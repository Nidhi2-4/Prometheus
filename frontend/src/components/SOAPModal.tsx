import React from 'react';
import { SOAPNote, Language } from '../types/health';
import { X, Printer, Stethoscope, FileText } from 'lucide-react';

interface SOAPModalProps {
  language: Language;
  soap: SOAPNote;
  onClose: () => void;
}

export const SOAPModal: React.FC<SOAPModalProps> = ({ language, soap, onClose }) => {
  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: 'rgba(5, 10, 20, 0.95)',
      zIndex: 10000,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '16px',
    }}>
      <div className="glass-card" style={{ width: '100%', maxWidth: '520px', maxHeight: '90vh', overflowY: 'auto', padding: '24px', position: 'relative' }}>
        <button
          onClick={onClose}
          style={{ position: 'absolute', top: '16px', right: '16px', background: 'transparent', color: '#94A3B8' }}
        >
          <X size={24} />
        </button>

        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '16px' }}>
          <div style={{
            width: '40px',
            height: '40px',
            borderRadius: '10px',
            background: 'rgba(2, 132, 199, 0.2)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}>
            <Stethoscope size={22} color="#38BDF8" />
          </div>
          <div>
            <h3 style={{ fontSize: '18px', fontWeight: 700, color: '#FFF' }}>
              Clinician SOAP Summary Note
            </h3>
            <p style={{ fontSize: '12px', color: '#94A3B8' }}>Structured Clinical Handover Protocol</p>
          </div>
        </div>

        {/* 4 SOAP Blocks */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', marginBottom: '20px' }}>
          <div style={{ background: 'rgba(255, 255, 255, 0.04)', padding: '14px', borderRadius: '12px', borderLeft: '4px solid #38BDF8' }}>
            <h4 style={{ fontSize: '13px', fontWeight: 700, color: '#38BDF8', textTransform: 'uppercase', marginBottom: '4px' }}>
              S — Subjective
            </h4>
            <p style={{ fontSize: '13px', color: '#E2E8F0', lineHeight: 1.5 }}>{soap.subjective}</p>
          </div>

          <div style={{ background: 'rgba(255, 255, 255, 0.04)', padding: '14px', borderRadius: '12px', borderLeft: '4px solid #10B981' }}>
            <h4 style={{ fontSize: '13px', fontWeight: 700, color: '#34D399', textTransform: 'uppercase', marginBottom: '4px' }}>
              O — Objective
            </h4>
            <p style={{ fontSize: '13px', color: '#E2E8F0', lineHeight: 1.5 }}>{soap.objective}</p>
          </div>

          <div style={{ background: 'rgba(255, 255, 255, 0.04)', padding: '14px', borderRadius: '12px', borderLeft: '4px solid #F59E0B' }}>
            <h4 style={{ fontSize: '13px', fontWeight: 700, color: '#FBBF24', textTransform: 'uppercase', marginBottom: '4px' }}>
              A — Assessment
            </h4>
            <p style={{ fontSize: '13px', color: '#E2E8F0', lineHeight: 1.5 }}>{soap.assessment}</p>
          </div>

          <div style={{ background: 'rgba(255, 255, 255, 0.04)', padding: '14px', borderRadius: '12px', borderLeft: '4px solid #818CF8' }}>
            <h4 style={{ fontSize: '13px', fontWeight: 700, color: '#A5B4FC', textTransform: 'uppercase', marginBottom: '4px' }}>
              P — Plan & Referral
            </h4>
            <p style={{ fontSize: '13px', color: '#E2E8F0', lineHeight: 1.5 }}>{soap.plan}</p>
          </div>
        </div>

        <div style={{ display: 'flex', gap: '10px' }}>
          <button
            className="btn-primary"
            onClick={() => window.print()}
            style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}
          >
            <Printer size={18} />
            Print SOAP Record
          </button>
        </div>
      </div>
    </div>
  );
};
