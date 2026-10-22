import { Navigation, Phone, Siren } from 'lucide-react';
import { RedFlagRule } from '../types/health';
import { RedFlagKey, Strings } from '../i18n/translations';

// Full-screen alert. The Call 108 link is a plain tel: link so it never depends on the network.
export function EmergencyAlert({ t, rules, onNearest, onContinue }: {
  t: Strings;
  rules: RedFlagRule[];
  onNearest: () => void;
  onContinue: () => void;
}) {
  return (
    <div className="emergency" role="alertdialog" aria-labelledby="em-title">
      <div className="inner">
        <Siren size={48} />
        <h1 id="em-title">{t.em_title}</h1>
        <p className="big">{t.em_sub}</p>
        <ul>
          {rules.map((r) => <li key={r.id}>{t[r.message_key as RedFlagKey] || r.description}</li>)}
        </ul>
        <a className="btn btn-call" href="tel:108"><Phone size={26} /> {t.call_108}</a>
        <button className="btn btn-ghost" onClick={onNearest}><Navigation size={20} /> {t.em_nearest}</button>
        <button className="link" onClick={onContinue}>{t.em_continue}</button>
      </div>
    </div>
  );
}
