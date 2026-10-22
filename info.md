# SwasthSetu — Project Info

Single page with everything the team needs: what we build, who owns what, the stack, the models, the API contract and the open decisions.
Master reference: `docs/Documentation - Health Risk Detection.pdf`. When this file and the PDF disagree, this file has the latest decisions.

> Triage support, not diagnosis. Every result screen, PDF and API response says so.

---

## 1. What we are building

**Phase 1 (now): a mobile-first web app** that runs in the phone browser (installable as a PWA).
**Phase 2 (after the web version is complete): the native mobile app**, reusing the same backend and API.

A patient goes through a guided check and gets:

1. An instant **emergency warning** if any red flag is present (deterministic rules, no ML).
2. **Risk scores** for hypertension, diabetes and cardiovascular disease, each with the top 3 reasons (SHAP).
3. **Camera heart rate** (rPPG) with a signal-quality check and openly stated accuracy limits.
4. A **triage level**: Emergency / Urgent / Routine / Self-care.
5. The **best nearby facility**, based on distance, cost / PM-JAY, wait time, availability and rating.
6. Outputs: a **printable summary**, a **SOAP note** for clinicians and a **FHIR R4 JSON** export.

Languages: English, Hindi, Marathi (voice plus big icon buttons).

Demo stories:
- **Emergency:** chest pain + sweating → red alert + nearest emergency hospital.
- **Sunita (chronic):** 45 years, high BMI, family history of diabetes → Medium hypertension, High diabetes, PHC recommendation, PDF.
- **Priya (pregnant):** raised BP + swelling → Urgent, maternity-capable facility.
- **Clinician view:** the same case as a SOAP note and FHIR JSON.

---

## 2. Team

| Person  | Owns |
|---------|------|
| Anish   | Backend (FastAPI): API, rules, triage, facilities, reports, model integration |
| Pravesh | ML models + SHAP, delivered through a `predict()` function (see section 5) |
| Nidhi   | Frontend + documentation |

---

## 3. Latest changes (vs the PDF)

| Topic | PDF says | Now |
|-------|----------|-----|
| Platform | React Native Expo Android app | **Web app first** (React + Vite PWA). Native mobile app only after the web version is complete |
| Auth | Supabase JWT | **Sessions** (see section 7) |
| Location | not fixed | **GPS** via the browser / device location API; manual district list if permission is denied |
| ML algorithm | XGBoost | **XGBoost dropped.** Pravesh is choosing (Random Forest / Logistic Regression likely). The backend does not care which one, see section 5 |
| Facility ranking | distance + type + scheme | Ranked by **time to see a doctor** (travel + doctor arrival + queue). Then cost / PM-JAY, rating (section 8) |
| Doctor availability | not covered | Hospitals push roster/queue to a partner endpoint (simulated for the demo, section 8) |

---

## 4. Tech stack

**Frontend (phase 1, web):** React + Vite + TypeScript + `vite-plugin-pwa`, `react-i18next`, `react-leaflet` + OpenStreetMap, IndexedDB for the offline queue. Hosted on Vercel. Full guide: [frontend.md](frontend.md).
Why web first: camera heart rate needs per-frame pixel access (a few lines with canvas in the browser, a native module + dev build in React Native), the browser has free speech APIs, and judges only need a link.

**Mobile (phase 2):** decided after the web version is done. Options: wrap the same web code with Capacitor (fastest reuse), or a native Expo app. The backend and API stay the same either way, so keep all API calls in one frontend module.

**Backend: Python 3.11 + FastAPI.** Why not Node:
- Pravesh's models are Python (scikit-learn, `.joblib`). SHAP only exists in Python. A Node backend would still need a Python server next to it.
- Signal processing for rPPG (detrend, bandpass, FFT) is a few lines with NumPy/SciPy.
- FastAPI generates Swagger docs at `/docs` and an OpenAPI schema at `/openapi.json`, so the frontend always sees the current contract.

Libraries: `fastapi`, `uvicorn`, `pydantic`, `numpy`, `scipy`, `scikit-learn`, `shap`, `joblib`, `itsdangerous` (signed session cookie).
Storage: SQLite (Python stdlib) for the demo. Supabase only if we need history across devices.
Hosting: Render or Railway (HTTPS is required, see section 10).

---

## 5. ML models

### Core (required by the problem statement)

