"""Note-based pitch correction for a vocal stem.

Instead of hard "robot" auto-tune, every sung note is detected and the whole
note is moved so its centre lands on the nearest note of the song's key.
Vibrato, slides and expression inside the note are kept. Notes that are
already in tune (within --min-cents) are left completely untouched.
"""
import numpy as np
import librosa
from scipy.ndimage import median_filter, uniform_filter1d
from scipy import signal

from .psola import shift_region

NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"]
SCALES = {
    "major": [0, 2, 4, 5, 7, 9, 11],
    "minor": [0, 2, 3, 5, 7, 8, 10],
    "chromatic": list(range(12)),
}
ANALYSIS_SR = 22050
HOP = 256
_PITCH_LP = signal.butter(6, 4000, "lp", fs=ANALYSIS_SR, output="sos")


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


def track_pitch(vocal_mono, sr, lowpass=False):
    """Return (times, midi, voiced) at HOP/ANALYSIS_SR resolution.

    lowpass=True reads pitch from the voice below 4 kHz only, the range the ear judges pitch from. The
    guard and QC use it to judge flicker: hi-hat bleed in a separated vocal, "s" sounds and an air boost
    otherwise make the tracker flicker between readings (Dont Giva 0:05.2: 20 cents full-band, 10 below
    4 kHz). The tuner keeps the full band, which segments very short notes more reliably."""
    y = librosa.resample(vocal_mono, orig_sr=sr, target_sr=ANALYSIS_SR)
    if lowpass:
        y = signal.sosfiltfilt(_PITCH_LP, y)
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


def nearest_allowed(m, allowed):
    """Nearest MIDI note whose pitch class is allowed (bool[12])."""
    base = int(np.floor(m)) - 13
    cands = [p for p in range(base, base + 27) if allowed[p % 12]]
    return min(cands, key=lambda p: abs(p - m))


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
                     min_dur=0.15, short_max_cents=35, max_cents=45, max_wobble=0.45, max_trend=0.6,
                     allowed_at=None):
    """Decide a per-frame shift (in semitones) for each note.

    A held note gets two corrections: its overall offset (the whole note is
    moved, as before) and its drift - the slow sag or creep of pitch inside
    the note, measured on a curve smoothed over 0.2 s so vibrato is kept.
    Short notes (80-150 ms) are moved only when they are clearly steady.
    Slides, runs and notes halfway between two scale notes are left as sung.
    """
    plan = []
    for nt in notes:
        if allowed_at is not None:
            target = nearest_allowed(nt["center"], allowed_at((nt["t0"] + nt["t1"]) / 2))
        else:
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
    curve = uniform_filter1d(curve, size=w, mode="nearest")
    # The glide must not spill onto a sung note that was left alone (e.g. the
    # next note of a fast run): those stay at exactly zero shift.
    for p in plan:
        if p["frames"] is None:
            curve[p["start"]:p["end"]] = 0.0
    return curve


def correct_vocals(vocals, sr, key, min_cents=10, strength=1.0, track=None, tuning_cents=0.0, allowed_at=None,
                   log=print):
    """Pitch-correct a stereo vocal stem (n, 2). Returns (tuned, plan, track).

    tuning_cents: the song's reference pitch relative to A=440 (see analysis.estimate_tuning).
    Notes are judged against it, so a beat pitched 40 cents flat keeps its vocal 40 cents flat.
    Plan targets and the returned track["midi"] are relative to that reference.
    allowed_at: optional t -> bool[12] of in-key notes at that moment (analysis.scale_map); overrides `key`."""
    mono = vocals.mean(axis=1)
    if track is None:
        times, midi, voiced = track_pitch(mono, sr)
    else:
        times, midi, voiced = track["times"], track["midi"], track["voiced"]
    tonic, scale = parse_key(key)
    ref = tuning_cents / 100
    rel = midi - ref  # pitch relative to the song's own tuning
    notes = find_notes(times, rel, voiced)
    plan = plan_corrections(notes, tonic, scale, min_cents=min_cents, strength=strength, midi=rel,
                            allowed_at=allowed_at)
    _skip_harmonies(plan, mono, sr, tuning_cents)
    hop_t = HOP / ANALYSIS_SR
    curve = shift_curve(plan, len(times), hop_t)
    track = {"times": times, "midi": rel, "voiced": voiced, "curve": curve}
    n_fixed = sum(1 for p in plan if p["status"] == "corrected")
    if n_fixed == 0:
        log("  every sung note is already in tune - vocal left untouched")
        return vocals.copy(), plan, track

    # Render, re-measure, and put back any note that did not clearly improve.
    # Pitch-shifting a layered or heavily processed vocal can land off target;
    # a note that can't be fixed cleanly is left exactly as sung.
    for _ in range(3):
        tuned, track["curve"], n_touch = _two_pass(vocals, plan, times, midi, voiced, curve, tonic, scale,
                                                   min_cents, strength, sr, ref, allowed_at)
        failed = _verify(tuned, plan, times, rel, sr, ref)
        if not failed:
            break
        for p in failed:
            p["frames"], p["shift"], p["status"] = None, 0.0, "unclear pitch (left natural)"
        curve = shift_curve(plan, len(times), hop_t)
        if not any(p["status"] == "corrected" for p in plan):
            tuned, track["curve"], n_touch = vocals.copy(), curve, 0
            break
    else:
        # Still failing after three rounds: keep only what verified, render once more without them.
        for p in _verify(tuned, plan, times, rel, sr, ref):
            p["frames"], p["shift"], p["status"] = None, 0.0, "unclear pitch (left natural)"
        curve = shift_curve(plan, len(times), hop_t)
        tuned, track["curve"] = _render(vocals, plan, times, midi, voiced, curve, sr), curve
        n_touch = 0
    n_fixed = sum(1 for p in plan if p["status"] == "corrected")
    n_back = sum(1 for p in plan if p["status"] == "unclear pitch (left natural)")
    log(f"  corrected {n_fixed} of {len(plan)} sung notes"
        + (f" ({n_touch} touched up in a second pass)" if n_touch else "")
        + (f"; {n_back} put back as sung because they could not be fixed cleanly" if n_back else ""))
    return tuned, plan, track


