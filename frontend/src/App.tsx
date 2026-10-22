import React, { useState, useEffect } from 'react';
import {
  Language,
  PatientFeatures,
  HeartRateResult,
  AssessmentResponse,
  SymptomCode,
} from './types/health';
import { TRANSLATIONS, SYMPTOM_CATALOG } from './i18n/translations';
import { evaluateRedFlags } from './services/redFlagEngine';
import { getRankedFacilities } from './services/facilitiesData';
import { submitAssessment, generateSOAPNote, generateFHIRBundle, initializeSession } from './services/api';
import { speakDeviceText, startDeviceSpeechRecognition } from './device/speech';
import { getDeviceLocation } from './device/geolocation';
import { queueAssessmentOffline, setupAutoSyncListener } from './services/offlineQueue';
import { HeartRateScanner } from './components/HeartRateScanner';
import { EmergencyModal } from './components/EmergencyModal';
import { FacilityView } from './components/FacilityView';
import { SchemeModal } from './components/SchemeModal';
import { SOAPModal } from './components/SOAPModal';
import { FHIRModal } from './components/FHIRModal';
import { PrintSummaryModal } from './components/PrintSummaryModal';

import {
  Heart,
  Volume2,
  Mic,
  AlertOctagon,
  ArrowRight,
  ArrowLeft,
  ChevronRight,
  Camera,
  CheckCircle2,
  PhoneCall,
  Activity,
  ShieldCheck,
  Stethoscope,
  Database,
  Printer,
  Sparkles,
} from 'lucide-react';

type ScreenStep =
  | 'LANG_SELECT'
  | 'CONSENT'
  | 'HOME'
  | 'BASIC_INFO'
  | 'LIFESTYLE'
  | 'HISTORY'
  | 'PREGNANCY'
  | 'SYMPTOMS'
  | 'VITALS_HUB'
  | 'PROCESSING'
  | 'RESULT';

const DEFAULT_FEATURES: PatientFeatures = {
  age: 45,
  sex: 'F',
  height_cm: 155,
  weight_kg: 72,
  smoker: false,
  alcohol: false,
  activity_level: 'low',
  known_hypertension: false,
  known_diabetes: false,
  known_heart_disease: false,
  family_history_diabetes: true,
  family_history_cvd: false,
  systolic: 142,
  diastolic: 92,
  is_pregnant: false,
  pregnancy_weeks: null,
  gravida: 1,
  previous_complications: false,
  symptoms: ['headache', 'dizziness'],
};

