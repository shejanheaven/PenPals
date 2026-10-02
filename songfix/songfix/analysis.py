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


def beat_chroma(instrumental, sr, tuning_cents=0.0, hop=512):
    """(times, chroma[12, frames]) of the beat, so notes can be checked against what is playing."""
    y = librosa.resample(librosa.to_mono(instrumental.T), orig_sr=sr, target_sr=22050)
    c = librosa.feature.chroma_cqt(y=y, sr=22050, hop_length=hop, tuning=tuning_cents / 100)
    return librosa.frames_to_time(np.arange(c.shape[1]), sr=22050, hop_length=hop), c


def detect_scale(instrumental, sr, rel_midi, tuning_cents=0.0, chroma=None):
    """Pick the key from the notes the singer holds in tune, with the beat as the tie-breaker.

    The beat alone can mislead (456: the beat said F# minor, but the vocal sings G - not G# - 35
    times, in tune). For tuning only the set of 7 notes matters, so each of the 12 major/relative
    minor sets is scored by how much clearly-pitched sung time falls inside it (60%) and how much of
    the beat's chroma does (40%). Returns (key, ranked [(key, score)], vocal coverage of the best set).
    """
    if chroma is None:
        _, chroma = beat_chroma(instrumental, sr, tuning_cents)
    beat = chroma.mean(axis=1)
    beat = beat / beat.sum()
    m = rel_midi[np.isfinite(rel_midi)]
    clear = m[np.abs(m - np.round(m)) < 0.25]  # frames sitting clearly on a note
    voc = np.bincount(np.round(clear).astype(int) % 12, minlength=12).astype(float)
    voc = voc / voc.sum() if voc.sum() > 0 else np.full(12, 1 / 12)
    major = np.zeros(12, bool)
    major[[0, 2, 4, 5, 7, 9, 11]] = True
    ranked = []
    for k in range(12):
        s = np.roll(major, k)
        cover = float(voc[s].sum())
        ranked.append((0.6 * cover + 0.4 * float(beat[s].sum()), cover, k))
    ranked.sort(reverse=True)
    _, cover, k = ranked[0]
    # Same 7 notes: major key on k, or its relative minor on k+9. Ask the profiles which one it feels like.
    profile = beat + voc
    maj = float(np.corrcoef(profile, np.roll(MAJOR, k))[0, 1])
    mnr = float(np.corrcoef(profile, np.roll(MINOR, (k + 9) % 12))[0, 1])
    key = f"{NOTE_NAMES[k]} major" if maj >= mnr else f"{NOTE_NAMES[(k + 9) % 12]} minor"
    return key, [(f"{NOTE_NAMES[kk]} major", round(sc, 3)) for sc, _, kk in ranked[:4]], cover


MAJOR_SET = np.zeros(12, bool)
MAJOR_SET[[0, 2, 4, 5, 7, 9, 11]] = True


def _set_scores(voc, beat):
    """Score each of the 12 major/relative-minor note sets: 60% sung time inside it, 40% beat chroma inside it."""
    return np.array([0.6 * voc[np.roll(MAJOR_SET, k)].sum() + 0.4 * beat[np.roll(MAJOR_SET, k)].sum()
                     for k in range(12)])


def _clear_hist(m):
    m = m[np.isfinite(m)]
    m = m[np.abs(m - np.round(m)) < 0.25]
    return np.bincount(np.round(m).astype(int) % 12, minlength=12).astype(float)


def _allowed(scores, margin):
    """Notes allowed = union of every note set scoring within `margin` of the best: when two keys
    are nearly tied, the note they disagree on is left alone instead of being pulled either way."""
    best = scores.max()
    out = np.zeros(12, bool)
    for k in np.flatnonzero(scores >= best - margin):
        out |= np.roll(MAJOR_SET, k)
    return out


def scale_map(times, rel_midi, chroma, window=20.0, hop=10.0, margin=0.012):
    """Which notes are 'in key' at each moment: (allowed_at(t) -> bool[12], sections).

    The key is judged per ~20 s section, so a chorus or final lift that changes key is tuned to its
    own key. A section with too little clear singing uses the whole song's notes."""
    ct, c = chroma
    voc_all = _clear_hist(rel_midi)
    voc_g = voc_all / max(voc_all.sum(), 1)
    beat_g = c.mean(axis=1) / c.mean(axis=1).sum()
    global_allowed = _allowed(_set_scores(voc_g, beat_g), margin)
    end = float(times[-1]) if len(times) else 0.0
    starts = np.arange(0.0, max(end - window, 0) + hop, hop)
    sections = []
    for s0 in starts:
        sel = (times >= s0) & (times < s0 + window)
        h = _clear_hist(rel_midi[sel])
        if h.sum() < 150:
            sections.append((s0, global_allowed))
            continue
        voc = 0.7 * h / h.sum() + 0.3 * voc_g
        cs = (ct >= s0) & (ct < s0 + window)
        beat = c[:, cs].mean(axis=1) if cs.any() else c.mean(axis=1)
        sections.append((s0, _allowed(_set_scores(voc, beat / beat.sum()), margin)))
    centers = np.array([s0 + window / 2 for s0, _ in sections]) if sections else np.array([0.0])

    def allowed_at(t):
        if not sections:
            return global_allowed
        return sections[int(np.argmin(np.abs(centers - t)))][1]

    return allowed_at, [(round(float(s0), 1), [NOTE_NAMES[i] for i in np.flatnonzero(a)]) for s0, a in sections]


def relative_key(key):
    root, mode = key.split()
    i = NOTE_NAMES.index(root)
    if mode == "major":
        return f"{NOTE_NAMES[(i + 9) % 12]} minor"
    return f"{NOTE_NAMES[(i + 3) % 12]} major"
