"""Risk scores from Pravesh's models in models/: LightGBM + isotonic calibration (hypertension, diabetes, CVD)
and a Random Forest (maternal). Explanations are per-patient SHAP values."""
import hashlib
import json
import os
import pickle
from collections import defaultdict
from pathlib import Path

import lightgbm as lgb
import numpy as np
from joblib import numpy_pickle

from .schemas import Factor, Features, HeartRate, RiskResult

MODEL_DIR = Path(os.environ.get("MODEL_DIR", Path(__file__).resolve().parents[2] / "models"))
BUNDLES = {
    "hypertension": "hypertension/htn_bundle.joblib",
    "diabetes": "diabetes/dm_bundle.joblib",
    "cvd": "cvd/cvd_nolab_bundle.joblib",
    "maternal": "maternal/maternal_bundle.joblib",
}
CONDITIONS = tuple(BUNDLES)
LEVELS = ("low", "medium", "high")


def safe_load(path: Path):
    """joblib.load that only lets numpy/sklearn/joblib classes through. A pickle can run any code it names."""
    original = numpy_pickle.NumpyUnpickler.find_class

    def find_class(self, module, name):
        if module.split(".")[0] not in ("numpy", "sklearn", "joblib"):
            raise pickle.UnpicklingError(f"blocked {module}.{name} in {path.name}")
        return original(self, module, name)

    numpy_pickle.NumpyUnpickler.find_class = find_class
    try:
        return numpy_pickle.load(path)
    finally:
        numpy_pickle.NumpyUnpickler.find_class = original


def _load() -> dict:
    models = {}
    for condition, rel in BUNDLES.items():
        path = MODEL_DIR / rel
        if not path.exists():
            continue
        b = safe_load(path)
        if "booster_str" in b:
            b["booster"] = lgb.Booster(model_str=b["booster_str"])
        else:
            import shap  # slow import (~4 s), only needed for the Random Forest
            b["explainer"] = shap.TreeExplainer(b["model_high"])
        b["version"] = f"{path.stem}-{hashlib.sha1(path.read_bytes()).hexdigest()[:8]}"
        metrics = path.parent / "metrics.json"
        b["metrics"] = json.loads(metrics.read_text()) if metrics.exists() else {}
        models[condition] = b
    return models


MODELS = _load()

# Values we do not ask in the intake are left missing (NaN): the LightGBM models learned missing values.
# Exceptions the models never saw missing get a fixed value instead.
LGBM_FILL = {"borderline_diabetes": 0.0, "told_prediabetes": 0.0}
MATERNAL_FILL = {"BS": 7.5, "BodyTemp": 98.0, "HeartRate": 76.0}  # UCI maternal dataset medians
ACTIVITY_MIN_WK = {"low": 0.0, "moderate": 150.0, "high": 300.0}  # assumed leisure activity minutes per week
SKIP_IF_KNOWN = {"hypertension": "known_hypertension", "diabetes": "known_diabetes", "cvd": "known_heart_disease"}

# Model feature -> intake key used for the plain-language text (several model features can share one key).
FEATURE_KEY = {
    "sex_female": "sex", "waist_cm": "bmi", "waist_to_height": "bmi", "sbp": "systolic", "dbp": "diastolic",
    "smoking_status": "smoker", "alcohol_days_per_year": "alcohol", "alcohol_drinks_per_day": "alcohol",
    "active": "activity_level", "leisure_mvpa_min_wk": "activity_level", "sedentary_min_day": "activity_level",
    "family_history_dm": "family_history_diabetes", "told_hypertension": "known_hypertension",
    "borderline_diabetes": "known_diabetes", "told_prediabetes": "known_diabetes", "sleep_hours": "sleep",
    "Age": "age", "SystolicBP": "systolic", "DiastolicBP": "diastolic", "BS": "blood_sugar",
    "BodyTemp": "body_temp", "HeartRate": "heart_rate",
}