export function App() {
  const [lang, setLang] = useState<Language>('en');
  const [step, setStep] = useState<ScreenStep>('LANG_SELECT');
  const [features, setFeatures] = useState<PatientFeatures>(DEFAULT_FEATURES);
  const [heartRate, setHeartRate] = useState<HeartRateResult | null>(null);
  const [assessment, setAssessment] = useState<AssessmentResponse | null>(null);
  const [userCoords, setUserCoords] = useState<{ lat: number; lng: number }>({ lat: 21.0667, lng: 78.9667 });

  // Modals
  const [showEmergency, setShowEmergency] = useState(false);
  const [showScanner, setShowScanner] = useState(false);
  const [showScheme, setShowScheme] = useState(false);
  const [showSOAP, setShowSOAP] = useState(false);
  const [showFHIR, setShowFHIR] = useState(false);
  const [showPrint, setShowPrint] = useState(false);
  const [isListening, setIsListening] = useState(false);

  const t = TRANSLATIONS[lang];

  useEffect(() => {
    initializeSession();
    // Fetch Device Location with district fallback
    getDeviceLocation(
      (coords) => setUserCoords(coords),
      (fallback) => setUserCoords(fallback)
    );
    // Setup offline auto-sync listener
    setupAutoSyncListener((count) => {
      alert(`Network restored! ${count} offline assessments synchronized successfully.`);
    });
  }, []);

  // Demo presets for judges and instant testing
  const loadPreset = (preset: 'sunita' | 'priya' | 'emergency') => {
    if (preset === 'emergency') {
      const emFeatures: PatientFeatures = {
        ...DEFAULT_FEATURES,
        age: 52,
        symptoms: ['chest_pain', 'sweating', 'arm_jaw_pain'],
      };
      setFeatures(emFeatures);
      const rf = evaluateRedFlags(emFeatures);
      if (rf.emergency) {
        setShowEmergency(true);
      }
    } else if (preset === 'sunita') {
      setLang('mr');
      setFeatures({
        age: 45,
        sex: 'F',
        height_cm: 155,
        weight_kg: 72,
        smoker: false,
        alcohol: false,
        activity_level: 'low',
        known_hypertension: false,
        known_diabetes: false,
        known_heart_disease: false,
        family_history_diabetes: true,
        family_history_cvd: false,
        systolic: 142,
        diastolic: 92,
        is_pregnant: false,
        pregnancy_weeks: null,
        symptoms: ['headache', 'dizziness'],
      });
      setStep('SYMPTOMS');
    } else if (preset === 'priya') {
      setFeatures({
        age: 26,
        sex: 'F',
        height_cm: 160,
        weight_kg: 68,
        smoker: false,
        alcohol: false,
        activity_level: 'moderate',
        known_hypertension: false,
        known_diabetes: false,
        known_heart_disease: false,
        family_history_diabetes: false,
        family_history_cvd: false,
        systolic: 148,
        diastolic: 94,
        is_pregnant: true,
        pregnancy_weeks: 24,
        gravida: 1,
        previous_complications: false,
        symptoms: ['swelling', 'severe_headache'],
      });
      setStep('PREGNANCY');
    }
  };

  // Red-flag check on symptom toggle
  const toggleSymptom = (code: SymptomCode) => {
    const current = features.symptoms;
    const exists = current.includes(code);
    const updated = exists ? current.filter((c) => c !== code) : [...current, code];
    const newFeatures = { ...features, symptoms: updated };
    setFeatures(newFeatures);

    const rf = evaluateRedFlags(newFeatures, heartRate);
    if (rf.emergency) {
      setShowEmergency(true);
    }
  };

  // Voice recognition toggle
  const handleVoiceListen = () => {
    setIsListening(true);
    const rec = startDeviceSpeechRecognition(
      lang,
      (text, codes) => {
        setIsListening(false);
        if (codes.length > 0) {
          const combined = Array.from(new Set([...features.symptoms, ...codes]));
          const updated = { ...features, symptoms: combined };
          setFeatures(updated);
          const rf = evaluateRedFlags(updated, heartRate);
          if (rf.emergency) setShowEmergency(true);
        } else {
          alert(`Heard: "${text}". No specific symptom code identified, please tap from the grid.`);
        }
      },
      () => setIsListening(false)
    );

    if (!rec) {
      setIsListening(false);
      alert(t.voice_unsupported);
    }
  };

  // Trigger Clinical Assessment
  const handleAnalyze = async () => {
    setStep('PROCESSING');
    setTimeout(async () => {
      const payload = {
        language: lang,
        lat: userCoords.lat,
        lng: userCoords.lng,
        features,
        heart_rate: heartRate,
      };

      const res = await submitAssessment(payload);

      // If offline, queue in IndexedDB
      if (typeof navigator !== 'undefined' && !navigator.onLine) {
        await queueAssessmentOffline({
          id: res.assessment_id,
          timestamp: new Date().toISOString(),
          payload,
          localAssessment: res,
        });
        alert('Offline mode active: results saved locally and will auto-sync when network returns.');
      }

      setAssessment(res);
      setStep('RESULT');
    }, 1200);
  };

  const triggeredRedFlags = evaluateRedFlags(features, heartRate).rules;
  const rankedFacilities = getRankedFacilities(
    assessment?.triage_level || 'routine',
    features.is_pregnant
  );
  const bestFacility = rankedFacilities[0];
  const heightM = features.height_cm / 100;
  const bmi = (features.weight_kg / (heightM * heightM)).toFixed(1);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh', padding: '16px 16px 80px 16px' }}>
      {/* Top Navbar */}
      <header className="glass-card" style={{ padding: '12px 16px', marginBottom: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }} onClick={() => setStep('HOME')}>
          <div style={{ width: '32px', height: '32px', borderRadius: '8px', background: 'var(--primary-gradient)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Heart size={18} color="#FFF" />
          </div>
          <div>
            <h1 style={{ fontSize: '18px', fontWeight: 800, color: '#FFF' }}>{t.app_name}</h1>
            <p style={{ fontSize: '10px', color: '#94A3B8' }}>{t.tagline}</p>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          {/* Language Selector */}
          <select
            value={lang}
            onChange={(e) => setLang(e.target.value as Language)}
            style={{
              background: 'rgba(255, 255, 255, 0.08)',
              border: '1px solid var(--border-subtle)',
              color: '#FFF',
              borderRadius: '8px',
              padding: '6px 8px',
              fontSize: '12px',
              fontWeight: 600,
            }}
          >
            <option value="en">English</option>
            <option value="hi">हिंदी</option>
            <option value="mr">मराठी</option>
          </select>

          {/* SOS 108 */}
          <a
            href="tel:108"
            className="btn-emergency"
            style={{
              padding: '6px 12px',
              borderRadius: '8px',
              fontSize: '12px',
              fontWeight: 700,
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              textDecoration: 'none',
            }}
          >
            <PhoneCall size={14} />
            108
          </a>
        </div>
      </header>

      {/* Demo Preset Bar (Hackathon Demo Shortcut) */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: '6px',
        overflowX: 'auto',
        marginBottom: '16px',
        padding: '6px 8px',
        background: 'rgba(255, 255, 255, 0.03)',
        borderRadius: '10px',
        fontSize: '12px',
      }}>
        <span style={{ color: '#38BDF8', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '4px' }}>
          <Sparkles size={14} /> Demo:
        </span>
        <button
          onClick={() => loadPreset('emergency')}
          style={{ padding: '4px 10px', minHeight: '30px', fontSize: '11px', background: 'rgba(220, 38, 38, 0.2)', color: '#F87171', border: '1px solid rgba(220, 38, 38, 0.3)' }}
        >
          🚨 1. Emergency
        </button>
        <button
          onClick={() => loadPreset('sunita')}
          style={{ padding: '4px 10px', minHeight: '30px', fontSize: '11px', background: 'rgba(2, 132, 199, 0.2)', color: '#38BDF8', border: '1px solid rgba(2, 132, 199, 0.3)' }}
        >
          👵 2. Sunita (Chronic)
        </button>
        <button
          onClick={() => loadPreset('priya')}
          style={{ padding: '4px 10px', minHeight: '30px', fontSize: '11px', background: 'rgba(236, 72, 153, 0.2)', color: '#F472B6', border: '1px solid rgba(236, 72, 153, 0.3)' }}
        >
          🤰 3. Priya (Maternal)
        </button>
      </div>

      {/* Screen Views */}
      <main style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
        {/* 1. Language Selection */}
        {step === 'LANG_SELECT' && (
          <div className="glass-card" style={{ padding: '24px', textAlign: 'center' }}>
            <h2 style={{ fontSize: '22px', marginBottom: '8px' }}>{t.lang_select_title}</h2>
            <p style={{ color: '#94A3B8', fontSize: '14px', marginBottom: '24px' }}>{t.lang_select_sub}</p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '24px' }}>
              <div
                className={`option-card ${lang === 'mr' ? 'selected' : ''}`}
                onClick={() => setLang('mr')}
              >
                <span style={{ fontSize: '28px' }}>🚩</span>
                <div style={{ textAlign: 'left' }}>
                  <div style={{ fontSize: '18px', fontWeight: 700 }}>मराठी (Marathi)</div>
                  <div style={{ fontSize: '12px', color: '#94A3B8' }}>आरोग्य तपासणी व मार्गदर्शन</div>
                </div>
              </div>

              <div
                className={`option-card ${lang === 'hi' ? 'selected' : ''}`}
                onClick={() => setLang('hi')}
              >
                <span style={{ fontSize: '28px' }}>🇮🇳</span>
                <div style={{ textAlign: 'left' }}>
                  <div style={{ fontSize: '18px', fontWeight: 700 }}>हिंदी (Hindi)</div>
                  <div style={{ fontSize: '12px', color: '#94A3B8' }}>स्वास्थ्य जांच एवं केंद्र खोज</div>
                </div>
              </div>

              <div
                className={`option-card ${lang === 'en' ? 'selected' : ''}`}
                onClick={() => setLang('en')}
              >
                <span style={{ fontSize: '28px' }}>🌐</span>
                <div style={{ textAlign: 'left' }}>
                  <div style={{ fontSize: '18px', fontWeight: 700 }}>English</div>
                  <div style={{ fontSize: '12px', color: '#94A3B8' }}>AI Triage & Access Navigation</div>
                </div>
              </div>
            </div>

            <button className="btn-primary" onClick={() => setStep('CONSENT')}>
              {t.next} <ArrowRight size={18} style={{ marginLeft: '6px' }} />
            </button>
          </div>
        )}

        {/* 2. Consent Screen */}
        {step === 'CONSENT' && (
          <div className="glass-card" style={{ padding: '24px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
              <h2 style={{ fontSize: '20px' }}>{t.consent_title}</h2>
              <button className="speaker-btn" onClick={() => speakDeviceText(t.consent_body, lang)}>
                <Volume2 size={20} />
              </button>
            </div>

            <div style={{
              background: 'rgba(245, 158, 11, 0.1)',
              border: '1px solid rgba(245, 158, 11, 0.3)',
              borderRadius: '12px',
              padding: '16px',
              marginBottom: '20px',
            }}>
              <p style={{ color: '#FBBF24', fontSize: '13px', fontWeight: 700, marginBottom: '6px' }}>
                ⚠️ {t.disclaimer_banner}
              </p>
              <p style={{ fontSize: '14px', color: '#CBD5E1', lineHeight: 1.6 }}>{t.consent_body}</p>
            </div>

            <button className="btn-primary" onClick={() => setStep('HOME')}>
              {t.consent_agree}
            </button>
          </div>
        )}

        {/* 3. Home Screen */}
        {step === 'HOME' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div className="glass-card" style={{ padding: '28px 20px', textAlign: 'center' }}>
              <div style={{
                width: '64px',
                height: '64px',
                borderRadius: '50%',
                background: 'rgba(2, 132, 199, 0.2)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                margin: '0 auto 16px auto',
              }}>
                <Activity size={32} color="#38BDF8" />
              </div>

              <h2 style={{ fontSize: '24px', fontWeight: 800, marginBottom: '8px' }}>
                {t.home_start_btn}
              </h2>
              <p style={{ fontSize: '14px', color: '#94A3B8', marginBottom: '24px' }}>
                {t.home_sub}
              </p>

              <button className="btn-primary" onClick={() => setStep('BASIC_INFO')}>
                {t.home_start_btn} <ChevronRight size={20} />
              </button>
            </div>

            {/* Feature highlights */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '12px' }}>
              <div className="glass-card" style={{ padding: '16px' }}>
                <span style={{ fontSize: '24px' }}>🚨</span>
                <div style={{ fontWeight: 700, fontSize: '14px', marginTop: '6px' }}>Instant Red-Flags</div>
                <div style={{ fontSize: '12px', color: '#94A3B8' }}>Sub-second local emergency detection</div>
              </div>
              <div className="glass-card" style={{ padding: '16px' }}>
                <span style={{ fontSize: '24px' }}>📷</span>
                <div style={{ fontWeight: 700, fontSize: '14px', marginTop: '6px' }}>Face rPPG Pulse</div>
                <div style={{ fontSize: '12px', color: '#94A3B8' }}>Camera heart rate quality gate</div>
              </div>
            </div>
          </div>
        )}

        {/* 4. Basic Info */}
        {step === 'BASIC_INFO' && (
          <div className="glass-card" style={{ padding: '24px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <h2 style={{ fontSize: '20px' }}>{t.basic_title}</h2>
              <button className="speaker-btn" onClick={() => speakDeviceText(`${t.basic_title}. ${t.age_label}, ${t.sex_label}, ${t.height_label}, ${t.weight_label}`, lang)}>
                <Volume2 size={20} />
              </button>
            </div>

            {/* Age */}
            <div style={{ marginBottom: '16px' }}>
              <label style={{ fontSize: '13px', color: '#94A3B8', display: 'block', marginBottom: '6px' }}>{t.age_label}</label>
              <input
                type="number"
                min="1"
                max="120"
                value={features.age}
                onChange={(e) => setFeatures({ ...features, age: parseInt(e.target.value, 10) || 0 })}
                style={{ width: '100%', padding: '12px', background: 'rgba(255, 255, 255, 0.05)', border: '1px solid var(--border-subtle)', borderRadius: '10px', color: '#FFF', fontSize: '16px' }}
              />
            </div>

            {/* Sex */}
            <div style={{ marginBottom: '16px' }}>
              <label style={{ fontSize: '13px', color: '#94A3B8', display: 'block', marginBottom: '6px' }}>{t.sex_label}</label>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px' }}>
                {(['M', 'F', 'O'] as const).map((s) => (
                  <button
                    key={s}
                    type="button"
                    className={`btn-secondary ${features.sex === s ? 'selected' : ''}`}
                    onClick={() => setFeatures({ ...features, sex: s, is_pregnant: s === 'F' ? features.is_pregnant : false })}
                    style={{ background: features.sex === s ? 'var(--primary-gradient)' : 'rgba(255, 255, 255, 0.05)' }}
                  >
                    {s === 'M' ? t.male : s === 'F' ? t.female : t.other}
                  </button>
                ))}
              </div>
            </div>

            {/* Height & Weight with BMI */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '16px' }}>
              <div>
                <label style={{ fontSize: '13px', color: '#94A3B8', display: 'block', marginBottom: '6px' }}>{t.height_label}</label>
                <input
                  type="number"
                  value={features.height_cm}
                  onChange={(e) => setFeatures({ ...features, height_cm: parseInt(e.target.value, 10) || 0 })}
                  style={{ width: '100%', padding: '12px', background: 'rgba(255, 255, 255, 0.05)', border: '1px solid var(--border-subtle)', borderRadius: '10px', color: '#FFF', fontSize: '16px' }}
                />
              </div>
              <div>
                <label style={{ fontSize: '13px', color: '#94A3B8', display: 'block', marginBottom: '6px' }}>{t.weight_label}</label>
                <input
                  type="number"
                  value={features.weight_kg}
                  onChange={(e) => setFeatures({ ...features, weight_kg: parseInt(e.target.value, 10) || 0 })}
                  style={{ width: '100%', padding: '12px', background: 'rgba(255, 255, 255, 0.05)', border: '1px solid var(--border-subtle)', borderRadius: '10px', color: '#FFF', fontSize: '16px' }}
                />
              </div>
            </div>

            {/* BMI Banner */}
            <div style={{ padding: '10px 14px', background: 'rgba(56, 189, 248, 0.1)', borderRadius: '10px', marginBottom: '20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '13px', color: '#94A3B8' }}>{t.calculated_bmi}</span>
              <span style={{ fontSize: '16px', fontWeight: 800, color: '#38BDF8' }}>{bmi} kg/m²</span>
            </div>

            <div style={{ display: 'flex', gap: '10px' }}>
              <button className="btn-secondary" onClick={() => setStep('HOME')} style={{ flex: 1 }}>{t.back}</button>
              <button className="btn-primary" onClick={() => setStep('LIFESTYLE')} style={{ flex: 2 }}>{t.next} <ArrowRight size={18} /></button>
            </div>
          </div>
        )}

        {/* 5. Lifestyle Screen */}
        {step === 'LIFESTYLE' && (
          <div className="glass-card" style={{ padding: '24px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <h2 style={{ fontSize: '20px' }}>{t.lifestyle_title}</h2>
              <button className="speaker-btn" onClick={() => speakDeviceText(`${t.lifestyle_title}. ${t.smoking_label}. ${t.alcohol_label}`, lang)}>
                <Volume2 size={20} />
              </button>
            </div>

            {/* Smoking */}
            <label className="option-card" style={{ marginBottom: '12px', display: 'flex', justifyContent: 'space-between' }}>
              <span>{t.smoking_label}</span>
              <input
                type="checkbox"
                checked={features.smoker}
                onChange={(e) => setFeatures({ ...features, smoker: e.target.checked })}
                style={{ width: '20px', height: '20px', accentColor: '#0284C7' }}
              />
            </label>

            {/* Alcohol */}
            <label className="option-card" style={{ marginBottom: '16px', display: 'flex', justifyContent: 'space-between' }}>
              <span>{t.alcohol_label}</span>
              <input
                type="checkbox"
                checked={features.alcohol}
                onChange={(e) => setFeatures({ ...features, alcohol: e.target.checked })}
                style={{ width: '20px', height: '20px', accentColor: '#0284C7' }}
              />
            </label>

            {/* Activity Level */}
            <div style={{ marginBottom: '20px' }}>
              <label style={{ fontSize: '13px', color: '#94A3B8', display: 'block', marginBottom: '8px' }}>{t.activity_label}</label>
              {(['low', 'moderate', 'high'] as const).map((lvl) => (
                <div
                  key={lvl}
                  className={`option-card ${features.activity_level === lvl ? 'selected' : ''}`}
                  onClick={() => setFeatures({ ...features, activity_level: lvl })}
                  style={{ marginBottom: '8px' }}
                >
                  <span style={{ fontSize: '18px' }}>{lvl === 'low' ? '🛋️' : lvl === 'moderate' ? '🚶' : '🌾'}</span>
                  <span>{lvl === 'low' ? t.activity_low : lvl === 'moderate' ? t.activity_mod : t.activity_high}</span>
                </div>
              ))}
            </div>

            <div style={{ display: 'flex', gap: '10px' }}>
              <button className="btn-secondary" onClick={() => setStep('BASIC_INFO')} style={{ flex: 1 }}>{t.back}</button>
              <button className="btn-primary" onClick={() => setStep('HISTORY')} style={{ flex: 2 }}>{t.next} <ArrowRight size={18} /></button>
            </div>
          </div>
        )}

        {/* 6. Medical History */}
        {step === 'HISTORY' && (
          <div className="glass-card" style={{ padding: '24px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <h2 style={{ fontSize: '20px' }}>{t.history_title}</h2>
              <button className="speaker-btn" onClick={() => speakDeviceText(t.history_title, lang)}>
                <Volume2 size={20} />
              </button>
            </div>

            <label className="option-card" style={{ marginBottom: '10px', display: 'flex', justifyContent: 'space-between' }}>
              <span>{t.known_bp}</span>
              <input
                type="checkbox"
                checked={features.known_hypertension}
                onChange={(e) => setFeatures({ ...features, known_hypertension: e.target.checked })}
                style={{ width: '20px', height: '20px', accentColor: '#0284C7' }}
              />
            </label>

            <label className="option-card" style={{ marginBottom: '10px', display: 'flex', justifyContent: 'space-between' }}>
              <span>{t.known_diabetes}</span>
              <input
                type="checkbox"
                checked={features.known_diabetes}
                onChange={(e) => setFeatures({ ...features, known_diabetes: e.target.checked })}
                style={{ width: '20px', height: '20px', accentColor: '#0284C7' }}
              />
            </label>

            <label className="option-card" style={{ marginBottom: '10px', display: 'flex', justifyContent: 'space-between' }}>
              <span>{t.known_heart}</span>
              <input
                type="checkbox"
                checked={features.known_heart_disease}
                onChange={(e) => setFeatures({ ...features, known_heart_disease: e.target.checked })}
                style={{ width: '20px', height: '20px', accentColor: '#0284C7' }}
              />
            </label>

            <label className="option-card" style={{ marginBottom: '10px', display: 'flex', justifyContent: 'space-between' }}>
              <span>{t.family_diabetes}</span>
              <input
                type="checkbox"
                checked={features.family_history_diabetes}
                onChange={(e) => setFeatures({ ...features, family_history_diabetes: e.target.checked })}
                style={{ width: '20px', height: '20px', accentColor: '#0284C7' }}
              />
            </label>

            {features.sex === 'F' && (
              <label className="option-card" style={{ marginBottom: '16px', display: 'flex', justifyContent: 'space-between', border: '1px solid rgba(236, 72, 153, 0.4)' }}>
                <span style={{ color: '#F472B6', fontWeight: 600 }}>🤰 {t.is_pregnant}</span>
                <input
                  type="checkbox"
                  checked={features.is_pregnant}
                  onChange={(e) => setFeatures({ ...features, is_pregnant: e.target.checked })}
                  style={{ width: '20px', height: '20px', accentColor: '#EC4899' }}
                />
              </label>
            )}

            <div style={{ display: 'flex', gap: '10px' }}>
              <button className="btn-secondary" onClick={() => setStep('LIFESTYLE')} style={{ flex: 1 }}>{t.back}</button>
              <button
                className="btn-primary"
                onClick={() => setStep(features.is_pregnant ? 'PREGNANCY' : 'SYMPTOMS')}
                style={{ flex: 2 }}
              >
                {t.next} <ArrowRight size={18} />
              </button>
            </div>
          </div>
        )}

        {/* 7. Pregnancy Details (Conditional) */}
        {step === 'PREGNANCY' && (
          <div className="glass-card" style={{ padding: '24px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <h2 style={{ fontSize: '20px', color: '#F472B6' }}>🤰 {t.preg_title}</h2>
              <button className="speaker-btn" onClick={() => speakDeviceText(t.preg_title, lang)}>
                <Volume2 size={20} />
              </button>
            </div>

            <div style={{ marginBottom: '16px' }}>
              <label style={{ fontSize: '13px', color: '#94A3B8', display: 'block', marginBottom: '6px' }}>{t.preg_weeks}</label>
              <input
                type="number"
                min="1"
                max="42"
                value={features.pregnancy_weeks || 24}
                onChange={(e) => setFeatures({ ...features, pregnancy_weeks: parseInt(e.target.value, 10) || null })}
                style={{ width: '100%', padding: '12px', background: 'rgba(255, 255, 255, 0.05)', border: '1px solid var(--border-subtle)', borderRadius: '10px', color: '#FFF', fontSize: '16px' }}
              />
            </div>

            <div style={{ marginBottom: '16px' }}>
              <label style={{ fontSize: '13px', color: '#94A3B8', display: 'block', marginBottom: '6px' }}>{t.gravida}</label>
              <input
                type="number"
                min="1"
                max="10"
                value={features.gravida || 1}
                onChange={(e) => setFeatures({ ...features, gravida: parseInt(e.target.value, 10) || 1 })}
                style={{ width: '100%', padding: '12px', background: 'rgba(255, 255, 255, 0.05)', border: '1px solid var(--border-subtle)', borderRadius: '10px', color: '#FFF', fontSize: '16px' }}
              />
            </div>

            <label className="option-card" style={{ marginBottom: '20px', display: 'flex', justifyContent: 'space-between' }}>
              <span>{t.prev_complications}</span>
              <input
                type="checkbox"
                checked={features.previous_complications}
                onChange={(e) => setFeatures({ ...features, previous_complications: e.target.checked })}
                style={{ width: '20px', height: '20px', accentColor: '#EC4899' }}
              />
            </label>

            <div style={{ display: 'flex', gap: '10px' }}>
              <button className="btn-secondary" onClick={() => setStep('HISTORY')} style={{ flex: 1 }}>{t.back}</button>
              <button className="btn-primary" onClick={() => setStep('SYMPTOMS')} style={{ flex: 2 }}>{t.next} <ArrowRight size={18} /></button>
            </div>
          </div>
        )}

        {/* 8. Symptoms Grid (Voice & Icon) */}
        {step === 'SYMPTOMS' && (
          <div className="glass-card" style={{ padding: '20px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
              <div>
                <h2 style={{ fontSize: '19px' }}>{t.symptoms_title}</h2>
                <p style={{ fontSize: '12px', color: '#94A3B8' }}>{t.symptoms_sub}</p>
              </div>

              <div style={{ display: 'flex', gap: '6px' }}>
                <button
                  onClick={handleVoiceListen}
                  className="speaker-btn"
                  style={{
                    backgroundColor: isListening ? '#DC2626' : 'rgba(2, 132, 199, 0.2)',
                    color: '#FFF',
                  }}
                  title={t.voice_mic_btn}
                >
                  <Mic size={18} />
                </button>
                <button
                  className="speaker-btn"
                  onClick={() => speakDeviceText(`${t.symptoms_title}. ${t.symptoms_sub}`, lang)}
                >
                  <Volume2 size={18} />
                </button>
              </div>
            </div>

            {/* Listening Feedback */}
            {isListening && (
              <div style={{ padding: '8px 12px', background: 'rgba(220, 38, 38, 0.2)', border: '1px solid #DC2626', borderRadius: '8px', color: '#FCA5A5', fontSize: '12px', marginBottom: '12px', textAlign: 'center' }}>
                🎙️ {t.voice_listening}
              </div>
            )}

            {/* 29 Symptoms Grid */}
            <div className="symptom-grid" style={{ maxHeight: '380px', overflowY: 'auto', paddingRight: '4px', marginBottom: '16px' }}>
              {SYMPTOM_CATALOG.filter((s) => !s.pregnancyOnly || features.is_pregnant).map((sym) => {
                const isSelected = features.symptoms.includes(sym.code);
                return (
                  <div
                    key={sym.code}
                    className={`symptom-card ${isSelected ? 'selected' : ''} ${sym.isRedFlagCandidate ? 'is-red-flag' : ''}`}
                    onClick={() => toggleSymptom(sym.code)}
                  >
                    <span style={{ fontSize: '26px' }}>{sym.icon}</span>
                    <span style={{ fontSize: '13px', fontWeight: 600, color: isSelected ? '#FFFFFF' : '#CBD5E1' }}>
                      {sym.label[lang]}
                    </span>
                    {sym.isRedFlagCandidate && (
                      <span style={{ fontSize: '9px', color: '#F87171', fontWeight: 700, textTransform: 'uppercase' }}>
                        Alert Sign
                      </span>
                    )}
                  </div>
                );
              })}
            </div>

            <div style={{ display: 'flex', gap: '10px' }}>
              <button className="btn-secondary" onClick={() => setStep(features.is_pregnant ? 'PREGNANCY' : 'HISTORY')} style={{ flex: 1 }}>{t.back}</button>
              <button className="btn-primary" onClick={() => setStep('VITALS_HUB')} style={{ flex: 2 }}>{t.next} <ArrowRight size={18} /></button>
            </div>
          </div>
        )}

        {/* 9. Vitals Hub (BP + Heart Rate Scan) */}
        {step === 'VITALS_HUB' && (
          <div className="glass-card" style={{ padding: '24px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
              <h2 style={{ fontSize: '20px' }}>{t.vitals_title}</h2>
              <button className="speaker-btn" onClick={() => speakDeviceText(t.vitals_title, lang)}>
                <Volume2 size={20} />
              </button>
            </div>
            <p style={{ fontSize: '13px', color: '#94A3B8', marginBottom: '20px' }}>{t.vitals_sub}</p>

            {/* Manual BP Section */}
            <div style={{ background: 'rgba(255, 255, 255, 0.03)', padding: '16px', borderRadius: '12px', border: '1px solid var(--border-subtle)', marginBottom: '16px' }}>
              <h4 style={{ fontSize: '15px', fontWeight: 700, color: '#38BDF8', marginBottom: '10px' }}>
                🩸 {t.bp_manual_title}
              </h4>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                <div>
                  <label style={{ fontSize: '12px', color: '#94A3B8', display: 'block', marginBottom: '4px' }}>{t.systolic_label}</label>
                  <input
                    type="number"
                    placeholder="120"
                    value={features.systolic || ''}
                    onChange={(e) => setFeatures({ ...features, systolic: parseInt(e.target.value, 10) || null })}
                    style={{ width: '100%', padding: '10px', background: 'rgba(255, 255, 255, 0.05)', border: '1px solid var(--border-subtle)', borderRadius: '8px', color: '#FFF' }}
                  />
                </div>
                <div>
                  <label style={{ fontSize: '12px', color: '#94A3B8', display: 'block', marginBottom: '4px' }}>{t.diastolic_label}</label>
                  <input
                    type="number"
                    placeholder="80"
                    value={features.diastolic || ''}
                    onChange={(e) => setFeatures({ ...features, diastolic: parseInt(e.target.value, 10) || null })}
                    style={{ width: '100%', padding: '10px', background: 'rgba(255, 255, 255, 0.05)', border: '1px solid var(--border-subtle)', borderRadius: '8px', color: '#FFF' }}
                  />
                </div>
              </div>
            </div>

            {/* Camera Heart Rate rPPG Section */}
            <div style={{ background: 'rgba(56, 189, 248, 0.05)', padding: '16px', borderRadius: '12px', border: '1px solid rgba(56, 189, 248, 0.25)', marginBottom: '24px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                <h4 style={{ fontSize: '15px', fontWeight: 700, color: '#38BDF8', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Camera size={18} />
                  {t.camera_rppg_btn}
                </h4>
                {heartRate?.bpm && (
                  <span style={{ fontSize: '12px', padding: '3px 8px', borderRadius: '6px', background: '#059669', color: '#FFF', fontWeight: 700 }}>
                    {heartRate.bpm} BPM ({heartRate.quality})
                  </span>
                )}
              </div>
              <p style={{ fontSize: '12px', color: '#94A3B8', marginBottom: '12px' }}>{t.camera_rppg_sub}</p>

              <button
                className="btn-secondary"
                onClick={() => setShowScanner(true)}
                style={{ width: '100%', borderColor: 'rgba(56, 189, 248, 0.4)' }}
              >
                {heartRate ? 'Re-scan Heart Rate' : 'Open Camera Scanner'}
              </button>
            </div>

            <div style={{ display: 'flex', gap: '10px' }}>
              <button className="btn-secondary" onClick={() => setStep('SYMPTOMS')} style={{ flex: 1 }}>{t.back}</button>
              <button className="btn-primary" onClick={handleAnalyze} style={{ flex: 2 }}>{t.see_results_btn} <ArrowRight size={18} /></button>
            </div>
          </div>
        )}

        {/* 10. Processing Screen */}
        {step === 'PROCESSING' && (
          <div className="glass-card" style={{ padding: '40px 20px', textAlign: 'center', margin: 'auto 0' }}>
            <div style={{
              width: '80px',
              height: '80px',
              borderRadius: '50%',
              background: 'rgba(2, 132, 199, 0.2)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              margin: '0 auto 20px auto',
              boxShadow: '0 0 30px rgba(56, 189, 248, 0.4)',
              animation: 'pulse 1.2s infinite',
            }}>
              <Activity size={40} color="#38BDF8" />
            </div>
            <h3 style={{ fontSize: '20px', fontWeight: 700, color: '#FFF', marginBottom: '8px' }}>
              Analyzing Clinical Risk Profiles...
            </h3>
            <p style={{ fontSize: '13px', color: '#94A3B8' }}>
              Evaluating deterministic safety rules and chronic models
            </p>
          </div>
        )}

        {/* 11. Results Screen */}
        {step === 'RESULT' && assessment && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {/* Triage Banner */}
            <div style={{
              padding: '18px',
              borderRadius: '16px',
              background:
                assessment.triage_level === 'emergency' ? 'var(--triage-emergency-bg)' :
                assessment.triage_level === 'urgent' ? 'var(--triage-urgent-bg)' :
                assessment.triage_level === 'routine' ? 'var(--triage-routine-bg)' : 'var(--triage-selfcare-bg)',
              border: `2px solid ${
                assessment.triage_level === 'emergency' ? '#EF4444' :
                assessment.triage_level === 'urgent' ? '#F97316' :
                assessment.triage_level === 'routine' ? '#F59E0B' : '#10B981'
              }`,
            }}>
              <span style={{ fontSize: '11px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#94A3B8' }}>
                Primary Triage Verdict
              </span>
              <h3 style={{
                fontSize: '20px',
                fontWeight: 800,
                color:
                  assessment.triage_level === 'emergency' ? '#F87171' :
                  assessment.triage_level === 'urgent' ? '#FB923C' :
                  assessment.triage_level === 'routine' ? '#FBBF24' : '#34D399',
                marginTop: '4px',
                marginBottom: '6px',
              }}>
                {assessment.triage_level === 'emergency' ? t.triage_emergency :
                 assessment.triage_level === 'urgent' ? t.triage_urgent :
                 assessment.triage_level === 'routine' ? t.triage_routine : t.triage_self_care}
              </h3>
              <p style={{ fontSize: '12px', color: '#CBD5E1' }}>
                {t.disclaimer_banner}
              </p>
            </div>

            {/* Explainable Risk Cards (SHAP) */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <h4 style={{ fontSize: '16px', fontWeight: 700, color: '#FFF' }}>
                Stratified Risk Assessments
              </h4>
              {assessment.results.map((r) => (
                <div key={r.condition} className="glass-card" style={{ padding: '16px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                    <div style={{ fontWeight: 700, fontSize: '16px', textTransform: 'capitalize', color: '#FFF' }}>
                      {r.condition} Risk
                    </div>
                    <span style={{
                      padding: '4px 10px',
                      borderRadius: '8px',
                      fontSize: '11px',
                      fontWeight: 800,
                      textTransform: 'uppercase',
                      background: r.level === 'high' ? 'rgba(239, 68, 68, 0.2)' : r.level === 'medium' ? 'rgba(245, 158, 11, 0.2)' : 'rgba(16, 185, 129, 0.2)',
                      color: r.level === 'high' ? '#F87171' : r.level === 'medium' ? '#FBBF24' : '#34D399',
                    }}>
                      {r.level} ({(r.probability * 100).toFixed(0)}%)
                    </span>
                  </div>

                  {/* Probability Bar */}
                  <div style={{ width: '100%', height: '6px', background: 'rgba(255, 255, 255, 0.08)', borderRadius: '999px', overflow: 'hidden', marginBottom: '10px' }}>
                    <div style={{
                      width: `${r.probability * 100}%`,
                      height: '100%',
                      background: r.level === 'high' ? '#EF4444' : r.level === 'medium' ? '#F59E0B' : '#10B981',
                    }} />
                  </div>

                  {/* Top 3 Factors in plain language */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    {r.top_factors.map((f, idx) => (
                      <div key={idx} style={{ fontSize: '12px', color: '#94A3B8', display: 'flex', alignItems: 'flex-start', gap: '6px' }}>
                        <span style={{ color: '#38BDF8' }}>•</span>
                        <span>{f.text}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>

            {/* Care Recommender & Interactive Map */}
            <div style={{ marginTop: '8px' }}>
              <h4 style={{ fontSize: '16px', fontWeight: 700, color: '#FFF', marginBottom: '10px' }}>
                {t.nearest_care_title}
              </h4>
              <FacilityView
                language={lang}
                facilities={rankedFacilities}
                triageLevel={assessment.triage_level}
                userCoords={userCoords}
                isPregnant={features.is_pregnant}
              />
            </div>

            {/* Quick Action Buttons: PM-JAY, SOAP, FHIR, Print */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginTop: '12px' }}>
              <button
                className="btn-secondary"
                onClick={() => setShowScheme(true)}
                style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', fontSize: '13px' }}
              >
                <ShieldCheck size={16} color="#38BDF8" />
                PM-JAY Scheme
              </button>
              <button
                className="btn-secondary"
                onClick={() => setShowSOAP(true)}
                style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', fontSize: '13px' }}
              >
                <Stethoscope size={16} color="#10B981" />
                Doctor SOAP
              </button>
              <button
                className="btn-secondary"
                onClick={() => setShowFHIR(true)}
                style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', fontSize: '13px' }}
              >
                <Database size={16} color="#818CF8" />
                FHIR JSON
              </button>
              <button
                className="btn-secondary"
                onClick={() => setShowPrint(true)}
                style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', fontSize: '13px' }}
              >
                <Printer size={16} color="#F59E0B" />
                Print PDF
              </button>
            </div>

            {/* Start Over */}
            <button
              className="btn-primary"
              onClick={() => {
                setFeatures(DEFAULT_FEATURES);
                setHeartRate(null);
                setAssessment(null);
                setStep('HOME');
              }}
              style={{ marginTop: '16px' }}
            >
              Start New Health Check
            </button>
          </div>
        )}
      </main>

      {/* Modals */}
      {showEmergency && (
        <EmergencyModal
          language={lang}
          rules={triggeredRedFlags.length > 0 ? triggeredRedFlags : [
            { id: 'RF01', message_key: 'rf01_chest_pain', name: 'Cardiac Warning Triggered', description: 'Immediate hospital care advised.' }
          ]}
          onContinue={() => setShowEmergency(false)}
          onNavigateHospital={() => {
            setShowEmergency(false);
            setStep('RESULT');
          }}
        />
      )}

      {showScanner && (
        <HeartRateScanner
          language={lang}
          onComplete={(res) => {
            setHeartRate(res);
            setShowScanner(false);
          }}
          onClose={() => setShowScanner(false)}
        />
      )}

      {showScheme && (
        <SchemeModal
          language={lang}
          onClose={() => setShowScheme(false)}
        />
      )}

      {showSOAP && assessment && (
        <SOAPModal
          language={lang}
          soap={generateSOAPNote(features, assessment, heartRate)}
          onClose={() => setShowSOAP(false)}
        />
      )}

      {showFHIR && assessment && (
        <FHIRModal
          fhirData={generateFHIRBundle(features, assessment, heartRate)}
          onClose={() => setShowFHIR(false)}
        />
      )}

      {showPrint && assessment && (
        <PrintSummaryModal
          language={lang}
          features={features}
          assessment={assessment}
          heartRate={heartRate}
          facility={bestFacility}
          onClose={() => setShowPrint(false)}
        />
      )}
    </div>
  );
}

export default App;