def _skip_harmonies(plan, mono, sr, tuning_cents, ratio=0.6):
    """Leave notes alone where a second voice (a harmony or stacked double) is singing a different note.

    Shifting the stem would move the harmony with the lead and make the two clash. A second pitch
    class carrying more than `ratio` of the lead's chroma energy, other than the lead's own fifth
    (its strongest overtone), counts as another voice."""
    todo = [p for p in plan if p["status"] == "corrected"]
    if not todo:
        return
    y = librosa.resample(mono, orig_sr=sr, target_sr=ANALYSIS_SR)
    c = librosa.feature.chroma_cqt(y=y, sr=ANALYSIS_SR, hop_length=HOP, tuning=tuning_cents / 100)
    ct = librosa.frames_to_time(np.arange(c.shape[1]), sr=ANALYSIS_SR, hop_length=HOP)
    for p in todo:
        sel = (ct >= p["t0"]) & (ct <= p["t1"])
        if not sel.any():
            continue
        e = c[:, sel].mean(axis=1)
        lead = p["target"] % 12
        # An out-of-tune note also spills into the neighbouring half-steps; harmonies never sit there.
        own = {lead, (lead + 1) % 12, (lead - 1) % 12, (lead + 7) % 12}
        others = [e[k] for k in range(12) if k not in own]
        if max(others) > ratio * e[lead]:
            p["frames"], p["shift"], p["status"] = None, 0.0, "harmony / stacked voices (left natural)"


def _two_pass(vocals, plan, times, midi, voiced, curve, tonic, scale, min_cents, strength, sr, ref=0.0,
              allowed_at=None):
    """First pass, then re-measure the notes just fixed and touch up any PSOLA left a few cents short.

    Returns (tuned, total shift curve, number of notes touched up)."""
    hop_t = HOP / ANALYSIS_SR
    tuned = _render(vocals, plan, times, midi, voiced, curve, sr)
    t2, m2, v2 = track_pitch(tuned.mean(axis=1), sr)
    first = [(p["t0"], p["t1"]) for p in plan if p["status"] == "corrected"]
    full2 = plan_corrections(find_notes(t2, m2 - ref, v2), tonic, scale, min_cents=min(min_cents, 8),
                             strength=strength, midi=m2 - ref, allowed_at=allowed_at)
    for p in full2:
        if p["status"] == "corrected" and not any(p["t0"] < b and p["t1"] > a for a, b in first):
            p["frames"], p["shift"], p["status"] = None, 0.0, "left for pass one"
    plan2 = [p for p in full2 if p["status"] == "corrected"]
    if not plan2:
        return tuned, curve, 0
    curve2 = shift_curve(full2, len(t2), hop_t)
    return _render(tuned, plan2, t2, m2, v2, curve2, sr), curve + curve2[:len(curve)], len(plan2)


def note_error(times, midi, p, voiced=None):
    """Typical distance (cents) of a note from its target over its held middle, ignoring tracker spikes
    and frames that belong to the neighbouring note. None if there is too little to measure."""
    span = p["t1"] - p["t0"]
    sel = (times >= p["t0"] + 0.2 * span) & (times <= p["t0"] + 0.9 * span) & np.isfinite(midi)
    if voiced is not None:
        sel &= voiced
    if sel.sum() < 3:
        return None
    cents = 100 * (despike(midi[sel]) - p["target"])
    cents = cents[np.abs(cents) < 60]
    if len(cents) < 3:
        return None
    k = min(len(cents), 9)
    return float(np.median(np.abs(np.convolve(cents, np.ones(k) / k, mode="valid"))))


def note_flicker(times, midi, p, voiced=None):
    """Median frame-to-frame pitch jump (cents) over the held middle of a note: how much it flickers."""
    span = p["t1"] - p["t0"]
    sel = (times >= p["t0"] + 0.2 * span) & (times <= p["t0"] + 0.9 * span) & np.isfinite(midi)
    if voiced is not None:
        sel &= voiced
    seg = midi[sel]
    if len(seg) < 4:
        return None
    d = np.abs(np.diff(seg)) * 100
    d = d[d < 60]  # a jump to the neighbouring note is not flicker
    return float(np.median(d)) if len(d) else None


def _verify(tuned, plan, times, midi, sr, ref=0.0):
    """Corrected notes that did not end up clearly better: within 12 cents (18 for notes under
    0.15 s) and at least 2 cents closer than before."""
    t3, m3, v3 = track_pitch(tuned.mean(axis=1), sr)
    failed = []
    for p in plan:
        if p["status"] != "corrected":
            continue
        before = note_error(times, midi, p)
        after = note_error(t3, m3 - ref, p, v3)
        limit = 12 if p["t1"] - p["t0"] >= 0.15 else 18
        if after is None or after > limit or (before is not None and after > before - 2):
            failed.append(p)
            continue
        # The average can look fixed while the pitch flickers frame to frame (a warbly, buzzy note):
        # that is worse than leaving it as sung.
        fb, fa = note_flicker(times, midi, p), note_flicker(t3, m3 - ref, p, v3)
        if fb is not None and fa is not None and fa > fb + 4 and fa > 8:  # under 8 cents is inaudible
            failed.append(p)
    return failed


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
