import { useEffect, useState } from 'react';
import { ArrowLeft, ArrowRight, CircleAlert, FileText, MapPin, Mic, Phone, ShieldCheck, Siren, Stethoscope } from 'lucide-react';
import {
  AssessmentResponse, Facility, HeartRateResult, Language, PatientFeatures, RedFlagRule, SymptomCode, TriageLevel,
} from './types/health';
import { SYMPTOM_CATALOG, TRANSLATIONS } from './i18n/translations';
import { evaluateRedFlags } from './services/redFlagEngine';
import { fetchFacilities, initializeSession, postAssessment, submitAssessment } from './services/api';
import { queueAssessmentOffline, setupAutoSyncListener } from './services/offlineQueue';
import { startDeviceSpeechRecognition } from './device/speech';
import { DISTRICT_FALLBACKS, GeoCoordinates, getDeviceLocation } from './device/geolocation';
import { Choice, Title, YesNo } from './components/ui';
import { EmergencyAlert } from './components/EmergencyAlert';
import { HeartRateScanner } from './components/HeartRateScanner';
import { CareScreen } from './components/CareScreen';
import { SchemeScreen } from './components/SchemeScreen';
import { SummaryScreen } from './components/SummaryScreen';
import { DoctorScreen } from './components/DoctorScreen';

type Step =
  | 'lang' | 'consent' | 'home'
  | 'basic' | 'lifestyle' | 'history' | 'pregnancy' | 'symptoms' | 'vitals'
  | 'result' | 'care' | 'scheme' | 'summary' | 'doctor';

const EMPTY: PatientFeatures = {
  name: '',
  age: 0, sex: null, height_cm: 0, weight_kg: 0,
  smoker: false, alcohol: false, activity_level: 'moderate',
  known_hypertension: false, known_diabetes: false, known_heart_disease: false,
  family_history_diabetes: false, family_history_cvd: false,
  systolic: null, diastolic: null,
  is_pregnant: false, pregnancy_weeks: null, gravida: null, previous_complications: false,
  symptoms: [],
};

const LANGS: { code: Language; name: string }[] = [
  { code: 'en', name: 'English' },
  { code: 'hi', name: 'हिंदी' },
  { code: 'mr', name: 'मराठी' },
  { code: 'gu', name: 'ગુજરાતી' },
  { code: 'te', name: 'తెలుగు' },
  { code: 'kn', name: 'ಕನ್ನಡ' },
];

const TRIAGE_ICON = { emergency: Siren, urgent: CircleAlert, routine: Stethoscope, self_care: ShieldCheck };

const inRange = (v: number | null | undefined, lo: number, hi: number) => v != null && v >= lo && v <= hi;
const numOrNull = (v: string) => (v === '' ? null : Number(v));

