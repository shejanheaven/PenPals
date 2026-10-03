"""Mastering chain: cleanup, tonal EQ, multiband control, width, glue, soft clip, true-peak limiter."""
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


def design_eq(x, sr, reference=None, target=None, amount=0.5, max_db=2.5):
    """Return (centers, gain_db) for a gentle corrective EQ curve.

    Without a reference: smooths out bumps and holes relative to the song's
    own overall tonal shape (no genre target is imposed).
    With a reference track, or a target curve (centers, levels) averaged from
    several references: moves the song's tonal balance towards it.
    """
    centers, lvl = band_spectrum(x, sr)
    logf = np.log2(centers)
    band = (centers >= 40) & (centers <= 14000)
    if reference is not None:
        target = band_spectrum(reference, sr)
    if target is not None:
        rc, rl = target
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


def split_bands(x, sr, lo=150.0, hi=5000.0):
    """Low / mid / high bands that add back to exactly x (complementary split)."""
    low = signal.sosfiltfilt(signal.butter(4, lo, "lp", fs=sr, output="sos"), x, axis=0)
    rest = x - low
    high = signal.sosfiltfilt(signal.butter(4, hi, "hp", fs=sr, output="sos"), rest, axis=0)
    return low, rest - high, high


def band_compress(x, sr, ratio, attack, release, percentile, knee_db=6.0):
    """Stereo-linked soft-knee compressor, threshold at a loudness percentile of the band itself.

    Returns (y, gain reduction in dB at the 99th percentile)."""
    det = np.sqrt(np.mean(x ** 2, axis=1)) * np.sqrt(2)
    att, rel = np.exp(-1 / (attack * sr)), np.exp(-1 / (release * sr))
    env_db = db(np.sqrt(_env_follow(det ** 2, att, rel)))
    active = env_db > env_db.max() - 40
    threshold = np.percentile(env_db[active], percentile)
    over = env_db - threshold
    slope = 1 - 1 / ratio
    gr = np.where(over <= -knee_db / 2, 0.0,
                  np.where(over >= knee_db / 2, over * slope, slope * (over + knee_db / 2) ** 2 / (2 * knee_db)))
    return x * (10 ** (-gr / 20))[:, None], float(np.percentile(gr, 99))


def multiband(x, sr):
    """Keep the low end steady and take the edge off sibilance and harsh peaks; mids untouched."""
    low, mid, high = split_bands(x, sr)
    low, low_gr = band_compress(low, sr, ratio=2.0, attack=0.03, release=0.2, percentile=80)
    high, high_gr = band_compress(high, sr, ratio=3.0, attack=0.002, release=0.06, percentile=97)
    return low + mid + high, low_gr, high_gr


def correlation(x):
    if np.std(x[:, 0]) == 0 or np.std(x[:, 1]) == 0:
        return 1.0
    return float(np.corrcoef(x[:, 0], x[:, 1])[0, 1])


def widen_highs(x, sr, gain_db, freq=3000.0):
    """Lift the side channel above `freq`: a wider top end that sums to the same mono."""
    mid = (x[:, 0] + x[:, 1]) / 2
    side = (x[:, 0] - x[:, 1]) / 2
    side_hi = signal.sosfiltfilt(signal.butter(2, freq, "hp", fs=sr, output="sos"), side)
    side = side + side_hi * (10 ** (gain_db / 20) - 1)
    return np.stack([mid + side, mid - side], axis=1)


def soft_clip(x, ceiling, knee_db=1.0, over_db=1.5):
    """Round off peaks, 4x oversampled so it adds no aliasing.

    Linear up to knee_db below `ceiling`, then a tanh shoulder that never goes
    more than over_db above it. The limiter after it catches what is left."""
    k = ceiling * 10 ** (-knee_db / 20)
    top = ceiling * 10 ** (over_db / 20)
    up = signal.resample_poly(x, OVERSAMPLE, 1, axis=0)
    a = np.abs(up)
    shaped = np.where(a <= k, a, k + (top - k) * np.tanh((a - k) / (top - k)))
    return signal.resample_poly(np.sign(up) * shaped, 1, OVERSAMPLE, axis=0)[: len(x)]


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


def auto_loudness(before_lufs):
    """Commercial loudness: at least -9 LUFS, and never quieter than the original render (up to -7), because a
    quieter master sounds duller even when nothing else changed (Burning: -7.6 -> -9.0 sounded muddier)."""
    return float(np.clip(before_lufs, -9.0, -7.0))


def master(x, sr, target_lufs=None, ceiling_dbtp=-1.0, reference=None, target_curve=None,
           eq_amount=0.5, glue=True, log=print):
    """Master x. target_lufs=None means auto_loudness. info["steps"] says what was done, in plain words."""
    meter = pyln.Meter(sr)
    info, steps = {}, []
    if target_lufs is None:
        target_lufs = auto_loudness(meter.integrated_loudness(x))
    y = highpass(x, sr, 25.0)
    y = mono_bass(y, sr, 120.0)
    steps.append("Removed sub-rumble below 25 Hz and made the bass mono below 120 Hz")
    centers, gain_db = design_eq(y, sr, reference=reference, target=target_curve, amount=eq_amount)
    info["eq"] = {"freqs": centers.tolist(), "gain_db": gain_db.tolist()}
    y = apply_eq(y, sr, centers, gain_db)
    moves = sorted(zip(centers, gain_db), key=lambda fg: -abs(fg[1]))[:4]
    matched = reference is not None or target_curve is not None
    steps.append(("Matched the tone of your reference songs" if matched else "Tonal-balance EQ") +
                 ", biggest moves: " + ", ".join(f"{f:.0f} Hz {g:+.1f} dB" for f, g in sorted(moves)))
    y, low_gr, high_gr = multiband(y, sr)
    info["multiband"] = {"low_gr_db": low_gr, "high_gr_db": high_gr}
    steps.append(f"Steadied the low end (~{low_gr:.1f} dB on the biggest hits) and tamed sibilance and "
                 f"harsh peaks (~{high_gr:.1f} dB)")
    corr = correlation(y)
    width = 1.5 if corr > 0.9 else 1.0 if corr > 0.8 else 0.0
    if width:
        y = widen_highs(y, sr, width)
        steps.append(f"Widened the top end by {width:.1f} dB (the mix was narrow; mono playback is unchanged)")
    info["width_db"] = width
    if glue:
        y, gr = glue_compress(y, sr)
        info["glue_gr_db"] = gr
        steps.append(f"Glue compression: ~{gr:.1f} dB on the loudest parts")

    ceiling = 10 ** (ceiling_dbtp / 20)

    def finish(target):
        # Iterate: clipping and limiting lower loudness a little, so re-aim a few times.
        g = target - meter.integrated_loudness(y)
        for _ in range(5):
            out, max_gr = limit(soft_clip(y * 10 ** (g / 20), ceiling), sr, ceiling_dbtp - 0.1)
            err = target - meter.integrated_loudness(out)
            if abs(err) < 0.1:
                break
            g += err
        return out, max_gr

    out, max_gr = finish(target_lufs)
    # Final safety: make sure no inter-sample peak gets through.
    tp = true_peak(out)
    if tp > ceiling:
        out *= ceiling / tp
    info["target_lufs"] = round(target_lufs, 2)
    info["limiter_max_gr_db"] = -max_gr
    steps.append(f"Soft clipper + true-peak limiter: up to {-max_gr:.1f} dB of peak reduction, "
                 f"{target_lufs:.1f} LUFS, ceiling {ceiling_dbtp} dBTP")
    info["steps"] = steps
    return out, info
