"""Run from backend/: python -m pytest -q"""
from datetime import datetime, timedelta, timezone

import numpy as np
from fastapi.testclient import TestClient

import os
import pickle

import joblib
import pytest

from app import facilities, risk, rppg, rules
from app.main import app
from app.schemas import Features, HeartRate, RiskResult


def ids(**kw):
    return [h.id for h in rules.red_flags(**kw)]


def test_red_flags():
    assert ids(symptoms=["chest_pain", "sweating"]) == ["RF01"]
    assert ids(symptoms=["chest_pain"]) == []
    assert ids(symptoms=[], systolic=179, diastolic=119) == []
    assert ids(symptoms=[], systolic=180) == ["RF02"]
    assert ids(symptoms=[], diastolic=120) == ["RF02"]
    assert ids(symptoms=["face_drooping"]) == ["RF03"]
    assert ids(symptoms=["breathlessness_at_rest"]) == ["RF04"]
    # pregnancy rules only when pregnant
    assert ids(symptoms=["vaginal_bleeding"]) == []
    assert ids(symptoms=["vaginal_bleeding"], is_pregnant=True) == ["RF05"]
    assert ids(symptoms=["severe_headache"], is_pregnant=True) == []
    assert ids(symptoms=["severe_headache", "blurred_vision"], is_pregnant=True) == ["RF05"]
    assert ids(symptoms=[], systolic=159, diastolic=109, is_pregnant=True) == []
    assert ids(symptoms=[], systolic=160, is_pregnant=True) == ["RF05"]
    assert ids(symptoms=["fainting"]) == ["RF06"]
    assert ids(symptoms=["confusion"]) == []
    assert ids(symptoms=["confusion"], known_diabetes=True) == ["RF07"]
    # heart rate only counts with a good signal and symptoms
    assert ids(symptoms=["dizziness"], heart_rate=160, heart_rate_quality="good") == ["RF08"]
    assert ids(symptoms=["dizziness"], heart_rate=160, heart_rate_quality="marginal") == []
    assert ids(symptoms=[], heart_rate=35, heart_rate_quality="good") == []
    assert ids(symptoms=["coughing_blood"]) == ["RF09"]
    assert ids(symptoms=["seizure"]) == ["RF10"]
    assert ids(symptoms=["convulsions"]) == ["RF10"]


def test_pmjay():
    from app.schemas import EligibilityIn
    assert rules.pmjay_eligibility(EligibilityIn(senior_70_plus=True)).result == "likely"
    assert rules.pmjay_eligibility(EligibilityIn(ration_card=True)).result == "possibly"
    assert rules.pmjay_eligibility(EligibilityIn()).result == "not_likely"


def rr(condition, level):
    return RiskResult(condition=condition, probability=0.5, level=level, model_version="t", top_factors=[])


def feat(**kw):
    return Features(**({"age": 45, "sex": "F", "height_cm": 155, "weight_kg": 72} | kw))


def test_triage_demo_stories():
    sunita = feat(systolic=142, diastolic=92, symptoms=["headache", "dizziness", "frequent_urination"])
    assert rules.triage([], [rr("hypertension", "medium"), rr("diabetes", "high"), rr("cvd", "low")], sunita) == "routine"
    priya = feat(age=26, is_pregnant=True, systolic=145, diastolic=95, symptoms=["swelling"])
    assert rules.triage([], [rr("hypertension", "low")], priya) == "urgent"
    assert rules.triage(rules.red_flags(["chest_pain", "sweating"]), [], feat()) == "emergency"
    assert rules.triage([], [rr("cvd", "high")], feat(symptoms=["chest_pain"])) == "urgent"
    assert rules.triage([], [rr("cvd", "low")], feat(systolic=160)) == "urgent"
    assert rules.triage([], [rr("cvd", "low")], feat()) == "self_care"


def test_models_loaded_and_explained():
    assert set(risk.MODELS) == {"hypertension", "diabetes", "cvd", "maternal"}
    sunita = feat(activity_level="low", family_history_diabetes=True, systolic=142, diastolic=92,
                  symptoms=["headache", "dizziness", "frequent_urination"])
    out = {r.condition: r for c in risk.CONDITIONS if (r := risk.predict(c, sunita, None, "en"))}
    assert set(out) == {"hypertension", "diabetes", "cvd"}  # not pregnant: no maternal
    for r in out.values():
        assert 0 <= r.probability <= 1 and r.top_factors and all(x.text for x in r.top_factors)
    assert out["hypertension"].level != "low" and out["hypertension"].top_factors[0].feature == "systolic"  # BP rule

    priya = feat(age=26, is_pregnant=True, systolic=145, diastolic=95, symptoms=["swelling"])
    m = risk.predict("maternal", priya, HeartRate(bpm=88, quality="good"), "mr")
    assert m.level == "high" and m.class_probabilities and m.top_factors[0].feature == "systolic"
    assert rules.triage([], [m], priya) == "urgent"

    # pregnancy: CVD is shown with a caveat but never drives triage
    cvd = risk.predict("cvd", priya, None, "en")
    assert cvd is not None and cvd.note and out["cvd"].note is None
    calm = feat(age=26, is_pregnant=True, systolic=120, diastolic=80)
    assert rules.triage([], [rr("cvd", "high")], calm) == "self_care"

    assert risk.predict("diabetes", feat(known_diabetes=True), None, "en") is None  # already diagnosed
    assert risk.predict("cvd", feat(), None, "en") is None  # CVD model needs BP


