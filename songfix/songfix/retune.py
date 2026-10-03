"""Find and smooth the artifacts a too-fast auto-tune leaves in a vocal.

Three things make hard-tuned vocals sound "weird" even when every note is in tune:

- warble: a held note that sits near the boundary between two notes makes the auto-tune flip
  between them several times a second (a robotic flutter)
- snaps: in a smooth sung line, the pitch jumps from one note to the next in a frame or two
  (under ~25 ms) where a voice glides over 50-150 ms
- chatter: on raspy or breathy notes the auto-tune can't lock on and the pitch jitters 25-90 cents
  from one 12 ms frame to the next, which sounds crackly or "distorted"

`find` lists both from a pitch track; `smoothing_curve` returns the per-frame pitch shift
(semitones) that holds a warbling note on its main pitch and turns each snap into a short,
natural glide. Everything else stays at zero shift.
"""
import numpy as np


def _runs(voiced):
    """(start, end) index pairs of continuous voiced stretches."""
    v = np.concatenate([[False], voiced, [False]]).astype(int)
    d = np.diff(v)
    return list(zip(np.flatnonzero(d == 1), np.flatnonzero(d == -1)))


def fill_gaps(midi, voiced, max_gap=2):
    """Bridge 1-2 frame dropouts inside a sung line (the tracker often loses the pitch for a frame right
    at a hard jump) by interpolating the pitch across them. Returns (midi, voiced)."""
    ok = voiced & np.isfinite(midi)
    m, v = midi.copy(), ok.copy()
    idx = np.flatnonzero(ok)
    for i, j in zip(idx, idx[1:]):
        if 1 < j - i <= max_gap + 1:
            m[i + 1:j] = np.interp(np.arange(i + 1, j), [i, j], [midi[i], midi[j]])
            v[i + 1:j] = True
    return m, v


def _segments(q):
    """Split a run of rounded note numbers into (start, end, note) segments."""
    out, s = [], 0
    for i in range(1, len(q) + 1):
        if i == len(q) or q[i] != q[s]:
            out.append((s, i, int(q[s])))
            s = i
    return out


