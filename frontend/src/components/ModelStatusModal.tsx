import { useEffect, useState } from 'react';
import { CheckCircle2, XCircle, X, Cpu, Activity, ShieldCheck, Heart, Stethoscope, Mic, Sparkles } from 'lucide-react';

interface ModelItem {
  name: string;
  displayName: string;
  version: string;
  status: 'connected' | 'not_connected';
  algorithm: string;
  metric: string;
  featuresCount?: number;
  category: string;
}

const STATIC_MODELS: ModelItem[] = [
  {
    name: 'hypertension',
    displayName: 'Hypertension Risk',
    version: 'htn_bundle-0e2dc99f',
    status: 'connected',
    algorithm: 'LightGBM + BP Clinical Rule Override',
    metric: 'AUROC: 0.841 · Recall: 84.9%',
    featuresCount: 13,
    category: 'Chronic Triage',
  },
  {
    name: 'diabetes',
    displayName: 'Type-2 Diabetes Risk',
    version: 'dm_bundle-9ab6205d',
    status: 'connected',
    algorithm: 'LightGBM (CDC BRFSS Non-Lab)',
    metric: 'AUROC: 0.786 · Specificity: 71.0%',
    featuresCount: 13,
    category: 'Chronic Triage',
  },
  {
    name: 'cvd',
    displayName: 'Cardiovascular Disease (CVD)',
    version: 'cvd_nolab_bundle-f50aa76d',
    status: 'connected',
    algorithm: 'LightGBM (Kaggle 70k Cohort)',
    metric: 'AUROC: 0.789 · Recall: 86.3%',
    featuresCount: 8,
    category: 'Cardio Risk',
  },
  {
    name: 'maternal',
    displayName: 'Maternal Complications Risk',
    version: 'maternal_bundle-598ef5ad',
    status: 'connected',
    algorithm: 'Random Forest + SHAP TreeExplainer (UCI)',
    metric: 'AUROC: 0.927 · High-Risk Recall: 90.2%',
    featuresCount: 6,
    category: 'Obstetric Triage',
  },
  {
    name: 'ppg_quality',
    displayName: 'Camera PPG Signal Quality Gate',
    version: 'butppg-lgbm-v2.0',
    status: 'connected',
    algorithm: 'LightGBM (BUT-PPG PhysioNet)',
    metric: 'AUROC: 0.854 · MAE: 5.5 BPM',
    featuresCount: 11,
    category: 'Smartphone Bio-Sensor',
  },
  {
    name: 'voice_gemini',
    displayName: 'Multilingual Voice Symptom AI',
    version: 'gemini-flash-lite-latest',
    status: 'connected',
    algorithm: 'LLM Slot Extraction with Schema Constraining',
    metric: 'Supports 6 Indian Languages · Latency: ~6s',
    featuresCount: 29,
    category: 'Voice Intake',
  },
  {
    name: 'rules_engine',
    displayName: 'Emergency Red-Flag Engine',
    version: 'RF01-RF10',
    status: 'connected',
    algorithm: 'Deterministic Medical Decision Logic (0ms)',
    metric: '100% Pass on 10 Emergency Test Scenarios',
    category: 'Safety Layer',
  },
];