class _Evil:
    def __reduce__(self):
        return (os.getcwd, ())


def test_safe_load_blocks_code(tmp_path):
    joblib.dump({"x": _Evil()}, tmp_path / "evil.joblib")
    with pytest.raises(pickle.UnpicklingError):
        risk.safe_load(tmp_path / "evil.joblib")


def test_rppg():
    fps, t = 30, np.arange(25 * 30) / 30
    rng = np.random.default_rng(0)
    clean = 120 + 0.8 * np.sin(2 * np.pi * 1.2 * t) + rng.normal(0, 0.3, t.size)  # 72 BPM
    r = rppg.estimate(clean.tolist(), fps)
    assert r.quality == "good" and abs(r.bpm - 72) <= 2, r
    noise = 120 + rng.normal(0, 0.5, t.size)
    r = rppg.estimate(noise.tolist(), fps)
    assert r.quality == "poor" and r.bpm is None, r
    dark = clean - 100
    assert "too_dark" in rppg.estimate(dark.tolist(), fps).reasons
    assert rppg.estimate([100.0] * 300, fps).reasons == ["face_not_visible"]


def test_ranking_prefers_doctor_on_duty(monkeypatch):
    now = datetime.now(timezone.utc)
    base = {"type": "chc", "phone": None, "services": ["emergency"], "emergency_capable": True, "open_24x7": True,
            "pmjay_empanelled": True, "cost_tier": "free", "rating": 4.0, "review_count": 1, "simulated_fields": []}
    near = base | {"id": "near", "name": "Near", "lat": 21.150, "lng": 79.0}   # ~0 km
    far = base | {"id": "far", "name": "Far", "lat": 21.235, "lng": 79.0}     # ~9.5 km, ~23 min
    monkeypatch.setattr(facilities, "FACILITIES", [near, far])
    monkeypatch.setattr(facilities, "AVAILABILITY", {
        "near": {"doctors": [{"specialty": "general", "on_duty": False, "arrives_in_min": 60}], "queue_wait_min": 0, "updated_at": now},
        "far": {"doctors": [{"specialty": "general", "on_duty": True, "arrives_in_min": 0}], "queue_wait_min": 0, "updated_at": now},
    })
    out = facilities.nearby(21.150, 79.0, "emergency", now=now)
    assert [f.id for f in out] == ["far", "near"]
    assert out[1].time_to_doctor_min == 60

    # stale data: availability unknown, ranked by travel + assumed wait
    later = now + timedelta(minutes=45)
    out = facilities.nearby(21.150, 79.0, "emergency", now=later)
    assert [f.id for f in out] == ["near", "far"]
    assert out[0].time_to_doctor_min is None and out[0].availability_updated_min_ago == 45


SUNITA = {"language": "mr", "lat": 21.1458, "lng": 79.0882,
          "features": {"age": 45, "sex": "F", "height_cm": 155, "weight_kg": 72, "activity_level": "low",
                       "family_history_diabetes": True, "systolic": 142, "diastolic": 92,
                       "symptoms": ["headache", "dizziness", "frequent_urination"]},
          "heart_rate": {"bpm": 78, "quality": "good"}}


def test_api_flow():
    c = TestClient(app)
    assert c.post("/api/v1/redflags", json={"symptoms": ["chest_pain", "sweating"]}).json()["emergency"] is True
    assert c.post("/api/v1/assess", json=SUNITA).status_code == 401  # no session yet

    c.post("/api/v1/session")
    out = c.post("/api/v1/assess", json=SUNITA).json()
    assert out["triage_level"] in ("routine", "urgent")
    assert {r["condition"] for r in out["results"]} == {"hypertension", "diabetes", "cvd"}
    assert len(c.get("/api/v1/models").json()) == 4
    assert all(f["text"] for r in out["results"] for f in r["top_factors"])

    aid = out["assessment_id"]
    assert set(c.get(f"/api/v1/assessments/{aid}/soap").json()) >= {"subjective", "objective", "assessment", "plan"}
    bundle = c.get(f"/api/v1/assessments/{aid}/fhir").json()
    kinds = [e["resource"]["resourceType"] for e in bundle["entry"]]
    assert kinds.count("Patient") == 1 and kinds.count("Observation") == 2 and kinds.count("RiskAssessment") == 3

    other = TestClient(app)
    other.post("/api/v1/session")
    assert other.get(f"/api/v1/assessments/{aid}/soap").status_code == 404  # other session cannot read it

    assert c.get("/api/v1/facilities/nearby", params={"lat": 21.1458, "lng": 79.0882, "triage_level": "emergency"}).json()
    avail = {"facility_id": "fac_gmch", "doctors": [], "queue_wait_min": 5, "updated_at": "2026-10-22T13:00:00+05:30"}
    assert c.post("/api/v1/partner/availability", json=avail, headers={"X-Partner-Key": "wrong"}).status_code == 403
    assert c.post("/api/v1/assess", json=SUNITA | {"features": SUNITA["features"] | {"age": 500}}).status_code == 422
