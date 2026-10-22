import { SymptomCode } from '../types/health';

// Symptom Keyword Matcher from spoken transcript
export function matchTranscriptToSymptoms(transcript: string): SymptomCode[] {
  const lower = transcript.toLowerCase();
  const matched: SymptomCode[] = [];

  const mappings: { code: SymptomCode; keywords: string[] }[] = [
    { code: 'chest_pain', keywords: ['chest', 'छाती', 'छातीत'] },
    { code: 'sweating', keywords: ['sweat', 'sweating', 'पसीना', 'घाम'] },
    { code: 'breathlessness', keywords: ['breath', 'breathless', 'सांस', 'दम', 'श्वास'] },
    { code: 'breathlessness_at_rest', keywords: ['बैठे-बैठे सांस', 'विश्रांतीच्या वेळी', 'breathless at rest'] },
    { code: 'headache', keywords: ['headache', 'सिरदर्द', 'डोके', 'डोकेदुखी', 'सर दर्द'] },
    { code: 'severe_headache', keywords: ['severe headache', 'तेज सिरदर्द', 'तीव्र डोकेदुखी'] },
    { code: 'dizziness', keywords: ['dizzy', 'dizziness', 'चक्कर', 'भोवळ'] },
    { code: 'fever', keywords: ['fever', 'बुखार', 'ताप', 'temperature'] },
    { code: 'cough', keywords: ['cough', 'खांसी', 'खोकला'] },
    { code: 'nausea', keywords: ['nausea', 'vomit', 'उल्टी', 'मळमळ', 'जी मिचलाना'] },
    { code: 'fainting', keywords: ['faint', 'बेहोश', 'बेशुद्ध'] },
    { code: 'swelling', keywords: ['swelling', 'swell', 'सूजन', 'सूज'] },
    { code: 'frequent_urination', keywords: ['urination', 'urine', 'पेशाब', 'लघवी', 'toilet'] },
    { code: 'excessive_thirst', keywords: ['thirst', 'thirsty', 'प्यास', 'तहान'] },
    { code: 'fatigue', keywords: ['tired', 'fatigue', 'कमजोरी', 'थकान', 'अशक्तपणा'] },
    { code: 'blurred_vision', keywords: ['vision', 'blur', 'धुंधला', 'अस्पष्ट'] },
    { code: 'coughing_blood', keywords: ['cough blood', 'खून की खांसी', 'रक्त खोकला'] },
    { code: 'vaginal_bleeding', keywords: ['bleeding', 'रक्तस्राव', 'खून जाना'] },
    { code: 'reduced_baby_movement', keywords: ['baby movement', 'बच्चे की हलचल', 'बाळाची हालचाल'] },
  ];

  for (const item of mappings) {
    if (item.keywords.some((k) => lower.includes(k))) {
      matched.push(item.code);
    }
  }

  return matched;
}
