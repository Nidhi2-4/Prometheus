"""Clinician SOAP note and FHIR R4 Bundle, built from a stored assessment. Template-based, deterministic."""
import uuid
from datetime import date, datetime, timezone

from .risk import bmi
from .schemas import AssessIn, AssessOut, SoapOut

DISCLAIMER = "Screening guidance, not a diagnosis."
LABEL = {"hypertension": "Hypertension", "diabetes": "Type 2 diabetes mellitus", "cvd": "Cardiovascular disease",
         "maternal": "Complication of pregnancy"}
SNOMED = {"hypertension": "38341003", "diabetes": "44054006", "cvd": "49601007", "maternal": "198609003"}
PLAN = {
    "emergency": "Immediate referral to the nearest emergency-capable facility. Call 108.",
    "urgent": "See a doctor within 24 hours at a CHC / district hospital. Confirm BP and risk findings.",
    "routine": "Visit the nearest PHC within a week. Recheck BP; consider blood sugar test and NCD screening.",
    "self_care": "Lifestyle guidance (diet, activity, no tobacco). Recheck in 3-6 months or if symptoms appear.",
}


def _words(codes) -> str:
    return ", ".join(c.replace("_", " ") for c in codes)


def soap(inp: AssessIn, out: AssessOut) -> SoapOut:
    f, hr = inp.features, inp.heart_rate
    history = [label for flag, label in [
        (f.known_hypertension, "known hypertension"), (f.known_diabetes, "known diabetes"),
        (f.known_heart_disease, "known heart disease"), (f.family_history_diabetes, "family history of diabetes"),
        (f.family_history_cvd, "family history of heart disease"), (f.smoker, "smoker"), (f.alcohol, "alcohol use"),
    ] if flag]
    pregnancy = f" Pregnant ({f.pregnancy_weeks or '?'} weeks)." if f.is_pregnant else ""

    vitals = [f"BMI {bmi(f):.1f}"]
    if f.systolic and f.diastolic:
        vitals.insert(0, f"BP {f.systolic}/{f.diastolic} mmHg")
    if hr and hr.bpm:
        vitals.append(f"HR {hr.bpm:.0f} bpm (camera estimate, signal {hr.quality})")

    flags = ", ".join(r.id for r in out.red_flags) or "none"
    risks = "; ".join(f"{LABEL[r.condition]} {r.level} ({r.probability:.2f}, model {r.model_version})" for r in out.results)
    return SoapOut(
        subjective=f"{f.age} y, {f.sex}. Symptoms: {_words(f.symptoms) or 'none reported'}. "
                   f"History: {', '.join(history) or 'none reported'}. Activity: {f.activity_level}.{pregnancy}",
        objective=". ".join(vitals) + ".",
        assessment=f"Red flags: {flags}. Risk: {risks}. Triage: {out.triage_level}.",
        plan=PLAN[out.triage_level],
        disclaimer=DISCLAIMER,
    )


def _coding(system, code, display=None) -> dict:
    return {"coding": [{"system": system, "code": code, **({"display": display} if display else {})}]}


VITAL = _coding("http://terminology.hl7.org/CodeSystem/observation-category", "vital-signs")


def _qty(value, unit, code) -> dict:
    return {"value": value, "unit": unit, "system": "http://unitsofmeasure.org", "code": code}


def fhir(assessment_id: str, inp: AssessIn, out: AssessOut, created: datetime | None = None) -> dict:
    f, hr = inp.features, inp.heart_rate
    when = (created or datetime.now(timezone.utc)).isoformat()

    def url(name):  # stable ids per assessment
        return f"urn:uuid:{uuid.uuid5(uuid.NAMESPACE_URL, f'swasthsetu/{assessment_id}/{name}')}"

    patient = url("patient")
    subject = {"reference": patient}
    entries = [(patient, {
        "resourceType": "Patient",
        "gender": {"M": "male", "F": "female"}.get(f.sex, "other"),
        "birthDate": str(date.today().year - f.age),  # year only: we only know the age
        "communication": [{"language": _coding("urn:ietf:bcp:47", f"{inp.language}-IN")}],
    })]
    if f.systolic and f.diastolic:
        entries.append((url("bp"), {
            "resourceType": "Observation", "status": "final", "category": [VITAL],
            "code": _coding("http://loinc.org", "85354-9", "Blood pressure panel"),
            "subject": subject, "effectiveDateTime": when,
            "component": [
                {"code": _coding("http://loinc.org", "8480-6", "Systolic blood pressure"),
                 "valueQuantity": _qty(f.systolic, "mmHg", "mm[Hg]")},
                {"code": _coding("http://loinc.org", "8462-4", "Diastolic blood pressure"),
                 "valueQuantity": _qty(f.diastolic, "mmHg", "mm[Hg]")},
            ],
        }))
    if hr and hr.bpm:
        entries.append((url("hr"), {
            "resourceType": "Observation", "status": "final", "category": [VITAL],
            "code": _coding("http://loinc.org", "8867-4", "Heart rate"),
            "subject": subject, "effectiveDateTime": when,
            "valueQuantity": _qty(round(hr.bpm), "beats/minute", "/min"),
            "note": [{"text": f"Camera (rPPG) screening estimate, signal quality {hr.quality}. Not a medical device."}],
        }))
    for r in out.results:
        entries.append((url(f"risk-{r.condition}"), {
            "resourceType": "RiskAssessment", "status": "final", "subject": subject, "occurrenceDateTime": when,
            "method": {"text": f"SwasthSetu {r.condition} model {r.model_version}"},
            "prediction": [{
                "outcome": _coding("http://snomed.info/sct", SNOMED[r.condition], LABEL[r.condition]),
                "probabilityDecimal": r.probability,
                "qualitativeRisk": _coding("http://terminology.hl7.org/CodeSystem/risk-probability",
                                           {"low": "low", "medium": "moderate", "high": "high"}[r.level]),
            }],
            "note": [{"text": "Top factors: " + ", ".join(x.feature for x in r.top_factors) + ". " + DISCLAIMER}],
        }))
    return {"resourceType": "Bundle", "type": "collection", "timestamp": when,
            "entry": [{"fullUrl": u, "resource": res} for u, res in entries]}