def find(times, midi, voiced, hop_t, max_dwell=0.10, snap_frames=2, min_hold=0.10):
    """Return {"warble": [(t0, t1, main_note, other_note)], "snaps": [(t, from_note, to_note)]}.

    midi must be relative to the song's tuning, so whole numbers are the notes of the beat."""
    warble, snaps = [], []
    midi, voiced = fill_gaps(midi, voiced)
    for a, b in _runs(voiced):
        if (b - a) * hop_t < 0.15:
            continue
        m = midi[a:b]
        segs = _segments(np.round(m))
        # Warble: A-B-A(-B) where the in-between visits are short and the notes are neighbours.
        i = 0
        while i < len(segs) - 2:
            j = i
            while (j + 2 < len(segs) and segs[j + 2][2] == segs[j][2] and abs(segs[j + 1][2] - segs[j][2]) <= 2
                   and (segs[j + 1][1] - segs[j + 1][0]) * hop_t <= max_dwell):
                j += 2
            if j > i:
                notes = [s[2] for s in segs[i:j + 1]]
                dur = {n: sum(s[1] - s[0] for s in segs[i:j + 1] if s[2] == n) for n in set(notes)}
                main = max(dur, key=dur.get)
                other = [n for n in dur if n != main][0]
                warble.append((float(times[a + segs[i][0]]), float(times[a + segs[j][1] - 1]), main, other))
                i = j + 1
            else:
                i += 1
        # Snaps: two held notes where the pitch gets from 20% to 80% of the way across in at most
        # snap_frames frames (~25 ms); a sung change-over takes 50-150 ms.
        held = [sg for sg in segs if (sg[1] - sg[0]) * hop_t >= min_hold]
        for (s0, e0, n0), (s1, e1, n1) in zip(held, held[1:]):
            if n0 == n1 or s1 - e0 > 8:
                continue
            before, after = np.median(m[max(s0, e0 - 6):e0]), np.median(m[s1:min(e1, s1 + 6)])
            jump = after - before
            if abs(jump) < 0.8:
                continue
            lo, hi = max(e0 - 6, s0), min(s1 + 6, e1)
            frac = (m[lo:hi] - before) / jump
            i20 = lo + int(np.argmax(frac >= 0.2))
            i80 = lo + int(np.argmax(frac >= 0.8))
            if 0 <= i80 - i20 <= snap_frames:
                snaps.append((float(times[a + (i20 + i80) // 2]), n0, n1))
    return {"warble": warble, "snaps": snaps}


def chatter_share(midi, voiced):
    """Share of voiced frames whose pitch jumps 25-90 cents from the previous frame (jitter, not note changes)."""
    ok = voiced & np.isfinite(midi)
    both = ok[1:] & ok[:-1]
    d = np.abs(np.diff(midi))
    return float(np.mean((d[both] > 0.25) & (d[both] < 0.9))) if both.any() else 0.0


def smoothing_curve(times, midi, voiced, events, hop_t, glide=0.10, edge=0.015):
    """Per-frame shift (semitones) that removes warble flips and turns snaps into glides.

    Warble: frames that flipped to the other note are moved back to where the main note sits. Snap: the step is replaced by a smoothstep glide asked to last `glide`
    seconds, centred on the jump (PSOLA works in whole voice cycles, so it comes out at about 50-60 ms). Edges are feathered over `edge` seconds so nothing clicks."""
    curve = np.zeros(len(times))
    midi, voiced = fill_gaps(midi, voiced)
    rnd = np.round(midi)
    # Chatter on raspy notes is measured but not "steadied": the readings there are mostly noise, and
    # shifting by them made the pitch flicker after rendering (Beggin 1:42.9: steady +17 -> +7/+27/+7...).
    for t0, t1, main, other in events["warble"]:
        span = (times >= t0) & (times <= t1) & voiced
        sel = span & (rnd == other)
        held = span & (rnd == main)
        # Move each flicked frame back to where the held note actually sits - by however far it really
        # jumped. A fixed semitone overshoots a partial flick (Beggin 1:29.7: +65 cents became -35).
        home = main + (np.median(midi[held] - main) if held.any() else 0.0)
        curve[sel] = home - midi[sel]
    half = int(round(glide / 2 / hop_t))
    for t, n0, n1 in events["snaps"]:
        k = int(np.argmin(np.abs(times - t)))
        a, b = max(k - half, 0), min(k + half, len(times))
        if not voiced[a:b].all() or not np.isfinite(midi[a:b]).all():
            continue
        before = np.median(midi[max(a - 4, 0):a + 1])
        after = np.median(midi[b - 1:min(b + 4, len(midi))])
        u = (np.arange(a, b) - a + 0.5) / (b - a)
        want = before + (after - before) * (u * u * (3 - 2 * u))  # smoothstep glide
        # The glide replaces only the step itself; the small wobble around each note is kept.
        step = np.where(np.arange(a, b) < k, before, after)
        curve[a:b] = want - step
    w = max(1, int(round(edge / hop_t)))
    if w > 1:
        curve = np.convolve(curve, np.ones(w) / w, mode="same")
    return curve


def smooth_vocal(vocals, sr, tuning_cents=0.0, log=print):
    """Find warble and snaps in a vocal stem and smooth them. Returns (vocal, info).

    Every changed spot is re-measured; if a spot did not get cleaner the original is kept there."""
    from . import tune
    hop_t = tune.HOP / tune.ANALYSIS_SR
    times, midi, voiced = tune.track_pitch(vocals.mean(axis=1), sr)
    rel = midi - tuning_cents / 100
    ev = find(times, rel, voiced, hop_t)
    ev["warble"] = [w for w in ev["warble"] if w[1] - w[0] >= 0.03]  # 1-2 frame blips are tracker noise
    chat = chatter_share(rel, voiced)
    info = {"warble_found": len(ev["warble"]), "snaps_found": len(ev["snaps"]), "chatter_pct": round(chat * 100, 1)}
    if not ev["warble"] and not ev["snaps"] and chat < 0.01:
        return vocals, info
    curve = smoothing_curve(times, rel, voiced, ev, hop_t)
    # Render wherever the curve moves anything (flips, glides and chatter alike).
    moving = np.abs(curve) > 1e-3
    spots = [{"status": "corrected", "t0": float(times[a]), "t1": float(times[b - 1])} for a, b in _runs(moving)]
    # Render with the bridged pitch so a glide can be drawn straight through a 1-frame tracker dropout.
    mf, vf = fill_gaps(midi, voiced)
    out = tune._render(vocals, spots, times, mf, vf, curve, sr)
    # Re-measure every flip spot: if one ended up further from its held note than before, put that spot
    # back exactly as it was and render again without it.
    t2, m2, v2 = tune.track_pitch(out.mean(axis=1), sr)
    r2 = m2 - tuning_cents / 100
    rnd = np.round(rel)
    bad = []
    for t0, t1, main, other in ev["warble"]:
        span = (times >= t0) & (times <= t1) & voiced & np.isfinite(rel)
        held = span & (rnd == main)
        home = main + (np.median(rel[held] - main) if held.any() else 0.0)
        span2 = span[:len(r2)] & v2[:len(span)] & np.isfinite(r2[:len(span)])
        if span.any() and span2.any():
            if np.median(np.abs(r2[:len(span)][span2] - home)) > np.median(np.abs(rel[span] - home)) + 0.02:
                bad.append((t0, t1))
    if bad:
        for t0, t1 in bad:
            curve[(times >= t0 - 0.05) & (times <= t1 + 0.05)] = 0.0
        moving = np.abs(curve) > 1e-3
        spots = [{"status": "corrected", "t0": float(times[a]), "t1": float(times[b - 1])} for a, b in _runs(moving)]
        out = tune._render(vocals, spots, times, mf, vf, curve, sr) if spots else vocals
        t2, m2, v2 = tune.track_pitch(out.mean(axis=1), sr)
        info["flip_spots_put_back"] = len(bad)
    # Keep the change only if there is less warble/snapping than before.
    ev2 = find(t2, m2 - tuning_cents / 100, v2, hop_t)
    ev2["warble"] = [w for w in ev2["warble"] if w[1] - w[0] >= 0.03]
    chat2 = chatter_share(m2 - tuning_cents / 100, v2)
    info.update({"warble_after": len(ev2["warble"]), "snaps_after": len(ev2["snaps"]),
                 "chatter_after_pct": round(chat2 * 100, 1)})
    # 0.3 points of chatter is within the tracker's noise; more than that means the render got rougher.
    worse = (len(ev2["warble"]) + len(ev2["snaps"]) > len(ev["warble"]) + len(ev["snaps"])) or chat2 > chat + 0.003
    better = (len(ev2["warble"]) + len(ev2["snaps"]) < len(ev["warble"]) + len(ev["snaps"])) or chat2 < chat - 0.003
    if worse or not better:
        info["kept_original"] = True
        return vocals, info
    log(f"  smoothed the auto-tune: note flips {len(ev['warble'])} -> {len(ev2['warble'])}, "
        f"instant jumps {len(ev['snaps'])} -> {len(ev2['snaps'])}, chatter {chat:.1%} -> {chat2:.1%}")
    return out, info


def shift_all(vocals, sr, cents, fade=0.1):
    """Move the whole vocal by `cents` (PSOLA, timing unchanged): a vocal auto-tuned to A=440 over a
    beat pitched 15 cents sharp is re-pitched in one piece, so short notes and slides move with it."""
    from . import tune
    times, midi, voiced = tune.track_pitch(vocals.mean(axis=1), sr)
    mf, vf = fill_gaps(midi, voiced)
    curve = np.full(len(times), cents / 100.0)
    n = max(1, int(fade / (tune.HOP / tune.ANALYSIS_SR)))
    curve[:n] *= np.linspace(0, 1, n)
    curve[-n:] *= np.linspace(1, 0, n)
    whole = [{"status": "corrected", "t0": float(times[0]) + 0.12, "t1": float(times[-1]) - 0.6}]
    return tune._render(vocals, whole, times, mf, vf, curve, sr)
