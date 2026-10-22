# Swasthik — Project Reference

The one place to look things up: what we built, how to run it, how each part works, what is simulated, what is still open.
Frontend contract with full request/response examples: [FRONTEND.md](FRONTEND.md). Live API with "Try it out": `<backend-url>/docs`.
Original spec (older decisions): `docs/Documentation - Health Risk Detection.pdf`. Problem statement: `image.png`.
**When this file disagrees with the PDF or PROJECT_SPEC.md, this file is current.** Last updated 2026-10-22.

> Triage support, not diagnosis. Every result screen, PDF and API response says so.

---

## Contents

1. [What we built](#1-what-we-built)
2. [Team](#2-team)
3. [Status against the problem statement](#3-status-against-the-problem-statement)
4. [Run it locally](#4-run-it-locally)
5. [Architecture and repo layout](#5-architecture-and-repo-layout)
6. [Risk models](#6-risk-models)
7. [Red flags and triage](#7-red-flags-and-triage)
8. [Camera heart rate (rPPG)](#8-camera-heart-rate-rppg)
9. [Facility recommender and live availability](#9-facility-recommender-and-live-availability)
10. [PM-JAY eligibility](#10-pm-jay-eligibility)
11. [Reports: summary, SOAP, FHIR](#11-reports-summary-soap-fhir)
12. [Sessions](#12-sessions)
13. [API reference](#13-api-reference)
14. [What is simulated](#14-what-is-simulated)
15. [Before the demo (to do)](#15-before-the-demo-to-do)
16. [Decision log](#16-decision-log)
17. [Gotchas](#17-gotchas)
18. [Slide notes](#18-slide-notes)

---

## 1. What we built

A mobile-first **web app** (installable PWA). A patient answers a short guided check by tapping icons or speaking, and gets:

1. An instant **emergency alert** when a red flag is present (deterministic rules, no ML), with Call 108 and the nearest emergency facility.
2. **Risk cards** for hypertension, diabetes, cardiovascular disease and (if pregnant) maternal risk, each with plain-language reasons from SHAP.
3. A **camera heart rate** reading with a signal-quality gate. The video never leaves the phone.
4. A **triage level**: Emergency / Urgent / Routine / Self-care.
5. **Nearby facilities** ranked by how fast the patient can actually see a doctor, with cost, PM-JAY and rating.
6. A **printable summary** (PDF), a **SOAP note** for the clinician and a **FHIR R4** export.

Languages: English, Hindi, Marathi, Gujarati, Telugu, Kannada.

Phase 2 (after the web version is complete): native mobile app reusing the same backend and API (Capacitor wrapper or Expo, not decided).

### Demo stories

| Story | Input | Expected result (checked 2026-10-22 on the real models) |
|---|---|---|
| Emergency | Chest pain + cold sweat | RF01 fires → full-screen alert, Call 108, nearest emergency hospital |
| Sunita, 45 F | BMI 30, low activity, family history of diabetes, BP 142/92, headache, dizziness, frequent urination | Hypertension **Medium**, Diabetes **High**, triage **Routine**, nearest PHC, PDF |
| Priya, 26 F, pregnant 24 wk | BP 145/95, swelling | Maternal **High** (0.88), triage **Urgent**, maternity facilities; CVD card shows "not validated in pregnancy" |
| Clinician view | Any of the above | SOAP note + FHIR JSON |

---

## 2. Team

| Person | Owns |
|---|---|
| Anish | Backend (FastAPI): API, rules, triage, facilities, reports, model integration |
| Pravesh | ML models (delivered in `models/`) |
| Nidhi | Frontend (React + Vite PWA) and documentation |

---

## 3. Status against the problem statement

| Requirement | Status | Where |
|---|---|---|
| Voice + icon intake in 2–3 languages | ✅ 6 languages, icon symptom cards, speech input and read-aloud | `frontend/src/services/voice.ts`, `i18n/translations.ts` |
| Emergency red flags, deterministic, no ML | ✅ RF01–RF10, same rules on device and server, tested | `backend/app/rules.py`, `frontend/src/services/redFlagEngine.ts` |
| Risk scoring for 2–3 conditions (XGBoost / Random Forest) | ✅ Hypertension, diabetes, CVD with **LightGBM** (gradient boosting, same family as XGBoost); maternal with **Random Forest** | `models/`, `backend/app/risk.py` |
| SHAP explanations | ✅ per-patient TreeSHAP, top reasons in the user's language | `backend/app/risk.py` |
| One smartphone screening tool: rPPG | ✅ pipeline works; ⚠️ **no measured accuracy yet** (see section 15) | `frontend/src/components/HeartRateScanner.tsx`, `backend/app/rppg.py` |
| Facility recommender, Leaflet + OSM | ✅ map, distance, ranked list | `frontend/src/components/CareScreen.tsx`, `backend/app/facilities.py` |
| PM-JAY eligibility by simple rules | ✅ indicative, "verify at facility" | `backend/app/rules.py` |
| Cost and wait-time tiers | ✅ cost tier, wait time (simulated, labelled) | `backend/app/data/facilities.json` |
| Printable PDF summary | ✅ print page → Save as PDF | `frontend/src/components/SummaryScreen.tsx` |
| SOAP clinician view | ✅ | `backend/app/reports.py`, `DoctorScreen.tsx` |
| FHIR export (Patient, Observation, RiskAssessment) | ✅; ⚠️ not yet run through the HAPI validator | `backend/app/reports.py` |
| Fakes clearly labelled "simulated" | ✅ in the app; also say it on the slides | section 14 |
| "Triage support, not diagnosis" | ✅ every result and the PDF | |
| Cough audio (listed in `image.png`) | ❌ not built on purpose: the detailed statement says pick rPPG **over** cough | |
| Blood pressure logs (listed in `image.png`) | ⚠️ BP is entered during the check; no history/trend of past readings | |

---

## 4. Run it locally

### Backend

```powershell
cd backend
python -m venv .venv                                  # once
.venv\Scripts\python -m pip install -r requirements.txt   # once
.venv\Scripts\python -m uvicorn app.main:app --port 8001   # http://localhost:8001/docs
```

Second terminal, simulated hospital availability (pushes every minute):

```powershell
cd backend
$env:API_URL = "http://localhost:8001"; .venv\Scripts\python mock_hospital.py
```

Tests: `cd backend` then `.venv\Scripts\python -m pytest -q` (8 tests: rules, triage, models, safe loading, rPPG, ranking, API flow).

Why port 8001: on Anish's laptop port 8000 is taken by another project (KisanAI), which an IDE agent keeps restarting. Any free port works; point the frontend at it.

### Frontend

```powershell
cd frontend
npm install                     # once
npm run dev                     # http://localhost:5173
```

`frontend/.env.local` (not committed) tells the frontend where the backend is:

```
VITE_BACKEND_URL=http://localhost:8001/api/v1
```

Open **`http://localhost:5173`**, not `127.0.0.1:5173`: the session cookie is only sent when the page and the API use the same host name.

Without the backend the app still runs: red flags work on the device and results fall back to a rough local estimate with an "offline estimate" banner.

### Environment variables (backend)

| Var | Default | Production |
|---|---|---|
| `CORS_ORIGINS` | `http://localhost:5173,http://127.0.0.1:5173` | exact frontend URL(s), comma-separated |
| `SESSION_SECRET` | `dev-only-change-me` | long random string |
| `COOKIE_SAMESITE` | `lax` | `none` when frontend and backend are on different domains |
| `COOKIE_SECURE` | off | `1` (required with `none`) |
| `PARTNER_KEY` | `dev-partner-key` | random string shared with the hospital pusher |
| `MODEL_DIR` | `<repo>/models` | where the model bundles are |
| `API_URL` | `http://localhost:8000` | `mock_hospital.py` only |

---

## 5. Architecture and repo layout

```
Phone browser (React + Vite PWA)
  ├─ intake, symptom icons, voice (Web Speech API)
  ├─ red-flag engine (offline copy of RF01–RF10)
  ├─ camera → mean green value per frame (video stays on the phone)
  ├─ GPS (district list if denied), Leaflet + OpenStreetMap
  └─ IndexedDB queue for offline assessments
        │  HTTPS + session cookie
        ▼
FastAPI backend (Python 3.12)
  ├─ rules.py       red flags, triage, PM-JAY
  ├─ risk.py        4 models + SHAP, safe loading
  ├─ rppg.py        filter + FFT → BPM + quality
  ├─ facilities.py  ranking by time to see a doctor, live availability
  └─ reports.py     SOAP, FHIR R4
        ▲
        │  POST /partner/availability (X-Partner-Key)
mock_hospital.py  (simulated hospital software)
```

```
backend/
  app/main.py          routes, CORS, sessions
  app/schemas.py       request/response models = the API contract
  app/rules.py         RF01–RF10, triage, PM-JAY
  app/risk.py          model loading, feature mapping, SHAP, factor texts (6 languages)
  app/rppg.py          heart rate from green-channel signal
  app/facilities.py    ranking + availability store
  app/reports.py       SOAP + FHIR
  app/data/facilities.json
  mock_hospital.py     simulated availability pusher
  tests/test_core.py
frontend/src/
  App.tsx              screens and flow
  services/api.ts      every backend call + offline fallbacks
  services/redFlagEngine.ts, rppg.ts (offline fallback), voice.ts, offlineQueue.ts, facilitiesData.ts (offline list)
  components/          CareScreen, DoctorScreen, SummaryScreen, SchemeScreen, HeartRateScanner, EmergencyAlert
  i18n/translations.ts all UI text and the symptom catalog
models/                Pravesh's model bundles (joblib)
```

Storage: assessments live in backend memory (lost on restart). Add SQLite when assessment history is needed.

---

## 6. Risk models

| Condition | File | Model | Bands (calibrated by Pravesh) |
|---|---|---|---|
| Hypertension | `models/hypertension/htn_bundle.joblib` | LightGBM + isotonic calibration. No BP input (avoids label leakage) | low < 0.20 ≤ medium < 0.45 ≤ high |
| Diabetes | `models/diabetes/dm_bundle.joblib` | LightGBM + isotonic | low < 0.10 ≤ medium < 0.25 ≤ high |
| CVD | `models/cvd/cvd_nolab_bundle.joblib` | LightGBM + isotonic (Kaggle 70k). Needs BP | low < 0.30 ≤ medium < 0.60 ≤ high |
| Maternal | `models/maternal/maternal_bundle.joblib` | Random Forest, 3-class + separate high-risk model | High if p(high) ≥ 0.25, else the 3-class winner |

Not used: `cvd_lab_bundle` (needs cholesterol and glucose), `dm_bundle_nofh` (for the 2021–23 test only), `htn_model.txt` (same model as the bundle).

### How they were trained (`ml/`, Pravesh)

- `ml/Model_1_dataset.py`, `ml/Model_2_dataset.py` build the NHANES datasets (2017–20 = train/validate, 2021–23 = external test). `ml/Promethius.ipynb` trains and evaluates all four. Datasets are not in the repo (1 GB, public sources).
- **Hypertension:** NHANES adults 18–80, **pregnant women excluded**. Label = measured BP ≥ 140/90 or on BP medicine (so it includes treated hypertension). BP itself is not a feature. LightGBM with monotone constraints (risk only rises with age, BMI, waist, diabetes), 60/20/20 split, isotonic calibration on the validation split. Top drivers: age, waist, known diabetes, BMI, activity.
- **Diabetes:** NHANES adults 20–80, pregnant excluded. Label = HbA1c ≥ 6.5 or diagnosed or on medicine; evaluated on **undiagnosed** diabetes among people not yet diagnosed (that is the app's job). Beats the Indian Diabetes Risk Score baseline (AUROC 0.79 vs 0.72). Referral threshold set to refer the top 25 %.
- **CVD:** Kaggle cardio 70k (ages 30–65, 65 % women). Rows with impossible values removed (BP outside 80–240 / 40–150, systolic ≤ diastolic). "No-lab" model: age, sex, BMI, BP, smoker, alcohol, active.
- **Maternal:** UCI maternal health (1,014 rows, 55 % duplicates → 452 unique). Random Forest picked for high-risk recall. Separate high-vs-not model, threshold 0.25 catches 90 % of high-risk. Plus a clinical rule layer (below).
- Values outside the training ranges were set to missing during training (e.g. BMI outside 13–70); the backend does the same.

### Test-set metrics (`models/diabetes/final_metrics.csv`, also served by `GET /models`)

| Model | Test set | n | AUROC | Sensitivity | Specificity | PPV |
|---|---|---|---|---|---|---|
| Hypertension | internal 2017–20 | 1,590 | 0.841 | 0.849 | 0.676 | 0.636 |
| Hypertension | external 2021–23 | 6,084 | 0.816 | 0.868 | 0.609 | 0.587 |
| Undiagnosed diabetes | internal 2017–20 | 1,323 | 0.786 | 0.975 | 0.394 | 0.048 |
| Undiagnosed diabetes | external 2021–23 | 4,826 | 0.753 | 0.961 | 0.381 | 0.041 |
| CVD (no lab) | held-out test | 13,703 | 0.789 | 0.863 | 0.484 | 0.621 |
| Maternal (urgent) | 5-fold CV | 452 | 0.927 | 0.902 | 0.759 | 0.552 |

Read the diabetes row honestly: it is a screening net (catches ~96 % of undiagnosed cases) with many false alarms (PPV ~4–5 %), which is acceptable for "go get a blood test", not for a diagnosis. Confusion matrices: `models/confusion_matrices.png`.

### Camera heart rate: what Pravesh's notebook assumes

The notebook's PPG section (`Heart PPG`, BUT-PPG dataset) is designed for **fingertip on camera + flash, red channel**, with a LightGBM signal-quality model. Our app measures the **face, green channel** (as the problem statement asks). That PPG bundle was not saved (`models/ppg/` does not exist), so the backend uses its own filter + FFT + peak-share quality gate. Team decision pending: keep face rPPG, or add a fingertip mode (more accurate, uses his quality model once saved).

### How the backend uses them (`backend/app/risk.py`)

- **Explanations:** LightGBM's built-in TreeSHAP (`pred_contrib=True`); `shap.TreeExplainer` for the Random Forest. Model features are grouped into intake terms (waist and BMI → "weight"), top 3 positive ones are shown.
- **A reason is only shown when it is true for the user.** SHAP can push risk up for a "safe" value (non-drinkers in NHANES); we never tell a non-drinker "regular alcohol use".
- **Values we don't ask** (waist, sleep, sedentary minutes) are sent as missing; the LightGBM models learned missing values. Maternal fills missing blood sugar / temperature / heart rate with UCI medians (7.5 mmol/L, 98 °F, 76 bpm). Missing values are never used as reasons.
- **Mappings:** smoking yes → `smoking_status` 2 (0 never, 1 former, 2 current, confirmed by Pravesh). Alcohol yes → 104 days/year, 2 drinks/day. Activity low/moderate/high → 0/150/300 min/week; CVD `active` = not low. Blood sugar mg/dL → mmol/L, °C → °F for the maternal model.
- **Skipped on purpose:** a condition already diagnosed (known diabetes → no diabetes card), anyone under 18 for the three chronic models (trained on adults), CVD without a valid BP reading (80–240 / 40–150, systolic > diastolic, as in its training data), maternal when not pregnant. So `results` has 0–4 cards.
- **Maternal rule layer** (Pravesh's `maternal_risk()`, only with values the user gave): BP ≥ 160/110, blood sugar ≥ 11.1 mmol/L (200 mg/dL) or heart rate ≥ 120 → High; BP ≥ 140/90, temperature ≥ 100.4 °F or age < 18 / ≥ 35 lift Low to Medium. `model_version` ends with `+rules` when a rule changed the level.
- **BP rule:** measured BP ≥ 140/90 lifts hypertension to at least Medium and puts BP first in the reasons (`model_version` ends with `+bp-rule`).
- **Pregnancy:** hypertension, diabetes and CVD cards are still shown, each with a translated `note` ("not validated in pregnancy, follow the pregnancy card"), and they do not affect triage. None of their training sets had pregnant women.
- **Safe loading:** pickles can run code, so loading only allows numpy / sklearn / joblib classes (a test proves a malicious pickle is blocked). Needs `scikit-learn==1.9.1`, the version the models were trained with.
- **Version string:** `<file>-<sha1 prefix>`, shown on every card.

---

## 7. Red flags and triage

Red flags run on the device on every step (works offline) and again on the server in `/assess`. Same rules both sides.

| ID | Rule |
|---|---|
| RF01 | Chest pain with sweating, nausea, arm/jaw pain or breathlessness |
| RF02 | Systolic ≥ 180 or diastolic ≥ 120 |
| RF03 | One-side weakness, face drooping, slurred speech or sudden vision loss |
| RF04 | Breathless at rest |
| RF05 | Pregnant with bleeding, severe headache + blurred vision, convulsions, reduced baby movement, or BP ≥ 160/110 |
| RF06 | Fainting |
| RF07 | Known diabetic with any of: confusion, extreme drowsiness, fruity breath, persistent vomiting |
| RF08 | Heart rate > 150 or < 40 with any symptom, only if signal quality is good |
| RF09 | Coughing blood |
| RF10 | Seizure or convulsions |

Triage (first match wins, `rules.triage`):

1. Any red flag → **Emergency**
2. BP ≥ 160/100, or pregnant with BP ≥ 140/90, or maternal High, or a High risk plus an acute symptom of that condition → **Urgent** (doctor within 24 h)
3. Any Medium/High risk, or cough with fever/breathlessness → **Routine** (PHC within a week)
4. Otherwise → **Self-care**

In pregnancy only the maternal card counts for triage (plus red flags and the pregnancy BP rule). Acute symptoms: hypertension — severe headache, blurred vision, chest pain; diabetes — blurred vision, persistent vomiting, extreme drowsiness; CVD — chest pain, breathlessness, arm/jaw pain.

Input ranges (validated in the app and the API): age 1–120, height 50–250 cm, weight 2–300 kg, systolic 60–260, diastolic 30–160, pregnancy 1–42 weeks. Symptom codes: [FRONTEND.md](FRONTEND.md) section 4.

---

## 8. Camera heart rate (rPPG)

- Phone: front camera, face inside an oval, 25 s. Every frame the app averages the **green** channel of the forehead/cheek area and sends only these numbers (`{fps, green: [...]}`). **The video never leaves the phone.**
- Server (`rppg.py`): detrend → band-pass 0.7–4 Hz (42–240 bpm) → spectrum peak → BPM. Quality = share of power near the peak: ≥ 0.5 good, ≥ 0.3 marginal, else poor. Too dark (mean < 40) or too much movement (raw std > 8) caps quality.
- Poor → no BPM, reason (too dark / hold still / face not visible), retry or manual pulse.
- Offline fallback: a simpler DFT in `frontend/src/services/rppg.ts`.
- Every reading says "Screening estimate, not a medical device."
- **Accuracy is not measured yet.** Thresholds are first guesses (calibration knobs at the top of `rppg.py`).

---

## 9. Facility recommender and live availability

12 facilities around Nagpur in `backend/app/data/facilities.json`: GMCH, Mayo (IGGMC), Daga Women's Hospital, AIIMS, Kamptee SDH, Hingna and Kalmeshwar rural hospitals, Butibori, Mouda and two urban PHCs, and one sample private hospital. **Coordinates are approximate and phone numbers are empty** until verified.

Ranking by **time to see a doctor**, not just distance:

```
time_to_doctor = travel_min + max(0, doctor_arrives_in_min - travel_min) + queue_wait_min
travel_min     = distance (Haversine) at 25 km/h
```

- **Emergency:** only emergency-capable, 24×7 facilities; sorted by `time_to_doctor`; ratings ignored.
- **Urgent:** CHC / sub-district / district / medical college or PM-JAY empanelled; sorted by `time_to_doctor`.
- **Pregnant** (`service=maternity`): only facilities with maternity, and the gynaecologist's availability counts.
- **Routine / Self-care:** `time_to_doctor` + cost penalty (free 0, subsidized 10, paid 25 min) − 5 min per rating point above 3.
- No data or data older than 30 min → "availability unknown, call before going", ranked by travel + 30 min. Fresh data but no doctor of the needed type → listed last.
- Call 108 stays on emergency screens whatever the data says.

**Live availability:** hospital software would push its roster and queue to `POST /api/v1/partner/availability` (header `X-Partner-Key`), shaped after FHIR `PractitionerRole` / `Schedule` / `Slot` so any FHIR-capable HMIS could plug in. No public Indian HMIS API offers live duty rosters today (ABDM HFR/HPR list facilities and doctors only). For the demo `mock_hospital.py` pushes random but realistic rosters every minute, keeping each hospital's real specialties.

---

## 10. PM-JAY eligibility

Four yes/no questions: ration card, BPL/Antyodaya, someone aged 70+, low income.

- **Likely:** 70+ (Ayushman Vay Vandana, any income) or BPL/Antyodaya.
- **Possibly:** ration card or low income.
- **Not likely:** none of these.

Always shows documents to carry and "Indicative only, verify at the facility." Verify current criteria on pmjay.gov.in before the demo.

---

## 11. Reports: summary, SOAP, FHIR

- **Patient summary / PDF:** print-styled page in the app; the browser's print gives "Save as PDF".
- **SOAP** (`GET /assessments/{id}/soap`): Subjective (age, sex, symptoms, history, pregnancy), Objective (BP, BMI, heart rate with quality), Assessment (red flags, each risk with probability and model version, triage), Plan (by triage level).
- **FHIR R4** (`GET /assessments/{id}/fhir`): Bundle `collection` with Patient (gender, birth year, language), Observation BP (LOINC 85354-9 with 8480-6 / 8462-4), Observation heart rate (LOINC 8867-4, quality note), one RiskAssessment per condition (SNOMED outcome, probability, qualitative risk). Stable ids per assessment.

---

## 12. Sessions

- App start: `POST /session` sets a signed cookie. Guest only, no login.
- Only `/assess` and `/assessments/*` need it. Red flags, facilities, rPPG and PM-JAY work without a session, so the emergency path never fails on a cookie problem.
- An assessment can only be read by the session that created it.
- Frontend: every call uses `credentials: 'include'`; on a 401 it starts a new session and retries once.
- Deployed on two domains (Vercel + Render): set `COOKIE_SAMESITE=none`, `COOKIE_SECURE=1`, `CORS_ORIGINS=<exact frontend URL>`. Some browsers (Safari, incognito) block such cookies; the fix is to also accept an `X-Session-Id` header (not built yet).

---

## 13. API reference

Base `/api/v1`. Full examples in [FRONTEND.md](FRONTEND.md) section 5.

| Method | Path | Session | Purpose |
|---|---|---|---|
| GET | `/health` | | Status and loaded models |
| POST | `/session` | | Start a guest session |
| POST | `/redflags` | | RF01–RF10 on the current answers |
| POST | `/assess` | ✔ | Intake → red flags, risk cards, triage; stores the assessment |
| GET | `/assessments/{id}` | ✔ | Stored result |
| GET | `/assessments/{id}/soap` | ✔ | SOAP note |
| GET | `/assessments/{id}/fhir` | ✔ | FHIR R4 Bundle |
| POST | `/vitals/rppg` | | `{fps, green[]}` → BPM, quality, reasons |
| GET | `/facilities/nearby?lat&lng&triage_level&service&limit` | | Ranked facilities |
| POST | `/partner/availability` | key | Hospital roster + queue |
| POST | `/schemes/eligibility` | | PM-JAY check |
| GET | `/models` | | Model versions, bands, features, metrics |

`language` accepts `en, hi, mr, gu, te, kn`. `sex` accepts `M, F, O` (or `other`). Extra fields the frontend sends (gravida, symptom duration) are ignored.

---

## 14. What is simulated

Say this on screen (already done) and on the slides:

- Doctor availability, arrival times and queue waits (mock hospital pusher)
- Facility ratings and review counts
- Cost tiers are curated, not from an official source
- PM-JAY eligibility is indicative
- The sample private hospital is fictional

Real: red-flag rules, the four trained models and their SHAP reasons, rPPG signal processing, distances, SOAP and FHIR.

---

## 15. Before the demo (to do)

| # | Task | Owner |
|---|---|---|
| 1 | Deploy backend (Render/Railway) and frontend (Vercel) on HTTPS: phones only allow camera and GPS on HTTPS | Anish + Nidhi |
| 2 | Accept `X-Session-Id` header so cross-domain cookies can't break `/assess` | Anish |
| 3 | rPPG accuracy: 10+ people, phone vs pulse oximeter, different lighting → mean error; tune `rppg.py` thresholds | Team |
| 4 | Verify facility coordinates on OpenStreetMap; add phone numbers from official sources only | Anish |
| 5 | Run one FHIR export through the HAPI validator | Anish |
| 6 | Decide face rPPG vs fingertip PPG; if fingertip, save Pravesh's `ppg_quality_bundle.joblib` (section 6) | Team |
| 7 | Confirm alcohol and activity mappings (section 6) | Pravesh |
| 8 | Native speaker check of Gujarati / Telugu / Kannada reason texts | Nidhi |
| 9 | Verify PM-JAY criteria on pmjay.gov.in | Anish |
| 10 | Decide who submits on the portal | Team |

Nice to have: BP history/trend, assessment history (SQLite), model transparency screen fed by `/models`.

---

## 16. Decision log

| Date | Decision | Why |
|---|---|---|
| 2026-10-22 | Web app (React + Vite PWA) first, native mobile later | Camera pixels and speech are easy in the browser; judges only need a link; problem statement asks for a web app |
| 2026-10-22 | Python FastAPI backend | Models and SHAP are Python; NumPy/SciPy for rPPG; auto docs |
| 2026-10-22 | Sessions instead of JWT | Team decision; guest-only demo |
| 2026-10-22 | Patient location by GPS, district list fallback | |
| 2026-10-22 | XGBoost dropped; Pravesh delivered LightGBM + Random Forest | Same tree-model family, native SHAP |
| 2026-10-22 | Rank facilities by time to see a doctor; availability via partner push | A good rating is useless if no doctor is there |
| 2026-10-22 | rPPG sends green-channel numbers, not video | Smaller upload, no video processing on server, privacy |
| 2026-10-22 | No cough model | Problem statement: pick rPPG over cough |
| 2026-10-22 | Pregnancy: show CVD with a caveat, ignore it for triage | Not validated in pregnancy, but hiding it was not wanted |
| 2026-10-22 | `smoking_status` 0 never / 1 former / 2 current | Confirmed by Pravesh (and in `ml/Model_1_dataset.py`) |
| 2026-10-22 | All chronic cards get the pregnancy caveat; chronic models skipped under 18; maternal rule layer added | Matches how the models were trained (`ml/Promethius.ipynb`) |

---

## 17. Gotchas

- **`localhost` vs `127.0.0.1`:** open the frontend on the same host name as the API, or the session cookie is not sent.
- **Port 8000** on Anish's laptop belongs to KisanAI (restarted by an IDE agent). Use 8001.
- **`uvicorn --reload` on Windows** sometimes leaves an old worker on the port that keeps serving old code. Restart without `--reload` if responses look stale.
- **`scikit-learn` must stay 1.9.1**, or the model files may not load.
- **HTTPS** is required on phones for camera, microphone and GPS, and an HTTPS page cannot call an HTTP API.
- **Antivirus/proxy SSL:** Python downloads failed with "unable to get local issuer certificate"; `truststore` (uses the Windows certificate store) fixed it. Don't turn certificate checks off.
- Assessments are in memory: restarting the backend forgets them (SOAP/FHIR for old ids → 404, the app falls back to its local version).

---

## 18. Slide notes

- "Triage support, not diagnosis" on the first and last slide.
- Models: LightGBM (gradient-boosted trees, same family as XGBoost) for three chronic risks, Random Forest for maternal; calibrated; per-patient SHAP. Show the metrics table from section 6 and `models/confusion_matrices.png`; mention the external 2021–23 test (hypertension 0.82, diabetes 0.75) and that diabetes beats the Indian Diabetes Risk Score.
- Safety: emergency rules are deterministic and run offline; ML never decides an emergency; the maternal model is backed by pregnancy rules.
- rPPG: "video never leaves the phone"; show the measured error vs pulse oximeter and the failure cases. Don't claim accuracy we have not measured.
- Facilities: "time to see a doctor" ranking; availability is simulated through a FHIR-shaped partner API.
- Honest limits: datasets are not Indian-rural (NHANES, Kaggle, UCI); CVD not validated in pregnancy; simulated data listed in section 14; no cough model by choice.
