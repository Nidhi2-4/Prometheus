import React, { useState } from 'react';
import { Language, SchemeResult } from '../types/health';
import { X, ShieldCheck, FileCheck, CheckCircle2, AlertCircle } from 'lucide-react';

interface SchemeModalProps {
  language: Language;
  onClose: () => void;
}

export const SchemeModal: React.FC<SchemeModalProps> = ({ language, onClose }) => {
  const [hasRationCard, setHasRationCard] = useState(true);
  const [isBPL, setIsBPL] = useState(true);
  const [hasSeniorCitizen, setHasSeniorCitizen] = useState(false);
  const [annualIncome, setAnnualIncome] = useState<number>(120000);
  const [result, setResult] = useState<SchemeResult | null>(null);

  const evaluateScheme = () => {
    let status: 'likely' | 'possibly' | 'not_likely' = 'not_likely';
    const documents: string[] = ['Aadhaar Card of all family members'];

    if (isBPL || hasRationCard) {
      status = 'likely';
      documents.push('Ration Card (Yellow/Orange / Antyodaya Anna Yojana)');
    } else if (hasSeniorCitizen) {
      status = 'likely';
      documents.push('Senior Citizen Age Proof (Aadhaar showing 70+ years)');
    } else if (annualIncome <= 250000) {
      status = 'possibly';
      documents.push('Income Certificate from Tehsildar / Local Authority');
    }

    setResult({
      status,
      title:
        status === 'likely'
          ? language === 'mr' ? 'पात्र असण्याची दाट शक्यता (Likely Eligible)' : language === 'hi' ? 'पात्र होने की पूरी संभावना (Likely Eligible)' : 'Likely Eligible for PM-JAY'
          : status === 'possibly'
          ? language === 'mr' ? 'कदाचित पात्र (Possibly Eligible)' : language === 'hi' ? 'संभावित पात्र (Possibly Eligible)' : 'Possibly Eligible'
          : language === 'mr' ? 'प्राथमिक निकषात अपात्र (Not Likely)' : language === 'hi' ? 'प्राथमिक मानकों में अपात्र (Not Likely)' : 'Not Likely under Current Criteria',
      message:
        status === 'likely'
          ? language === 'mr'
            ? 'तुम्ही आयुष्मान भारत (PM-JAY) अंतर्गत मोफत ५ लाख रुपयांपर्यंतच्या उपचारांसाठी पात्र आहात.'
            : language === 'hi'
            ? 'आप आयुष्मान भारत योजना (PM-JAY) के तहत 5 लाख रुपये तक के मुफ्त इलाज के लिए पात्र हैं।'
            : 'You appear eligible for free secondary and tertiary treatment up to ₹5 Lakh/year under Ayushman Bharat (PM-JAY).'
          : language === 'mr'
            ? 'उत्पन्न दाखल्याची पडताळणी केंद्रावर करावी लागेल.'
            : language === 'hi'
            ? 'आय प्रमाण पत्र की पुष्टि अस्पताल के आरोग्य मित्र काउंटर पर करानी होगी।'
            : 'Eligibility requires verification of income certificate at the hospital Aarogya Mitra desk.',
      documents,
    });
  };

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: 'rgba(5, 10, 20, 0.92)',
      zIndex: 10000,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '16px',
    }}>
      <div className="glass-card" style={{ width: '100%', maxWidth: '460px', padding: '24px', position: 'relative' }}>
        <button
          onClick={onClose}
          style={{ position: 'absolute', top: '16px', right: '16px', background: 'transparent', color: '#94A3B8' }}
        >
          <X size={24} />
        </button>

        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '14px' }}>
          <div style={{
            width: '38px',
            height: '38px',
            borderRadius: '10px',
            background: 'rgba(2, 132, 199, 0.2)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}>
            <ShieldCheck size={22} color="#38BDF8" />
          </div>
          <div>
            <h3 style={{ fontSize: '18px', fontWeight: 700, color: '#FFF' }}>
              {language === 'mr' ? 'आयुष्मान भारत (PM-JAY) पात्रता' : language === 'hi' ? 'आयुष्मान भारत (PM-JAY) पात्रता' : 'Ayushman Bharat Eligibility'}
            </h3>
            <span className="simulated-pill">Indicative Tool</span>
          </div>
        </div>

        {!result ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <label className="option-card" style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ fontSize: '14px', color: '#E2E8F0' }}>
                {language === 'mr' ? 'कुटुंबाकडे रेशन कार्ड आहे का?' : language === 'hi' ? 'क्या परिवार के पास राशन कार्ड है?' : 'Do you have a Family Ration Card?'}
              </span>
              <input
                type="checkbox"
                checked={hasRationCard}
                onChange={(e) => setHasRationCard(e.target.checked)}
                style={{ width: '20px', height: '20px', accentColor: '#0284C7' }}
              />
            </label>

            <label className="option-card" style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ fontSize: '14px', color: '#E2E8F0' }}>
                {language === 'mr' ? 'कुटुंब दारिद्र्यरेषेखालील (BPL) आहे का?' : language === 'hi' ? 'क्या परिवार BPL (गरीबी रेखा) श्रेणी में है?' : 'Is your household in BPL / SECC category?'}
              </span>
              <input
                type="checkbox"
                checked={isBPL}
                onChange={(e) => setIsBPL(e.target.checked)}
                style={{ width: '20px', height: '20px', accentColor: '#0284C7' }}
              />
            </label>

            <label className="option-card" style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ fontSize: '14px', color: '#E2E8F0' }}>
                {language === 'mr' ? 'कुटुंबात ७० वर्षे किंवा त्याहून अधिक वयाचे वृद्ध आहेत का?' : language === 'hi' ? 'क्या परिवार में 70+ वर्ष के बुजुर्ग हैं?' : 'Any senior citizens aged 70 or above in family?'}
              </span>
              <input
                type="checkbox"
                checked={hasSeniorCitizen}
                onChange={(e) => setHasSeniorCitizen(e.target.checked)}
                style={{ width: '20px', height: '20px', accentColor: '#0284C7' }}
              />
            </label>

            <button className="btn-primary" onClick={evaluateScheme} style={{ marginTop: '8px' }}>
              {language === 'mr' ? 'पात्रता तपासा' : language === 'hi' ? 'पात्रता जांचें' : 'Check Eligibility'}
            </button>
          </div>
        ) : (
          <div>
            <div style={{
              padding: '16px',
              borderRadius: '12px',
              backgroundColor: result.status === 'likely' ? 'rgba(16, 185, 129, 0.15)' : 'rgba(245, 158, 11, 0.15)',
              border: `1px solid ${result.status === 'likely' ? '#10B981' : '#F59E0B'}`,
              marginBottom: '16px',
            }}>
              <h4 style={{ color: result.status === 'likely' ? '#34D399' : '#FBBF24', fontSize: '16px', marginBottom: '6px' }}>
                {result.title}
              </h4>
              <p style={{ fontSize: '13px', color: '#CBD5E1' }}>{result.message}</p>
            </div>

            <div style={{ marginBottom: '16px' }}>
              <h5 style={{ fontSize: '13px', fontWeight: 700, color: '#94A3B8', textTransform: 'uppercase', marginBottom: '8px' }}>
                {language === 'mr' ? 'रुग्णालयात जाताना सोबत नेण्याची कागदपत्रे:' : language === 'hi' ? 'अस्पताल ले जाने हेतु जरूरी दस्तावेज:' : 'Required Documents to Carry:'}
              </h5>
              {result.documents.map((doc, idx) => (
                <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', color: '#E2E8F0', marginBottom: '6px' }}>
                  <FileCheck size={16} color="#38BDF8" />
                  <span>{doc}</span>
                </div>
              ))}
            </div>

            <p style={{ fontSize: '12px', color: '#F59E0B', fontWeight: 600, marginBottom: '16px' }}>
              ⚠️ Indicative, verify at the facility Aarogya Mitra desk.
            </p>

            <button className="btn-secondary" onClick={() => setResult(null)} style={{ width: '100%' }}>
              {language === 'mr' ? 'पुन्हा तपासा' : language === 'hi' ? 'फिर से जांचें' : 'Check Again'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
