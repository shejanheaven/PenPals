"""Note-based pitch correction for a vocal stem.

Instead of hard "robot" auto-tune, every sung note is detected and the whole
note is moved so its centre lands on the nearest note of the song's key.
Vibrato, slides and expression inside the note are kept. Notes that are
already in tune (within --min-cents) are left completely untouched.
"""
import numpy as np
import librosa
from scipy.ndimage import median_filter, uniform_filter1d

from .psola import shift_region

NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"]
SCALES = {
    "major": [0, 2, 4, 5, 7, 9, 11],
    "minor": [0, 2, 3, 5, 7, 8, 10],
    "chromatic": list(range(12)),
}
ANALYSIS_SR = 22050
HOP = 256


def parse_key(key):
    """'C minor', 'F# major', 'Am', 'chromatic' -> (tonic_pc, scale_name)."""
    k = key.strip().replace("♯", "#").replace("♭", "b")
    if k.lower() == "chromatic":
        return 0, "chromatic"
    flats = {"Db": "C#", "Eb": "D#", "Gb": "F#", "Ab": "G#", "Bb": "A#"}
    parts = k.split()
    root = parts[0]
    mode = parts[1].lower() if len(parts) > 1 else "major"
    if len(parts) == 1 and root.endswith("m") and len(root) > 1:
        root, mode = root[:-1], "minor"
    root = root[0].upper() + root[1:]
    root = flats.get(root, root)
    if root not in NOTE_NAMES or mode not in ("major", "minor"):
        raise ValueError(f"Could not understand key '{key}'. Try e.g. 'C major', 'A minor', 'F#m'.")
    return NOTE_NAMES.index(root), mode


def track_pitch(vocal_mono, sr):
    """Return (times, midi, voiced) at HOP/ANALYSIS_SR resolution."""
    y = librosa.resample(vocal_mono, orig_sr=sr, target_sr=ANALYSIS_SR)
    f0, voiced, _ = librosa.pyin(y, fmin=65, fmax=1100, sr=ANALYSIS_SR,
                                 frame_length=1024, hop_length=HOP)
    times = librosa.frames_to_time(np.arange(len(f0)), sr=ANALYSIS_SR, hop_length=HOP)
    # pYIN works on a 10-cent grid; refine with plain YIN (continuous, parabolic
    # interpolation) wherever the two agree, keeping pYIN's robust voicing.
    f0_yin = librosa.yin(y, fmin=65, fmax=1100, sr=ANALYSIS_SR, frame_length=1024,
                         hop_length=HOP)[:len(f0)]
    f0_seed = np.where(voiced & np.isfinite(f0), f0, 0.0)
    ratio = np.divide(f0_yin, f0_seed, out=np.ones_like(f0_seed), where=f0_seed > 0)
    good = (f0_seed > 0) & (np.abs(12 * np.log2(np.maximum(ratio, 1e-6))) < 0.3)
    f0_out = np.where(good, f0_yin, f0_seed)
    voiced = f0_out > 0
    midi = np.full(len(f0_out), np.nan)
    midi[voiced] = librosa.hz_to_midi(f0_out[voiced])
    return times, midi, voiced


