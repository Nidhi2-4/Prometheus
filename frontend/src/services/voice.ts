import { Language, SymptomCode } from '../types/health';

// Text-to-Speech (TTS)
export function speakText(text: string, lang: Language) {
  if (!('speechSynthesis' in window)) return;

  window.speechSynthesis.cancel(); // Stop any ongoing speech

  const utterance = new SpeechSynthesisUtterance(text);
  const targetLocale = lang === 'mr' ? 'mr-IN' : lang === 'hi' ? 'hi-IN' : 'en-IN';
  utterance.lang = targetLocale;
  utterance.rate = 0.95; // Slightly slower for clear rural comprehension

  const voices = window.speechSynthesis.getVoices();
  const matchedVoice = voices.find((v) => v.lang === targetLocale || v.lang.startsWith(targetLocale.split('-')[0]));
  if (matchedVoice) {
    utterance.voice = matchedVoice;
  }

  window.speechSynthesis.speak(utterance);
}

// Symptom Keyword Matcher from spoken transcript
export function matchTranscriptToSymptoms(transcript: string): SymptomCode[] {
  const lower = transcript.toLowerCase();
  const matched: SymptomCode[] = [];

  const mappings: { code: SymptomCode; keywords: string[] }[] = [
    { code: 'chest_pain', keywords: ['chest pain', 'chest', 'छाती', 'दर्द', 'दुखणे', 'छातीत', 'pressure'] },
    { code: 'sweating', keywords: ['sweat', 'sweating', 'पसीना', 'घाम'] },
    { code: 'breathlessness', keywords: ['breath', 'breathless', 'सांस', 'दम', 'श्वास'] },
    { code: 'breathlessness_at_rest', keywords: ['बैठे-बैठे सांस', 'विश्रांतीच्या वेळी', 'breathless at rest'] },
    { code: 'headache', keywords: ['headache', 'सिरदर्द', 'डोके', 'डोकेदुखी', 'सर दर्द'] },
    { code: 'severe_headache', keywords: ['severe headache', 'तेज सिरदर्द', 'तीव्र डोकेदुखी'] },
    { code: 'dizziness', keywords: ['dizzy', 'dizziness', 'चक्कर', 'भोवळ'] },
    { code: 'fever', keywords: ['fever', 'बुखार', 'ताप', 'temperature'] },
    { code: 'cough', keywords: ['cough', 'खांसी', 'खोकला'] },
    { code: 'nausea', keywords: ['nausea', 'vomit', 'उल्टी', 'मळमळ', 'जी मिचलाना'] },
    { code: 'fainting', keywords: ['faint', 'fainting', 'बेहोश', 'बेशुद्ध', 'चक्कर खाकर'] },
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

// Speech Recognition helper
export function createSpeechRecognizer(
  lang: Language,
  onResult: (transcript: string, matched: SymptomCode[]) => void,
  onError?: (err: unknown) => void
) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const SpeechRec = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
  if (!SpeechRec) return null;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const recognition = new (SpeechRec as any)();
  recognition.continuous = false;
  recognition.interimResults = false;
  recognition.lang = lang === 'mr' ? 'mr-IN' : lang === 'hi' ? 'hi-IN' : 'en-IN';

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  recognition.onresult = (event: any) => {
    const text = event.results[0][0].transcript;
    const codes = matchTranscriptToSymptoms(text);
    onResult(text, codes);
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  recognition.onerror = (e: any) => {
    if (onError) onError(e);
  };

  return recognition;
}
