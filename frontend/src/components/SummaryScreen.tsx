import { Printer } from 'lucide-react';
import { AssessmentResponse, Facility, HeartRateResult, Language, PatientFeatures } from '../types/health';
import { SYMPTOM_CATALOG, TRANSLATIONS } from '../i18n/translations';

// Print-styled one-page summary; window.print() gives "Save as PDF" on phones.
export function SummaryScreen({ lang, f, hr, assessment, facility }: {
  lang: Language;
  f: PatientFeatures;
  hr: HeartRateResult | null;
  assessment: AssessmentResponse;
  facility?: Facility;
}) {
  const t = TRANSLATIONS[lang];
  const sex = f.sex === 'M' ? t.male : f.sex === 'F' ? t.female : t.other;
  const bmi = (f.weight_kg / (f.height_cm / 100) ** 2).toFixed(1);
  const symptoms = f.symptoms.map((c) => SYMPTOM_CATALOG.find((s) => s.code === c)?.label[lang] ?? c);
  const bp = f.systolic && f.diastolic ? `${f.systolic}/${f.diastolic} mmHg` : t.not_recorded;
  const pulse = hr?.bpm ? `${hr.bpm} /min` : t.not_recorded;

  return (
    <section className="card">
      <div className="summary-brand-header">
        <div className="summary-brand">
          <img src="/favicon.png" alt="Swasthik Logo" className="summary-logo" />
          <div className="summary-brand-text">
            <h2 className="summary-app-title">{t.app_name}</h2>
            <p className="summary-app-tagline">{t.tagline}</p>
          </div>
        </div>
        <div className="summary-title-badge">
          <h1>{t.summary_title}</h1>
        </div>
      </div>
      <table className="summary-table">
        <tbody>
          <tr><th>{t.s_date}</th><td>{new Date().toLocaleDateString('en-IN')}</td></tr>
          <tr><th>{t.s_patient}</th><td>{f.name ? <strong>{f.name}, </strong> : null}{f.age}, {sex}, {f.height_cm} cm, {f.weight_kg} kg, {t.bmi} {bmi}{f.is_pregnant && `, ${t.preg_title} ${f.pregnancy_weeks}`}</td></tr>
          <tr><th>{t.s_symptoms}</th><td>{symptoms.length ? symptoms.join(', ') : t.none}</td></tr>
          <tr><th>{t.s_vitals}</th><td>{bp} / {pulse}</td></tr>
          <tr><th>{t.s_triage}</th><td><strong>{t[`triage_${assessment.triage_level}` as const]}</strong>. {t[`advice_${assessment.triage_level}` as const]}</td></tr>
          <tr>
            <th>{t.s_risks}</th>
            <td>
              {assessment.results.map((r) => (
                <div key={r.condition}>
                  <strong>{t[`cond_${r.condition}` as const]}: {t[`level_${r.level}` as const]}</strong>
                  <ul className="reasons">{r.top_factors.slice(0, 3).map((x) => <li key={x.feature}>{x.text}</li>)}</ul>
                </div>
              ))}
            </td>
          </tr>
          {facility && <tr><th>{t.s_facility}</th><td>{facility.name}{facility.phone ? `, ${facility.phone}` : ''}</td></tr>}
        </tbody>
      </table>
      <p className="small muted">{t.disclaimer}</p>
      <button className="btn btn-primary no-print" onClick={() => window.print()}><Printer size={20} /> {t.print}</button>
    </section>
  );
}
