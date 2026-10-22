// Local fallback for POST /vitals/rppg: green-channel means -> BPM via a DFT over the 45-180 BPM band.
// ponytail: plain DFT + peak-ratio quality gate; the backend (filter + FFT + ML gate) is the real one.
export interface RppgEstimate {
  bpm: number | null;
  quality: 'good' | 'marginal' | 'poor';
  quality_score: number;
  reasons: string[];
}

export function estimateBpm(green: number[], fps: number, brightness: number): RppgEstimate {
  if (brightness < 40) return { bpm: null, quality: 'poor', quality_score: 0, reasons: ['too_dark'] };
  if (green.length < fps * 10) return { bpm: null, quality: 'poor', quality_score: 0, reasons: ['face_not_visible'] };

  // Remove slow drift (lighting changes) with a 1 s moving average.
  const win = Math.max(1, Math.round(fps));
  const signal = green.map((_, i) => {
    const from = Math.max(0, i - win), to = Math.min(green.length, i + win + 1);
    let sum = 0;
    for (let j = from; j < to; j++) sum += green[j];
    return green[i] - sum / (to - from);
  });

  let best = 0, bestPower = 0, total = 0;
  for (let bpm = 45; bpm <= 180; bpm++) {
    const w = (2 * Math.PI * bpm) / 60 / fps;
    let re = 0, im = 0;
    for (let n = 0; n < signal.length; n++) {
      re += signal[n] * Math.cos(w * n);
      im += signal[n] * Math.sin(w * n);
    }
    const power = re * re + im * im;
    total += power;
    if (power > bestPower) { bestPower = power; best = bpm; }
  }

  // Share of band power within +-3 BPM of the peak; a clean pulse concentrates here.
  let near = 0;
  for (let bpm = best - 3; bpm <= best + 3; bpm++) {
    const w = (2 * Math.PI * bpm) / 60 / fps;
    let re = 0, im = 0;
    for (let n = 0; n < signal.length; n++) {
      re += signal[n] * Math.cos(w * n);
      im += signal[n] * Math.sin(w * n);
    }
    near += re * re + im * im;
  }
  const score = total > 0 ? Math.min(1, near / total) : 0;

  if (score < 0.3) return { bpm: null, quality: 'poor', quality_score: score, reasons: ['too_much_movement'] };
  return { bpm: best, quality: score >= 0.6 ? 'good' : 'marginal', quality_score: score, reasons: [] };
}
