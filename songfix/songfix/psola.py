"""Pitch-synchronous overlap-add (TD-PSOLA) pitch shifting.

Why not a phase vocoder: PSOLA reproduces the input *exactly* wherever the
shift is zero, so a corrected note slots back into the untouched vocal with no
seams, phasing or smearing. Formants are preserved naturally, so the voice
keeps its character.
"""
import numpy as np
from numba import njit


@njit(cache=True)
def _next_mark(x, t, period, n):
    """Find the next pitch mark ~1 period after t by maximising waveform similarity."""
    half = int(period // 2)
    lo, hi = int(t + 0.85 * period), int(t + 1.15 * period)
    if t - half < 0 or hi + half >= n:
        return int(t + period + 0.5)
    best, best_o = -1e30, int(t + period + 0.5)
    for c in range(lo, hi + 1):
        num, e1, e2 = 0.0, 1e-12, 1e-12
        for i in range(-half, half):
            a, b = x[t + i], x[c + i]
            num += a * b
            e1 += a * a
            e2 += b * b
        score = num / np.sqrt(e1 * e2)
        if score > best:
            best, best_o = score, c
    return best_o


@njit(cache=True)
def pitch_marks(x, f0, start, end, sr):
    """Analysis marks: one per period in voiced parts, every 5 ms elsewhere."""
    n = x.shape[0]
    out = np.empty(int((end - start) / sr * 1200) + 16, dtype=np.int64)
    k = 0
    t = start
    unvoiced_step = int(0.005 * sr)
    while t < end and k < out.shape[0]:
        out[k] = t
        k += 1
        f = f0[t]
        if f > 0:
            t = _next_mark(x, t, sr / f, n)
        else:
            t += unvoiced_step
    return out[:k]


@njit(cache=True)
def _render(x, marks, ratio, start, end):
    n, ch = x.shape
    acc = np.zeros((n, ch))
    wsum = np.zeros(n)
    m = marks.shape[0]
    s = float(marks[1])
    k = 1
    while s < end and m > 2:
        # analysis mark nearest to the synthesis time (keeps timing unchanged)
        while k + 1 < m - 1 and abs(marks[k + 1] - s) < abs(marks[k] - s):
            k += 1
        while k - 1 > 0 and abs(marks[k - 1] - s) < abs(marks[k] - s):
            k -= 1
        if k <= 0 or k >= m - 1:
            break
        tk = marks[k]
        left, right = tk - marks[k - 1], marks[k + 1] - tk
        si = int(s + 0.5)
        for i in range(-left, right):
            src, dst = tk + i, si + i
            if 0 <= src < n and 0 <= dst < n:
                if i < 0:
                    w = 0.5 - 0.5 * np.cos(np.pi * (i + left) / left)
                else:
                    w = 0.5 + 0.5 * np.cos(np.pi * i / right)
                for c in range(ch):
                    acc[dst, c] += w * x[src, c]
                wsum[dst] += w
        r = ratio[min(si, n - 1)]
        step = right / r
        if abs(r - 1.0) < 1e-6:
            # Back at zero shift: drift back onto the original grid (<= ~9 cents
            # for a few periods) so the output becomes identical to the input.
            delta = s - tk
            corr = min(max(-0.15 * delta, -0.005 * right), 0.005 * right)
            step += corr
        s += step
    return acc, wsum


def shift_region(x, f0_samples, ratio, start, end, sr, fade=0.01):
    """Pitch-shift x[start:end] (x is (n, ch)) by `ratio` (one value per sample).

    Returns (a, b, segment) - write `segment` back into x[a:b]. `ratio` must be
    1.0 at the region edges.
    """
    mono = x.mean(axis=1)
    marks = pitch_marks(mono, f0_samples, start, end, sr)
    if len(marks) < 4:
        return start, start, x[start:start]
    acc, wsum = _render(x, marks, ratio, start, end)
    a, b = int(marks[1]), int(marks[-2])
    orig = x[a:b]
    out = orig.copy()
    ok = wsum[a:b] > 1e-3
    out[ok] = acc[a:b][ok] / wsum[a:b][ok, None]
    # Tiny crossfades at the very edges as a safety net (the shift is zero
    # there, so both signals are already the same).
    nf = min(int(fade * sr), (b - a) // 2)
    w = np.ones(b - a)
    w[:nf] = np.linspace(0, 1, nf)
    w[b - a - nf:] = np.linspace(1, 0, nf)
    return a, b, orig * (1 - w[:, None]) + out * w[:, None]
