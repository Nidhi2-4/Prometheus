import React, { useState } from 'react';
import { X, Copy, Download, Check, Database } from 'lucide-react';

interface FHIRModalProps {
  fhirData: object;
  onClose: () => void;
}

export const FHIRModal: React.FC<FHIRModalProps> = ({ fhirData, onClose }) => {
  const [copied, setCopied] = useState(false);
  const jsonString = JSON.stringify(fhirData, null, 2);

  const handleCopy = () => {
    navigator.clipboard.writeText(jsonString);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownload = () => {
    const blob = new Blob([jsonString], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `swasthik-fhir-bundle-${Date.now()}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

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
      <div className="glass-card" style={{ width: '100%', maxWidth: '540px', maxHeight: '90vh', display: 'flex', flexDirection: 'column', padding: '24px', position: 'relative' }}>
        <button
          onClick={onClose}
          style={{ position: 'absolute', top: '16px', right: '16px', background: 'transparent', color: '#94A3B8' }}
        >
          <X size={24} />
        </button>

        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '14px' }}>
          <div style={{
            width: '40px',
            height: '40px',
            borderRadius: '10px',
            background: 'rgba(56, 189, 248, 0.15)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}>
            <Database size={22} color="#38BDF8" />
          </div>
          <div>
            <h3 style={{ fontSize: '18px', fontWeight: 700, color: '#FFF' }}>
              HL7 FHIR R4 JSON Export
            </h3>
            <p style={{ fontSize: '12px', color: '#94A3B8' }}>Interoperable Health Data Exchange Standards</p>
          </div>
        </div>

        {/* Code Box */}
        <div style={{
          flex: 1,
          overflowY: 'auto',
          backgroundColor: '#0F172A',
          border: '1px solid var(--border-subtle)',
          borderRadius: '12px',
          padding: '14px',
          fontFamily: 'monospace',
          fontSize: '12px',
          color: '#38BDF8',
          marginBottom: '16px',
        }}>
          <pre>{jsonString}</pre>
        </div>

        {/* Action Buttons */}
        <div style={{ display: 'flex', gap: '10px' }}>
          <button
            className="btn-secondary"
            onClick={handleCopy}
            style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}
          >
            {copied ? <Check size={16} color="#34D399" /> : <Copy size={16} />}
            {copied ? 'Copied' : 'Copy JSON'}
          </button>
          <button
            className="btn-primary"
            onClick={handleDownload}
            style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}
          >
            <Download size={16} />
            Download .json
          </button>
        </div>
      </div>
    </div>
  );
};