# A factor's text is only shown when it is true for this user. SHAP can push risk up for a "safe" value
# (e.g. non-drinkers in NHANES); telling a non-drinker "regular alcohol use" would be wrong.
APPLIES = {
    "bmi": lambda f, hr: bmi(f) >= 25,
    "systolic": lambda f, hr: (f.systolic or 0) >= 130,
    "diastolic": lambda f, hr: (f.diastolic or 0) >= 85,
    "smoker": lambda f, hr: f.smoker,
    "alcohol": lambda f, hr: f.alcohol,
    "activity_level": lambda f, hr: f.activity_level == "low",
    "family_history_diabetes": lambda f, hr: f.family_history_diabetes,
    "known_hypertension": lambda f, hr: f.known_hypertension,
    "known_diabetes": lambda f, hr: f.known_diabetes,
    "blood_sugar": lambda f, hr: (f.blood_sugar_mgdl or 0) > 140,
    "body_temp": lambda f, hr: (f.body_temp_c or 0) > 37.5,
    "heart_rate": lambda f, hr: bool(hr and hr.bpm and not 60 <= hr.bpm <= 100),
    "sleep": lambda f, hr: False,  # not asked in the intake
}


def bmi(f: Features) -> float:
    return f.weight_kg / (f.height_cm / 100) ** 2


def _inputs(f: Features, hr: HeartRate | None) -> dict:
    """Intake mapped to every model's feature names. None = not known."""
    good_hr = hr.bpm if hr and hr.bpm and hr.quality != "poor" else None
    return {
        "age": f.age, "sex_female": float(f.sex == "F"), "bmi": bmi(f), "sbp": f.systolic, "dbp": f.diastolic,
        "smoker": float(f.smoker), "smoking_status": 2.0 if f.smoker else 0.0,  # assumed 0 never, 1 former, 2 current
        "alcohol": float(f.alcohol),
        "alcohol_days_per_year": 104.0 if f.alcohol else 0.0, "alcohol_drinks_per_day": 2.0 if f.alcohol else 0.0,
        "active": float(f.activity_level != "low"), "leisure_mvpa_min_wk": ACTIVITY_MIN_WK[f.activity_level],
        "family_history_dm": float(f.family_history_diabetes), "told_hypertension": float(f.known_hypertension),
        "known_diabetes": float(f.known_diabetes),
        "Age": f.age, "SystolicBP": f.systolic, "DiastolicBP": f.diastolic,
        "BS": f.blood_sugar_mgdl / 18 if f.blood_sugar_mgdl else None,  # model uses mmol/L
        "BodyTemp": f.body_temp_c * 9 / 5 + 32 if f.body_temp_c else None,  # model uses °F
        "HeartRate": good_hr,
    }


def _row(features: list[str], x: dict, fill: dict):
    values, unknown = [], set()
    for name in features:
        v = x.get(name)
        if v is None:
            unknown.add(name)
            v = fill.get(name, np.nan)
        values.append(float(v))
    return np.array([values]), unknown


def predict(condition: str, f: Features, hr: HeartRate | None, language: str) -> RiskResult | None:
    """None when the condition does not apply: not pregnant, already diagnosed, BP missing for CVD, no model."""
    b = MODELS.get(condition)
    if b is None or getattr(f, SKIP_IF_KNOWN.get(condition, ""), False):
        return None
    if condition == "maternal" and not f.is_pregnant:
        return None
    if condition == "cvd" and not (f.systolic and f.diastolic):  # this model never saw missing BP
        return None

    x = _inputs(f, hr)
    class_probabilities = None
    if condition == "maternal":
        X, unknown = _row(b["features"], x, MATERNAL_FILL)
        p3 = b["model_3class"].predict_proba(X)[0]  # classes 0 low, 1 mid, 2 high
        p = float(b["model_high"].predict_proba(X)[0, 1])
        level = "high" if p >= b["threshold_high"] else LEVELS[int(p3.argmax())]
        contrib = np.asarray(b["explainer"].shap_values(X))[0, :, 1]
        class_probabilities = {"low": round(float(p3[0]), 2), "mid": round(float(p3[1]), 2), "high": round(float(p3[2]), 2)}
    else:
        X, unknown = _row(b["features"], x, LGBM_FILL)
        p = float(b["calibrator"].predict(b["booster"].predict(X))[0])
        level = next(lbl for lo, hi, lbl in b["bands"] if lo <= p < hi).replace("moderate", "medium")
        contrib = b["booster"].predict(X, pred_contrib=True)[0][:-1]  # TreeSHAP, last column is the bias

    impact = defaultdict(float)
    for name, c in zip(b["features"], contrib):
        if name not in unknown:  # never explain with values the user did not give
            impact[FEATURE_KEY.get(name, name)] += float(c)
    top = sorted(((k, v) for k, v in impact.items() if v >= 0.01 and APPLIES.get(k, lambda f, hr: True)(f, hr)),
                 key=lambda kv: -kv[1])[:3]
    version = b["version"]

    # The hypertension model has no BP input (label leakage). A measured BP >= 140/90 is handled by rule.
    if condition == "hypertension" and ((f.systolic or 0) >= 140 or (f.diastolic or 0) >= 90):
        level = max(level, "medium", key=LEVELS.index)
        key = "systolic" if (f.systolic or 0) >= 140 else "diastolic"
        top = [(key, 0.0)] + [kv for kv in top if kv[0] != key][:2]
        version += "+bp-rule"

    return RiskResult(
        condition=condition, probability=round(p, 2), level=level, model_version=version,
        class_probabilities=class_probabilities,
        top_factors=[Factor(feature=k, impact=round(v, 2), text=factor_text(k, language)) for k, v in top],
    )


