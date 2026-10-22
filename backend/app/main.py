"""Swasthik API. Run: uvicorn app.main:app --port 8001  (docs at /docs)."""
import asyncio
import hmac
import os
import uuid
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from pathlib import Path

from dotenv import load_dotenv

# Local runs read <repo>/env.local; on Render the file doesn't exist and the dashboard env is used.
load_dotenv(Path(__file__).resolve().parents[2] / "env.local")

try:  # use the OS certificate store (antivirus/proxy roots on Windows broke Python's own bundle)
    import truststore
    truststore.inject_into_ssl()
except ImportError:
    pass

from fastapi import APIRouter, Depends, FastAPI, Header, HTTPException, Request  # noqa: E402
from fastapi.middleware.cors import CORSMiddleware  # noqa: E402
from starlette.middleware.sessions import SessionMiddleware  # noqa: E402

from . import facilities, reports, risk, rppg, rules, voice  # noqa: E402
from .schemas import (AssessIn, AssessOut, AvailabilityIn, EligibilityIn, EligibilityOut, FacilityOut,  # noqa: E402
                      RedFlagIn, RedFlagOut, RppgIn, RppgOut, SoapOut, Triage, VoiceIn, VoiceOut)

PARTNER_KEY = os.environ.get("PARTNER_KEY", "dev-partner-key")

async def _simulate_availability():
    while True:
        facilities.simulate_once()
        await asyncio.sleep(60)


@asynccontextmanager
async def lifespan(_app):
    # Demo deploys have no hospital pusher; without this, availability goes stale after 30 min.
    task = asyncio.create_task(_simulate_availability()) if os.environ.get("SIMULATE_AVAILABILITY") == "1" else None
    yield
    if task:
        task.cancel()


app = FastAPI(title="Swasthik API", version="0.1.0", description="Triage support, not diagnosis.", lifespan=lifespan)
app.add_middleware(
    SessionMiddleware,
    secret_key=os.environ.get("SESSION_SECRET", "dev-only-change-me"),
    same_site=os.environ.get("COOKIE_SAMESITE", "lax"),  # "none" when frontend and backend are on different domains
    https_only=os.environ.get("COOKIE_SECURE") == "1",   # must be "1" with SameSite=none
)
app.add_middleware(  # added last = outermost, so CORS headers are on every response
    CORSMiddleware,
    # Browsers send the origin without a trailing slash; tolerate "https://x.app/" in the env value.
    allow_origins=[o.strip().rstrip("/") for o in
                   os.environ.get("CORS_ORIGINS", "http://localhost:5173,http://127.0.0.1:5173").split(",") if o.strip()],
    allow_credentials=True, allow_methods=["*"], allow_headers=["*"],
)
api = APIRouter(prefix="/api/v1")

# ponytail: in-memory store, lost on restart; move to SQLite when history (F16) is needed.
ASSESSMENTS: dict[str, dict] = {}
SESSIONS: set[str] = set()  # issued session ids; a restart forces clients to start a new session


def session_id(request: Request, x_session_id: str | None = Header(None)) -> str:
    # Header first: browsers often block the cookie when frontend and backend are on different domains.
    if x_session_id in SESSIONS:
        return x_session_id
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
    sid = request.session.setdefault("sid", uuid.uuid4().hex)
    SESSIONS.add(sid)
    return {"ok": True, "session_id": sid}  # send back as X-Session-Id when cookies are blocked


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


# ponytail: session-gated but no rate limit; add one if the Gemini quota is ever abused.
@api.post("/voice/symptoms", response_model=VoiceOut)
def voice_symptoms(body: VoiceIn, _sid: str = Depends(session_id)):
    try:
        out = voice.parse(body.text, body.language)
    except (OSError, KeyError, IndexError, ValueError):
        raise HTTPException(502, "Voice service unavailable")
    if out is None:
        raise HTTPException(503, "Voice AI not configured")
    return out


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
    ppg_path = risk.MODEL_DIR / "ppg" / "ppg_quality_bundle.joblib"
    ppg_exists = ppg_path.exists()
    voice_key = bool(os.environ.get("GEMINI_API_KEY"))

    results = []
    # 4 Clinical ML Models
    for c, b in risk.MODELS.items():
        results.append({
            "name": c,
            "connected": True,
            "status": "connected",
            "version": b["version"],
            "bands": b.get("bands"),
            "threshold": b.get("threshold", b.get("threshold_high")),
            "features": b["features"],
            "metrics": b["metrics"]
        })

    # Model 5: PPG Signal Quality (LightGBM on BUT-PPG)
    results.append({
        "name": "ppg_quality",
        "connected": ppg_exists,
        "status": "connected" if ppg_exists else "not_connected",
        "version": "butppg-lgbm-v2.0" if ppg_exists else "offline",
        "features": ["snr", "spectral_peak_share", "autocorr_peak", "hr_fft_vs_peak_diff", "ibi_cv", "skewness", "kurtosis", "perfusion", "raw_range_ratio", "zero_cross_rate", "hr_fft"],
        "metrics": {"auroc": 0.854, "accuracy": 0.843, "mae_bpm": 5.5} if ppg_exists else {}
    })

    # Model 6 / Voice AI: Gemini Multilingual Speech-to-Symptoms
    results.append({
        "name": "voice_gemini",
        "connected": voice_key,
        "status": "connected" if voice_key else "not_connected",
        "version": os.environ.get("GEMINI_MODEL", "gemini-flash-lite-latest"),
        "features": ["multilingual_stt", "symptom_slot_extraction"],
        "metrics": {"supported_languages": 6, "response_avg_s": 6.2}
    })

    return results


app.include_router(api)
