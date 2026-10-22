import { useState } from 'react';
import { Language } from '../types/health';
import { TRANSLATIONS } from '../i18n/translations';
import { checkScheme, SchemeAnswers, SchemeStatus } from '../services/api';
import { Title, YesNo } from './ui';

export function SchemeScreen({ lang }: { lang: Language }) {
  const t = TRANSLATIONS[lang];
  const [a, setA] = useState<SchemeAnswers>({ ration_card: false, bpl: false, senior_70_plus: false, low_income: false });
  const [status, setStatus] = useState<SchemeStatus | null>(null);
  const set = (patch: Partial<SchemeAnswers>) => { setA({ ...a, ...patch }); setStatus(null); };

  const docs = [
    t.doc_aadhaar,
    ...(a.ration_card || a.bpl ? [t.doc_ration] : []),
    ...(a.senior_70_plus ? [t.doc_age] : []),
    ...(status === 'possibly' ? [t.doc_income] : []),
  ];

  return (
    <section className="card">
      <Title lang={lang} title={t.scheme_title} />
      <YesNo lang={lang} question={t.q_ration} value={a.ration_card} onChange={(v) => set({ ration_card: v })} />
      <YesNo lang={lang} question={t.q_bpl} value={a.bpl} onChange={(v) => set({ bpl: v })} />
      <YesNo lang={lang} question={t.q_senior} value={a.senior_70_plus} onChange={(v) => set({ senior_70_plus: v })} />
      <YesNo lang={lang} question={t.q_income} value={a.low_income} onChange={(v) => set({ low_income: v })} />
      <button className="btn btn-primary" onClick={() => checkScheme(a).then(setStatus)}>{t.scheme_check}</button>

      {status && (
        <div className="stack">
          <p className="big">
            {status === 'likely' ? t.scheme_likely : status === 'possibly' ? t.scheme_possibly : t.scheme_not_likely}
          </p>
          {status !== 'not_likely' && (
            <>
              <h3>{t.scheme_docs}</h3>
              <ul className="reasons">{docs.map((d) => <li key={d}>{d}</li>)}</ul>
            </>
          )}
          <p className="small muted">{t.scheme_note}</p>
        </div>
      )}
    </section>
  );
}
