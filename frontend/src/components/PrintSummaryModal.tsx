import React from 'react';
import { PatientFeatures, AssessmentResponse, HeartRateResult, Facility, Language } from '../types/health';
import { X, Printer, HeartPulse } from 'lucide-react';

interface PrintSummaryModalProps {
  language: Language;
  features: PatientFeatures;
  assessment: AssessmentResponse;
  heartRate?: HeartRateResult | null;
  facility?: Facility;
  onClose: () => void;
}

export const PrintSummaryModal: React.FC<PrintSummaryModalProps> = ({
  language,
  features,
  assessment,
  heartRate,
  facility,
  onClose,
}) => {
  const heightM = features.height_cm / 100;
  const bmi = (features.weight_kg / (heightM * heightM)).toFixed(1);

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
      <div className="glass-card" style={{ width: '100%', maxWidth: '580px', maxHeight: '90vh', overflowY: 'auto', padding: '24px', position: 'relative' }}>
        <button
          onClick={onClose}
          className="no-print"
          style={{ position: 'absolute', top: '16px', right: '16px', background: 'transparent', color: '#94A3B8' }}
        >
          <X size={24} />
        </button>

        {/* Printable Document Sheet */}
        <div id="patient-print-sheet" style={{
          backgroundColor: '#FFFFFF',
          color: '#0F172A',
          padding: '28px',
          borderRadius: '8px',
          fontFamily: 'sans-serif',
          lineHeight: 1.4,
        }}>
          {/* Header */}
          <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '2px solid #0284C7', paddingBottom: '12px', marginBottom: '16px' }}>
            <div>
              <h2 style={{ fontSize: '22px', fontWeight: 800, color: '#0369A1' }}>🩺 Swasthik Health Triage</h2>
              <p style={{ fontSize: '11px', color: '#64748B' }}>Primary Healthcare Screening & Referral Record</p>
            </div>
            <div style={{ textAlign: 'right', fontSize: '12px', color: '#64748B' }}>
              <div><strong>Date:</strong> {new Date().toLocaleDateString('en-IN')}</div>
              <div><strong>Ref ID:</strong> {assessment.assessment_id.toUpperCase()}</div>
            </div>
          </div>

          {/* Patient Profile */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '10px', backgroundColor: '#F8FAFC', padding: '12px', borderRadius: '6px', marginBottom: '16px', fontSize: '12px' }}>
            <div><strong>Age:</strong> {features.age} yrs</div>
            <div><strong>Sex:</strong> {features.sex === 'F' ? 'Female' : 'Male'}</div>
            <div><strong>Height/Weight:</strong> {features.height_cm}cm / {features.weight_kg}kg</div>
            <div><strong>BMI:</strong> {bmi} kg/m²</div>
            {features.is_pregnant && (
              <div style={{ gridColumn: 'span 4', color: '#BE185D', fontWeight: 700 }}>
                Pregnant: ~{features.pregnancy_weeks || 'N/A'} weeks
              </div>
            )}
          </div>

          {/* Vitals & Symptoms */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '16px', fontSize: '12px' }}>
            <div style={{ border: '1px solid #E2E8F0', padding: '10px', borderRadius: '6px' }}>
              <div style={{ fontWeight: 700, color: '#0369A1', marginBottom: '4px' }}>Recorded Vitals:</div>
              <div>Blood Pressure: {features.systolic ? `${features.systolic}/${features.diastolic} mmHg` : 'Not recorded'}</div>
              <div>Heart Rate (Camera): {heartRate?.bpm ? `${heartRate.bpm} BPM (${heartRate.quality})` : 'Not recorded'}</div>
            </div>
            <div style={{ border: '1px solid #E2E8F0', padding: '10px', borderRadius: '6px' }}>
              <div style={{ fontWeight: 700, color: '#0369A1', marginBottom: '4px' }}>Reported Symptoms:</div>
              <div>{features.symptoms.length > 0 ? features.symptoms.join(', ') : 'None reported'}</div>
            </div>
          </div>

          {/* Triage Verdict */}
          <div style={{
            padding: '12px',
            borderRadius: '6px',
            marginBottom: '16px',
            backgroundColor:
              assessment.triage_level === 'emergency' ? '#FEE2E2' :
              assessment.triage_level === 'urgent' ? '#FFEDD5' :
              assessment.triage_level === 'routine' ? '#FEF3C7' : '#D1FAE5',
            color:
              assessment.triage_level === 'emergency' ? '#991B1B' :
              assessment.triage_level === 'urgent' ? '#9A3412' :
              assessment.triage_level === 'routine' ? '#92400E' : '#065F46',
            border: '1px solid currentColor',
          }}>
            <div style={{ fontWeight: 800, fontSize: '14px', textTransform: 'uppercase' }}>
              Triage Recommendation: {assessment.triage_level}
            </div>
            <div style={{ fontSize: '12px', marginTop: '2px' }}>
              {assessment.triage_level === 'emergency' && 'IMMEDIATE EMERGENCY: Dial 108 or go to the nearest emergency-capable hospital immediately.'}
              {assessment.triage_level === 'urgent' && 'URGENT: Visit a medical officer or Community Health Centre within 24 hours.'}
              {assessment.triage_level === 'routine' && 'ROUTINE: Visit your nearest Primary Health Centre (PHC) within 7 days for checkup.'}
              {assessment.triage_level === 'self_care' && 'SELF-CARE: Maintain a balanced low-sodium diet and monitor symptoms.'}
            </div>
          </div>

          {/* Risk Factors */}
          <div style={{ marginBottom: '16px', fontSize: '12px' }}>
            <div style={{ fontWeight: 700, color: '#0F172A', marginBottom: '6px' }}>Risk Evaluation Breakdown:</div>
            {assessment.results.map((r, i) => (
              <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', borderBottom: '1px dashed #E2E8F0' }}>
                <span style={{ textTransform: 'capitalize', fontWeight: 600 }}>{r.condition} Risk</span>
                <span style={{ fontWeight: 700, color: r.level === 'high' ? '#DC2626' : r.level === 'medium' ? '#D97706' : '#059669' }}>
                  {r.level.toUpperCase()} ({(r.probability * 100).toFixed(0)}%)
                </span>
              </div>
            ))}
          </div>

          {/* Recommended Facility */}
          {facility && (
            <div style={{ backgroundColor: '#F0F9FF', border: '1px solid #BAE6FD', padding: '10px', borderRadius: '6px', marginBottom: '14px', fontSize: '12px' }}>
              <div style={{ fontWeight: 700, color: '#0369A1' }}>Nearest Recommended Facility:</div>
              <div style={{ fontWeight: 600 }}>{facility.name} (~{facility.time_to_doctor_min} min to see doctor)</div>
              <div>Phone: {facility.phone} • Distance: {facility.distance_km} km • Tier: {facility.cost_tier.toUpperCase()}</div>
            </div>
          )}

          {/* Disclaimer */}
          <div style={{ borderTop: '1px solid #CBD5E1', paddingTop: '10px', fontSize: '10px', color: '#64748B', textAlign: 'center' }}>
            <strong>DISCLAIMER:</strong> Screening guidance, not a diagnosis. Swasthik is a clinical decision-support tool. Please present this summary to your treating medical practitioner.
          </div>
        </div>

        {/* Action Button */}
        <div className="no-print" style={{ marginTop: '16px' }}>
          <button
            className="btn-primary"
            onClick={() => window.print()}
            style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}
          >
            <Printer size={18} />
            Print or Save as PDF
          </button>
        </div>
      </div>
    </div>
  );
};
