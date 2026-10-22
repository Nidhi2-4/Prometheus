import {
  PatientFeatures,
  HeartRateResult,
  AssessmentResponse,
  ConditionRisk,
  SOAPNote,
  TriageLevel,
  Facility,
  Language,
} from '../types/health';
import { evaluateRedFlags } from './redFlagEngine';
import { TRANSLATIONS } from '../i18n/translations';
import { getRankedFacilities } from './facilitiesData';
import { estimateBpm } from './rppg';

const API_BASE_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:8000/api/v1';

// Every call sends the session cookie. Throws when the backend is down so callers can fall back locally.
// A 401 means the session is missing (backend was down at app start, or restarted): start one and retry once.
async function request<T>(path: string, body?: unknown): Promise<T> {
  const send = () => fetch(`${API_BASE_URL}${path}`, {
    method: body === undefined ? 'GET' : 'POST',
    credentials: 'include',
    headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  let res = await send();
  if (res.status === 401 && path !== '/session') {
    await fetch(`${API_BASE_URL}/session`, { method: 'POST', credentials: 'include' });
    res = await send();
  }
  if (!res.ok) throw new Error(`${path} failed: ${res.status}`);
  return res.json();
}

export async function initializeSession(): Promise<void> {
  await request('/session', {}).catch(() => console.info('Backend unreachable, running locally'));
}

export async function checkHeartRate(green: number[], fps: number, brightness: number): Promise<HeartRateResult> {
  const note = 'Screening estimate, not a medical device.';
  try {
    return await request<HeartRateResult>('/vitals/rppg', { fps, green });
  } catch {
    return { ...estimateBpm(green, fps, brightness), note };
  }
}

export async function fetchFacilities(lat: number, lng: number, triage: TriageLevel, maternity: boolean): Promise<Facility[]> {
  const q = new URLSearchParams({ lat: String(lat), lng: String(lng), triage_level: triage });
  if (maternity) q.set('service', 'maternity');
  try {
    return await request<Facility[]>(`/facilities/nearby?${q}`);
  } catch {
    return getRankedFacilities(triage, maternity);
  }
}

export type SchemeStatus = 'likely' | 'possibly' | 'not_likely';
export interface SchemeAnswers { ration_card: boolean; bpl: boolean; senior_70_plus: boolean; low_income: boolean }

export async function checkScheme(a: SchemeAnswers): Promise<SchemeStatus> {
  try {
    return (await request<{ result: SchemeStatus }>('/schemes/eligibility', a)).result;
  } catch {
    // Same rules as the backend (rules.pmjay_eligibility).
    if (a.senior_70_plus || a.bpl) return 'likely';
    return a.ration_card || a.low_income ? 'possibly' : 'not_likely';
  }
}

export async function fetchSOAP(features: PatientFeatures, assessment: AssessmentResponse, hr: HeartRateResult | null): Promise<SOAPNote> {
  return request<SOAPNote>(`/assessments/${assessment.assessment_id}/soap`).catch(() => generateSOAPNote(features, assessment, hr));
}

export async function fetchFHIR(features: PatientFeatures, assessment: AssessmentResponse, hr: HeartRateResult | null): Promise<object> {
  return request<object>(`/assessments/${assessment.assessment_id}/fhir`).catch(() => generateFHIRBundle(features, assessment, hr));
}

// Local clinical assessment calculation (reliable demo & offline fallback)
export function calculateLocalAssessment(
  features: PatientFeatures,
  heartRate?: HeartRateResult | null,
  language: string = 'en'
): AssessmentResponse {
  const redFlagCheck = evaluateRedFlags(features, heartRate);
  const tr = TRANSLATIONS[language as Language] ?? TRANSLATIONS.en;

  // 1. BMI calculation
  const heightM = features.height_cm / 100;
  const bmi = Number((features.weight_kg / (heightM * heightM)).toFixed(1));

  // 2. Hypertension Risk Calculation
  let htScore = 0.15;
  if (features.age > 40) htScore += 0.2;
  if (features.age > 55) htScore += 0.15;
  if (bmi >= 25) htScore += 0.18;
  if (features.smoker) htScore += 0.12;
  if (features.systolic && features.systolic >= 140) htScore += 0.25;
  if (features.diastolic && features.diastolic >= 90) htScore += 0.15;
  if (features.known_hypertension) htScore += 0.25;
  const htProb = Math.min(0.96, Number(htScore.toFixed(2)));

  // 3. Diabetes Risk Calculation
  let dbScore = 0.12;
  if (features.age > 35) dbScore += 0.18;
  if (bmi >= 25) dbScore += 0.22;
  if (features.family_history_diabetes) dbScore += 0.24;
  if (features.activity_level === 'low') dbScore += 0.14;
  if (features.symptoms.includes('excessive_thirst')) dbScore += 0.15;
  if (features.symptoms.includes('frequent_urination')) dbScore += 0.15;
  if (features.known_diabetes) dbScore += 0.3;
  const dbProb = Math.min(0.95, Number(dbScore.toFixed(2)));

  // 4. CVD Risk Calculation
  let cvdScore = 0.1;
  if (features.age > 45) cvdScore += 0.2;
  if (features.smoker) cvdScore += 0.22;
  if (features.alcohol) cvdScore += 0.1;
  if (features.family_history_cvd) cvdScore += 0.2;
  if (bmi >= 28) cvdScore += 0.15;
  if (features.systolic && features.systolic > 135) cvdScore += 0.15;
  const cvdProb = Math.min(0.94, Number(cvdScore.toFixed(2)));

  const results: ConditionRisk[] = [
    {
      condition: 'hypertension',
      probability: htProb,
      level: htProb > 0.66 ? 'high' : htProb > 0.33 ? 'medium' : 'low',
      model_version: 'offline-estimate',
      top_factors: [
        {
          feature: 'systolic',
          impact: 0.24,
          text: tr.f_ht_bp,
        },
        {
          feature: 'bmi',
          impact: 0.18,
          text: tr.f_ht_bmi,
        },
        {
          feature: 'age',
          impact: 0.12,
          text: tr.f_ht_age,
        },
      ],
    },
    {
      condition: 'diabetes',
      probability: dbProb,
      level: dbProb > 0.66 ? 'high' : dbProb > 0.33 ? 'medium' : 'low',
      model_version: 'offline-estimate',
      top_factors: [
        {
          feature: 'family_history',
          impact: 0.25,
          text: tr.f_db_family,
        },
        {
          feature: 'bmi',
          impact: 0.2,
          text: tr.f_db_bmi,
        },
        {
          feature: 'activity',
          impact: 0.14,
          text: tr.f_db_activity,
        },
      ],
    },
    {
      condition: 'cvd',
      probability: cvdProb,
      level: cvdProb > 0.66 ? 'high' : cvdProb > 0.33 ? 'medium' : 'low',
      model_version: 'offline-estimate',
      top_factors: [
        {
          feature: 'age_vascular',
          impact: 0.22,
          text: tr.f_cvd_age,
        },
        {
          feature: 'lifestyle',
          impact: 0.18,
          text: tr.f_cvd_lifestyle,
        },
        {
          feature: 'blood_pressure',
          impact: 0.15,
          text: tr.f_cvd_bp,
        },
      ],
    },
  ];

  // If female and pregnant, add maternal risk
  if (features.is_pregnant) {
    const isMaternalHigh =
      (features.systolic && features.systolic >= 140) ||
      features.symptoms.includes('swelling') ||
      features.symptoms.includes('headache') ||
      features.previous_complications;

    results.push({
      condition: 'maternal',
      probability: isMaternalHigh ? 0.76 : 0.28,
      level: isMaternalHigh ? 'high' : 'low',
      model_version: 'offline-estimate',
      top_factors: [
        {
          feature: 'gestational_bp',
          impact: 0.28,
          text: tr.f_mat_bp,
        },
        {
          feature: 'edema',
          impact: 0.22,
          text: tr.f_mat_swelling,
        },
      ],
    });
  }

  // Triage determination
  let triageLevel: TriageLevel = 'self_care';
  if (redFlagCheck.emergency) {
    triageLevel = 'emergency';
  } else if (
    results.some((r) => r.level === 'high') ||
    (features.systolic && features.systolic >= 160) ||
    (features.diastolic && features.diastolic >= 100) ||
    (features.is_pregnant && results.some((r) => r.condition === 'maternal' && r.level === 'high'))
  ) {
    triageLevel = 'urgent';
  } else if (results.some((r) => r.level === 'medium') || features.symptoms.length > 0) {
    triageLevel = 'routine';
  }

  return {
    assessment_id: 'swasthik_' + Math.random().toString(36).substring(2, 9),
    red_flags: redFlagCheck.rules,
    triage_level: triageLevel,
    results,
    disclaimer: 'Screening guidance, not a diagnosis.',
  };
}

export interface AssessPayload {
  language: string;
  lat: number;
  lng: number;
  features: PatientFeatures;
  heart_rate?: HeartRateResult | null;
}

export const postAssessment = (payload: AssessPayload) => request<AssessmentResponse>('/assess', payload);

// Backend first, local rules + scoring when it is unreachable.
export async function submitAssessment(payload: AssessPayload): Promise<{ result: AssessmentResponse; offline: boolean }> {
  try {
    return { result: await postAssessment(payload), offline: false };
  } catch {
    return { result: calculateLocalAssessment(payload.features, payload.heart_rate, payload.language), offline: true };
  }
}

// Generate Clinician SOAP Note
export function generateSOAPNote(
  features: PatientFeatures,
  assessment: AssessmentResponse,
  heartRate?: HeartRateResult | null
): SOAPNote {
  const heightM = features.height_cm / 100;
  const bmi = (features.weight_kg / (heightM * heightM)).toFixed(1);

  const subjective = [
    `Chief Complaints: ${features.symptoms.join(', ') || 'Routine health risk screening'}.`,
    `Patient Profile: ${features.age}yo ${features.sex === 'F' ? 'Female' : features.sex === 'M' ? 'Male' : 'Other'}.`,
    features.is_pregnant ? `Obstetric History: Pregnant (~${features.pregnancy_weeks || 'unknown'} weeks). Gravida: ${features.gravida || 1}. Prior complications: ${features.previous_complications ? 'Yes' : 'No'}.` : null,
    `Lifestyle: Smoker: ${features.smoker ? 'Yes' : 'No'}, Alcohol: ${features.alcohol ? 'Yes' : 'No'}, Activity: ${features.activity_level}.`,
    `Family History: Diabetes: ${features.family_history_diabetes ? 'Yes' : 'No'}, CVD: ${features.family_history_cvd ? 'Yes' : 'No'}.`,
  ].filter(Boolean).join(' ');

  const objective = [
    `Vitals: BP: ${features.systolic || 'NA'}/${features.diastolic || 'NA'} mmHg.`,
    `Heart Rate (rPPG Camera): ${heartRate?.bpm ? heartRate.bpm + ' BPM (' + heartRate.quality + ' signal quality)' : 'Not recorded'}.`,
    `Physical Markers: Height: ${features.height_cm} cm, Weight: ${features.weight_kg} kg, Calculated BMI: ${bmi} kg/m².`,
  ].join(' ');

  const assessmentText = [
    `Triage Level: ${assessment.triage_level.toUpperCase()}.`,
    assessment.red_flags.length > 0 ? `Active Red Flags: ${assessment.red_flags.map((r) => r.name || r.id).join('; ')}.` : 'No acute emergency red flags triggered.',
    `Stratified Chronic Risk: ` + assessment.results.map((r) => `${r.condition.toUpperCase()} (${r.level}, prob ${(r.probability * 100).toFixed(0)}%)`).join(', ') + '.',
  ].join(' ');

  const plan = [
    assessment.triage_level === 'emergency' ? 'IMMEDIATE EMERGENCY REFERRAL via 108 Ambulance to Nearest Critical Care Hospital.' : null,
    assessment.triage_level === 'urgent' ? 'Referral to Community Health Centre (CHC) or District Hospital within 24 hours.' : null,
    assessment.triage_level === 'routine' ? 'Primary Health Centre (PHC) evaluation within 7 days for confirmatory diagnostics (FPG/HbA1c, repeat BP monitoring).' : null,
    'Lifestyle intervention: Dietary sodium reduction, physical activity promotion, and symptom diary maintenance.',
    'Follow-up review in 14-30 days.',
  ].filter(Boolean).join(' ');

  return {
    subjective,
    objective,
    assessment: assessmentText,
    plan,
  };
}

// Generate FHIR R4 JSON Bundle
export function generateFHIRBundle(
  features: PatientFeatures,
  assessment: AssessmentResponse,
  heartRate?: HeartRateResult | null
) {
  const patientId = 'patient-' + Math.random().toString(36).substring(2, 8);
  const now = new Date().toISOString();

  return {
    resourceType: 'Bundle',
    type: 'collection',
    timestamp: now,
    meta: {
      profile: ['http://hl7.org/fhir/StructureDefinition/Bundle'],
    },
    entry: [
      {
        resource: {
          resourceType: 'Patient',
          id: patientId,
          gender: features.sex === 'F' ? 'female' : features.sex === 'M' ? 'male' : 'other',
          birthDate: new Date(new Date().getFullYear() - features.age, 0, 1).toISOString().split('T')[0],
          extension: [
            {
              url: 'http://swasthik.in/fhir/StructureDefinition/pregnancy-status',
              valueBoolean: features.is_pregnant,
            },
          ],
        },
      },
      ...(features.systolic && features.diastolic ? [
        {
          resource: {
            resourceType: 'Observation',
            status: 'final',
            code: {
              coding: [{ system: 'http://loinc.org', code: '85354-9', display: 'Blood pressure panel' }],
            },
            subject: { reference: `Patient/${patientId}` },
            effectiveDateTime: now,
            component: [
              {
                code: { coding: [{ system: 'http://loinc.org', code: '8480-6', display: 'Systolic blood pressure' }] },
                valueQuantity: { value: features.systolic, unit: 'mmHg', system: 'http://unitsofmeasure.org', code: 'mm[Hg]' },
              },
              {
                code: { coding: [{ system: 'http://loinc.org', code: '8462-4', display: 'Diastolic blood pressure' }] },
                valueQuantity: { value: features.diastolic, unit: 'mmHg', system: 'http://unitsofmeasure.org', code: 'mm[Hg]' },
              },
            ],
          },
        },
      ] : []),
      ...(heartRate?.bpm ? [
        {
          resource: {
            resourceType: 'Observation',
            status: 'final',
            code: {
              coding: [{ system: 'http://loinc.org', code: '8867-4', display: 'Heart rate' }],
            },
            subject: { reference: `Patient/${patientId}` },
            effectiveDateTime: now,
            valueQuantity: { value: heartRate.bpm, unit: 'beats/minute', system: 'http://unitsofmeasure.org', code: '/min' },
            note: [{ text: `Photoplethysmography (rPPG) scan quality: ${heartRate.quality}. Method: non-contact facial video.` }],
          },
        },
      ] : []),
      ...assessment.results.map((r, i) => ({
        resource: {
          resourceType: 'RiskAssessment',
          id: `risk-${i}`,
          status: 'final',
          subject: { reference: `Patient/${patientId}` },
          occurrenceDateTime: now,
          condition: { text: r.condition },
          prediction: [
            {
              outcome: { text: `${r.condition} risk level ${r.level}` },
              probabilityDecimal: r.probability,
              qualitativeRisk: { text: r.level },
            },
          ],
          note: r.top_factors.map((f) => ({ text: f.text })),
        },
      })),
    ],
  };
}
