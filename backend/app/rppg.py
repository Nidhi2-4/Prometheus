"""Camera heart rate from the per-frame mean green value of the face region (sent by the frontend)."""
import numpy as np
from scipy import signal

from .schemas import RppgOut

NOTE = "Screening estimate, not a medical device."

# Calibration knobs: tune against a pulse oximeter on real phones (10+ people, different lighting).
MIN_BRIGHTNESS = 40          # mean green (0-255) below this: too dark
MAX_RAW_STD = 8.0            # raw green std above this: movement or lighting changes
GOOD_PEAK_FRACTION = 0.5     # share of 0.7-4 Hz power within ±0.1 Hz of the peak
MARGINAL_PEAK_FRACTION = 0.3


def estimate(green: list[float], fps: float) -> RppgOut:
    x = np.asarray(green, dtype=float)
    if x.std() < 1e-6:
        return RppgOut(bpm=None, quality="poor", quality_score=0.0, reasons=["face_not_visible"], note=NOTE)
    reasons = []
    if x.mean() < MIN_BRIGHTNESS:
        reasons.append("too_dark")
    if x.std() > MAX_RAW_STD:
        reasons.append("too_much_movement")

    b, a = signal.butter(3, [0.7, 4.0], btype="band", fs=fps)  # 42-240 BPM
    y = signal.filtfilt(b, a, signal.detrend(x))
    f, p = signal.periodogram(y, fs=fps, nfft=8192)  # zero-padded for finer BPM steps
    band = (f >= 0.7) & (f <= 4.0)
    f, p = f[band], p[band]
    peak = p.argmax()
    score = float(p[np.abs(f - f[peak]) <= 0.1].sum() / p.sum())

    if score >= GOOD_PEAK_FRACTION and not reasons:
        quality = "good"
    elif score >= MARGINAL_PEAK_FRACTION:
        quality = "marginal"
    else:
        quality = "poor"
        reasons = reasons or ["weak_signal"]
    bpm = None if quality == "poor" else round(float(f[peak]) * 60)
    return RppgOut(bpm=bpm, quality=quality, quality_score=round(score, 2), reasons=reasons, note=NOTE)
