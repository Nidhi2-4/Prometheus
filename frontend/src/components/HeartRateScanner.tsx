import { useEffect, useRef, useState } from 'react';
import { Camera } from 'lucide-react';
import { HeartRateResult } from '../types/health';
import { Strings } from '../i18n/translations';
import { getCameraStream, stopCameraStream } from '../device/camera';
import { checkHeartRate } from '../services/api';
import { estimateBpm } from '../services/rppg';

const SECONDS = 25;
const WARMUP = 1.5; // seconds: the camera is still adjusting exposure, those frames are skipped
// Forehead and both cheeks inside the oval guide, as [x, y, width, height] fractions of the frame.
const REGIONS = [[0.40, 0.22, 0.20, 0.10], [0.33, 0.50, 0.10, 0.10], [0.57, 0.50, 0.10, 0.10]];

type Mode = 'idle' | 'live' | 'checking' | 'manual';
type Quality = HeartRateResult['quality'];

// Reads the mean green value of the forehead and cheeks each frame; only those numbers leave the phone.
export function HeartRateScanner({ t, value, onChange }: { t: Strings; value: HeartRateResult | null; onChange: (hr: HeartRateResult | null) => void }) {
  const [mode, setMode] = useState<Mode>('idle');
  const [cameraError, setCameraError] = useState(false);
  const [left, setLeft] = useState(SECONDS);
  const [dark, setDark] = useState(false);
  const [moving, setMoving] = useState(false);
  const [live, setLive] = useState<Quality | null>(null); // quick on-phone check while recording
  const [aspect, setAspect] = useState('4 / 3');
  const [manual, setManual] = useState('');
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const start = async () => {
    setCameraError(false);
    onChange(null);
    try {
      streamRef.current = await getCameraStream('user');
      setLeft(SECONDS);
      setLive(null);
      setMoving(false);
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
    let previous = -1;
    let lastCheck = 0;
    let handle = 0;
    let cancelled = false;
    // requestVideoFrameCallback fires once per real camera frame; requestAnimationFrame (fallback) repeats frames.
    const perFrame = 'requestVideoFrameCallback' in video;
    const schedule = (cb: () => void) => { handle = perFrame ? video.requestVideoFrameCallback(cb) : requestAnimationFrame(cb); };
    const cancel = () => (perFrame ? video.cancelVideoFrameCallback(handle) : cancelAnimationFrame(handle));

    video.srcObject = stream;
    video.play().then(() => {
      const fw = video.videoWidth, fh = video.videoHeight;
      canvas.width = fw;
      canvas.height = fh;
      setAspect(`${fw} / ${fh}`); // box matches the frame, so the oval sits exactly where we measure
      const boxes = REGIONS.map(([x, y, w, h]) => [x * fw, y * fh, w * fw, h * fh]);
      const t0 = performance.now();
      let tStart = 0;

      const tick = () => {
        if (cancelled) return;
        ctx.drawImage(video, 0, 0);
        let g = 0, all = 0, n = 0;
        for (const [x, y, w, h] of boxes) {
          const px = ctx.getImageData(x, y, w, h).data;
          for (let i = 0; i < px.length; i += 4) {
            g += px[i + 1];
            all += px[i] + px[i + 1] + px[i + 2];
          }
          n += px.length / 4;
        }
        const brightness = all / n / 3;
        setDark(brightness < 40);
        setMoving(previous >= 0 && Math.abs(brightness - previous) > 6); // sudden jumps = head or light moving
        previous = brightness;

        const elapsed = (performance.now() - t0) / 1000;
        if (elapsed >= WARMUP) {
          if (!tStart) tStart = performance.now();
          green.push(g / n);
          brightnessSum += brightness;
        }
        const recorded = tStart ? (performance.now() - tStart) / 1000 : 0;
        // Every 5 s after 10 s of signal: quick check on the phone, so the user knows to hold still or move to light.
        if (recorded >= 10 && elapsed - lastCheck >= 5) {
          lastCheck = elapsed;
          setLive(estimateBpm(green, green.length / recorded, brightnessSum / green.length).quality);
        }

        setLeft(Math.max(0, Math.ceil(SECONDS - elapsed)));
        if (elapsed < SECONDS) return schedule(tick);
        setMode('checking');
        checkHeartRate(green, green.length / recorded, brightnessSum / green.length).then((hr) => {
          onChange(hr);
          setMode('idle');
        });
      };
      schedule(tick);
    }).catch(() => {
      setCameraError(true);
      setMode('idle');
    });

    return () => {
      cancelled = true;
      cancel();
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
    r === 'too_dark' ? t.reason_too_dark
      : r === 'too_much_movement' || r === 'weak_signal' ? t.reason_too_much_movement  // weak pulse signal: hold still and retry
      : t.reason_face_not_visible;

  return (
    <div className="stack">
      <h2>{t.hr_title}</h2>

      {mode === 'live' && (
        <>
          <div className="camera" style={{ aspectRatio: aspect }}>
            <video ref={videoRef} playsInline muted autoPlay />
            <div className="oval" />
            {live && (
              <span className={`live level ${live === 'good' ? 'level-low' : live === 'marginal' ? 'level-medium' : 'level-high'}`}>
                {live === 'good' ? t.q_good : live === 'marginal' ? t.q_marginal : t.q_poor}
              </span>
            )}
            <span className="count">{left}s</span>
            <span className="tip">{dark ? t.hr_too_dark : moving ? t.reason_too_much_movement : t.hr_hint}</span>
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
