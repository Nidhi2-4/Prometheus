"""Simulated hospital software (HMIS): pushes random doctor availability every minute. Demo only.

Run next to the API:  python mock_hospital.py
Env: API_URL (default http://localhost:8000), PARTNER_KEY (must match the API).
"""
import json
import os
import random
import time
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

API = os.environ.get("API_URL", "http://localhost:8000") + "/api/v1/partner/availability"
KEY = os.environ.get("PARTNER_KEY", "dev-partner-key")
FACILITIES = json.loads((Path(__file__).parent / "app" / "data" / "facilities.json").read_text(encoding="utf-8"))


def doctor(specialty):
    on_duty = random.random() < 0.7
    return {"specialty": specialty, "on_duty": on_duty, "arrives_in_min": 0 if on_duty else random.choice([15, 30, 45, 60, 120])}


while True:
    for f in FACILITIES:
        specialties = ["general"] + (["gynaecology"] if "maternity" in f["services"] else [])
        body = {"facility_id": f["id"], "doctors": [doctor(s) for s in specialties],
                "queue_wait_min": random.choice([5, 10, 20, 30, 60]),
                "updated_at": datetime.now(timezone.utc).isoformat()}
        req = urllib.request.Request(API, data=json.dumps(body).encode(), method="POST",
                                     headers={"Content-Type": "application/json", "X-Partner-Key": KEY})
        urllib.request.urlopen(req).close()
    print(f"{datetime.now():%H:%M:%S} pushed availability for {len(FACILITIES)} facilities")
    time.sleep(60)
