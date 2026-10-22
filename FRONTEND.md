# Swastik — Frontend Guide

Everything the frontend needs: what we are building, the screens, the API, and the tricky parts (camera heart rate, voice, GPS, sessions).
Backend owner: Anish. ML: Pravesh. Overall project info: [info.md](info.md). Full original spec: `docs/Documentation - Health Risk Detection.pdf`.

> Rule for every result screen and the PDF: **"Screening guidance, not a diagnosis."**

---

## 1. What we are building

A mobile-first **web app** (runs in the phone browser). A patient (often low-literacy, rural, speaks Marathi or Hindi) goes through a guided health check and ends with:

1. An instant **emergency alert** if anything dangerous is reported.
2. **Risk cards** for hypertension, diabetes and heart disease, each with 3 reasons in plain language.
3. A **camera heart rate** reading (face video, nothing uploaded).
4. A **triage level**: Emergency / Urgent / Routine / Self-care.
5. The **best nearby hospital**, ranked by how fast the patient can actually see a doctor, plus cost, PM-JAY and rating.
6. A **printable summary**, a **doctor view (SOAP note)** and a **FHIR JSON** export.

### Demo stories (build for these first)

- **Emergency:** user taps chest pain + sweating → full-screen red alert immediately → Call 108 + nearest emergency hospital.
- **Sunita, 45:** high BMI, family history of diabetes, headaches → Medium hypertension, High diabetes, heart rate reading, PHC recommendation, PDF.
- **Priya, pregnant:** raised BP + swelling → Urgent, facilities with maternity care.
- **Doctor view:** the same case as a SOAP note and FHIR JSON.

The whole demo must run in under 3 minutes.

---

## 2. Platform and stack

**Decided:**
- **Phase 1 (now): web app**, built mobile-first and installable as a PWA ("Add to Home Screen" on Android). Judges just open a link or scan a QR.
- **Phase 2 (after web is complete): native mobile app.** Capacitor wrapper (reuses this code) or Expo, decided later. The backend and API stay the same.

Why web first: the camera heart rate needs per-frame pixel access (easy with canvas in the browser, a native module + dev build in React Native), and the browser gives speech recognition and text-to-speech for free.

Stack:
- React + Vite + TypeScript
- `vite-plugin-pwa` (installable app + service worker for offline)
- `react-i18next` for English / Hindi / Marathi
- `leaflet` + `react-leaflet` with OpenStreetMap tiles (no API key)
- IndexedDB (`idb-keyval`) for the offline queue
- Tailwind (optional)
- Deploy on Vercel (HTTPS, see section 9)

To make phase 2 easy:
- Keep **all API calls in one module** (e.g. `src/api.ts`). No `fetch` scattered in components.
- Keep browser-only code (camera, speech, geolocation, print) behind small helpers (`src/device/*.ts`), so the mobile version can swap them.

---

## 3. Screens and flow

```
Language select → Consent → Home
  → Basic info (age, sex, height, weight)
  → Lifestyle (smoking, alcohol, activity)
  → History (known BP/diabetes/heart disease, family history, pregnant?)
  → [if female + pregnant] Pregnancy details
  → Symptoms (big icon grid + voice)          ← red-flag check on every tap
  → Vitals: BP entry (optional), Heart rate scan (optional)
  → Processing
  → Result: triage level + risk cards
      → Risk detail (3 reasons)
      → Find care: map + facility list → facility detail (call, directions)
      → PM-JAY eligibility check
      → Summary (printable)
      → Doctor view: SOAP note + FHIR export
```

Emergency alert can open **from any intake screen** the moment a red flag fires.

### Design rules

