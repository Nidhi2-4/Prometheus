"""Request/response models. These are the API contract: frontend types are generated from them."""
from typing import Literal

from pydantic import AwareDatetime, BaseModel, Field

Symptom = Literal[
    "chest_pain", "sweating", "nausea", "arm_jaw_pain", "breathlessness", "breathlessness_at_rest",
    "headache", "severe_headache", "dizziness", "blurred_vision", "sudden_vision_loss",
    "one_side_weakness", "face_drooping", "slurred_speech", "fainting", "seizure",
    "coughing_blood", "fever", "cough", "excessive_thirst", "frequent_urination", "fatigue",
    "swelling", "vaginal_bleeding", "reduced_baby_movement", "convulsions",
    "confusion", "extreme_drowsiness", "fruity_breath", "persistent_vomiting",
]
Language = Literal["en", "hi", "mr", "gu", "te", "kn"]
Triage = Literal["emergency", "urgent", "routine", "self_care"]
Level = Literal["low", "medium", "high"]
Condition = Literal["hypertension", "diabetes", "cvd", "maternal"]
Quality = Literal["good", "marginal", "poor"]

Systolic = Field(None, ge=60, le=260)
Diastolic = Field(None, ge=30, le=160)


class RedFlagIn(BaseModel):
    symptoms: list[Symptom] = []
    systolic: int | None = Systolic
    diastolic: int | None = Diastolic
    is_pregnant: bool = False
    known_diabetes: bool = False
    heart_rate: float | None = Field(None, ge=20, le=250)
    heart_rate_quality: Quality | None = None


class RuleHit(BaseModel):
    id: str
    message_key: str


class RedFlagOut(BaseModel):
    emergency: bool
    rules: list[RuleHit]


class Features(BaseModel):
    name: str | None = None
    age: int = Field(ge=1, le=120)
    sex: Literal["M", "F", "O", "other"]  # "O" and "other" mean the same
    height_cm: float = Field(ge=50, le=250)
    weight_kg: float = Field(ge=2, le=300)
    smoker: bool = False
    alcohol: bool = False
    activity_level: Literal["low", "moderate", "high"] = "moderate"
    known_hypertension: bool = False
    known_diabetes: bool = False
    known_heart_disease: bool = False
    family_history_diabetes: bool = False
    family_history_cvd: bool = False
    systolic: int | None = Systolic
    diastolic: int | None = Diastolic
    is_pregnant: bool = False
    pregnancy_weeks: int | None = Field(None, ge=1, le=45)
    blood_sugar_mgdl: float | None = Field(None, ge=20, le=600)  # optional, used by the maternal model
    body_temp_c: float | None = Field(None, ge=30, le=45)        # optional, used by the maternal model
    symptoms: list[Symptom] = []
    symptom_duration_days: int | None = Field(None, ge=0, le=3650)


class HeartRate(BaseModel):
    bpm: float | None = Field(None, ge=20, le=250)
    quality: Quality


class AssessIn(BaseModel):
    language: Language = "en"
    lat: float | None = Field(None, ge=-90, le=90)
    lng: float | None = Field(None, ge=-180, le=180)
    features: Features
    heart_rate: HeartRate | None = None


class Factor(BaseModel):
    feature: str
    impact: float
    text: str


class RiskResult(BaseModel):
    condition: Condition
    probability: float
    level: Level
    model_version: str
    class_probabilities: dict[str, float] | None = None  # maternal only: low / mid / high
    top_factors: list[Factor]
    note: str | None = None  # caveat to show on the card, in the user's language


class AssessOut(BaseModel):
    assessment_id: str
    red_flags: list[RuleHit]
    triage_level: Triage
    results: list[RiskResult]
    disclaimer: str


class RppgIn(BaseModel):
    fps: float = Field(ge=10, le=120)
    green: list[float] = Field(min_length=100, max_length=7200)  # 10 s at 10 fps .. 60 s at 120 fps


class RppgOut(BaseModel):
    bpm: int | None
    quality: Quality
    quality_score: float
    reasons: list[str]
    note: str


class Doctor(BaseModel):
    specialty: str
    on_duty: bool
    arrives_in_min: int = Field(0, ge=0, le=24 * 60)


class AvailabilityIn(BaseModel):
    facility_id: str
    doctors: list[Doctor]
    queue_wait_min: int = Field(ge=0, le=24 * 60)
    updated_at: AwareDatetime


class FacilityOut(BaseModel):
    id: str
    name: str
    type: str
    lat: float
    lng: float
    phone: str | None
    services: list[str]
    distance_km: float
    travel_min: int
    doctor_available: bool | None = None
    doctor_arrives_in_min: int | None = None
    queue_wait_min: int | None = None
    time_to_doctor_min: int | None = None
    availability_updated_min_ago: int | None = None
    cost_tier: Literal["free", "subsidized", "paid"]
    pmjay_empanelled: bool
    rating: float
    review_count: int
    simulated_fields: list[str]


class EligibilityIn(BaseModel):  # the frontend's four yes/no questions
    ration_card: bool = False      # family has a ration card
    bpl: bool = False              # BPL / Antyodaya card or listed as deprived
    senior_70_plus: bool = False   # someone in the family is 70 or older
    low_income: bool = False


class EligibilityOut(BaseModel):
    result: Literal["likely", "possibly", "not_likely"]
    reasons: list[str]
    documents: list[str]
    note: str


class VoiceIn(BaseModel):
    text: str = Field(min_length=1, max_length=500)  # transcribed speech only, never audio
    language: Language = "en"


class VoiceOut(BaseModel):
    symptoms: list[Symptom]
    duration_days: int | None


class SoapOut(BaseModel):
    subjective: str
    objective: str
    assessment: str
    plan: str
    disclaimer: str
