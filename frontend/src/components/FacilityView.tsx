import React, { useState } from 'react';
import { Facility, Language, TriageLevel } from '../types/health';
import { MapPin, Phone, Navigation, Clock, ShieldCheck, Star, Filter, AlertCircle } from 'lucide-react';
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet';
import L from 'leaflet';

// Leaflet default icon fix
const defaultIcon = L.icon({
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
});

interface FacilityViewProps {
  language: Language;
  facilities: Facility[];
  triageLevel: TriageLevel;
  userCoords: { lat: number; lng: number };
  isPregnant?: boolean;
}

export const FacilityView: React.FC<FacilityViewProps> = ({
  language,
  facilities,
  triageLevel,
  userCoords,
  isPregnant,
}) => {
  const [activeFilter, setActiveFilter] = useState<'all' | 'maternity' | 'emergency'>(
    isPregnant ? 'maternity' : triageLevel === 'emergency' ? 'emergency' : 'all'
  );
  const [selectedFacility, setSelectedFacility] = useState<Facility>(facilities[0]);

  const filtered = facilities.filter((f) => {
    if (activeFilter === 'maternity') return f.has_maternity;
    if (activeFilter === 'emergency') return f.emergency_capable;
    return true;
  });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      {/* Filters */}
      <div style={{ display: 'flex', gap: '8px', overflowX: 'auto', paddingBottom: '4px' }}>
        <button
          onClick={() => setActiveFilter('all')}
          style={{
            padding: '8px 14px',
            borderRadius: '999px',
            fontSize: '13px',
            background: activeFilter === 'all' ? 'var(--primary-gradient)' : 'rgba(255, 255, 255, 0.06)',
            color: '#FFFFFF',
            border: 'none',
          }}
        >
          {language === 'mr' ? 'सर्व केंद्रे' : language === 'hi' ? 'सभी केंद्र' : 'All Facilities'}
        </button>
        <button
          onClick={() => setActiveFilter('maternity')}
          style={{
            padding: '8px 14px',
            borderRadius: '999px',
            fontSize: '13px',
            background: activeFilter === 'maternity' ? 'linear-gradient(135deg, #EC4899 0%, #BE185D 100%)' : 'rgba(255, 255, 255, 0.06)',
            color: '#FFFFFF',
            border: 'none',
          }}
        >
          {language === 'mr' ? 'प्रसूती सेवा (Maternity)' : language === 'hi' ? 'मातृत्व सेवा (Maternity)' : 'Maternity Care'}
        </button>
        <button
          onClick={() => setActiveFilter('emergency')}
          style={{
            padding: '8px 14px',
            borderRadius: '999px',
            fontSize: '13px',
            background: activeFilter === 'emergency' ? 'linear-gradient(135deg, #EF4444 0%, #B91C1C 100%)' : 'rgba(255, 255, 255, 0.06)',
            color: '#FFFFFF',
            border: 'none',
          }}
        >
          {language === 'mr' ? 'आपत्कालीन (Emergency)' : language === 'hi' ? 'आपातकालीन (Emergency)' : 'Emergency Capable'}
        </button>
      </div>

      {/* Interactive Leaflet Map */}
      <div style={{
        height: '240px',
        width: '100%',
        borderRadius: '16px',
        overflow: 'hidden',
        border: '1px solid var(--border-subtle)',
        boxShadow: '0 4px 20px rgba(0, 0, 0, 0.3)',
      }}>
        <MapContainer
          center={[userCoords.lat || 21.0667, userCoords.lng || 78.9667]}
          zoom={12}
          style={{ height: '100%', width: '100%' }}
          scrollWheelZoom={false}
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          {filtered.map((fac) => (
            <Marker
              key={fac.id}
              position={[fac.lat, fac.lng]}
              icon={defaultIcon}
              eventHandlers={{
                click: () => setSelectedFacility(fac),
              }}
            >
              <Popup>
                <strong>{fac.name}</strong><br />
                {fac.time_to_doctor_min} min to see doctor<br />
                {fac.cost_tier.toUpperCase()} • PM-JAY
              </Popup>
            </Marker>
          ))}
        </MapContainer>
      </div>

      {/* Ranked Facility Cards */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        {filtered.map((fac, idx) => {
          const isSelected = selectedFacility?.id === fac.id;
          return (
            <div
              key={fac.id}
              className="glass-card"
              onClick={() => setSelectedFacility(fac)}
              style={{
                padding: '16px',
                border: isSelected ? '2px solid var(--primary-light)' : '1px solid var(--border-subtle)',
                backgroundColor: isSelected ? 'rgba(2, 132, 199, 0.12)' : 'var(--bg-card)',
              }}
            >
              {/* Top Row: Rank & Time to Doctor */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
                <div>
                  <span style={{
                    fontSize: '11px',
                    fontWeight: 700,
                    color: 'var(--primary-light)',
                    textTransform: 'uppercase',
                    letterSpacing: '0.05em',
                  }}>
                    #{idx + 1} Best Match • {fac.type.toUpperCase()}
                  </span>
                  <h4 style={{ fontSize: '17px', fontWeight: 700, color: '#FFFFFF', marginTop: '2px' }}>
                    {fac.name}
                  </h4>
                </div>

                {/* Big Time to Doctor Pill */}
                <div style={{
                  background: 'rgba(14, 165, 233, 0.2)',
                  border: '1px solid rgba(56, 189, 248, 0.4)',
                  padding: '6px 10px',
                  borderRadius: '10px',
                  textAlign: 'right',
                }}>
                  <div style={{ fontSize: '16px', fontWeight: 800, color: '#38BDF8' }}>
                    ~{fac.time_to_doctor_min} min
                  </div>
                  <div style={{ fontSize: '9px', color: '#94A3B8', textTransform: 'uppercase' }}>
                    To see doctor
                  </div>
                </div>
              </div>

              {/* Doctor Status & Distance */}
              <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '10px', fontSize: '13px', color: '#CBD5E1', marginBottom: '12px' }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                  <span style={{
                    width: '8px',
                    height: '8px',
                    borderRadius: '50%',
                    background: fac.doctor_available ? '#10B981' : '#F59E0B',
                  }} />
                  {fac.doctor_available ? 'Doctor available now' : `Doctor arrives in ${fac.doctor_arrives_in_min} min`}
                </span>
                <span>•</span>
                <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <MapPin size={14} color="#94A3B8" />
                  {fac.distance_km} km ({fac.travel_min} min travel)
                </span>
                <span>•</span>
                <span style={{ display: 'flex', alignItems: 'center', gap: '2px', color: '#FBBF24' }}>
                  <Star size={13} fill="#FBBF24" />
                  {fac.rating} ({fac.review_count})
                </span>
              </div>

              {/* Badges: Cost Tier, PM-JAY, Simulated */}
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', alignItems: 'center', marginBottom: '14px' }}>
                <span style={{
                  fontSize: '11px',
                  padding: '3px 8px',
                  borderRadius: '6px',
                  background: fac.cost_tier === 'free' ? 'rgba(16, 185, 129, 0.2)' : 'rgba(245, 158, 11, 0.2)',
                  color: fac.cost_tier === 'free' ? '#34D399' : '#FBBF24',
                  fontWeight: 700,
                  textTransform: 'uppercase',
                }}>
                  {fac.cost_tier}
                </span>

                {fac.pmjay_empanelled && (
                  <span style={{
                    fontSize: '11px',
                    padding: '3px 8px',
                    borderRadius: '6px',
                    background: 'rgba(2, 132, 199, 0.2)',
                    color: '#38BDF8',
                    fontWeight: 700,
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                  }}>
                    <ShieldCheck size={12} />
                    PM-JAY Empanelled
                  </span>
                )}

                <span className="simulated-pill">simulated</span>
              </div>

              {/* Action Buttons: Call & Directions */}
              <div style={{ display: 'flex', gap: '8px' }}>
                <a
                  href={`tel:${fac.phone}`}
                  style={{
                    flex: 1,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '6px',
                    padding: '10px',
                    borderRadius: '10px',
                    background: 'rgba(255, 255, 255, 0.08)',
                    color: '#FFFFFF',
                    textDecoration: 'none',
                    fontSize: '14px',
                    fontWeight: 600,
                  }}
                >
                  <Phone size={15} color="#38BDF8" />
                  Call
                </a>
                <a
                  href={`https://www.google.com/maps/dir/?api=1&destination=${fac.lat},${fac.lng}`}
                  target="_blank"
                  rel="noreferrer"
                  style={{
                    flex: 1,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '6px',
                    padding: '10px',
                    borderRadius: '10px',
                    background: 'var(--primary-gradient)',
                    color: '#FFFFFF',
                    textDecoration: 'none',
                    fontSize: '14px',
                    fontWeight: 600,
                  }}
                >
                  <Navigation size={15} />
                  Directions
                </a>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
