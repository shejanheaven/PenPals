"""Do-no-harm guard: after all the pitch work, no note may come out worse than it went in.

Every step (flip smoothing, glides, the whole-vocal shift, note tuning) checks itself, but a later step
can undo an earlier one. This compares the finished vocal with the vocal before any pitch work, note by
note, and swaps any note that ended up further off its pitch or more flickery back to the original
take for just that note, with short crossfades so there is no seam.
"""
import numpy as np

from . import tune


def _note_stats(times, midi, voiced, t0, t1, target):
    p = {"t0": t0, "t1": t1, "target": target}
    return tune.note_error(times, midi, p, voiced), tune.note_flicker(times, midi, p, voiced)


def keep_no_worse(reference, processed, sr, tuning_cents=0.0, plan=None, fade=0.015, log=print):
    """Return (vocal, info): `processed`, with every note that got worse than in `reference` put back.

    reference: the vocal before any pitch work (after a whole-vocal shift, if one was made - that shift
    is the intended starting point). Both must be the same length.
    plan: the tuner's notes; every note it changed is checked with its own boundaries too, so a tuned note
    can't slip past because the guard split the take differently (Dont Giva 0:05.2)."""
    ref = tuning_cents / 100
    t0s, m0, v0 = tune.track_pitch(reference.mean(axis=1), sr, lowpass=True)
    t1s, m1, v1 = tune.track_pitch(processed.mean(axis=1), sr, lowpass=True)
    notes = [{"t0": nt["t0"], "t1": nt["t1"], "center": nt["center"]} for nt in tune.find_notes(t0s, m0 - ref, v0)]
    for p in plan or []:
        if p.get("status") == "corrected":
            notes.append({"t0": p["t0"], "t1": p["t1"], "center": float(p["target"]) + 0.0})
    out = processed.copy()
    n = len(out)
    nf = max(1, int(fade * sr))
    ramp = np.linspace(0.0, 1.0, nf)
    restored = []
    for nt in notes:
        if nt["t1"] - nt["t0"] < 0.1:
            continue
        target = int(round(nt["center"]))
        e0, f0 = _note_stats(t0s, m0 - ref, v0, nt["t0"], nt["t1"], target)
        e1, f1 = _note_stats(t1s, m1 - ref, v1, nt["t0"], nt["t1"], target)
        worse_pitch = e0 is not None and e1 is not None and e1 > e0 + 3 and e1 > 10
        worse_flicker = f0 is not None and f1 is not None and f1 > f0 + 4 and f1 > 8
        if not (worse_pitch or worse_flicker):
            continue
        a = max(0, int((nt["t0"] - 0.03) * sr))
        b = min(n, int((nt["t1"] + 0.03) * sr))
        if b - a <= 2 * nf:
            continue
        w = np.ones(b - a)
        w[:nf], w[-nf:] = ramp, ramp[::-1]  # 1 = original take, faded in and out
        out[a:b] = processed[a:b] * (1 - w[:, None]) + reference[a:b] * w[:, None]
        restored.append({"t": round(nt["t0"], 2), "span": [round(nt["t0"] - 0.03, 3), round(nt["t1"] + 0.03, 3)],
                         "pitch": [e0, e1], "flicker": [f0, f1]})
    if restored:
        log(f"  put {len(restored)} note(s) back to the original take because the processing made them worse")
    return out, {"notes_restored": len(restored), "where": [r["t"] for r in restored],
                 "spans": [r["span"] for r in restored]}
