import { PatientFeatures, RedFlagRule, HeartRateResult } from '../types/health';

export function evaluateRedFlags(
  features: Partial<PatientFeatures>,
  heartRate?: HeartRateResult | null
): { emergency: boolean; rules: RedFlagRule[] } {
  const triggered: RedFlagRule[] = [];
  const s = new Set(features.symptoms || []);

  // RF01: Chest pain with sweating, nausea, arm/jaw pain, or breathlessness
  if (
    s.has('chest_pain') &&
    (s.has('sweating') || s.has('arm_jaw_pain') || s.has('breathlessness') || s.has('nausea'))
  ) {
    triggered.push({
      id: 'RF01',
      message_key: 'rf01_chest_pain',
      name: 'Acute Cardiac Warning',
      description: 'Chest pain accompanied by cold sweating, radiation to arm/jaw, or breathlessness indicates possible acute coronary syndrome.',
    });
  }

  // RF02: Hypertensive Crisis (Systolic >= 180 or Diastolic >= 120)
  if ((features.systolic && features.systolic >= 180) || (features.diastolic && features.diastolic >= 120)) {
    triggered.push({
      id: 'RF02',
      message_key: 'rf02_bp_crisis',
      name: 'Hypertensive Crisis',
      description: 'Extremely high blood pressure reading (>= 180/120 mmHg) requires immediate medical decompression.',
    });
  }

  // RF03: Sudden stroke signs (weakness on one side, face drooping, slurred speech, sudden vision loss)
  if (s.has('one_side_weakness') || s.has('face_drooping') || s.has('slurred_speech') || s.has('sudden_vision_loss')) {
    triggered.push({
      id: 'RF03',
      message_key: 'rf03_stroke',
      name: 'Suspected Acute Stroke (FAST)',
      description: 'Sudden weakness on one side of the body, facial drooping, or slurred speech requires emergency CT scan within the golden hour.',
    });
  }

  // RF04: Severe breathlessness at rest
  if (s.has('breathlessness_at_rest')) {
    triggered.push({
      id: 'RF04',
      message_key: 'rf04_breathlessness_rest',
      name: 'Acute Respiratory Distress',
      description: 'Inability to breathe easily while resting demands urgent oxygen and airway support.',
    });
  }

  // RF05: Pregnancy Red Flags (bleeding, severe headache + blurred vision, convulsions, reduced baby movement, BP >= 160/110)
  if (features.is_pregnant) {
    const pregHypertension = (features.systolic && features.systolic >= 160) || (features.diastolic && features.diastolic >= 110);
    const hasPreeclampsiaSigns = s.has('severe_headache') && s.has('blurred_vision');
    if (
      s.has('vaginal_bleeding') ||
      s.has('reduced_baby_movement') ||
      s.has('convulsions') ||
      pregHypertension ||
      hasPreeclampsiaSigns
    ) {
      triggered.push({
        id: 'RF05',
        message_key: 'rf05_maternal_emergency',
        name: 'Obstetric Emergency / Pre-eclampsia',
        description: 'Vaginal bleeding, high blood pressure in pregnancy, convulsions, or reduced fetal movement indicate a critical maternal risk.',
      });
    }
  }

  // RF06: Fainting or loss of consciousness
  if (s.has('fainting')) {
    triggered.push({
      id: 'RF06',
      message_key: 'rf06_fainting',
      name: 'Syncope / Loss of Consciousness',
      description: 'Sudden collapse or loss of consciousness suggests severe hemodynamic or neurological crisis.',
    });
  }

  // RF07: Diabetic emergency: any one of confusion, drowsiness, fruity breath, vomiting (same as backend)
  if (
    features.known_diabetes &&
    (s.has('fruity_breath') || s.has('confusion') || s.has('extreme_drowsiness') || s.has('persistent_vomiting'))
  ) {
    triggered.push({
      id: 'RF07',
      message_key: 'rf07_dka',
      name: 'Diabetic Emergency (Suspected DKA)',
      description: 'Diabetic patient experiencing confusion, fruity breath, or extreme drowsiness with vomiting.',
    });
  }

  // RF08: Heart rate > 150 or < 40 with good quality
  if (heartRate && heartRate.quality === 'good' && heartRate.bpm !== null) {
    if ((heartRate.bpm > 150 || heartRate.bpm < 40) && s.size > 0) {
      triggered.push({
        id: 'RF08',
        message_key: 'rf08_arrhythmia',
        name: 'Severe Resting Arrhythmia',
        description: `Heart rate recorded at ${heartRate.bpm} BPM with accompanying symptoms requires urgent ECG evaluation.`,
      });
    }
  }

  // RF09: Coughing blood (hemoptysis)
  if (s.has('coughing_blood')) {
    triggered.push({
      id: 'RF09',
      message_key: 'rf09_hemoptysis',
      name: 'Hemoptysis (Coughing Blood)',
      description: 'Coughing up blood is a sign of acute pulmonary infection, pulmonary embolism, or vascular tear.',
    });
  }

  // RF10: Active seizure or convulsions
  if (s.has('seizure') || s.has('convulsions')) {
    triggered.push({
      id: 'RF10',
      message_key: 'rf10_seizure',
      name: 'Active Seizures / Status Epilepticus',
      description: 'Convulsive seizures require immediate hospital anti-epileptic treatment.',
    });
  }

  return {
    emergency: triggered.length > 0,
    rules: triggered,
  };
}