| # | Model | Detects | Inputs | Output |
|---|-------|---------|--------|--------|
| 1 | Hypertension | Risk of high BP | age, sex, BMI, smoking, alcohol, activity, family history, symptoms (headache, dizziness), optional BP | probability, level, top 3 factors |
| 2 | Cardiovascular | Risk of heart disease | age, sex, BMI, systolic, diastolic, smoking, alcohol, activity, known diabetes, symptoms (chest discomfort, breathlessness) | probability, level, top 3 factors |
| 3 | Diabetes (type 2) | Risk without lab tests | age, sex, BMI, activity, family history of diabetes, known high BP, symptoms (thirst, frequent urination, blurred vision) | probability, level, top 3 factors |

Dataset candidates (from the PDF): Kaggle Cardiovascular 70k, CDC BRFSS Diabetes Indicators, NHANES / Kaggle hypertension.
Risk bands: Low < 0.33, Medium 0.33–0.66, High > 0.66 (tune to favour recall for High).
Hypertension: if the training label is derived from BP, BP must not be an input (label leakage).

### Optional (in the PDF; build only if time allows)

| # | Model | Notes |
|---|-------|-------|
| 4 | Maternal risk (UCI dataset) | Pregnancy red flags (rule RF05) are the safety layer anyway |
| 5 | PPG signal quality | Can start as an SNR threshold instead of ML |
| 6 | Cough classifier | Problem statement says pick rPPG **over** cough |

### Delivered models (in `models/`, loaded by `backend/app/risk.py`)

| Condition | File | Model | Bands (calibrated) |
|-----------|------|-------|--------------------|
| Hypertension | `hypertension/htn_bundle.joblib` | LightGBM + isotonic, no BP input (leakage) | low < 0.20 ≤ medium < 0.45 ≤ high |
| Diabetes | `diabetes/dm_bundle.joblib` | LightGBM + isotonic | low < 0.10 ≤ medium < 0.25 ≤ high |
| CVD | `cvd/cvd_nolab_bundle.joblib` | LightGBM + isotonic (Kaggle 70k), **needs BP** | low < 0.30 ≤ medium < 0.60 ≤ high |
| Maternal | `maternal/maternal_bundle.joblib` | Random Forest, 3-class + high-risk head | high if p_high ≥ 0.25 |

- Explanations: LightGBM TreeSHAP (`pred_contrib`) and `shap.TreeExplainer` for the Random Forest. A factor is only shown when it is true for the user (no "regular alcohol use" for non-drinkers).
- Intake fields the models want but we don't ask (waist, sleep, sedentary minutes) are sent as missing; the LightGBM models learned missing values. Maternal fills missing blood sugar / temperature / heart rate with UCI medians.
- Skipped on purpose: a condition the user already has (known diabetes → no diabetes score), CVD without a BP reading, maternal when not pregnant.
- Measured BP ≥ 140/90 raises hypertension to at least Medium by rule (`model_version` ends in `+bp-rule`).
- Loading is restricted to numpy/sklearn/joblib classes (pickles can run code). Requires `scikit-learn==1.9.1`.
- `smoking_status`: 0 never / 1 former / 2 current (confirmed by Pravesh). The intake only asks yes/no, so smokers are sent as 2.
- Pregnancy: the CVD card is still shown, with a `note` that it is not validated in pregnancy (the Kaggle data had no pregnant women), and it does not affect triage. The maternal model and rules decide.
- Still to confirm with Pravesh: alcohol (yes = 104 days/year, 2 drinks/day) and activity (low/moderate/high = 0/150/300 min/week) mappings in `risk.py`.

### Original contract (superseded by the bundles above)

Pravesh delivers `ml/predict.py` plus model files. The backend calls exactly this:

```python
def predict(condition: str, features: dict) -> dict:
    # condition: "hypertension" | "diabetes" | "cvd"
    # features: the common intake keys below (missing keys allowed)
    return {
        "probability": 0.58,
        "model_version": "2026.10.1",
        "top_factors": [  # top 3 SHAP factors, highest impact first
            {"feature": "bmi", "impact": 0.14},
            {"feature": "age", "impact": 0.09},
            {"feature": "family_history_diabetes", "impact": 0.07},
        ],
    }
```

Common intake keys:
`age, sex, height_cm, weight_kg, smoker, alcohol, activity_level, family_history_diabetes, family_history_cvd, known_diabetes, known_hypertension, systolic, diastolic, symptoms`

`top_factors[].feature` must use the common key names (plus `bmi` and `symptoms`) so the backend can show translated text.
Optional: `ml/model_cards.json` (list of cards) is served as-is by `GET /models`.
Pravesh owns preprocessing, feature order, the model choice and SHAP. Each dataset has different columns, so mapping the common keys to each model's columns happens inside `predict()`.
The backend turns `level` and the plain-language `text` (3 languages) into the response.
Until `predict.py` exists, the backend returns mock values in the same shape, so the frontend is never blocked.

