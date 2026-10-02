"""Vocal polish: make the voice crisp and up front, and keep it easy on the ears.

Crisp (`crisp`): cut boxy 200-500 Hz buildup, even out the level so every word is clear, and add
air above 10 kHz - each only when the vocal needs it.

Comfort (`_tame`) - two things do almost all of the damage:
- sibilance: "s", "sh", "t" and "ch" sounds (5-10 kHz) that peak louder than the vowels
- harshness: too much 2.5-5 kHz, the range the ear is most sensitive to, especially on loud high notes

`measure` turns both into numbers; `polish` reduces them on the vocal stem only,
dynamically (only at the moments they happen), so the beat is untouched and the
voice keeps its clarity the rest of the time.
"""
import numpy as np
from scipy import signal

from .master import _env_follow, db

BANDS = {"body": (300, 2500), "harsh": (2500, 5000), "sib": (5000, 10000)}


def _band(x, sr, lo, hi):
    sos = signal.butter(4, [lo, hi], "bp", fs=sr, output="sos")
    return signal.sosfiltfilt(sos, x, axis=0)


def _short_levels(y, sr, win=0.01):
    """Level in dB of each 10 ms frame (mono)."""
    m = y.mean(axis=1) if y.ndim == 2 else y
    n = int(win * sr)
    k = len(m) // n
    frames = m[:k * n].reshape(k, n)
    return db(np.sqrt(np.mean(frames ** 2, axis=1)))


def measure(vocal, sr):
    """Ear-comfort numbers for a vocal stem (dB).

    sib_vs_vowel: loudest "s" moments vs loudest vowels (99.5th percentiles). Above about -3 dB, esses
        jump out and sting; polished vocals sit around -4 to -8.
    harsh_vs_body: average 2.5-5 kHz energy vs the 300-2500 Hz body. Above about -6 dB sounds edgy and tiring.
    harsh_peaks: how far the harsh band's loudest moments rise above its own typical level (piercing notes).
    """
    lv = {k: _short_levels(_band(vocal, sr, *b), sr) for k, b in BANDS.items()}
    full = _short_levels(vocal, sr)
    active = full > np.percentile(full, 99) - 35  # ignore silence between phrases
    if active.sum() < 50:
        return None
    pct = lambda a, q: float(np.percentile(a[active], q))
    energy = lambda a: float(db(np.sqrt(np.mean((10 ** (a[active] / 20)) ** 2))))
    band_energy = lambda lo, hi: energy(_short_levels(_band(vocal, sr, lo, hi), sr))
    return {
        "sib_vs_vowel": round(pct(lv["sib"], 99.5) - pct(lv["body"], 99.5), 1),
        "harsh_vs_body": round(energy(lv["harsh"]) - energy(lv["body"]), 1),
        "harsh_peaks": round(pct(lv["harsh"], 99.5) - pct(lv["harsh"], 50), 1),
        # boxiness: 200-500 Hz vs 1-2.5 kHz; above about +3 dB the voice sounds muffled, "in a box"
        "mud": round(band_energy(200, 500) - band_energy(1000, 2500), 1),
        # air: 10-16 kHz vs the body, on vowels only (esses carry most of the top end and would hide a dull
        # vowel); below the target the voice sounds dull rather than crisp
        "air": round(_vowel_air(vocal, sr, lv, active), 1),
        # how much the level swings between phrases (p10-p90 of 0.4 s levels); above ~6 dB words get lost
        "level_spread": round(_spread(vocal, sr), 1),
    }


def _vowel_air(vocal, sr, lv, active):
    air = _short_levels(_band(vocal, sr, 10000, min(16000, sr / 2 * 0.95)), sr)
    n = min(len(air), len(active))
    vowel = active[:n] & (lv["sib"][:n] < lv["body"][:n] - 6) & (lv["body"][:n] > np.percentile(lv["body"][:n], 50))
    if vowel.sum() < 20:
        vowel = active[:n]
    e = lambda a: db(np.sqrt(np.mean((10 ** (a[:n][vowel] / 20)) ** 2)))
    return float(e(air) - e(lv["body"]))


