import { useEffect, useRef, useState } from 'react';
import { Camera } from 'lucide-react';
import { HeartRateResult } from '../types/health';
import { Strings } from '../i18n/translations';
import { getCameraStream, stopCameraStream } from '../device/camera';
import { checkHeartRate } from '../services/api';

const SECONDS = 25;

type Mode = 'idle' | 'live' | 'checking' | 'manual';

// Reads the mean green value of the forehead/cheek area each frame; only those numbers leave the phone.
export function HeartRateScanner({ t, value, onChange }: { t: Strings; value: HeartRateResult | null; onChange: (hr: HeartRateResult | null) => void }) {
  const [mode, setMode] = useState<Mode>('idle');
  const [cameraError, setCameraError] = useState(false);
  const [left, setLeft] = useState(SECONDS);
  const [dark, setDark] = useState(false);
  const [manual, setManual] = useState('');
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const start = async () => {
    setCameraError(false);
    onChange(null);
    try {
      streamRef.current = await getCameraStream('user');
      setLeft(SECONDS);
      setMode('live');
    } catch {
      setCameraError(true);
    }
  };

  useEffect(() => {
    if (mode !== 'live' || !videoRef.current || !streamRef.current) return;
    const video = videoRef.current;
    const stream = streamRef.current;
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
    const green: number[] = [];
    let brightnessSum = 0;
    let raf = 0;
    let cancelled = false;

    video.srcObject = stream;
    video.play().then(() => {
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const w = canvas.width * 0.3, h = canvas.height * 0.25;
      const x = (canvas.width - w) / 2, y = canvas.height * 0.25;
      const t0 = performance.now();

      const tick = () => {
        if (cancelled) return;
        ctx.drawImage(video, 0, 0);
        const px = ctx.getImageData(x, y, w, h).data;
        let g = 0, all = 0;
        for (let i = 0; i < px.length; i += 4) {
          g += px[i + 1];
          all += px[i] + px[i + 1] + px[i + 2];
        }
        const n = px.length / 4;
        green.push(g / n);
        brightnessSum += all / n / 3;
        setDark(all / n / 3 < 40);

        const elapsed = (performance.now() - t0) / 1000;
        setLeft(Math.max(0, Math.ceil(SECONDS - elapsed)));
        if (elapsed < SECONDS) {
          raf = requestAnimationFrame(tick);
          return;
        }
        setMode('checking');
        checkHeartRate(green, green.length / elapsed, brightnessSum / green.length).then((hr) => {
          onChange(hr);
          setMode('idle');
        });
      };
      raf = requestAnimationFrame(tick);
    }).catch(() => {
      setCameraError(true);
      setMode('idle');
    });

    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
      stopCameraStream(stream);
    };
  }, [mode]);

  const saveManual = () => {
    const bpm = Number(manual);
    if (bpm < 30 || bpm > 220) return;
    onChange({ bpm, quality: 'good', quality_score: 1, reasons: [], note: 'Manual pulse entry.' });
    setMode('idle');
  };

  const reasonText = (r: string) =>
    r === 'too_dark' ? t.reason_too_dark : r === 'too_much_movement' ? t.reason_too_much_movement : t.reason_face_not_visible;

  return (
    <div className="stack">
      <h2>{t.hr_title}</h2>

      {mode === 'live' && (
        <>
          <div className="camera">
            <video ref={videoRef} playsInline muted />
            <div className="oval" />
            <span className="count">{left}s</span>
            <span className="tip">{dark ? t.hr_too_dark : t.hr_hint}</span>
          </div>
          <div className="progress"><div style={{ width: `${((SECONDS - left) / SECONDS) * 100}%` }} /></div>
        </>
      )}

      {mode === 'checking' && <p>{t.hr_checking}</p>}

      {mode === 'manual' && (
        <div className="row">
          <label className="field">
            {t.hr_manual_label}
            <input type="number" inputMode="numeric" value={manual} onChange={(e) => setManual(e.target.value)} />
          </label>
          <button className="btn btn-primary" style={{ flex: 'none', alignSelf: 'flex-end' }} onClick={saveManual}>{t.hr_save}</button>
        </div>
      )}

      {mode === 'idle' && (
        <>
          {value && value.quality !== 'poor' && value.bpm !== null && (
            <div>
              <p className="big">{t.hr_result(value.bpm)}</p>
              <p className={value.quality === 'good' ? 'level level-low' : 'level level-medium'}>
                {value.quality === 'good' ? t.q_good : t.q_marginal}
              </p>
            </div>
          )}
          {value?.quality === 'poor' && (
            <p className="error">{t.q_poor} {value.reasons.map(reasonText).join(' ')}</p>
          )}
          {cameraError && <p className="error">{t.hr_camera_error}</p>}
          {!value && !cameraError && <p className="muted small">{t.hr_sub}</p>}

          <div className="row">
            <button className="btn" onClick={start}><Camera size={20} /> {value || cameraError ? t.hr_retry : t.hr_start}</button>
          </div>
          {(cameraError || value?.quality === 'poor') && (
            <button className="btn" onClick={() => setMode('manual')}>{t.hr_manual}</button>
          )}
        </>
      )}

      <p className="small muted">{t.hr_note}</p>
    </div>
  );
}