def find_notes(times, midi, voiced, min_dur=0.08, split_jump=0.6):
    """Split voiced pitch into note segments. Returns list of dicts."""
    hop_t = times[1] - times[0]
    smooth = midi.copy()
    smooth[voiced] = median_filter(midi[voiced], size=5)
    notes = []
    n = len(midi)
    i = 0
    while i < n:
        if not voiced[i]:
            i += 1
            continue
        j = i
        while j + 1 < n and voiced[j + 1] and abs(smooth[j + 1] - smooth[j]) < split_jump:
            j += 1
        dur = (j - i + 1) * hop_t
        if dur >= min_dur:
            seg = midi[i:j + 1]
            k = len(seg)
            a, b = int(k * 0.2), max(int(k * 0.8), int(k * 0.2) + 1)
            core = seg[a:b]
            q = max(1, k // 4)
            # Remove the straight-line drift so vibrato counts as "wobble"
            # while a real slide shows up as "trend".
            x = np.arange(len(core))
            detrended = core - np.polyval(np.polyfit(x, core, 1), x) if len(core) > 2 else core
            notes.append({
                "start": i, "end": j + 1,
                "t0": float(times[i]), "t1": float(times[j] + hop_t),
                "center": float(np.median(core)),
                "wobble": float(np.std(detrended)),
                "trend": float(np.median(seg[-q:]) - np.median(seg[:q])),
            })
        i = j + 1
    return notes


def nearest_scale_note(m, tonic, scale):
    allowed = [(tonic + s) % 12 for s in SCALES[scale]]
    base = int(np.floor(m)) - 13
    cands = [p for p in range(base, base + 27) if p % 12 in allowed]
    return min(cands, key=lambda p: abs(p - m))


SMOOTH_S = 0.2      # longer than one vibrato cycle (4.5-7 Hz), so vibrato survives drift correction
DRIFT_HOLD_S = 0.08  # a drift must stay off for this long to count


def despike(seg, size=9, max_jump=0.4):
    """Replace single-frame pitch-tracker spikes (consonants, breaths) with the running median.

    Without this the drift correction would smear a 100-cent glitch across 0.2 s
    and pull the in-tune frames around it off pitch."""
    if len(seg) < 3:
        return seg
    med = median_filter(seg, size=min(size, len(seg) - (len(seg) + 1) % 2), mode="nearest")
    return np.where(np.abs(seg - med) < max_jump, seg, med)


def _ramp(n, hop_t, attack=0.12, release=0.04):
    """0..1 weight across a note: the scoop into it and the fall-off at its end stay as sung."""
    w = np.ones(n)
    a, r = min(n // 4, int(attack / hop_t)), min(n // 6, int(release / hop_t))
    if a:
        w[:a] = np.linspace(0, 1, a, endpoint=False)
    if r:
        w[n - r:] = np.linspace(1, 0, r)
    return w


def plan_corrections(notes, tonic, scale, min_cents=10, strength=1.0, midi=None, hop_t=HOP / ANALYSIS_SR,
                     min_dur=0.15, short_max_cents=35, max_cents=45, max_wobble=0.45, max_trend=0.6):
    """Decide a per-frame shift (in semitones) for each note.

    A held note gets two corrections: its overall offset (the whole note is
    moved, as before) and its drift - the slow sag or creep of pitch inside
    the note, measured on a curve smoothed over 0.2 s so vibrato is kept.
    Short notes (80-150 ms) are moved only when they are clearly steady.
    Slides, runs and notes halfway between two scale notes are left as sung.
    """
    plan = []
    for nt in notes:
        target = nearest_scale_note(nt["center"], tonic, scale)
        off_cents = 100 * (nt["center"] - target)
        dur = nt["t1"] - nt["t0"]
        n = nt["end"] - nt["start"]
        frames = None
        worst = off_cents
        if dur < min_dur:
            steady = nt["wobble"] < 0.15 and abs(nt["trend"]) < 0.35
            if abs(off_cents) < min_cents:
                status = "in tune"
            elif steady and abs(off_cents) <= short_max_cents:
                frames, status = np.full(n, -off_cents / 100), "corrected"
            else:
                status = "too short (left natural)"
        elif abs(nt["trend"]) > max_trend or nt["wobble"] > max_wobble:
            status = "slide/run (left natural)"
        elif abs(off_cents) > max_cents and not (dur >= 0.3 and nt["wobble"] < 0.2 and abs(off_cents) <= 65):
            status = "between notes (left natural)"
        else:
            drift = np.zeros(n)
            if midi is not None:
                seg = despike(midi[nt["start"]:nt["end"]])
                dev = 100 * (uniform_filter1d(seg, size=min(n, max(3, int(SMOOTH_S / hop_t) | 1)), mode="nearest")
                             - target)
                w = _ramp(n, hop_t)
                drift = (dev - off_cents) * w
                sustain = w > 0.5
                err = np.abs(off_cents + drift)
                if sustain.any():
                    k = np.flatnonzero(sustain)[np.argmax(err[sustain])]
                    worst = off_cents + drift[k]
                drifting = np.sum(sustain & (err >= min_cents + 5)) * hop_t >= DRIFT_HOLD_S
                if sustain.any() and err[sustain].max() > max_cents:
                    # Moving that far inside one note is a bend or a tracking glitch, not a sour note.
                    drift, drifting, worst = np.zeros(n), False, off_cents
            else:
                drifting = False
            if abs(off_cents) >= min_cents or drifting:
                frames, status = -(off_cents + drift) / 100, "corrected"
            else:
                status = "in tune"
        shift = 0.0
        if frames is not None:
            frames = frames * strength
            shift = float(np.mean(frames))
        plan.append({**nt, "target": int(target), "off_cents": float(off_cents), "worst_cents": float(worst),
                     "shift": shift, "frames": frames, "status": status})
    # Two touching notes pulled in opposite directions means the singer was
    # sliding between them - correcting both would exaggerate the jump.
    for a, b in zip(plan, plan[1:]):
        touching = b["t0"] - a["t1"] < 0.05
        if (touching and a["shift"] * b["shift"] < 0 and abs(a["shift"] - b["shift"]) > 0.15
                and abs(a["center"] - b["center"]) < 1.2):
            for p in (a, b):
                p["shift"], p["frames"], p["status"] = 0.0, None, "slide/run (left natural)"
    return plan


def shift_curve(plan, n_frames, hop_t, glide=0.03, bridge=0.15):
    """Per-frame shift (semitones): follows each corrected note, smooth in between."""
    curve = np.zeros(n_frames)
    active = np.zeros(n_frames, dtype=bool)
    for p in plan:
        if p["frames"] is not None:
            curve[p["start"]:p["end"]] = p["frames"]
            active[p["start"]:p["end"]] = True
    # Hold the shift across short gaps between two corrected notes so the
    # consonant/transition between them moves together with them.
    idx = np.flatnonzero(active)
    if len(idx) > 1:
        gaps = np.flatnonzero(np.diff(idx) > 1)
        for g in gaps:
            a, b = idx[g], idx[g + 1]
            if (b - a) * hop_t <= bridge:
                curve[a + 1:b] = np.linspace(curve[a], curve[b], b - a + 1)[1:-1]
                active[a + 1:b] = True
    w = max(1, int(round(glide / hop_t)))
    return uniform_filter1d(curve, size=w, mode="nearest")


def correct_vocals(vocals, sr, key, min_cents=10, strength=1.0, track=None, log=print):
    """Pitch-correct a stereo vocal stem (n, 2). Returns (tuned, plan, track)."""
    mono = vocals.mean(axis=1)
    if track is None:
        times, midi, voiced = track_pitch(mono, sr)
    else:
        times, midi, voiced = track["times"], track["midi"], track["voiced"]
    tonic, scale = parse_key(key)
    notes = find_notes(times, midi, voiced)
    plan = plan_corrections(notes, tonic, scale, min_cents=min_cents, strength=strength, midi=midi)
    hop_t = HOP / ANALYSIS_SR
    curve = shift_curve(plan, len(times), hop_t)
    track = {"times": times, "midi": midi, "voiced": voiced, "curve": curve}
    n_fixed = sum(1 for p in plan if p["status"] == "corrected")
    if n_fixed == 0:
        log("  every sung note is already in tune - vocal left untouched")
        return vocals.copy(), plan, track

    tuned = _render(vocals, plan, times, midi, voiced, curve, sr)

    # Second pass: re-measure the notes just fixed and touch up any that PSOLA
    # left a few cents short. Only notes the first pass corrected are eligible.
    t2, m2, v2 = track_pitch(tuned.mean(axis=1), sr)
    first = [(p["t0"], p["t1"]) for p in plan if p["status"] == "corrected"]
    plan2 = [p for p in plan_corrections(find_notes(t2, m2, v2), tonic, scale, min_cents=min(min_cents, 8),
                                         strength=strength, midi=m2)
             if p["status"] == "corrected" and any(p["t0"] < b and p["t1"] > a for a, b in first)]
    if plan2:
        curve2 = shift_curve(plan2, len(t2), hop_t)
        tuned = _render(tuned, plan2, t2, m2, v2, curve2, sr)
        track["curve"] = curve + curve2[:len(curve)]
    log(f"  corrected {n_fixed} of {len(plan)} sung notes" + (f" ({len(plan2)} touched up in a second pass)"
                                                               if plan2 else ""))
    return tuned, plan, track


def _render(vocals, plan, times, midi, voiced, curve, sr):
    """PSOLA-render each corrected note (plus a little room either side so the
    pitch can glide in and settle back); everything else stays sample-for-sample
    identical to the input."""
    mono = vocals.mean(axis=1)
    t_samples = np.arange(len(mono)) / sr
    ratio = 2.0 ** (np.interp(t_samples, times, curve) / 12)
    f0_frames = np.where(voiced, librosa.midi_to_hz(np.nan_to_num(midi, nan=0.0)), 0.0)
    f0_samples = np.interp(t_samples, times, f0_frames)
    # Don't let interpolation smear voiced pitch into unvoiced gaps.
    f0_samples[np.interp(t_samples, times, voiced.astype(float)) < 0.5] = 0.0
    regions = []
    for p in plan:
        if p["status"] == "corrected":
            a, b = int((p["t0"] - 0.12) * sr), int((p["t1"] + 0.6) * sr)
            if regions and a <= regions[-1][1]:
                regions[-1][1] = b
            else:
                regions.append([a, b])
    tuned = vocals.copy()
    for a, b in regions:
        a, b, seg = shift_region(vocals, f0_samples, ratio, max(0, a), min(len(mono) - 1, b), sr)
        tuned[a:b] = seg
    return tuned
