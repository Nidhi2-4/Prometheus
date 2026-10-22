"""SwasthSetu API. Run: uvicorn app.main:app --reload  (docs at /docs)."""
import hmac
import os
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, FastAPI, Header, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from starlette.middleware.sessions import SessionMiddleware

from . import facilities, reports, risk, rppg, rules
from .schemas import (AssessIn, AssessOut, AvailabilityIn, EligibilityIn, EligibilityOut, FacilityOut,
                      RedFlagIn, RedFlagOut, RppgIn, RppgOut, SoapOut, Triage)

PARTNER_KEY = os.environ.get("PARTNER_KEY", "dev-partner-key")

app = FastAPI(title="SwasthSetu API", version="0.1.0", description="Triage support, not diagnosis.")
app.add_middleware(
    SessionMiddleware,
    secret_key=os.environ.get("SESSION_SECRET", "dev-only-change-me"),
    same_site=os.environ.get("COOKIE_SAMESITE", "lax"),  # "none" when frontend and backend are on different domains
    https_only=os.environ.get("COOKIE_SECURE") == "1",   # must be "1" with SameSite=none
)
app.add_middleware(  # added last = outermost, so CORS headers are on every response
    CORSMiddleware,
    allow_origins=os.environ.get("CORS_ORIGINS", "http://localhost:5173").split(","),
    allow_credentials=True, allow_methods=["*"], allow_headers=["*"],
)
api = APIRouter(prefix="/api/v1")

# ponytail: in-memory store, lost on restart; move to SQLite when history (F16) is needed.
ASSESSMENTS: dict[str, dict] = {}


def session_id(request: Request) -> str:
    sid = request.session.get("sid")
    if not sid:
        raise HTTPException(401, "No session. Call POST /api/v1/session first.")
    return sid


def own_assessment(assessment_id: str, sid: str = Depends(session_id)) -> dict:
    a = ASSESSMENTS.get(assessment_id)
    if not a or a["sid"] != sid:
        raise HTTPException(404, "Assessment not found")
    return a


@api.get("/health")
def health():
    return {"status": "ok", "risk_models": sorted(risk.MODELS)}


@api.post("/session")
def start_session(request: Request):
    request.session.setdefault("sid", uuid.uuid4().hex)
    return {"ok": True}


# No session needed: the emergency path must never fail on a cookie problem.
@api.post("/redflags", response_model=RedFlagOut)
def redflags(body: RedFlagIn):
    hits = rules.red_flags(**body.model_dump())
    return RedFlagOut(emergency=bool(hits), rules=hits)


@api.post("/assess", response_model=AssessOut)
def assess(body: AssessIn, sid: str = Depends(session_id)):
    f, hr = body.features, body.heart_rate
    flags = rules.red_flags(f.symptoms, f.systolic, f.diastolic, f.is_pregnant, f.known_diabetes,
                            hr.bpm if hr else None, hr.quality if hr else None)
    results = [r for c in risk.CONDITIONS if (r := risk.predict(c, f, hr, body.language))]
    out = AssessOut(assessment_id=uuid.uuid4().hex, red_flags=flags, triage_level=rules.triage(flags, results, f),
                    results=results, disclaimer=reports.DISCLAIMER)
    ASSESSMENTS[out.assessment_id] = {"sid": sid, "input": body, "output": out, "created": datetime.now(timezone.utc)}
    return out


@api.get("/assessments/{assessment_id}", response_model=AssessOut)
def get_assessment(a: dict = Depends(own_assessment)):
    return a["output"]


@api.get("/assessments/{assessment_id}/soap", response_model=SoapOut)
def get_soap(a: dict = Depends(own_assessment)):
    return reports.soap(a["input"], a["output"])


@api.get("/assessments/{assessment_id}/fhir")
def get_fhir(assessment_id: str, a: dict = Depends(own_assessment)):
    return reports.fhir(assessment_id, a["input"], a["output"], a["created"])


@api.post("/vitals/rppg", response_model=RppgOut)
def vitals_rppg(body: RppgIn):
    return rppg.estimate(body.green, body.fps)


@api.get("/facilities/nearby", response_model=list[FacilityOut])
def facilities_nearby(lat: float, lng: float, triage_level: Triage = "routine", service: str | None = None,
                      limit: int = 10):
    return facilities.nearby(lat, lng, triage_level, service, min(limit, 50))


@api.post("/partner/availability")
def partner_availability(body: AvailabilityIn, x_partner_key: str = Header()):
    if not hmac.compare_digest(x_partner_key, PARTNER_KEY):
        raise HTTPException(403, "Invalid partner key")
    if not facilities.update_availability(body):
        raise HTTPException(404, "Unknown facility")
    return {"ok": True}


@api.post("/schemes/eligibility", response_model=EligibilityOut)
def schemes_eligibility(body: EligibilityIn):
    return rules.pmjay_eligibility(body)


@api.get("/models")
def models():
    return [{"name": c, "version": b["version"], "bands": b.get("bands"),
             "threshold": b.get("threshold", b.get("threshold_high")), "features": b["features"],
             "metrics": b["metrics"]} for c, b in risk.MODELS.items()]


app.include_router(api)