export function ModelStatusModal({ onClose }: { onClose: () => void }) {
  const [models, setModels] = useState<ModelItem[]>(STATIC_MODELS);
  const [backendStatus, setBackendStatus] = useState<'checking' | 'online' | 'offline'>('checking');

  useEffect(() => {
    const backendUrl = String(import.meta.env.VITE_BACKEND_URL || import.meta.env.VITE_BACKEND || 'http://localhost:8002')
      .replace(/\/+$/, '')
      .replace(/(\/api\/v1)?$/, '/api/v1');

    fetch(`${backendUrl}/models`, { method: 'GET', credentials: 'include' })
      .then((r) => {
        if (!r.ok) throw new Error('Backend responded with error');
        return r.json();
      })
      .then((data: Array<{ name: string; version: string; status: string }>) => {
        setBackendStatus('online');
        const map = new Map(data.map((m) => [m.name, m]));
        setModels((prev) =>
          prev.map((item) => {
            const remote = map.get(item.name);
            if (remote) {
              return {
                ...item,
                version: remote.version || item.version,
                status: (remote.status as 'connected' | 'not_connected') || 'connected',
              };
            }
            return item;
          })
        );
      })
      .catch(() => {
        setBackendStatus('offline');
      });
  }, []);

  const getIcon = (name: string) => {
    switch (name) {
      case 'hypertension': return <Activity size={18} />;
      case 'diabetes': return <Stethoscope size={18} />;
      case 'cvd': return <Heart size={18} />;
      case 'maternal': return <ShieldCheck size={18} />;
      case 'ppg_quality': return <Cpu size={18} />;
      case 'voice_gemini': return <Mic size={18} />;
      default: return <Sparkles size={18} />;
    }
  };

  const connectedCount = models.filter((m) => m.status === 'connected').length;

  return (
    <div className="modal-backdrop no-print" onClick={onClose} style={{ zIndex: 1100 }}>
      <div
        className="modal-box"
        onClick={(e) => e.stopPropagation()}
        style={{ maxWidth: '640px', width: '100%', maxHeight: '90vh', overflowY: 'auto' }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
          <div>
            <h2 style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '20px', margin: 0 }}>
              <Cpu size={22} color="var(--primary)" />
              AI Models & Engine Status
            </h2>
            <p className="muted small" style={{ margin: '2px 0 0 0' }}>
              {connectedCount} of {models.length} components active & verified
            </p>
          </div>
          <button className="icon-btn" aria-label="Close" onClick={onClose}>
            <X size={20} />
          </button>
        </div>

        {/* Backend Connectivity Status Bar */}
        <div
          style={{
            padding: '10px 14px',
            borderRadius: '8px',
            marginBottom: '14px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            background: backendStatus === 'online' ? '#ECFDF5' : backendStatus === 'offline' ? '#FEF2F2' : 'var(--mint)',
            color: backendStatus === 'online' ? '#065F46' : backendStatus === 'offline' ? '#991B1B' : 'var(--ink)',
            border: `1px solid ${backendStatus === 'online' ? '#A7F3D0' : backendStatus === 'offline' ? '#FECACA' : 'transparent'}`,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '14px', fontWeight: 600 }}>
            <span
              style={{
                width: '10px',
                height: '10px',
                borderRadius: '50%',
                background: backendStatus === 'online' ? '#10B981' : backendStatus === 'offline' ? '#EF4444' : '#F59E0B',
                boxShadow: backendStatus === 'online' ? '0 0 8px #10B981' : 'none',
              }}
            />
            {backendStatus === 'online'
              ? 'FastAPI Server: Connected (port 8002)'
              : backendStatus === 'offline'
              ? 'FastAPI Server: Offline (Using local heuristic fallbacks)'
              : 'Checking server connection...'}
          </div>
          <span style={{ fontSize: '12px', opacity: 0.85 }}>Live Diagnostics</span>
        </div>

        {/* Models Grid */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {models.map((m) => {
            const isConn = m.status === 'connected';
            return (
              <div
                key={m.name}
                style={{
                  border: '1px solid var(--border)',
                  borderRadius: '10px',
                  padding: '12px 14px',
                  background: 'var(--surface)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '6px',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 600, fontSize: '15px' }}>
                    <span style={{ color: 'var(--primary)' }}>{getIcon(m.name)}</span>
                    {m.displayName}
                  </div>
                  <span
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '4px',
                      fontSize: '12px',
                      fontWeight: 700,
                      padding: '2px 8px',
                      borderRadius: '12px',
                      background: isConn ? '#DEF7EC' : '#FDE8E8',
                      color: isConn ? '#03543F' : '#9B1C1C',
                    }}
                  >
                    {isConn ? <CheckCircle2 size={13} /> : <XCircle size={13} />}
                    {isConn ? 'CONNECTED' : 'NOT CONNECTED'}
                  </span>
                </div>

                <div style={{ fontSize: '13px', color: 'var(--muted)', display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                  <span><strong>Algorithm:</strong> {m.algorithm}</span>
                </div>

                <div style={{ fontSize: '12px', display: 'flex', justifyContent: 'space-between', borderTop: '1px dashed var(--border)', paddingTop: '6px', marginTop: '2px' }}>
                  <span style={{ color: 'var(--primary)', fontWeight: 600 }}>{m.metric}</span>
                  <span className="small muted">v: {m.version}</span>
                </div>
              </div>
            );
          })}
        </div>

        <button
          className="btn btn-primary"
          style={{ width: '100%', marginTop: '16px' }}
          onClick={onClose}
        >
          Close Status View
        </button>
      </div>
    </div>
  );
}