FACTOR_TEXT = {
    "age": ("Risk rises with age", "उम्र के साथ जोखिम बढ़ता है", "वयानुसार धोका वाढतो"),
    "sex": ("Risk differs between men and women", "पुरुषों और महिलाओं में जोखिम अलग होता है", "स्त्री आणि पुरुषांमध्ये धोका वेगळा असतो"),
    "bmi": ("Weight is higher for your height", "आपकी लंबाई के हिसाब से वज़न ज़्यादा है", "तुमच्या उंचीच्या मानाने वजन जास्त आहे"),
    "systolic": ("Your upper BP reading is higher than normal", "आपका ऊपर वाला BP सामान्य से ज़्यादा है", "तुमचा वरचा BP सामान्यपेक्षा जास्त आहे"),
    "diastolic": ("Your lower BP reading is higher than normal", "आपका नीचे वाला BP सामान्य से ज़्यादा है", "तुमचा खालचा BP सामान्यपेक्षा जास्त आहे"),
    "smoker": ("Smoking or tobacco use", "धूम्रपान या तंबाकू का सेवन", "धूम्रपान किंवा तंबाखूचे सेवन"),
    "alcohol": ("Regular alcohol use", "नियमित शराब का सेवन", "नियमित मद्यपान"),
    "activity_level": ("Low physical activity", "शारीरिक गतिविधि कम है", "शारीरिक हालचाल कमी आहे"),
    "family_history_diabetes": ("Diabetes runs in your family", "परिवार में डायबिटीज़ है", "कुटुंबात मधुमेह आहे"),
    "known_hypertension": ("You already have high BP", "आपको पहले से हाई BP है", "तुम्हाला आधीच उच्च रक्तदाब आहे"),
    "known_diabetes": ("You already have diabetes", "आपको पहले से डायबिटीज़ है", "तुम्हाला आधीच मधुमेह आहे"),
    "sleep": ("Your sleep pattern", "आपकी नींद का पैटर्न", "तुमच्या झोपेची पद्धत"),
    "blood_sugar": ("Blood sugar is higher than expected", "ब्लड शुगर अपेक्षा से ज़्यादा है", "रक्तातील साखर अपेक्षेपेक्षा जास्त आहे"),
    "body_temp": ("Body temperature is raised", "शरीर का तापमान बढ़ा हुआ है", "शरीराचे तापमान वाढलेले आहे"),
    "heart_rate": ("Heart rate is outside the usual range", "दिल की धड़कन सामान्य सीमा से बाहर है", "हृदयाचे ठोके नेहमीच्या मर्यादेबाहेर आहेत"),
}


def factor_text(key: str, language: str) -> str:
    texts = FACTOR_TEXT.get(key)
    return texts[("en", "hi", "mr").index(language)] if texts else key.replace("_", " ")
