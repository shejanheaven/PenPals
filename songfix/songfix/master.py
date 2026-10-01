"""Mastering chain: cleanup EQ, tonal smoothing, mono bass, glue, true-peak limiter."""
import numpy as np
import pyloudnorm as pyln
from numba import njit
from scipy import signal
from scipy.ndimage import minimum_filter1d, uniform_filter1d

OVERSAMPLE = 4


def db(x):
    return 20 * np.log10(np.maximum(x, 1e-12))


def true_peak(x):
    up = signal.resample_poly(x, OVERSAMPLE, 1, axis=0)
    return float(np.abs(up).max())


def band_spectrum(x, sr, n_fft=32768):
    """Long-term average spectrum of the mid channel on a 1/6-octave grid (dB).

    Levels are energy per band normalised by bandwidth, so pink noise reads
    as a flat line.
    """
    mono = x.mean(axis=1) if x.ndim == 2 else x
    f, p = signal.welch(mono, sr, nperseg=min(n_fft, len(mono)))
    centers = 1000 * 2.0 ** (np.arange(-36, 25) / 6)  # ~16 Hz .. 16 kHz
    centers = centers[(centers > 20) & (centers < min(16000, sr / 2 * 0.9))]
    levels = np.full(len(centers), np.nan)
    for k, c in enumerate(centers):
        sel = (f >= c * 2 ** (-1 / 12)) & (f < c * 2 ** (1 / 12))
        if sel.any():
            levels[k] = 10 * np.log10(np.mean(p[sel] * f[sel]) + 1e-20)
    ok = np.isfinite(levels)
    levels = np.interp(np.log2(centers), np.log2(centers[ok]), levels[ok])
    return centers, levels


def design_eq(x, sr, reference=None, amount=0.5, max_db=2.5):
    """Return (centers, gain_db) for a gentle corrective EQ curve.

    Without a reference: smooths out bumps and holes relative to the song's
    own overall tonal shape (no genre target is imposed).
    With a reference track: moves the song's tonal balance towards it.
    """
    centers, lvl = band_spectrum(x, sr)
    logf = np.log2(centers)
    band = (centers >= 40) & (centers <= 14000)
    if reference is not None:
        rc, rl = band_spectrum(reference, sr)
        rl = np.interp(logf, np.log2(rc), rl)
        diff = rl - lvl
        diff -= np.mean(diff[band])
        # Light smoothing so we follow the broad balance, not every peak.
        diff = uniform_filter1d(diff, 3, mode="nearest")
    else:
        # Smooth version of the song's own curve = its "intended" shape.
        trend = np.polyval(np.polyfit(logf[band], lvl[band], 3), logf)
        local = uniform_filter1d(lvl, 3, mode="nearest")
        diff = trend - local
    gain = np.clip(diff * amount, -max_db, max_db)
    gain[~band] = 0.0
    gain = uniform_filter1d(gain, 3, mode="nearest")
    return centers, gain


def apply_eq(x, sr, centers, gain_db, numtaps=8191):
    """Linear-phase FIR EQ (no phase smear, standard for mastering)."""
    freqs = np.concatenate([[0], centers, [sr / 2]])
    gains = np.concatenate([[gain_db[0]], gain_db, [gain_db[-1]]])
    grid = np.linspace(0, sr / 2, 4097)
    g = 10 ** (np.interp(np.log2(np.maximum(grid, 1)), np.log2(np.maximum(freqs, 1)), gains) / 20)
    taps = signal.firwin2(numtaps, grid, g, fs=sr)
    return signal.fftconvolve(x, taps[:, None], mode="same")


def highpass(x, sr, freq=25.0):
    sos = signal.butter(2, freq, "hp", fs=sr, output="sos")
    return signal.sosfiltfilt(sos, x, axis=0)


def mono_bass(x, sr, freq=120.0):
    """Make everything below `freq` mono: tighter low end, safe on phones and clubs."""
    mid = (x[:, 0] + x[:, 1]) / 2
    side = (x[:, 0] - x[:, 1]) / 2
    sos = signal.butter(4, freq, "hp", fs=sr, output="sos")
    side = signal.sosfiltfilt(sos, side)
    return np.stack([mid + side, mid - side], axis=1)


