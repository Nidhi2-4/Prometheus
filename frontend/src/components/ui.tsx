import type { ReactNode } from 'react';
import { Volume2 } from 'lucide-react';
import { Language } from '../types/health';
import { TRANSLATIONS } from '../i18n/translations';
import { hasVoice, speakDeviceText } from '../device/speech';

export function Title({ lang, title, sub, children }: { lang: Language; title: string; sub?: string; children?: ReactNode }) {
  return (
    <div className="title-row">
      <div>
        <h1>{title}</h1>
        {sub && <p className="muted">{sub}</p>}
      </div>
      <div className="row" style={{ flex: 'none' }}>
        {children}
        {hasVoice(lang) && (
          <button className="icon-btn" aria-label={TRANSLATIONS[lang].listen} onClick={() => speakDeviceText(sub ? `${title}. ${sub}` : title, lang)}>
            <Volume2 size={22} />
          </button>
        )}
      </div>
    </div>
  );
}

export function Choice({ selected, onClick, children }: { selected: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button type="button" className="choice" aria-pressed={selected} onClick={onClick}>
      {children}
    </button>
  );
}

export function YesNo({ lang, question, value, onChange }: { lang: Language; question: string; value: boolean | undefined; onChange: (v: boolean) => void }) {
  const t = TRANSLATIONS[lang];
  return (
    <div className="question">
      <span>{question}</span>
      <div className="row">
        <Choice selected={value === true} onClick={() => onChange(true)}>{t.yes}</Choice>
        <Choice selected={value === false} onClick={() => onChange(false)}>{t.no}</Choice>
      </div>
    </div>
  );
}
