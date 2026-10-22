import { Language, PatientFeatures, TriageLevel } from '../types/health';

// One-time setup: language, consent, profile and past BP readings, saved on this phone only.
// Every access is wrapped: private mode or blocked storage must never break the check.
const KEY = 'swasthik';

export type Profile = Omit<PatientFeatures, 'age' | 'symptoms' | 'systolic' | 'diastolic' | 'symptom_duration_days'> & {
  birth_year: number;          // age is recomputed every year
  pregnancy_saved_on?: string; // weeks move forward from this date
};

export interface CheckRecord {
  date: string;
  systolic: number | null;
  diastolic: number | null;
  bpm: number | null;
  triage: TriageLevel;
}

interface Saved {
  lang?: Language;
  consentAt?: string;
  profile?: Profile;
  history?: CheckRecord[];
}

export function loadSaved(): Saved {
  try {
    return JSON.parse(localStorage.getItem(KEY) || '{}');
  } catch {
    return {};
  }
}

function save(patch: Partial<Saved>) {
  try {
    localStorage.setItem(KEY, JSON.stringify({ ...loadSaved(), ...patch }));
  } catch {
    // storage blocked: the app still works, it just asks again next time
  }
}

export const saveLang = (lang: Language) => save({ lang });
export const saveConsent = () => save({ consentAt: new Date().toISOString() });

export function saveProfile(f: PatientFeatures) {
  const { age, symptoms: _s, systolic: _sy, diastolic: _d, symptom_duration_days: _sd, ...rest } = f;
  save({
    profile: {
      ...rest,
      birth_year: new Date().getFullYear() - age,
      pregnancy_saved_on: f.is_pregnant ? new Date().toISOString() : undefined,
    },
  });
}

// Saved profile -> features for today: current age, pregnancy weeks moved forward (cleared after 42 weeks).
export function profileToFeatures(p: Profile, empty: PatientFeatures): PatientFeatures {
  const { birth_year, pregnancy_saved_on, ...rest } = p;
  const f: PatientFeatures = { ...empty, ...rest, age: new Date().getFullYear() - birth_year };
  if (f.is_pregnant && f.pregnancy_weeks && pregnancy_saved_on) {
    const weeks = f.pregnancy_weeks + Math.floor((Date.now() - Date.parse(pregnancy_saved_on)) / (7 * 864e5));
    if (weeks > 42) Object.assign(f, { is_pregnant: false, pregnancy_weeks: null });
    else f.pregnancy_weeks = weeks;
  }
  return f;
}

export function addCheck(r: CheckRecord) {
  save({ history: [r, ...(loadSaved().history ?? [])].slice(0, 50) });
}

export function clearSaved() {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // nothing saved
  }
}
