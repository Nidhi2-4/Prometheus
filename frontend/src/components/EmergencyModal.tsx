import React from 'react';
import { RedFlagRule, Language } from '../types/health';
import { AlertOctagon, PhoneCall, Navigation, ArrowRight } from 'lucide-react';

interface EmergencyModalProps {
  language: Language;
  rules: RedFlagRule[];
  onContinue: () => void;
  onNavigateHospital: () => void;
}

export const EmergencyModal: React.FC<EmergencyModalProps> = ({
  language,
  rules,
  onContinue,
  onNavigateHospital,
}) => {
  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: '#7F1D1D',
      backgroundImage: 'radial-gradient(circle at 50% 20%, #991B1B 0%, #450A0A 100%)',
      zIndex: 10000,
      display: 'flex',
      flexDirection: 'column',
      justifyContent: 'space-between',
      padding: '24px 20px',
      color: '#FFFFFF',
    }}>
      <div style={{ textAlign: 'center', marginTop: '20px' }}>
        <div style={{
          width: '76px',
          height: '76px',
          borderRadius: '50%',
          backgroundColor: '#DC2626',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          margin: '0 auto 16px auto',
          boxShadow: '0 0 35px rgba(239, 68, 68, 0.8)',
          animation: 'pulse-red 1.5s infinite',
        }}>
          <AlertOctagon size={44} color="#FFFFFF" />
        </div>

        <h1 style={{ fontSize: '26px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.02em', marginBottom: '8px' }}>
          {language === 'mr' ? 'आपत्कालीन चेतावणी!' : language === 'hi' ? 'आपातकालीन चेतावनी!' : 'EMERGENCY RED-FLAG!'}
        </h1>
        
        <p style={{ fontSize: '18px', fontWeight: 600, color: '#FECACA', marginBottom: '16px' }}>
          {language === 'mr'
            ? 'त्वरित जवळच्या रुग्णालयात जा!'
            : language === 'hi'
            ? 'तुरंत नजदीकी बड़े अस्पताल जाएं!'
            : 'Go to the nearest hospital immediately!'}
        </p>

        {/* Triggered Red Flags Box */}
        <div style={{
          backgroundColor: 'rgba(0, 0, 0, 0.35)',
          borderRadius: '16px',
          padding: '16px',
          textAlign: 'left',
          marginBottom: '20px',
          border: '1px solid rgba(254, 202, 202, 0.25)',
        }}>
          <p style={{ fontSize: '13px', fontWeight: 700, color: '#FCA5A5', textTransform: 'uppercase', marginBottom: '8px' }}>
            {language === 'mr' ? 'धोकादायक लक्षणे:' : language === 'hi' ? 'गंभीर चेतावनी संकेत:' : 'Critical Warning Triggers:'}
          </p>
          {rules.map((rule) => (
            <div key={rule.id} style={{ marginBottom: '10px' }}>
              <div style={{ fontWeight: 700, fontSize: '15px', color: '#FFFFFF' }}>• {rule.name}</div>
              <div style={{ fontSize: '13px', color: '#FCA5A5', paddingLeft: '12px' }}>{rule.description}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Action Buttons */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', width: '100%' }}>
        {/* Call 108 Button */}
        <a
          href="tel:108"
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '10px',
            backgroundColor: '#FFFFFF',
            color: '#DC2626',
            padding: '16px',
            borderRadius: '14px',
            textDecoration: 'none',
            fontWeight: 800,
            fontSize: '18px',
            boxShadow: '0 4px 20px rgba(0, 0, 0, 0.4)',
          }}
        >
          <PhoneCall size={22} color="#DC2626" />
          {language === 'mr' ? '१०८ रुग्णवाहिका बोलवा' : language === 'hi' ? '108 एम्बुलेंस को कॉल करें' : 'Call 108 Emergency Ambulance'}
        </a>

        {/* Nearest Hospital Button */}
        <button
          onClick={onNavigateHospital}
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '10px',
            backgroundColor: 'rgba(255, 255, 255, 0.15)',
            border: '2px solid rgba(255, 255, 255, 0.4)',
            color: '#FFFFFF',
            padding: '14px',
            borderRadius: '14px',
            fontWeight: 700,
            fontSize: '16px',
          }}
        >
          <Navigation size={20} />
          {language === 'mr' ? 'जवळचे आपत्कालीन रुग्णालय शोधा' : language === 'hi' ? 'निकटतम आपातकालीन अस्पताल' : 'Nearest Emergency Hospital'}
        </button>

        {/* Continue Link */}
        <button
          onClick={onContinue}
          style={{
            background: 'transparent',
            border: 'none',
            color: '#FECACA',
            fontSize: '13px',
            textDecoration: 'underline',
            marginTop: '8px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '4px',
          }}
        >
          {language === 'mr' ? 'तरीही तपासणी सुरू ठेवा' : language === 'hi' ? 'फिर भी जांच जारी रखें' : 'Continue assessment anyway'}
          <ArrowRight size={14} />
        </button>
      </div>
    </div>
  );
};
