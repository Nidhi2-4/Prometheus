"""Deterministic rules: emergency red flags (RF01-RF10), triage level, PM-JAY eligibility. No ML here."""
from .schemas import EligibilityIn, EligibilityOut, Features, RiskResult, RuleHit


def red_flags(symptoms, systolic=None, diastolic=None, is_pregnant=False, known_diabetes=False,
              heart_rate=None, heart_rate_quality=None) -> list[RuleHit]:
    s = set(symptoms)
    sbp, dbp = systolic or 0, diastolic or 0
    checks = [
        ("RF01", "rf01_chest_pain", "chest_pain" in s and bool(s & {"sweating", "nausea", "arm_jaw_pain", "breathlessness"})),
        ("RF02", "rf02_bp_crisis", sbp >= 180 or dbp >= 120),
        ("RF03", "rf03_stroke", bool(s & {"one_side_weakness", "face_drooping", "slurred_speech", "sudden_vision_loss"})),
        ("RF04", "rf04_breathless_rest", "breathlessness_at_rest" in s),
        ("RF05", "rf05_pregnancy", is_pregnant and (
            bool(s & {"vaginal_bleeding", "convulsions", "reduced_baby_movement"})
            or {"severe_headache", "blurred_vision"} <= s
            or sbp >= 160 or dbp >= 110)),
        ("RF06", "rf06_fainting", "fainting" in s),
        ("RF07", "rf07_diabetic_emergency", known_diabetes and bool(s & {"confusion", "extreme_drowsiness", "fruity_breath", "persistent_vomiting"})),
        ("RF08", "rf08_heart_rate", heart_rate_quality == "good" and heart_rate is not None
            and (heart_rate > 150 or heart_rate < 40) and bool(s)),
        ("RF09", "rf09_coughing_blood", "coughing_blood" in s),
        ("RF10", "rf10_seizure", bool(s & {"seizure", "convulsions"})),
    ]
    return [RuleHit(id=i, message_key=k) for i, k, hit in checks if hit]


# Symptoms that make a High chronic risk urgent (acute warning signs, not the usual chronic ones).
URGENT_SYMPTOMS = {
    "hypertension": {"severe_headache", "blurred_vision", "chest_pain"},
    "diabetes": {"blurred_vision", "persistent_vomiting", "extreme_drowsiness"},
    "cvd": {"chest_pain", "breathlessness", "arm_jaw_pain"},
}


def triage(flags: list[RuleHit], results: list[RiskResult], f: Features) -> str:
    """First match wins (info.md section 6)."""
    s = set(f.symptoms)
    sbp, dbp = f.systolic or 0, f.diastolic or 0
    if f.is_pregnant:  # chronic models had no pregnant women in training; maternal model + rules decide
        results = [r for r in results if r.condition == "maternal"]
    if flags:
        return "emergency"
    if sbp >= 160 or dbp >= 100:
        return "urgent"
    if f.is_pregnant and (sbp >= 140 or dbp >= 90):  # hypertension in pregnancy
        return "urgent"
    if any(r.condition == "maternal" and r.level == "high" for r in results):
        return "urgent"
    if any(r.level == "high" and s & URGENT_SYMPTOMS.get(r.condition, set()) for r in results):
        return "urgent"
    if any(r.level in ("medium", "high") for r in results):
        return "routine"
    if "cough" in s and (s & {"fever", "breathlessness"} or (f.symptom_duration_days or 0) >= 14):
        return "routine"
    return "self_care"


PMJAY_DOCUMENTS = ["Aadhaar card", "Ration card (if any)", "Ayushman / PM-JAY card (if any)",
                   "Mobile number linked to Aadhaar"]


def pmjay_eligibility(e: EligibilityIn) -> EligibilityOut:
    # ponytail: indicative rules only; verify current criteria on pmjay.gov.in before the demo.
    likely = [r for ok, r in [
        (e.senior_70_plus, "Age 70 or above (Ayushman Vay Vandana, any income)"),
        (e.bpl, "BPL / Antyodaya household"),
    ] if ok]
    possibly = [r for ok, r in [
        (e.ration_card, "Ration card holder: check the PM-JAY list at the facility"),
        (e.low_income, "Low income: check the PM-JAY list at the facility"),
    ] if ok]
    result, reasons = ("likely", likely) if likely else ("possibly", possibly) if possibly else ("not_likely", [])
    return EligibilityOut(result=result, reasons=reasons, documents=PMJAY_DOCUMENTS,
                          note="Indicative only, verify at the facility.")