def _spread(vocal, sr, win=0.4):
    m = vocal.mean(axis=1)
    n = int(win * sr)
    k = len(m) // n
    lv = db(np.sqrt(np.mean(m[:k * n].reshape(k, n) ** 2, axis=1)))
    lv = lv[lv > lv.max() - 25]
    return float(np.percentile(lv, 90) - np.percentile(lv, 10)) if len(lv) > 5 else 0.0


def _biquad(x, sr, kind, f, gain_db, q=0.9):
    """RBJ peaking / high-shelf filter (minimum phase, like a mixing-desk EQ)."""
    a_ = 10 ** (gain_db / 40)
    w0 = 2 * np.pi * f / sr
    cw, sw = np.cos(w0), np.sin(w0)
    if kind == "peak":
        al = sw / (2 * q)
        b = [1 + al * a_, -2 * cw, 1 - al * a_]
        a = [1 + al / a_, -2 * cw, 1 - al / a_]
    else:  # high shelf, slope 1
        al = sw / 2 * np.sqrt(2)
        sa = 2 * np.sqrt(a_) * al
        b = [a_ * ((a_ + 1) + (a_ - 1) * cw + sa), -2 * a_ * ((a_ - 1) + (a_ + 1) * cw),
             a_ * ((a_ + 1) + (a_ - 1) * cw - sa)]
        a = [(a_ + 1) - (a_ - 1) * cw + sa, 2 * ((a_ - 1) - (a_ + 1) * cw), (a_ + 1) - (a_ - 1) * cw - sa]
    return signal.lfilter(np.array(b) / a[0], np.array(a) / a[0], x, axis=0)


MUD_TARGET, AIR_TARGET, SPREAD_TARGET = 3.0, -10.0, 6.0  # mud target is generous: deep voices are naturally fuller


def crisp(vocal, sr, m=None, max_mud_cut=3.0, max_air=4.0, max_level=6.0):
    """Clear, even and airy - only as much as this vocal needs. Returns (vocal, info)."""
    m = m or measure(vocal, sr)
    info = {}
    y = vocal
    mud_cut = float(np.clip(m["mud"] - MUD_TARGET, 0, max_mud_cut))
    if mud_cut > 0.3:
        y = _biquad(y, sr, "peak", 320, -mud_cut, q=0.8)
    info["mud_cut_db"] = round(mud_cut, 1)
    if m["level_spread"] > SPREAD_TARGET:
        # Leveler: phrase by phrase, bring quiet lines up and loud ones down (70% of the way to the median,
        # at most 6 dB),
        # only where someone is singing, so breaths and bleed between lines are not pumped up.
        mono = y.mean(axis=1)
        env = db(np.sqrt(_env_follow(mono ** 2, np.exp(-1 / (0.2 * sr)), np.exp(-1 / (0.4 * sr)))))
        act = env > np.percentile(env, 99) - 20
        if act.any():
            g = np.where(act, np.clip((np.median(env[act]) - env) * 0.7, -max_level, max_level), 0.0)
            g = signal.sosfiltfilt(signal.butter(1, 3.0, fs=sr, output="sos"), g)  # glide, never step
            y = y * (10 ** (g / 20))[:, None]
        # then a fast 3:1 compressor on the loudest 40% to keep every word forward
        from .master import band_compress
        rms = np.sqrt(np.mean(y ** 2))
        y, gr = band_compress(y, sr, ratio=3.0, attack=0.005, release=0.08, percentile=60)
        y = y * rms / max(np.sqrt(np.mean(y ** 2)), 1e-12)
        info["leveled"], info["compress_db"] = True, round(gr, 1)
    air = float(np.clip(AIR_TARGET - m["air"], 0, max_air))
    if air > 0.3:
        y = _biquad(y, sr, "shelf", 10000, air)
    info["air_db"] = round(air, 1)
    return y, info


