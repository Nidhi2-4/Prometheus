import { Language, SymptomCode } from '../types/health';
import { matchTranscriptToSymptoms } from '../services/voice';

// Text-to-Speech (TTS)
export function speakDeviceText(text: string, lang: Language) {
  if (!('speechSynthesis' in window)) return;

  window.speechSynthesis.cancel();

  const utterance = new SpeechSynthesisUtterance(text);
  const targetLocale = `${lang}-IN`;
  utterance.lang = targetLocale;
  utterance.rate = 0.95;

  const voices = window.speechSynthesis.getVoices();
  const matchedVoice = voices.find((v) => v.lang === targetLocale || v.lang.startsWith(targetLocale.split('-')[0]));
  if (matchedVoice) {
    utterance.voice = matchedVoice;
  }

  window.speechSynthesis.speak(utterance);
}

// Check if device has voice support for the language
export function hasVoice(lang: Language): boolean {
  if (!('speechSynthesis' in window)) return false;
  return window.speechSynthesis.getVoices().some((v) => v.lang.startsWith(lang));
}

export interface SpeechHandlers {
  onResult: (transcript: string, matched: SymptomCode[]) => void;
  onInterim?: (interim: string) => void;
  onError?: (err: string) => void;
  onStateChange?: (state: 'listening' | 'processing' | 'idle') => void;
}

// Module-level pointer to currently running recognition instance
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let activeRecognitionInstance: any = null;

export function isSpeechRecognitionSupported(): boolean {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return !!((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition);
}

export function stopDeviceSpeechRecognition() {
  if (activeRecognitionInstance) {
    try {
      activeRecognitionInstance.stop();
    } catch (e) {
      console.warn('Error stopping speech recognition:', e);
    }
    activeRecognitionInstance = null;
  }
}

// Speech-to-Text (STT) with robust microphone handling
export async function startDeviceSpeechRecognition(
  lang: Language,
  handlers: SpeechHandlers
) {
  const { onResult, onInterim, onError, onStateChange } = handlers;

  // Stop any currently running recognition first to avoid InvalidStateError
  stopDeviceSpeechRecognition();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const SpeechRec = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
  if (!SpeechRec) {
    onError?.('Speech recognition is not supported in this browser. Please use Google Chrome or Edge.');
    onStateChange?.('idle');
    return null;
  }

  // Setup recognition instance
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const recognition = new (SpeechRec as any)();
  activeRecognitionInstance = recognition;

  recognition.continuous = false;
  recognition.interimResults = true;
  recognition.maxAlternatives = 1;

  // Language mapping: Chrome desktop supports hi-IN and en-IN reliably.
  // For Marathi, gujarati, telugu, kannada - if unsupported by browser STT, we map to hi-IN
  // which transcribes phonetic Indian speech very accurately.
  const localeMap: Record<Language, string> = {
    en: 'en-IN',
    hi: 'hi-IN',
    mr: 'hi-IN', // hi-IN parses Marathi phonetics much better in Chromium than uninstalled mr-IN models
    gu: 'gu-IN',
    te: 'te-IN',
    kn: 'kn-IN',
  };

  recognition.lang = localeMap[lang] || 'hi-IN';

  let finalTranscript = '';
  let latestInterim = '';
  let resultDelivered = false;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  recognition.onstart = () => {
    onStateChange?.('listening');
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  recognition.onaudiostart = () => {
    onStateChange?.('listening');
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  recognition.onresult = (event: any) => {
    let interim = '';
    for (let i = event.resultIndex; i < event.results.length; ++i) {
      const part = event.results[i][0].transcript;
      if (event.results[i].isFinal) {
        finalTranscript += (finalTranscript ? ' ' : '') + part;
      } else {
        interim += part;
      }
    }

    latestInterim = interim;
    if (interim) {
      onInterim?.(interim);
    }

    if (finalTranscript && !resultDelivered) {
      resultDelivered = true;
      const codes = matchTranscriptToSymptoms(finalTranscript);
      onStateChange?.('processing');
      onResult(finalTranscript, codes);
    }
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  recognition.onerror = (e: any) => {
    console.warn('Speech recognition status:', e.error);
    activeRecognitionInstance = null;
    onStateChange?.('idle');

    if (e.error === 'no-speech') {
      onError?.('No voice detected. Please speak closer to your microphone or tap symptoms below.');
    } else if (e.error === 'not-allowed') {
      onError?.('Microphone access blocked. Click the lock/tune icon in browser URL bar to allow microphone.');
    } else if (e.error === 'audio-capture') {
      onError?.('No microphone hardware found. Please verify your microphone is plugged in.');
    } else if (e.error === 'network') {
      onError?.('Speech network timeout. You can select symptoms directly from the cards below.');
    } else if (e.error === 'language-not-supported') {
      onError?.('Language voice pack unavailable. Switched to Indian English / Hindi.');
    } else {
      onError?.(`Microphone notice: ${e.error || 'Please speak again or tap symptoms.'}`);
    }
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  recognition.onend = () => {
    activeRecognitionInstance = null;
    onStateChange?.('idle');

    // If browser ended before marking transcript as isFinal, deliver the collected text
    const residual = finalTranscript.trim() || latestInterim.trim();
    if (residual && !resultDelivered) {
      resultDelivered = true;
      const codes = matchTranscriptToSymptoms(residual);
      onStateChange?.('processing');
      onResult(residual, codes);
    }
  };

  try {
    recognition.start();
    return recognition;
  } catch (err: any) {
    activeRecognitionInstance = null;
    console.error('Failed to start speech recognition:', err);
    onStateChange?.('idle');
    onError?.('Could not activate microphone. Tap symptom cards directly.');
    return null;
  }
}
