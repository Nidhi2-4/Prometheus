import {
  PatientFeatures,
  HeartRateResult,
  AssessmentResponse,
  ConditionRisk,
  SOAPNote,
  TriageLevel,
} from '../types/health';
import { evaluateRedFlags } from './redFlagEngine';

// Default backend API URL from environment or local proxy
const API_BASE_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:8000/api/v1';

// Session initialization
export async function initializeSession(): Promise<string> {
  try {
    const res = await fetch(`${API_BASE_URL}/session`, {
      method: 'POST',
      credentials: 'include',
    });
    if (res.ok) {
      const data = await res.json();
      return data.session_id || 'session-active';
    }
  } catch {
    // Graceful offline fallback
    console.info('Backend unreachable, operating in offline/local session mode');
  }
  const localSession = 'session-local-' + Math.random().toString(36).substring(2, 9);
  localStorage.setItem('swasthik_session', localSession);
  return localSession;
}

// Local clinical assessment calculation (reliable demo & offline fallback)
export function calculateLocalAssessment(
  features: PatientFeatures,
  heartRate?: HeartRateResult | null,
  language: string = 'en'
): AssessmentResponse {
  const redFlagCheck = evaluateRedFlags(features, heartRate);

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
      model_version: '2026.10.1',
      top_factors: [
        {
          feature: 'systolic',
          impact: 0.24,
          text: language === 'mr'
            ? 'वरचा रक्तदाब (BP) सामान्यपेक्षा जास्त आहे'
            : language === 'hi'
            ? 'ऊपरी ब्लड प्रेशर सामान्य से अधिक है'
            : 'Your upper BP reading is higher than normal',
        },
        {
          feature: 'bmi',
          impact: 0.18,
          text: language === 'mr'
            ? 'उंचीच्या तुलनेत वजन (BMI) जास्त आहे'
            : language === 'hi'
            ? 'लंबाई के अनुपात में वजन (BMI) अधिक है'
            : 'Weight is elevated for your height (BMI ' + bmi + ')',
        },
        {
          feature: 'age',
          impact: 0.12,
          text: language === 'mr'
            ? 'वाढत्या वयामुळे रक्तदाबाचा धोका वाढतो'
            : language === 'hi'
            ? 'उम्र बढ़ने के साथ जोखिम बढ़ता है'
            : 'Age factor naturally increases vascular resistance',
        },
      ],
    },
    {
      condition: 'diabetes',
      probability: dbProb,
      level: dbProb > 0.66 ? 'high' : dbProb > 0.33 ? 'medium' : 'low',
      model_version: '2026.10.1',
      top_factors: [
        {
          feature: 'family_history',
          impact: 0.25,
          text: language === 'mr'
            ? 'कुटुंबात मधुमेहाचा इतिहास आहे'
            : language === 'hi'
            ? 'परिवार में शुगर/मधुमेह का इतिहास है'
            : 'Family history of diabetes is a primary metabolic driver',
        },
        {
          feature: 'bmi',
          impact: 0.2,
          text: language === 'mr'
            ? 'वजनामुळे इन्सुलिनच्या कार्यात अडथळा येतो'
            : language === 'hi'
            ? 'वजन के कारण इंसुलिन प्रतिरोध बढ़ता है'
            : 'Elevated BMI contributes to insulin resistance',
        },
        {
          feature: 'activity',
          impact: 0.14,
          text: language === 'mr'
            ? 'कमी शारीरिक हालचाल'
            : language === 'hi'
            ? 'दैनिक शारीरिक गतिविधि कम है'
            : 'Sedentary activity level slows glucose clearance',
        },
      ],
    },
    {
      condition: 'cvd',
      probability: cvdProb,
      level: cvdProb > 0.66 ? 'high' : cvdProb > 0.33 ? 'medium' : 'low',
      model_version: '2026.10.1',
      top_factors: [
        {
          feature: 'age_vascular',
          impact: 0.22,
          text: language === 'mr'
            ? 'वयोमान आणि रक्तवाहिन्यांचा ताण'
            : language === 'hi'
            ? 'आयु और रक्त वाहिकाओं का तनाव'
            : 'Age and vascular baseline risk',
        },
        {
          feature: 'lifestyle',
          impact: 0.18,
          text: language === 'mr'
            ? 'तंबाखू किंवा बैठी जीवनशैली'
            : language === 'hi'
            ? 'तंबाकू अथवा गतिहीन दिनचर्या'
            : 'Tobacco or sedentary lifestyle markers',
        },
        {
          feature: 'blood_pressure',
          impact: 0.15,
          text: language === 'mr'
            ? 'रक्तदाब पातळी'
            : language === 'hi'
            ? 'ब्लड प्रेशर स्तर'
            : 'Elevated cardiovascular load from BP trend',
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
      model_version: '2026.10.1',
      top_factors: [
        {
          feature: 'gestational_bp',
          impact: 0.28,
          text: language === 'mr'
            ? 'गरोदरपणातील रक्तदाब पातळी'
            : language === 'hi'
            ? 'गर्भावस्था में ब्लड प्रेशर स्तर'
            : 'Elevated BP reading during pregnancy',
        },
        {
          feature: 'edema',
          impact: 0.22,
          text: language === 'mr'
            ? 'पायांवर किंवा चेहऱ्यावर सूज'
            : language === 'hi'
            ? 'पैरों या चेहरे पर सूजन'
            : 'Peripheral edema / swelling reported',
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

// Submit assessment to backend (with local clinical fallback)
export async function submitAssessment(
  payload: {
    language: string;
    lat: number;
    lng: number;
    features: PatientFeatures;
    heart_rate?: HeartRateResult | null;
  }
): Promise<AssessmentResponse> {
  try {
    const res = await fetch(`${API_BASE_URL}/assess`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (res.ok) {
      return await res.json();
    }
  } catch (err) {
    console.warn('Backend API request failed; falling back to local deterministic model engine', err);
  }

  return calculateLocalAssessment(payload.features, payload.heart_rate, payload.language);
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
    `Patient Profile: ${features.age}yo ${features.sex === 'F' ? 'Female' : 'Male'}.`,
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
    assessment.red_flags.length > 0 ? `Active Red Flags: ${assessment.red_flags.map((r) => r.name).join('; ')}.` : 'No acute emergency red flags triggered.',
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
          gender: features.sex === 'F' ? 'female' : 'male',
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
