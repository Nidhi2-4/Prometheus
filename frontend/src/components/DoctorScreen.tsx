import { useEffect, useState } from 'react';
import { Copy, Download, Printer } from 'lucide-react';
import { AssessmentResponse, HeartRateResult, PatientFeatures, SOAPNote } from '../types/health';
import { fetchFHIR, fetchSOAP } from '../services/api';

// Clinician-facing, so kept in English.
export function DoctorScreen({ f, hr, assessment }: { f: PatientFeatures; hr: HeartRateResult | null; assessment: AssessmentResponse }) {
  const [soap, setSoap] = useState<SOAPNote | null>(null);
  const [fhir, setFhir] = useState('');
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    fetchSOAP(f, assessment, hr).then(setSoap);
    fetchFHIR(f, assessment, hr).then((b) => setFhir(JSON.stringify(b, null, 2)));
  }, [assessment]);

  const download = () => {
    const url = URL.createObjectURL(new Blob([fhir], { type: 'application/json' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `swasthik-fhir-${assessment.assessment_id}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const copy = () => navigator.clipboard.writeText(fhir).then(() => setCopied(true));

  return (
    <div className="grid">
      <section className="card">
        <h1>SOAP note</h1>
        {!soap ? <p>Loading...</p> : (
          <>
            <div><h3>Subjective</h3><p>{soap.subjective}</p></div>
            <div><h3>Objective</h3><p>{soap.objective}</p></div>
            <div><h3>Assessment</h3><p>{soap.assessment}</p></div>
            <div><h3>Plan</h3><p>{soap.plan}</p></div>
          </>
        )}
        <button className="btn no-print" onClick={() => window.print()}><Printer size={20} /> Print</button>
      </section>

      <section className="card no-print">
        <h2>FHIR R4 bundle</h2>
        <pre className="json">{fhir}</pre>
        <div className="row">
          <button className="btn" onClick={copy}><Copy size={18} /> {copied ? 'Copied' : 'Copy'}</button>
          <button className="btn btn-primary" onClick={download} disabled={!fhir}><Download size={18} /> Download .json</button>
        </div>
      </section>
    </div>
  );
}
