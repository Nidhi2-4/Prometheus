"""Facility recommender: ranks by time to see a doctor (info.md section 8)."""
import json
import math
import random
from datetime import datetime, timezone
from pathlib import Path

from .schemas import AvailabilityIn, FacilityOut

FACILITIES = json.loads((Path(__file__).parent / "data" / "facilities.json").read_text(encoding="utf-8"))
_now = datetime.now(timezone.utc)
# ponytail: in-memory, reset on restart; the mock hospital pusher refills it every minute.
AVAILABILITY = {f["id"]: {**f.pop("availability"), "updated_at": _now} for f in FACILITIES if "availability" in f}
SPECIALTIES = {fid: [d["specialty"] for d in a["doctors"]] for fid, a in AVAILABILITY.items()}  # real mix per facility

SPEED_KMH = 25  # ponytail: flat town speed; switch to road routing (OSRM) if travel times look wrong
STALE_MIN = 30
UNKNOWN_WAIT_MIN = 30  # assumed doctor wait when availability is unknown or stale
NO_SPECIALIST_PENALTY_MIN = 24 * 60  # keep listed (call button) but rank last
URGENT_TYPES = {"chc", "sub_district_hospital", "district_hospital", "medical_college"}
COST_PENALTY_MIN = {"free": 0, "subsidized": 10, "paid": 25}


def haversine_km(lat1, lng1, lat2, lng2) -> float:
    p1, p2 = math.radians(lat1), math.radians(lat2)
    a = math.sin((p2 - p1) / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(math.radians(lng2 - lng1) / 2) ** 2
    return 6371 * 2 * math.asin(math.sqrt(a))


def random_roster(facility: dict, rng=random) -> dict:
    """Simulated hospital software (demo only): plausible doctors on duty and queue for one facility."""
    specialties = SPECIALTIES.get(facility["id"]) or ["general"] + (["gynaecology"] if "maternity" in facility["services"] else [])
    doctors = []
    for s in specialties:
        on_duty = rng.random() < 0.7
        doctors.append({"specialty": s, "on_duty": on_duty, "arrives_in_min": 0 if on_duty else rng.choice([15, 30, 45, 60, 120])})
    return {"facility_id": facility["id"], "doctors": doctors, "queue_wait_min": rng.choice([5, 10, 20, 30, 60]),
            "updated_at": datetime.now(timezone.utc)}


def simulate_once():
    """Refresh every facility with a random roster (SIMULATE_AVAILABILITY=1, e.g. on Render without the pusher)."""
    for f in FACILITIES:
        update_availability(AvailabilityIn(**random_roster(f)))


def update_availability(a: AvailabilityIn) -> bool:
    if not any(f["id"] == a.facility_id for f in FACILITIES):
        return False
    AVAILABILITY[a.facility_id] = {"doctors": [d.model_dump() for d in a.doctors],
                                   "queue_wait_min": a.queue_wait_min, "updated_at": a.updated_at}
    return True


def _availability(facility_id: str, specialty: str, travel_min: int, now: datetime) -> dict:
    a = AVAILABILITY.get(facility_id)
    if not a:
        return {}
    age_min = (now - a["updated_at"]).total_seconds() / 60
    out = {"availability_updated_min_ago": max(0, int(age_min))}
    doctors = [d for d in a["doctors"] if d["specialty"] == specialty]
    if age_min > STALE_MIN:
        return out
    if not doctors:  # fresh roster, but no doctor of this specialty
        return out | {"doctor_available": False}
    arrives = min(0 if d["on_duty"] else d["arrives_in_min"] for d in doctors)
    return out | {
        "doctor_available": any(d["on_duty"] for d in doctors),
        "doctor_arrives_in_min": arrives,
        "queue_wait_min": a["queue_wait_min"],
        "time_to_doctor_min": travel_min + max(0, arrives - travel_min) + a["queue_wait_min"],
    }


def nearby(lat: float, lng: float, triage_level: str, service: str | None = None, limit: int = 10,
           now: datetime | None = None) -> list[FacilityOut]:
    now = now or datetime.now(timezone.utc)
    specialty = "gynaecology" if service == "maternity" else "general"
    ranked = []
    for f in FACILITIES:
        if service and service not in f["services"]:
            continue
        if triage_level == "emergency" and not (f["emergency_capable"] and f["open_24x7"]):
            continue
        if triage_level == "urgent" and not (f["type"] in URGENT_TYPES or f["pmjay_empanelled"]):
            continue
        km = haversine_km(lat, lng, f["lat"], f["lng"])
        travel = max(1, round(km / SPEED_KMH * 60))
        row = {k: f[k] for k in FacilityOut.model_fields if k in f}
        row |= {"distance_km": round(km, 1), "travel_min": travel, **_availability(f["id"], specialty, travel, now)}
        known = row.get("time_to_doctor_min")
        key = known if known is not None else travel + UNKNOWN_WAIT_MIN
        if known is None and row.get("doctor_available") is False:
            key += NO_SPECIALIST_PENALTY_MIN
        if triage_level in ("routine", "self_care"):
            key += COST_PENALTY_MIN[f["cost_tier"]] - 5 * (f["rating"] - 3)  # ponytail: hand-tuned weights, in minutes
        ranked.append((key, row))
    ranked.sort(key=lambda kr: kr[0])
    return [FacilityOut(**row) for _, row in ranked[:limit]]