---

## 6. Emergency red flags (no ML, deterministic)

Run on every symptom tap and on final submit. Any match means **"Go to emergency now"** plus Call 108 and the nearest emergency facility.

| ID | Rule |
|----|------|
| RF01 | Chest pain/pressure with sweating, nausea, arm/jaw pain or breathlessness |
| RF02 | Systolic ≥ 180 or diastolic ≥ 120 |
| RF03 | Stroke signs: one-side weakness, face drooping, slurred speech, sudden vision loss |
| RF04 | Severe breathlessness at rest |
| RF05 | Pregnancy with bleeding, severe headache + blurred vision, convulsions, reduced baby movement, or BP ≥ 160/110 |
| RF06 | Fainting / loss of consciousness |
| RF07 | Diabetic with confusion, extreme drowsiness, fruity breath or persistent vomiting |
| RF08 | Heart rate > 150 or < 40 at rest with symptoms (only if signal quality is good) |
| RF09 | Coughing blood |
| RF10 | Seizure |

Every rule gets a unit test, including boundary values (179 vs 180, etc.).

Symptom codes shared by frontend and backend: [frontend.md](frontend.md) section 4. Use those exact strings.
Input ranges (validated on both sides): age 1–120, height 50–250 cm, weight 2–300 kg, systolic 60–260, diastolic 30–160.

### Triage logic (first match wins)

1. Any red flag → **Emergency**
2. Any condition High + a relevant symptom, or BP ≥ 160/100 → **Urgent** (see a doctor within 24 h)
3. Any condition Medium or High → **Routine** (visit a PHC within a week)
4. Otherwise → **Self-care** (lifestyle guidance + recheck)

---

## 7. Sessions (replaces JWT)

- On app start the frontend calls `POST /api/v1/session`. The backend creates a session and sets a signed cookie (`SessionMiddleware`).
- All later calls send the cookie automatically. Guest only, no login for the demo.
- **Gotcha:** if frontend and backend are on different domains (e.g. Vercel + Render), the cookie needs `SameSite=None; Secure`, CORS needs `allow_credentials=True` with the **exact** frontend origin (not `*`), and the frontend must use `fetch(url, { credentials: "include" })`.
  Simpler alternative: put both behind one domain, or return `session_id` in the body and send it as an `X-Session-Id` header.

---

## 8. Facility recommender

Data: a curated JSON of 30–80 facilities around Nagpur (seeded from OpenStreetMap). Each facility:

```json
{
  "id": "fac_01",
  "name": "Government Medical College & Hospital, Nagpur",
  "type": "medical_college",
  "lat": 21.1356, "lng": 79.0849,
  "phone": "0712-xxxxxxx",
  "services": ["emergency", "maternity", "ncd_clinic", "lab"],
  "emergency_capable": true,
  "pmjay_empanelled": true,
  "cost_tier": "free",
  "open_24x7": true,
  "rating": 4.1,
  "review_count": 212,
  "availability": {
    "doctors": [{ "specialty": "general", "on_duty": true, "arrives_in_min": 0 },
                { "specialty": "gynaecology", "on_duty": false, "arrives_in_min": 40 }],
    "queue_wait_min": 20,
    "updated_at": "2026-10-22T13:05:00+05:30"
  },
  "simulated_fields": ["availability", "rating", "review_count"]
}
```

Location: patient GPS (`lat`, `lng`) from the frontend. Distance by Haversine, travel time from distance (assume ~25 km/h in town).

### Ranking: time to see a doctor

A great rating is useless if no doctor is there. Availability is a gate, reviews are only a tie-breaker.

```
time_to_doctor = travel_min + max(0, doctor_arrives_in_min - travel_min) + queue_wait_min
```

Example: A is 10 min away but the doctor arrives in 60 min (≈ 60 + queue). B is 25 min away with a doctor on duty (≈ 25 + queue). B wins.

By triage level:
- **Emergency:** only `emergency_capable` + `open_24x7` with a doctor on duty. Sort by `time_to_doctor`. Ratings ignored.
- **Urgent / maternal high risk:** the relevant specialist must be available (maternal → `maternity` service + gynaecology). Sort by `time_to_doctor`.
- **Routine / Self-care:** weighted score of `time_to_doctor`, cost (free / PM-JAY first), rating.

### Live availability (partner integration)