@njit(cache=True)
def _env_follow(det, att, rel):
    out = np.empty_like(det)
    e = det[0]
    for i in range(det.shape[0]):
        c = att if det[i] > e else rel
        e = c * e + (1 - c) * det[i]
        out[i] = e
    return out


def glue_compress(x, sr, ratio=1.5, target_gr_db=1.0, attack=0.03, release=0.25):
    """Gentle stereo-linked RMS bus compressor tuned to ~target_gr_db on loud parts."""
    det = np.sqrt(np.mean(x ** 2, axis=1))
    att, rel = np.exp(-1 / (attack * sr)), np.exp(-1 / (release * sr))
    env_db = db(np.sqrt(_env_follow(det ** 2, att, rel)) * np.sqrt(2))
    loud = np.percentile(env_db[env_db > env_db.max() - 30], 90)
    threshold = loud - target_gr_db * ratio / (ratio - 1)
    over = np.maximum(env_db - threshold, 0)
    gr = over * (1 - 1 / ratio)
    gain = 10 ** (-gr / 20)
    makeup = 10 ** (np.median(gr[env_db > threshold]) / 20) if np.any(env_db > threshold) else 1.0
    return x * (gain * makeup)[:, None], float(np.percentile(gr, 95))


@njit(cache=True)
def _release(g, coef):
    out = np.empty_like(g)
    cur = 1.0
    for i in range(g.shape[0]):
        if g[i] < cur:
            cur = g[i]
        else:
            cur = cur + (g[i] - cur) * (1 - coef)
        out[i] = cur
    return out


def limit(x, sr, ceiling_dbtp=-1.0, lookahead=0.002, release=0.08):
    """Look-ahead true-peak limiter (4x oversampled peak detection)."""
    ceiling = 10 ** (ceiling_dbtp / 20)
    up = signal.resample_poly(x, OVERSAMPLE, 1, axis=0)
    peak = np.abs(up).max(axis=1)
    peak = peak[: len(peak) // OVERSAMPLE * OVERSAMPLE].reshape(-1, OVERSAMPLE).max(axis=1)
    peak = np.concatenate([peak, np.zeros(len(x) - len(peak))])
    need = np.minimum(1.0, ceiling / np.maximum(peak, 1e-9))
    la = max(1, int(lookahead * sr))
    # Forward-looking minimum, then an equal-length ramp so the gain is already
    # down when the peak arrives (no overshoot, no clicks).
    g = minimum_filter1d(need, size=la, origin=-(la // 2))
    g = np.concatenate([np.full(la - 1, g[0]), g])
    g = np.convolve(g, np.ones(la) / la, mode="valid")
    g = _release(g, np.exp(-1 / (release * sr)))
    return x * g[:, None], float(db(g.min()))


def master(x, sr, target_lufs=-9.0, ceiling_dbtp=-1.0, reference=None,
           eq_amount=0.5, glue=True, log=print):
    meter = pyln.Meter(sr)
    info = {}
    y = highpass(x, sr, 25.0)
    y = mono_bass(y, sr, 120.0)
    centers, gain_db = design_eq(y, sr, reference=reference, amount=eq_amount)
    info["eq"] = {"freqs": centers.tolist(), "gain_db": gain_db.tolist()}
    y = apply_eq(y, sr, centers, gain_db)
    if glue:
        y, gr = glue_compress(y, sr)
        info["glue_gr_db"] = gr
    # Iterate: limiting lowers loudness a little, so re-aim a few times.
    gain_db_total = target_lufs - meter.integrated_loudness(y)
    for _ in range(4):
        out, max_gr = limit(y * 10 ** (gain_db_total / 20), sr, ceiling_dbtp - 0.1)
        err = target_lufs - meter.integrated_loudness(out)
        if abs(err) < 0.1:
            break
        gain_db_total += err
    # Final safety: make sure no inter-sample peak gets through.
    tp = true_peak(out)
    if tp > 10 ** (ceiling_dbtp / 20):
        out *= 10 ** (ceiling_dbtp / 20) / tp
    info["limiter_max_gr_db"] = -max_gr
    return out, info
