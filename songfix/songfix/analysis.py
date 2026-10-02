"""Measurements used in the report: loudness, peaks, key, tonal balance."""
import numpy as np
import pyloudnorm as pyln
import librosa

from .master import db, true_peak
from .tune import NOTE_NAMES

# Krumhansl-Schmuckler key profiles
MAJOR = np.array([6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88])
MINOR = np.array([6.33, 2.68, 3.52, 5.38, 2.60, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17])


def measure(x, sr):
    meter = pyln.Meter(sr)
    peak = float(np.abs(x).max())
    tp = true_peak(x)
    lufs = meter.integrated_loudness(x)
    mid, side = (x[:, 0] + x[:, 1]) / 2, (x[:, 0] - x[:, 1]) / 2
    return {
        "lufs": round(float(lufs), 2),
        "true_peak_dbtp": round(float(db(tp)), 2),
        "sample_peak_dbfs": round(float(db(peak)), 2),
        "clipped_samples": int(np.sum(np.abs(x) >= 1.0)),
        "plr_db": round(float(db(tp) - lufs), 2),
        "stereo_correlation": round(float(np.corrcoef(x[:, 0], x[:, 1])[0, 1]), 3),
        "side_to_mid_db": round(float(10 * np.log10(np.sum(side ** 2) / np.sum(mid ** 2) + 1e-12)), 2),
        "bandwidth_hz": int(_bandwidth(x, sr)),
    }


def _bandwidth(x, sr):
    """Highest frequency with real content (detects low-bitrate MP3/AAC cutoffs)."""
    mono = x.mean(axis=1)
    spec = np.abs(librosa.stft(mono[: sr * 60], n_fft=4096)) ** 2
    lvl = 10 * np.log10(spec.mean(axis=1) + 1e-20)
    f = librosa.fft_frequencies(sr=sr, n_fft=4096)
    ref = np.median(lvl[(f > 2000) & (f < 6000)])
    above = np.flatnonzero(lvl > ref - 45)
    return f[above[-1]] if len(above) else sr / 2


def estimate_tuning(x, sr):
    """How far the song's reference pitch sits from A=440, in cents (-50..+50).

    Producers often pitch a beat up or down; the vocal is sung to the beat, so
    notes must be judged against the beat's tuning, not against A=440."""
    y = librosa.resample(librosa.to_mono(x.T), orig_sr=sr, target_sr=22050)
    return float(librosa.estimate_tuning(y=y, sr=22050) * 100)


def detect_key(instrumental, sr, vocal_midi=None, tuning_cents=0.0):
    """Return (best_key, ranked list of (key, score)). vocal_midi must already be relative to the tuning."""
    y = librosa.resample(librosa.to_mono(instrumental.T), orig_sr=sr, target_sr=22050)
    chroma = librosa.feature.chroma_cqt(y=y, sr=22050, tuning=tuning_cents / 100).mean(axis=1)
    profile = chroma / chroma.sum()
    if vocal_midi is not None:
        m = vocal_midi[np.isfinite(vocal_midi)]
        if len(m) > 100:
            hist = np.bincount(np.round(m).astype(int) % 12, minlength=12).astype(float)
            profile = profile + hist / hist.sum()
    scores = []
    for k in range(12):
        scores.append((float(np.corrcoef(profile, np.roll(MAJOR, k))[0, 1]), f"{NOTE_NAMES[k]} major"))
        scores.append((float(np.corrcoef(profile, np.roll(MINOR, k))[0, 1]), f"{NOTE_NAMES[k]} minor"))
    scores.sort(reverse=True)
    return scores[0][1], [(k, round(s, 3)) for s, k in scores[:4]]


def relative_key(key):
    root, mode = key.split()
    i = NOTE_NAMES.index(root)
    if mode == "major":
        return f"{NOTE_NAMES[(i + 9) % 12]} minor"
    return f"{NOTE_NAMES[(i + 3) % 12]} major"