def _split(x, sr, f):
    """(low, high) around f, adding back to exactly x."""
    low = signal.sosfiltfilt(signal.butter(4, f, "lp", fs=sr, output="sos"), x, axis=0)
    return low, x - low


SIB_TARGET = -5.0    # loudest "s" moments at least this far below the loudest vowels
HARSH_TARGET = -6.0  # average 2.5-5 kHz at least this far below the body of the voice


def _env_db(x, sr, attack, release):
    return db(np.sqrt(_env_follow(x ** 2, np.exp(-1 / (attack * sr)), np.exp(-1 / (release * sr)))))


def _smooth_cut(cut_db, sr, release):
    """Smooth a gain-reduction curve (dB) so it never clicks: instant-ish down, gentle back up."""
    return _env_follow(cut_db, np.exp(-1 / (0.001 * sr)), np.exp(-1 / (release * sr)))


def polish(vocal, sr):
    """Crisp first (clarity, steady level, air), then comfort (harshness, de-essing) so any brightness
    the air boost brings out is caught. Returns (vocal, info) with before/after measurements."""
    before = measure(vocal, sr)
    if before is None:
        return vocal, {"before": None}
    y, cinfo = crisp(vocal, sr, before)
    y, tinfo = _tame(y, sr)
    return y, {"before": before, "after": measure(y, sr), **cinfo, **tinfo}


def _tame(vocal, sr, max_static=4.0, max_peak_cut=3.0, max_sib_cut=8.0):
    """De-ess and soften harshness on a vocal stem, only as much as it needs. Returns (vocal, info).

    1. Harshness: if the 2.5-5 kHz band averages above HARSH_TARGET relative to the body, it is turned
       down by the difference (at most max_static dB). Then the loudest 5% of harsh moments (piercing
       high notes) are dipped by up to max_peak_cut dB more.
    2. De-esser: one threshold per song, SIB_TARGET dB below the loudest vowels; "s" sounds above it
       have everything over 4.5 kHz turned down for that moment, by up to max_sib_cut dB.
    A vocal that is already smooth comes out unchanged."""
    m = measure(vocal, sr)
    if m is None:
        return vocal, {}
    mono = vocal.mean(axis=1)
    full = _short_levels(vocal, sr)
    active_frames = full > np.percentile(full, 99) - 35
    active = np.repeat(active_frames, int(0.01 * sr))
    active = np.concatenate([active, np.zeros(len(mono) - len(active), bool)])

    # 1. Harshness: static trim + peak dips on 2.5-5 kHz.
    low, rest = _split(vocal, sr, 2500)
    mid, high = _split(rest, sr, 5000)
    static = float(np.clip(m["harsh_vs_body"] - HARSH_TARGET, 0, max_static))
    env_h = _env_db(mid.mean(axis=1), sr, 0.005, 0.08) - static
    thr_h = np.percentile(env_h[active], 95) if active.any() else env_h.max()
    peak_cut = _smooth_cut(np.clip(env_h - thr_h, 0, max_peak_cut), sr, 0.08)
    g_h = 10 ** (-(static + peak_cut) / 20)
    y = low + mid * g_h[:, None] + high

    # 2. De-esser on everything above 4.5 kHz, against one per-song threshold.
    body_levels = _short_levels(_band(y, sr, *BANDS["body"]), sr)
    thr_s = np.percentile(body_levels[active_frames], 99.5) + SIB_TARGET
    low2, high2 = _split(y, sr, 4500)
    env_s = _env_db(_band(y.mean(axis=1), sr, *BANDS["sib"]), sr, 0.001, 0.05)
    sib_cut = _smooth_cut(np.clip(env_s - thr_s, 0, max_sib_cut), sr, 0.05)
    y = low2 + high2 * (10 ** (-sib_cut / 20))[:, None]

    info = {"harsh_static_db": round(static, 1),
            "harsh_peak_max_db": round(float(peak_cut.max()), 1),
            "deess_max_db": round(float(sib_cut.max()), 1),
            "deess_time_pct": round(float(np.mean(sib_cut[active] > 1.0) * 100), 1) if active.any() else 0.0}
    return y, info