- Hospital software (HMIS) pushes doctor roster and queue to `POST /api/v1/partner/availability`.
- Modelled on FHIR `PractitionerRole.availableTime`, `Schedule` and `Slot`, so any FHIR-capable HMIS can plug in. (No public Indian HMIS API exists for this today; ABDM HFR/HPR registries list facilities and doctors but not live duty rosters.)
- Demo: a small mock "hospital server" script pushes changing data every minute, labelled **simulated**.
- Stale data: if `updated_at` is older than 30 min, availability counts as unknown ("call before going") and the facility is ranked by travel time + an assumed 30 min wait. Fresh data with no doctor of the needed specialty → listed last.
- Emergency screens always keep **Call 108**, whatever the availability data says.

PM-JAY eligibility: a short rule-based questionnaire (ration card, SECC deprivation, age 70+) → Likely / Possibly / Not likely, plus documents to carry. Always labelled **"indicative, verify at the facility"**.

**Simulated and labelled as such on screen and on the slides:** wait times, doctor availability, ratings/reviews, appointment booking. Judges punish hidden fakery.

---

## 9. API contract (v1)

Base: `/api/v1`. Live schema and "try it out": `<backend-url>/docs`.

| Method | Path | Purpose |
|--------|------|---------|
| GET  | `/health` | Health check |
| POST | `/session` | Start a guest session (sets cookie) |
| POST | `/redflags` | Run RF01–RF10 on the current intake |
| POST | `/assess` | Full intake → red flags + risks + triage level; saves the assessment |
| POST | `/vitals/rppg` | Green-channel signal → BPM + quality |
| GET  | `/facilities/nearby?lat=&lng=&triage_level=&service=` | Facilities ranked by time to see a doctor |
| POST | `/partner/availability` | Hospital software pushes doctor roster + queue (mock pusher for the demo) |
| POST | `/schemes/eligibility` | PM-JAY indicative check |
| GET  | `/assessments/{id}/soap` | SOAP note JSON |
| GET  | `/assessments/{id}/fhir` | FHIR R4 Bundle (Patient, Observation, RiskAssessment) |
| GET  | `/models` | Model cards: version, dataset, metrics, limitations |

PDF summary: rendered by the frontend from the assessment (`window.print()` on a print-styled page). No backend endpoint.

### `POST /redflags`

```json
// request
{ "symptoms": ["chest_pain", "sweating"], "systolic": 150, "diastolic": 95,
  "is_pregnant": false, "heart_rate": null, "heart_rate_quality": null }
// response
{ "emergency": true,
  "rules": [{ "id": "RF01", "message_key": "rf01_chest_pain" }] }
```

### `POST /assess`

```json
// request
{ "language": "mr", "lat": 21.1458, "lng": 79.0882,
  "features": { "age": 45, "sex": "F", "height_cm": 155, "weight_kg": 72,
    "smoker": false, "alcohol": false, "activity_level": "low",
    "family_history_diabetes": true, "family_history_cvd": false,
    "systolic": 142, "diastolic": 92, "is_pregnant": false,
    "symptoms": ["headache", "dizziness", "frequent_urination"] },
  "heart_rate": { "bpm": 78, "quality": "good" } }
// response
{ "assessment_id": "a1b2...",
  "red_flags": [],
  "triage_level": "routine",
  "results": [
    { "condition": "hypertension", "probability": 0.58, "level": "medium",
      "model_version": "2026.10.1",
      "top_factors": [
        { "feature": "systolic", "impact": 0.21, "text": "Your upper BP reading is higher than normal" },
        { "feature": "bmi", "impact": 0.14, "text": "Weight is higher for your height" },
        { "feature": "age", "impact": 0.09, "text": "Risk rises with age" } ] } ],
  "disclaimer": "Screening guidance, not a diagnosis." }
```

### `POST /vitals/rppg`

Proposal: the frontend does **not** upload video. It records 20–30 s of the face inside an oval guide, takes the mean green value of that region per frame, and sends the numbers. The video never leaves the phone (good privacy point for the slides).

```json
// request
{ "fps": 30, "green": [112.4, 112.9, 113.1, "... ~900 values"] }
// response
{ "bpm": 78, "quality": "good", "quality_score": 0.91, "reasons": [],
  "note": "Screening estimate, not a medical device." }
```

Backend: detrend → bandpass 0.7–4 Hz → FFT peak → BPM. Quality from signal-to-noise ratio. If quality is poor: no BPM, a reason ("too dark", "too much movement"), retry, or manual pulse entry.

### `GET /facilities/nearby`