export default function App() {
  const [lang, setLang] = useState<Language>('en');
  const [step, setStep] = useState<Step>('lang');
  const [f, setF] = useState<PatientFeatures>(EMPTY);
  const [hr, setHr] = useState<HeartRateResult | null>(null);
  const [assessment, setAssessment] = useState<AssessmentResponse | null>(null);
  const [savedOffline, setSavedOffline] = useState(false);
  const [offlineResult, setOfflineResult] = useState(false);
  const [coords, setCoords] = useState<GeoCoordinates>(DISTRICT_FALLBACKS.Nagpur);
  const [gpsFailed, setGpsFailed] = useState(false);
  const [alertRules, setAlertRules] = useState<RedFlagRule[]>([]);
  const [dismissed, setDismissed] = useState<string[]>([]);
  const [emergencyFrom, setEmergencyFrom] = useState<Step | null>(null);
  const [facilities, setFacilities] = useState<Facility[]>([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [voiceMsg, setVoiceMsg] = useState('');
  const [, setVoicesLoaded] = useState(0);
  const t = TRANSLATIONS[lang];

  useEffect(() => {
    initializeSession();
    setupAutoSyncListener((item) => postAssessment(item.payload));
    // Voices load async; re-render so speaker buttons appear once they do.
    if ('speechSynthesis' in window) speechSynthesis.onvoiceschanged = () => setVoicesLoaded((n) => n + 1);
  }, []);

  useEffect(() => { document.documentElement.lang = lang; }, [lang]);

  const triage: TriageLevel | undefined = emergencyFrom ? 'emergency' : assessment?.triage_level;
  useEffect(() => {
    if (!triage) return;
    let live = true;
    fetchFacilities(coords.lat, coords.lng, triage, f.is_pregnant).then((list) => live && setFacilities(list));
    return () => { live = false; };
  }, [coords, triage, f.is_pregnant]);

  const go = (s: Step) => {
    setError('');
    setStep(s);
    window.scrollTo(0, 0);
  };

  const update = (patch: Partial<PatientFeatures>) => {
    setF({ ...f, ...patch });
    setError('');
  };

  const visibleSymptoms = SYMPTOM_CATALOG.filter((s) => !s.pregnancyOnly || f.is_pregnant);
  const toggleSymptom = (code: SymptomCode) =>
    update({ symptoms: f.symptoms.includes(code) ? f.symptoms.filter((c) => c !== code) : [...f.symptoms, code] });

  const listen = () => {
    setVoiceMsg(t.voice_listening);
    const rec = startDeviceSpeechRecognition(lang, (_text, codes) => {
      const found = codes.filter((c) => visibleSymptoms.some((s) => s.code === c) && !f.symptoms.includes(c));
      setVoiceMsg(found.length || codes.length ? '' : t.voice_none);
      if (found.length) update({ symptoms: [...f.symptoms, ...found] });
    }, () => setVoiceMsg(t.voice_none));
    if (!rec) setVoiceMsg(t.voice_unsupported);
  };

  const intake: Step[] = ['basic', 'lifestyle', 'history', ...(f.is_pregnant ? ['pregnancy' as const] : []), 'symptoms', 'vitals'];
  const idx = intake.indexOf(step);

  const validate = () => {
    if (step === 'basic') {
      if (!inRange(f.age, 1, 120)) return t.err_age;
      if (!f.sex) return t.err_sex;
      if (!inRange(f.height_cm, 50, 250)) return t.err_height;
      if (!inRange(f.weight_kg, 2, 300)) return t.err_weight;
    }
    if (step === 'pregnancy' && !inRange(f.pregnancy_weeks, 1, 42)) return t.err_weeks;
    if (step === 'vitals' && (f.systolic != null || f.diastolic != null) && !(inRange(f.systolic, 60, 260) && inRange(f.diastolic, 30, 160))) return t.err_bp;
    return '';
  };

  const seeResult = async () => {
    setBusy(true);
    const payload = { language: lang, lat: coords.lat, lng: coords.lng, features: f, heart_rate: hr };
    const { result, offline } = await submitAssessment(payload);
    const queued = offline && !navigator.onLine;
    if (queued) await queueAssessmentOffline({ id: result.assessment_id, timestamp: new Date().toISOString(), payload, localAssessment: result });
    setSavedOffline(queued);
    setOfflineResult(offline);
    setAssessment(result);
    setEmergencyFrom(null);
    setBusy(false);
    go('result');
  };

  const proceed = () => (step === 'vitals' ? seeResult() : go(intake[idx + 1]));

  // Red flags are checked when the user taps Next, so they can finish selecting first.
  // Rules already dismissed with "continue anyway" do not re-open the alert.
  const next = () => {
    const err = validate();
    if (err) return setError(err);
    const rules = evaluateRedFlags(f, hr).rules;
    if (rules.some((r) => !dismissed.includes(r.id))) return setAlertRules(rules);
    proceed();
  };

  // Every check starts from a blank form, however the user got back to home.
  const startCheck = () => {
    setF(EMPTY);
    setHr(null);
    setAssessment(null);
    setDismissed([]);
    setFacilities([]);
    setEmergencyFrom(null);
    getDeviceLocation(setCoords, (fallback) => { setCoords(fallback); setGpsFailed(true); });
    go('basic');
  };

  const bmi = f.height_cm && f.weight_kg ? (f.weight_kg / (f.height_cm / 100) ** 2).toFixed(1) : null;
  const afterResult = ['result', 'care', 'scheme', 'summary', 'doctor'].includes(step);
  const backFromCare = () => {
    if (emergencyFrom) {
      const from = emergencyFrom;
      setEmergencyFrom(null);
      go(from);
    } else go('result');
  };

  return (
    <>
      <header className="header no-print">
        <div className="header-inner">
        <button className="brand" onClick={() => step !== 'lang' && step !== 'consent' && go('home')}>
          <img src="/favicon.png" alt="Logo" className="brand-logo" />
          <span>{t.app_name}</span>
        </button>
        <select aria-label="Language" value={lang} onChange={(e) => setLang(e.target.value as Language)}>
          {LANGS.map((l) => <option key={l.code} value={l.code}>{l.name}</option>)}
        </select>
        <a className="btn btn-danger btn-small" href="tel:108"><Phone size={18} /> 108</a>
        </div>
      </header>

      <main className={['result', 'care', 'doctor'].includes(step) ? 'wide' : undefined}>
        {step === 'lang' && (
          <section className="card">
            <h1>{t.lang_title}</h1>
            <div className="langs">
              {LANGS.map((l) => (
                <Choice key={l.code} selected={lang === l.code} onClick={() => { setLang(l.code); go('consent'); }}>
                  <span className="big">{l.name}</span>
                </Choice>
              ))}
            </div>
          </section>
        )}

        {step === 'consent' && (
          <section className="card">
            <Title lang={lang} title={t.consent_title} sub={t.consent_body} />
            <p><strong>{t.disclaimer}</strong></p>
            <button className="btn btn-primary" onClick={() => go('home')}>{t.consent_agree}</button>
          </section>
        )}

        {step === 'home' && (
          <section className="card">
            <h1>{t.home_title}</h1>
            <p className="muted">{t.home_sub}</p>
            <button className="btn btn-primary" onClick={startCheck}>{t.home_start} <ArrowRight size={20} /></button>
            <p className="small muted">{t.tagline}</p>
          </section>
        )}

        {idx >= 0 && (
          <>
            <div>
              <p className="small muted">{t.step(idx + 1, intake.length)}</p>
              <div className="progress"><div style={{ width: `${((idx + 1) / intake.length) * 100}%` }} /></div>
            </div>

            <section className="card">
              {step === 'basic' && (
                <>
                  <Title lang={lang} title={t.basic_title} />
                  <label className="field">
                    {t.name}
                    <input
                      type="text"
                      autoComplete="name"
                      placeholder={t.name_placeholder}
                      value={f.name || ''}
                      onChange={(e) => update({ name: e.target.value })}
                    />
                  </label>
                  <label className="field">
                    {t.age}
                    <input type="number" inputMode="numeric" value={f.age || ''} onChange={(e) => update({ age: Number(e.target.value) })} />
                  </label>
                  <div className="question">
                    <span className="small muted">{t.sex}</span>
                    <div className="row">
                      {(['M', 'F', 'O'] as const).map((s) => (
                        <Choice key={s} selected={f.sex === s} onClick={() => update({ sex: s, is_pregnant: s === 'F' && f.is_pregnant })}>
                          {s === 'M' ? t.male : s === 'F' ? t.female : t.other}
                        </Choice>
                      ))}
                    </div>
                  </div>
                  <div className="row">
                    <label className="field">
                      {t.height}
                      <input type="number" inputMode="numeric" value={f.height_cm || ''} onChange={(e) => update({ height_cm: Number(e.target.value) })} />
                    </label>
                    <label className="field">
                      {t.weight}
                      <input type="number" inputMode="decimal" value={f.weight_kg || ''} onChange={(e) => update({ weight_kg: Number(e.target.value) })} />
                    </label>
                  </div>
                  {bmi && <p className="muted">{t.bmi}: <strong>{bmi}</strong></p>}
                </>
              )}

              {step === 'lifestyle' && (
                <>
                  <Title lang={lang} title={t.lifestyle_title} />
                  <YesNo lang={lang} question={t.smoke_q} value={f.smoker} onChange={(v) => update({ smoker: v })} />
                  <YesNo lang={lang} question={t.alcohol_q} value={f.alcohol} onChange={(v) => update({ alcohol: v })} />
                  <div className="question">
                    <span>{t.activity_q}</span>
                    {(['low', 'moderate', 'high'] as const).map((a) => (
                      <Choice key={a} selected={f.activity_level === a} onClick={() => update({ activity_level: a })}>
                        {a === 'low' ? t.activity_low : a === 'moderate' ? t.activity_mod : t.activity_high}
                      </Choice>
                    ))}
                  </div>
                </>
              )}

              {step === 'history' && (
                <>
                  <Title lang={lang} title={t.history_title} />
                  <YesNo lang={lang} question={t.known_bp_q} value={f.known_hypertension} onChange={(v) => update({ known_hypertension: v })} />
                  <YesNo lang={lang} question={t.known_diabetes_q} value={f.known_diabetes} onChange={(v) => update({ known_diabetes: v })} />
                  <YesNo lang={lang} question={t.known_heart_q} value={f.known_heart_disease} onChange={(v) => update({ known_heart_disease: v })} />
                  <YesNo lang={lang} question={t.family_diabetes_q} value={f.family_history_diabetes} onChange={(v) => update({ family_history_diabetes: v })} />
                  <YesNo lang={lang} question={t.family_heart_q} value={f.family_history_cvd} onChange={(v) => update({ family_history_cvd: v })} />
                  {f.sex === 'F' && (
                    <YesNo lang={lang} question={t.pregnant_q} value={f.is_pregnant} onChange={(v) => update({ is_pregnant: v })} />
                  )}
                </>
              )}

              {step === 'pregnancy' && (
                <>
                  <Title lang={lang} title={t.preg_title} />
                  <label className="field">
                    {t.preg_weeks}
                    <input type="number" inputMode="numeric" value={f.pregnancy_weeks ?? ''} onChange={(e) => update({ pregnancy_weeks: numOrNull(e.target.value) })} />
                  </label>
                  <label className="field">
                    {t.gravida}
                    <input type="number" inputMode="numeric" value={f.gravida ?? ''} onChange={(e) => update({ gravida: numOrNull(e.target.value) })} />
                  </label>
                  <YesNo lang={lang} question={t.prev_complications_q} value={f.previous_complications} onChange={(v) => update({ previous_complications: v })} />
                </>
              )}

              {step === 'symptoms' && (
                <>
                  <Title lang={lang} title={t.symptoms_title} sub={t.symptoms_sub}>
                    <button className="icon-btn" aria-label={t.voice_btn} onClick={listen}><Mic size={22} /></button>
                  </Title>
                  {voiceMsg && <p className="muted" role="status">{voiceMsg}</p>}
                  <div className="symptoms">
                    {visibleSymptoms.map((s) => (
                      <Choice key={s.code} selected={f.symptoms.includes(s.code)} onClick={() => toggleSymptom(s.code)}>
                        <s.icon size={28} />
                        {s.label[lang]}
                      </Choice>
                    ))}
                  </div>
                </>
              )}

              {step === 'vitals' && (
                <>
                  <Title lang={lang} title={t.vitals_title} sub={t.vitals_sub} />
                  <h2>{t.bp_title}</h2>
                  <div className="row">
                    <label className="field">
                      {t.systolic}
                      <input type="number" inputMode="numeric" value={f.systolic ?? ''} onChange={(e) => update({ systolic: numOrNull(e.target.value) })} />
                    </label>
                    <label className="field">
                      {t.diastolic}
                      <input type="number" inputMode="numeric" value={f.diastolic ?? ''} onChange={(e) => update({ diastolic: numOrNull(e.target.value) })} />
                    </label>
                  </div>
                  <HeartRateScanner t={t} value={hr} onChange={setHr} />
                </>
              )}
            </section>

            {error && <p className="error" role="alert">{error}</p>}
            <div className="row">
              <button className="btn" onClick={() => go(idx === 0 ? 'home' : intake[idx - 1])}><ArrowLeft size={20} /> {t.back}</button>
              <button className="btn btn-primary" disabled={busy} onClick={next}>
                {step === 'vitals' ? (busy ? t.checking : t.see_result) : t.next} <ArrowRight size={20} />
              </button>
            </div>
          </>
        )}

        {step === 'result' && assessment && (() => {
          const level = assessment.triage_level;
          const Icon = TRIAGE_ICON[level];
          return (
            <>
              {savedOffline && <p className="card">{t.saved_offline}</p>}
              {offlineResult && !savedOffline && <p className="card">{t.offline_estimate}</p>}
              <h1>{t.result_title}</h1>
              <div className={`triage triage-${level}`}>
                <Icon size={32} style={{ flex: 'none' }} />
                <div>
                  <h2>{t[`triage_${level}` as const]}</h2>
                  <p>{t[`advice_${level}` as const]}</p>
                </div>
              </div>
              {level === 'emergency' && <a className="btn btn-danger" href="tel:108"><Phone size={20} /> {t.call_108}</a>}

              <h2>{t.risk_title}</h2>
              <div className="grid">
              {assessment.results.map((r) => (
                <section key={r.condition} className="card">
                  <div className="title-row">
                    <h3>{t[`cond_${r.condition}` as const]}</h3>
                    <span className={`level level-${r.level}`}>{t[`level_${r.level}` as const]}</span>
                  </div>
                  <div className="bar"><div className={`level-${r.level}`} style={{ width: `${Math.round(r.probability * 100)}%` }} /></div>
                  <ul className="reasons">{r.top_factors.slice(0, 3).map((x) => <li key={x.feature}>{x.text}</li>)}</ul>
                  {r.note && <p className="small">{r.note}</p>}
                  <p className="small muted">{t.model_version} {r.model_version}</p>
                </section>
              ))}
              </div>

              <div className="stack actions">
                <button className="btn btn-primary" onClick={() => go('care')}><MapPin size={20} /> {t.find_care}</button>
                <button className="btn" onClick={() => go('scheme')}><ShieldCheck size={20} /> {t.pmjay_btn}</button>
                <button className="btn" onClick={() => go('summary')}><FileText size={20} /> {t.summary_btn}</button>
                <button className="btn" onClick={() => go('doctor')}><Stethoscope size={20} /> {t.doctor_btn}</button>
              </div>
              <button className="link" onClick={() => go('home')}>{t.start_over}</button>
            </>
          );
        })()}

        {step === 'care' && (
          <CareScreen
            t={t}
            facilities={facilities}
            coords={coords}
            onDistrict={setCoords}
            gpsFailed={gpsFailed}
            emergency={triage === 'emergency'}
            maternity={f.is_pregnant}
          />
        )}
        {step === 'scheme' && <SchemeScreen lang={lang} />}
        {step === 'summary' && assessment && <SummaryScreen lang={lang} f={f} hr={hr} assessment={assessment} facility={facilities[0]} />}
        {step === 'doctor' && assessment && <DoctorScreen f={f} hr={hr} assessment={assessment} />}

        {['care', 'scheme', 'summary', 'doctor'].includes(step) && (
          <button className="btn no-print" onClick={step === 'care' ? backFromCare : () => go('result')}>
            <ArrowLeft size={20} /> {t.back}
          </button>
        )}
      </main>

      {afterResult && <p className="footer no-print">{t.disclaimer}</p>}

      {alertRules.length > 0 && (
        <EmergencyAlert
          t={t}
          rules={alertRules}
          onNearest={() => {
            setDismissed(alertRules.map((r) => r.id));
            setAlertRules([]);
            setEmergencyFrom(step);
            go('care');
          }}
          onContinue={() => {
            setDismissed(alertRules.map((r) => r.id));
            setAlertRules([]);
            proceed();
          }}
        />
      )}
    </>
  );
}
