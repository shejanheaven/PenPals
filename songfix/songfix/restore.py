"""Undo clipping in a rendered song: rebuild flattened peaks from the samples around them."""
import numpy as np
from scipy.interpolate import CubicSpline


def clipped_runs(x, ratio=0.985, min_run=3):
    """(channel, start, end) of every run of >= min_run samples stuck at the song's own peak level."""
    thr = np.abs(x).max() * ratio
    out = []
    for c in range(x.shape[1]):
        hot = np.concatenate([[0], (np.abs(x[:, c]) >= thr).astype(np.int8), [0]])
        d = np.diff(hot)
        for s, e in zip(np.flatnonzero(d == 1), np.flatnonzero(d == -1)):
            if e - s >= min_run:
                out.append((c, int(s), int(e)))
    return out


def declip(x, ratio=0.985, min_run=3, context=8, min_runs=20):
    """Rebuild flat-topped peaks with a cubic spline through the clean samples either side.

    A flat run of samples at the song's peak level is the signature of a clipper or an overdriven
    render; the waveform really went higher there. Only acts when a song has at least `min_runs` such
    runs, so a song that merely touches its peak a few times is left alone. Returns (y, runs_fixed)."""
    runs = clipped_runs(x, ratio, min_run)
    if len(runs) < min_runs:
        return x, 0
    y = x.copy()
    n = len(x)
    for c, s, e in runs:
        a, b = max(s - context, 0), min(e + context, n)
        idx = np.r_[a:s, e:b]
        if len(idx) < 4:
            continue
        sign = np.sign(x[(s + e) // 2, c])
        fit = CubicSpline(idx, x[idx, c])(np.arange(s, e))
        # The true peak can only be further out than the flat top, never inside it.
        y[s:e, c] = sign * np.maximum(np.abs(fit), np.abs(x[s:e, c]))
    return y, len(runs)