```json
[{ "id": "fac_01", "name": "PHC Hingna", "type": "phc",
   "lat": 21.14, "lng": 79.08, "phone": "0712-xxxxxxx",
   "distance_km": 2.4, "travel_min": 9,
   "doctor_available": true, "doctor_arrives_in_min": 0,
   "queue_wait_min": 15, "time_to_doctor_min": 24,
   "availability_updated_min_ago": 4,
   "cost_tier": "free", "pmjay_empanelled": true,
   "rating": 4.3, "review_count": 88,
   "simulated_fields": ["doctor_available", "doctor_arrives_in_min", "queue_wait_min", "rating", "review_count"] }]
```

### `POST /partner/availability`

```json
{ "facility_id": "fac_01",
  "doctors": [{ "specialty": "general", "on_duty": true, "arrives_in_min": 0 }],
  "queue_wait_min": 15,
  "updated_at": "2026-10-22T13:05:00+05:30" }
```

### FHIR

Bundle type `collection` with:
- `Patient`: gender, age, language.
- `Observation`: BP (LOINC 85354-9, components 8480-6 / 8462-4) and heart rate (LOINC 8867-4, quality in a note).
- `RiskAssessment`: one per condition, with `qualitativeRisk` and `probabilityDecimal`.

Validate once with the public HAPI FHIR validator before the demo.

---

## 10. Integration rules

1. **The contract comes first.** The backend ships every endpoint with mock data on day one; real logic replaces the mocks without changing the shapes.
2. The frontend generates types from the live schema:
   `npx openapi-typescript <backend-url>/openapi.json -o src/api.d.ts`
   A renamed field then fails at compile time instead of during the demo.
3. **Deploy the backend early on HTTPS.** Phone browsers only allow camera, microphone and GPS on HTTPS, and an HTTPS frontend cannot call an HTTP backend.
4. Run the full Sunita flow end to end every few hours.
5. Any change to a request/response shape goes into section 9 of this file first, then into the code.

---

## 11. Open decisions

- [x] Platform: **web app first**, native mobile after the web version is complete.
- [ ] Mobile phase: Capacitor wrapper or native Expo? (decide after web is done)
- [ ] Final model algorithm and datasets (Pravesh).
- [ ] Maternal / PPG-quality / cough models: in or out?
- [ ] Red flags offline? If yes, the frontend needs a JS copy of the RF01–RF10 rules, kept in sync with the backend tests.
- [ ] Session: cookie (needs same domain or the cross-site settings above) or `X-Session-Id` header?
- [ ] Who submits on the portal.

---

## 12. Running the backend

```bash
cd backend
python -m venv .venv && .venv/Scripts/activate      # Linux/Mac: source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload                        # http://localhost:8000/docs
python mock_hospital.py                              # second terminal: simulated hospital availability
python -m pytest -q                                  # tests
```

Environment variables:

| Var | Default | Production |
|-----|---------|------------|
| `CORS_ORIGINS` | `http://localhost:5173` | exact frontend URL(s), comma-separated |
| `SESSION_SECRET` | `dev-only-change-me` | long random string |
| `COOKIE_SAMESITE` | `lax` | `none` if frontend and backend are on different domains |
| `COOKIE_SECURE` | off | `1` (required with `none`) |
| `PARTNER_KEY` | `dev-partner-key` | random string, shared with the hospital pusher |
| `API_URL` | `http://localhost:8000` | used by `mock_hospital.py` only |

Layout: `app/main.py` (routes), `schemas.py` (contract), `rules.py` (red flags, triage, PM-JAY), `risk.py` (Pravesh hook + mock), `facilities.py` + `data/facilities.json`, `rppg.py`, `reports.py` (SOAP, FHIR). Tests: `tests/test_core.py`.

Facility data: names are real public facilities around Nagpur, but coordinates are approximate and phone numbers are empty. Verify against OpenStreetMap before the demo. Availability, ratings and reviews are simulated.

## 13. Build order (backend)

Done: 1–10 below (mock risk scores until `ml/predict.py` lands). Next: deploy, real models, HAPI FHIR validation, real facility coordinates.

1. FastAPI skeleton + `/health` + mock endpoints, deployed → link to Nidhi
2. Red-flag engine + tests
3. Triage logic + tests
4. Facilities JSON + Haversine + `time_to_doctor` ranking
5. `/partner/availability` + mock hospital pusher script + stale-data rule
6. Session middleware
7. `/assess` wired to `predict()` (mock until Pravesh delivers)
8. rPPG signal → BPM
9. SOAP + FHIR builders
10. PM-JAY eligibility, `/models` cards
