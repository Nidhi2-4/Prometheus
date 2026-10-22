export type Language = 'en' | 'hi' | 'mr';

export type TriageLevel = 'emergency' | 'urgent' | 'routine' | 'self_care';
export type RiskLevel = 'low' | 'medium' | 'high';

export type SymptomCode =
  | 'chest_pain'
  | 'sweating'
  | 'nausea'
  | 'arm_jaw_pain'
  | 'breathlessness'
  | 'breathlessness_at_rest'
  | 'headache'
  | 'severe_headache'
  | 'dizziness'
  | 'blurred_vision'
  | 'one_side_weakness'
  | 'face_drooping'
  | 'slurred_speech'
  | 'fainting'
  | 'seizure'
  | 'coughing_blood'
  | 'fever'
  | 'cough'
  | 'excessive_thirst'
  | 'frequent_urination'
  | 'fatigue'
  | 'swelling'
  | 'vaginal_bleeding'
  | 'reduced_baby_movement'
  | 'convulsions'
  | 'confusion'
  | 'extreme_drowsiness'
  | 'fruity_breath'
  | 'persistent_vomiting';

export interface PatientFeatures {
  age: number;
  sex: 'M' | 'F' | 'O';
  height_cm: number;
  weight_kg: number;
  smoker: boolean;
  alcohol: boolean;
  activity_level: 'low' | 'moderate' | 'high';
  known_hypertension: boolean;
  known_diabetes: boolean;
  known_heart_disease: boolean;
  family_history_diabetes: boolean;
  family_history_cvd: boolean;
  systolic: number | null;
  diastolic: number | null;
  is_pregnant: boolean;
  pregnancy_weeks: number | null;
  gravida?: number | null;
  previous_complications?: boolean;
  symptoms: SymptomCode[];
  symptom_duration_days?: number;
}

export interface HeartRateResult {
  bpm: number | null;
  quality: 'good' | 'marginal' | 'poor';
  quality_score: number;
  reasons: string[];
  note: string;
}

export interface RedFlagRule {
  id: string;
  message_key: string;
  name: string;
  description: string;
}

export interface RiskFactor {
  feature: string;
  impact: number;
  text: string;
}

export interface ConditionRisk {
  condition: 'hypertension' | 'diabetes' | 'cvd' | 'maternal';
  probability: number;
  level: RiskLevel;
  model_version: string;
  top_factors: RiskFactor[];
}

export interface AssessmentResponse {
  assessment_id: string;
  red_flags: RedFlagRule[];
  triage_level: TriageLevel;
  results: ConditionRisk[];
  disclaimer: string;
}

export interface Facility {
  id: string;
  name: string;
  type: 'phc' | 'chc' | 'district_hospital' | 'medical_college' | 'private';
  lat: number;
  lng: number;
  phone: string;
  distance_km: number;
  travel_min: number;
  doctor_available: boolean;
  doctor_arrives_in_min: number;
  queue_wait_min: number;
  time_to_doctor_min: number;
  availability_updated_min_ago: number;
  cost_tier: 'free' | 'subsidized' | 'paid';
  pmjay_empanelled: boolean;
  has_maternity?: boolean;
  emergency_capable?: boolean;
  rating: number;
  review_count: number;
  simulated_fields: string[];
}

export interface SchemeQuestionnaire {
  has_ration_card: boolean;
  is_bpl: boolean;
  family_income_annual: number;
  age_70_plus_in_family: boolean;
  sc_st_category: boolean;
}

export interface SchemeResult {
  status: 'likely' | 'possibly' | 'not_likely';
  title: string;
  message: string;
  documents: string[];
}

export interface SOAPNote {
  subjective: string;
  objective: string;
  assessment: string;
  plan: string;
}
