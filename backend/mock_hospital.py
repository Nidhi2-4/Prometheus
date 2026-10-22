"""Simulated hospital software (HMIS): pushes random doctor availability every minute over the partner API. Demo only.

Run next to the API, from backend/:  python mock_hospital.py
Env: API_URL (default http://localhost:8000), PARTNER_KEY (must match the API).
Deployed without this script? Set SIMULATE_AVAILABILITY=1 on the API instead.
"""
import json
import os
import time
import urllib.request
from datetime import datetime

from app.facilities import FACILITIES, random_roster

API = os.environ.get("API_URL", "http://localhost:8000") + "/api/v1/partner/availability"
KEY = os.environ.get("PARTNER_KEY", "dev-partner-key")

while True:
    for f in FACILITIES:
        body = random_roster(f)
        body["updated_at"] = body["updated_at"].isoformat()
        req = urllib.request.Request(API, data=json.dumps(body).encode(), method="POST",
                                     headers={"Content-Type": "application/json", "X-Partner-Key": KEY})
        try:
            urllib.request.urlopen(req).close()
        except OSError as e:  # API down or restarting: keep going, next round retries
            print(f"{datetime.now():%H:%M:%S} push failed for {f['id']}: {e}")
            break
    else:
        print(f"{datetime.now():%H:%M:%S} pushed availability for {len(FACILITIES)} facilities")
    time.sleep(60)
