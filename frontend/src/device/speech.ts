import { Language, SymptomCode } from '../types/health';
import { matchTranscriptToSymptoms } from '../services/voice';

// Text-to-Speech (TTS)
export function speakDeviceText(text: string, lang: Language) {
  if (!('speechSynthesis' in window)) return;

  window.speechSynthesis.cancel();

  const utterance = new SpeechSynthesisUtterance(text);
  const targetLocale = lang === 'mr' ? 'mr-IN' : lang === 'hi' ? 'hi-IN' : 'en-IN';
  utterance.lang = targetLocale;
  utterance.rate = 0.95;

  const voices = window.speechSynthesis.getVoices();
  const matchedVoice = voices.find((v) => v.lang === targetLocale || v.lang.startsWith(targetLocale.split('-')[0]));
  if (matchedVoice) {
    utterance.voice = matchedVoice;
  }

  window.speechSynthesis.speak(utterance);
}

// Speech-to-Text (STT)
export function startDeviceSpeechRecognition(
  lang: Language,
  onResult: (transcript: string, matched: SymptomCode[]) => void,
  onError?: (err: unknown) => void
) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const SpeechRec = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
  if (!SpeechRec) {
    if (onError) onError(new Error('Speech recognition not supported in this browser.'));
    return null;
  }

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

  recognition.start();
  return recognition;
}