- One question per screen. Big buttons (min 48px touch target). Progress bar.
- Always **icon + text**. Speaker button on every question (reads it aloud).
- Every question answerable by tap. Voice is a bonus, never the only way.
- Colours for triage: green = self-care, amber = routine, orange = urgent, red = emergency. Also show an icon + label (don't rely on colour alone).
- High contrast, large font. Think "low-end Android phone in sunlight".
- Disclaimer footer on all result screens.
- Anything simulated (wait time, doctor availability, ratings, booking) shows a small **"simulated"** tag.

---

## 4. Symptom codes (shared with backend)

Use these exact codes in API calls. Labels/icons are yours.

| Code | Code | Code |
|------|------|------|
| `chest_pain` | `sweating` | `nausea` |
| `arm_jaw_pain` | `breathlessness` | `breathlessness_at_rest` |
| `headache` | `severe_headache` | `dizziness` |
| `blurred_vision` | `one_side_weakness` | `face_drooping` |
| `slurred_speech` | `fainting` | `seizure` |
| `coughing_blood` | `fever` | `cough` |
| `excessive_thirst` | `frequent_urination` | `fatigue` |
| `swelling` | `vaginal_bleeding` | `reduced_baby_movement` |
| `convulsions` | `confusion` | `extreme_drowsiness` |
| `fruity_breath` | `persistent_vomiting` | `sudden_vision_loss` |

Pregnancy-only symptoms (`vaginal_bleeding`, `reduced_baby_movement`, `convulsions`) show only if the user said pregnant.

---

## 5. API

Base URL: `<BACKEND_URL>/api/v1` (Anish will share it). Live docs with "Try it out": `<BACKEND_URL>/docs`.
All endpoints return mock data from day one in the final shape, so you can build against them now.

**Generate TypeScript types from the live schema** (re-run when the backend changes):

```bash
npx openapi-typescript <BACKEND_URL>/openapi.json -o src/api.d.ts
```

If a field gets renamed, your build breaks instead of the demo.

### Sessions (no login)

- On app start call `POST /session`. The backend sets a session cookie.
- **Every** request must send it:

```ts
fetch(`${API}/assess`, {
  method: "POST",
  credentials: "include",            // required, or the session is lost
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(payload),
});
```

- If cookies give trouble across domains, we switch to an `X-Session-Id` header. Tell Anish.
- Only `/assess` and `/assessments/*` need the session (401 without it). `/redflags`, `/facilities/nearby`, `/vitals/rppg` and `/schemes/eligibility` work without one, so the emergency path never breaks on a cookie problem.

### Endpoints

| Method | Path | When to call |
|--------|------|--------------|
| POST | `/session` | App start |
| POST | `/redflags` | Every symptom tap, BP entry, heart-rate result, pregnancy answer |
| POST | `/vitals/rppg` | After the 25 s face scan |
| POST | `/assess` | On "See my result" |
| GET  | `/facilities/nearby` | Find care screen |
| POST | `/schemes/eligibility` | PM-JAY questionnaire submit |
| GET  | `/assessments/{id}/soap` | Doctor view |
| GET  | `/assessments/{id}/fhir` | FHIR export (show + download as `.json`) |
| GET  | `/models` | "How was this calculated?" / model transparency screen |

#### `POST /redflags`

```json
// request
{ "symptoms": ["chest_pain", "sweating"], "systolic": null, "diastolic": null,
  "is_pregnant": false, "known_diabetes": false, "heart_rate": null, "heart_rate_quality": null }

// response
{ "emergency": true,
  "rules": [{ "id": "RF01", "message_key": "rf01_chest_pain" }] }
```

If `emergency: true` → open the **Emergency Alert** right away:
- Big red screen: "Go to the nearest hospital now".
- Button **Call 108** (`<a href="tel:108">`). This button must always be visible on this screen.
- Button **Nearest emergency hospital** (facilities with `triage_level=emergency`).
- Small link "Continue assessment anyway".

`message_key` values come from the backend; put their text in your i18n files (list will be in `/docs`).

#### `POST /assess`

```json
// request
{ "language": "mr", "lat": 21.1458, "lng": 79.0882,
  "features": {
    "age": 45, "sex": "F", "height_cm": 155, "weight_kg": 72,
    "smoker": false, "alcohol": false, "activity_level": "low",
    "known_hypertension": false, "known_diabetes": false, "known_heart_disease": false,
    "family_history_diabetes": true, "family_history_cvd": false,
    "systolic": 142, "diastolic": 92,
    "is_pregnant": false, "pregnancy_weeks": null,
    "symptoms": ["headache", "dizziness", "frequent_urination"] },
  "heart_rate": { "bpm": 78, "quality": "good" } }

// response
{ "assessment_id": "a1b2c3",
  "red_flags": [],
  "triage_level": "routine",
  "results": [
    { "condition": "hypertension", "probability": 0.58, "level": "medium",
      "model_version": "2026.10.1",
      "top_factors": [
        { "feature": "systolic", "impact": 0.21, "text": "Your upper BP reading is higher than normal" },
        { "feature": "bmi", "impact": 0.14, "text": "Weight is higher for your height" },
        { "feature": "age", "impact": 0.09, "text": "Risk rises with age" } ] },
    { "condition": "diabetes", "...": "same shape" },
    { "condition": "cvd", "...": "same shape" } ],
  "disclaimer": "Screening guidance, not a diagnosis." }
```

- `triage_level`: `emergency | urgent | routine | self_care`
- `level`: `low | medium | high`
- `text` comes back already translated into `language`.
- Optional fields (`systolic`, `heart_rate`, `blood_sugar_mgdl`, `body_temp_c`, …) can be `null` if the user skipped them.
- `results` has **2 to 4 items**, render whatever comes back. A condition is left out when it does not apply: already diagnosed (known diabetes → no diabetes card), no BP reading (no CVD card), not pregnant (no maternal card).
- Pregnant users get a `maternal` result with `class_probabilities: {"low", "mid", "high"}`. Optional maternal inputs: `blood_sugar_mgdl`, `body_temp_c`.
- `top_factors` can have fewer than 3 items (only reasons that are true for this user are shown). `impact: 0` means a rule, not the model (e.g. measured BP ≥ 140/90).

Risk card: condition name, level badge, a simple bar for probability, the 3 `text` reasons, model version, and a "How was this calculated?" link to `/models`.

#### `GET /facilities/nearby`

Query: `lat`, `lng`, `triage_level`, optional `service` (e.g. `maternity`).

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

The list is **already ranked** by the backend; show it in that order. Ranking is by `time_to_doctor_min` (travel + waiting for the doctor + queue), not just distance. Emergency → only emergency-capable places. Maternal → only maternity.

Facility card shows, in this priority:
1. **Time to see a doctor** ("~24 min to see a doctor"), big.
2. Doctor status: "Doctor available now" (green dot) / "Doctor in 40 min" / "No doctor info".
3. Distance + travel time.
4. Cost badge: Free / Subsidized / Paid, and a **PM-JAY** badge.
5. Rating ★ 4.3 (88).
6. Buttons: **Call** (`tel:`), **Directions** (`https://www.google.com/maps/dir/?api=1&destination=LAT,LNG`).

Doctor status from the fields:
- `doctor_available: true` → "Doctor available now"
- `doctor_available: false` + `doctor_arrives_in_min` → "Doctor in 40 min"
- `doctor_available: false` + no `time_to_doctor_min` → "No suitable doctor reported" (still show Call)
- `doctor_available: null` → "Availability unknown, call before going" (no data, or older than 30 min)
Show the "simulated" tag next to every field listed in `simulated_fields`.

Map: user marker + facility markers, tap a marker → same card.

#### `POST /vitals/rppg`

See section 6.

```json
// request
{ "fps": 29.7, "green": [112.4, 112.9, 113.1, "... about 750 numbers"] }

// response (good)
{ "bpm": 78, "quality": "good", "quality_score": 0.91, "reasons": [],
  "note": "Screening estimate, not a medical device." }

// response (poor)
{ "bpm": null, "quality": "poor", "quality_score": 0.22, "reasons": ["too_dark"],
  "note": "Screening estimate, not a medical device." }
```

- `good` → show BPM with a green "good signal" badge.
- `marginal` → show BPM with a warning.
- `poor` → **no BPM**. Show the reason (`too_dark`, `too_much_movement`, `face_not_visible`), a **Retry** button and **Enter pulse manually**.

#### PM-JAY eligibility

```json
// request: 4 simple questions
{ "age": 72, "has_pmjay_card": false, "secc_listed": false, "ration_card": "phh" }
// ration_card: "none" | "aay" (Antyodaya) | "phh" (priority household) | "apl"

// response
{ "result": "likely", "reasons": ["Age 70 or above (Ayushman Vay Vandana, any income)"],
  "documents": ["Aadhaar card", "Ration card (if any)", "Ayushman / PM-JAY card (if any)", "Mobile number linked to Aadhaar"],
  "note": "Indicative only, verify at the facility." }
```

`result`: `likely | possibly | not_likely`. Always show the `note`.

---

## 6. Camera heart rate (rPPG) — done in the browser

The video **never leaves the phone**. The frontend reads the average green value of the face area per frame and sends only those numbers. The backend does the maths (filter + FFT → BPM).

Screen:
- Front camera preview with an **oval guide**: "Keep your face inside the oval, sit still, face a light."
- 25-second countdown with a progress ring.
- Live tips if the picture is too dark (average brightness low).

Starting point:

```ts
async function scanHeartRate(video: HTMLVideoElement, seconds = 25) {
  const stream = await navigator.mediaDevices.getUserMedia({
    video: { facingMode: "user", width: 640, height: 480 },
  });
  video.srcObject = stream;
  await video.play();

  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;

  // Region inside the oval guide: upper-middle of the frame (forehead/cheeks).
  const w = canvas.width * 0.3, h = canvas.height * 0.25;
  const x = (canvas.width - w) / 2, y = canvas.height * 0.25;

  const green: number[] = [];
  const t0 = performance.now();

  await new Promise<void>((done) => {
    const tick = () => {
      ctx.drawImage(video, 0, 0);
      const px = ctx.getImageData(x, y, w, h).data;
      let g = 0;
      for (let i = 1; i < px.length; i += 4) g += px[i];   // G channel of RGBA
      green.push(g / (px.length / 4));
      if (performance.now() - t0 < seconds * 1000) requestAnimationFrame(tick);
      else done();
    };
    requestAnimationFrame(tick);
  });

  stream.getTracks().forEach((t) => t.stop());
  const fps = green.length / ((performance.now() - t0) / 1000);
  return { fps, green };   // POST this to /vitals/rppg
}
```

Notes:
- Works only on **HTTPS** (or localhost).
- Permission denied → explain why we need it and allow **skip** + manual pulse entry.
- Always show "Screening estimate, not a medical device."

---

## 7. Voice

**Text-to-speech** (read questions aloud): `speechSynthesis` with `lang` `en-IN` / `hi-IN` / `mr-IN`.
Many phones have **no Marathi voice**. Check `speechSynthesis.getVoices()`; if none for `mr-IN`, hide the speaker button or play a pre-recorded clip for the key prompts.

**Speech-to-text** (symptom description): `window.SpeechRecognition || window.webkitSpeechRecognition`, `lang` as above. Works in Chrome on Android; not in Firefox, unreliable on iOS.
Map recognised words to symptom codes with a simple keyword list per language (e.g. "छाती में दर्द" / "छातीत दुखतंय" / "chest pain" → `chest_pain`). Show what was understood as selected icons so the user can correct it.
Not recognised → "Try again or tap an icon."

---

## 8. Location (GPS)

```ts
navigator.geolocation.getCurrentPosition(
  (p) => setLoc({ lat: p.coords.latitude, lng: p.coords.longitude }),
  () => showDistrictPicker(),               // denied or failed
  { enableHighAccuracy: true, timeout: 10000 }
);
```

- Ask at the "Find care" step (or at assessment start), with a one-line reason first.
- Denied → dropdown of districts around Nagpur; backend accepts district centre coordinates.
- HTTPS only.

---

## 9. Must-knows

- **HTTPS everywhere.** Camera, microphone and GPS only work on HTTPS. An HTTPS frontend cannot call an HTTP backend. Test on a real phone with the deployed URLs, not just localhost.
- **`credentials: "include"`** on every fetch, or the session breaks.
- **Language:** all strings in `en.json`, `hi.json`, `mr.json`. No hard-coded text. Language switch available at any time.
- **Validate inputs** before sending: age 1–120, height 50–250 cm, weight 2–300 kg, systolic 60–260, diastolic 30–160.
- **Loading / error states** on every API call. Backend down → "Could not connect, retry". The Emergency Alert **Call 108** button must never depend on the network.
- Never show a BPM when quality is `poor`.
- **Offline:** the service worker caches the app, translations and the facility list. If there is no network on "See my result", save the assessment in IndexedDB, show "Will complete when online", and send the queue on the browser `online` event.

---

## 10. Printable summary and doctor view

**Summary (patient PDF):** a print-styled page + "Print / Save as PDF" button calling `window.print()`. Use `@media print` CSS, A4, one page. Contents: patient basics, symptoms, vitals, risk flags with reasons, triage level, recommended facility, date, disclaimer.

**Doctor view (SOAP):** from `GET /assessments/{id}/soap`:

```json
{ "subjective": "...", "objective": "...", "assessment": "...", "plan": "..." }
```

Show as four labelled blocks; printable the same way.

**FHIR export:** from `GET /assessments/{id}/fhir`. Show pretty-printed JSON + a **Download .json** button. Its job in the demo is to show we follow the healthcare standard.

---

## 11. Build order

1. Language + consent + intake screens (tap only) with i18n
2. Symptom grid + `/redflags` + Emergency Alert ← demo story 1
3. `/assess` + Result screen + risk cards ← demo story 2
4. Find care: map + ranked facility cards
5. Heart rate scan
6. Summary print page, SOAP view, FHIR export
7. Voice (TTS, then STT)
8. Pregnancy screens, PM-JAY check, model transparency screen

Backend endpoints return mock data from day one in the final shape. Start against `/docs` now, no need to wait for the ML models.

---

## 12. Questions to answer early (ping Anish)

- Frontend URL for CORS (Anish needs the exact origin).
- Should red flags also work offline? If yes, we need a JS copy of the rules.
