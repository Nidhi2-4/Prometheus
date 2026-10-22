import { useState } from 'react';
import { Navigation, Phone, Star } from 'lucide-react';
import { CircleMarker, MapContainer, Marker, TileLayer } from 'react-leaflet';
import L from 'leaflet';
import markerIcon from 'leaflet/dist/images/marker-icon.png';
import markerIcon2x from 'leaflet/dist/images/marker-icon-2x.png';
import markerShadow from 'leaflet/dist/images/marker-shadow.png';
import { Facility } from '../types/health';
import { Strings } from '../i18n/translations';
import { DISTRICT_FALLBACKS, GeoCoordinates } from '../device/geolocation';

const icon = L.icon({ iconUrl: markerIcon, iconRetinaUrl: markerIcon2x, shadowUrl: markerShadow, iconSize: [25, 41], iconAnchor: [12, 41] });

// The list arrives already ranked by time to see a doctor; show it in that order.
export function CareScreen({ t, facilities, coords, onDistrict, gpsFailed, emergency, maternity }: {
  t: Strings;
  facilities: Facility[];
  coords: GeoCoordinates;
  onDistrict: (c: GeoCoordinates) => void;
  gpsFailed: boolean;
  emergency: boolean;
  maternity: boolean;
}) {
  const [selected, setSelected] = useState<string | null>(null);

  const pick = (id: string) => {
    setSelected(id);
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  };

  return (
    <>
      <h1>{t.care_title}</h1>
      {emergency && <p className="muted">{t.care_emergency}</p>}
      {!emergency && maternity && <p className="muted">{t.care_maternity}</p>}

      {gpsFailed && (
        <label className="field">
          {t.location_denied}
          <select className="input" defaultValue="Nagpur" onChange={(e) => onDistrict(DISTRICT_FALLBACKS[e.target.value])}>
            {Object.keys(DISTRICT_FALLBACKS).map((d) => <option key={d}>{d}</option>)}
          </select>
        </label>
      )}

      <div className="care-layout">
      <div className="map">
        <MapContainer key={`${coords.lat},${coords.lng}`} center={[coords.lat, coords.lng]} zoom={11} scrollWheelZoom={false} style={{ height: '100%' }}>
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          <CircleMarker center={[coords.lat, coords.lng]} radius={8} pathOptions={{ color: '#2F404F', fillOpacity: 1 }} />
          {facilities.map((f) => (
            <Marker key={f.id} position={[f.lat, f.lng]} icon={icon} eventHandlers={{ click: () => pick(f.id) }} />
          ))}
        </MapContainer>
      </div>

      <div className="stack">
      {facilities.map((f) => (
        <section key={f.id} id={f.id} className={`card facility${selected === f.id ? ' selected' : ''}`}>
          <h2>{f.name}</h2>
          <p className="big">{t.min_to_doctor(f.time_to_doctor_min)}</p>
          <p>
            {f.availability_updated_min_ago > 30 ? t.availability_unknown : (
              <>
                <span className="dot" style={{ background: f.doctor_available ? 'var(--teal)' : 'var(--mint)' }} />
                {f.doctor_available ? t.doctor_now : t.doctor_in(f.doctor_arrives_in_min)}
              </>
            )}
          </p>
          <p className="muted">{t.distance(f.distance_km, f.travel_min)}</p>
          <p className="small">
            {f.cost_tier === 'free' ? t.cost_free : f.cost_tier === 'subsidized' ? t.cost_subsidized : t.cost_paid}
            {f.pmjay_empanelled && ` · ${t.pmjay}`}
            {" · "}<Star size={14} aria-hidden /> {f.rating} ({f.review_count})
          </p>
          <div className="row">
            <a className="btn btn-small" href={`tel:${f.phone}`}><Phone size={18} /> {t.call}</a>
            <a className="btn btn-small btn-primary" href={`https://www.google.com/maps/dir/?api=1&destination=${f.lat},${f.lng}`} target="_blank" rel="noreferrer">
              <Navigation size={18} /> {t.directions}
            </a>
          </div>
        </section>
      ))}
      <p className="small muted">{t.simulated_note}</p>
      </div>
      </div>
    </>
  );
}
