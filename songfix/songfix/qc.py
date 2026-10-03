"""Quality check a finished songfix folder: catches anything technically wrong with the master.

    python -m songfix.qc "<song>_songfix folder" "<original song>"

Writes qc.json into the folder and returns {"pass": bool, "problems": [...], "checks": {...}}.
"""
import json
import sys
from pathlib import Path

import numpy as np
import pyloudnorm as pyln

from . import audio_io, tune
from .audio_io import SR
from .master import band_spectrum, correlation, true_peak


def _clicks(x, threshold):
    """Samples whose second difference (normalised by loudness) jumps past threshold."""
    m = x.mean(axis=1)
    d2 = np.abs(np.diff(m, 2)) / (np.sqrt(np.mean(m ** 2)) + 1e-12)
    return d2, int(np.sum(d2 > threshold))


def _retune_check(folder, report):
    """Re-measure every corrected note on the tuned vocal: it must end up closer to pitch, and within 12 cents
    (18 for notes shorter than 0.15 s)."""
    # Notes the do-no-harm guard put back are the original take, not fixes.
    spans = (report.get("guard") or {}).get("spans", [])
    fixed = [n for n in report.get("notes", []) if n["status"] == "corrected"
             and not any(a <= n["t0"] and n["t1"] <= b for a, b in spans)]
    if not fixed or not (folder / "vocal_after.mp3").exists():
        return [], {"notes_checked": 0}
    # Measure before and after the same way, from the two vocal files the page plays.
    tb, mb, vb = tune.track_pitch(audio_io.load(folder / "vocal_before.mp3").mean(axis=1), SR, lowpass=True)
    ta, ma, va = tune.track_pitch(audio_io.load(folder / "vocal_after.mp3").mean(axis=1), SR, lowpass=True)
    ref = report.get("tuning_cents", 0.0) / 100  # note targets are relative to the song's own tuning
    mb, ma = mb - ref, ma - ref
    worse, off = [], []
    for n in fixed:
        before, after = tune.note_error(tb, mb, n, vb), tune.note_error(ta, ma, n, va)
        if after is None:
            continue
        fb, fa = tune.note_flicker(tb, mb, n, vb), tune.note_flicker(ta, ma, n, va)
        if fb is not None and fa is not None and fa > fb + 4 and fa > 8:  # under 8 cents is inaudible
            worse.append(f"{n['t0']:.1f}s (pitch flickers {fb:.0f} -> {fa:.0f} cents frame to frame)")
            continue
        if before is not None and after > before + 2 and after > 10:  # under 10 cents is still in tune
            worse.append(f"{n['t0']:.1f}s ({before:.0f} -> {after:.0f} cents)")
        elif after > (12 if n["t1"] - n["t0"] >= 0.15 else 18):  # short notes are heard and measured more loosely
            off.append(f"{n['t0']:.1f}s ({after:.0f} cents)")
    problems = []
    if worse:
        problems.append(f"tuning made {len(worse)} note(s) worse: {', '.join(worse[:6])}")
    if off:
        problems.append(f"{len(off)} fixed note(s) still more than 12 cents off: {', '.join(off[:6])}")
    return problems, {"notes_checked": len(fixed), "made_worse": len(worse), "still_off": len(off)}


def check(folder, original):
    folder = Path(folder)
    report = json.loads((folder / "report.json").read_text())
    master_wav = next(p for p in folder.glob("*(songfix).wav"))
    orig, out = audio_io.load(original), audio_io.load(master_wav)
    meter = pyln.Meter(SR)
    ceiling = report["settings"]["ceiling"]
    target = report.get("mastering", {}).get("target_lufs")
    problems, checks = [], {}

    checks["length_diff_s"] = round(abs(len(out) - len(orig)) / SR, 3)
    if checks["length_diff_s"] > 0.05:
        problems.append(f"length changed by {checks['length_diff_s']} s")

    tp = 20 * np.log10(true_peak(out) + 1e-12)
    checks["true_peak_dbtp"] = round(float(tp), 2)
    checks["clipped_samples"] = int(np.sum(np.abs(out) >= 0.999))
    if tp > ceiling + 0.05 or checks["clipped_samples"]:
        problems.append(f"peaks over the ceiling ({tp:.2f} dBTP, {checks['clipped_samples']} clipped samples)")
    lufs = meter.integrated_loudness(out)
    checks["lufs"] = round(float(lufs), 2)
    if target is not None and abs(lufs - target) > 0.3:
        problems.append(f"loudness {lufs:.1f} LUFS misses the {target} target")
    checks["dc_offset"] = round(float(np.abs(out.mean(axis=0)).max()), 5)
    if checks["dc_offset"] > 0.002:
        problems.append("DC offset in the master")

    # Clicks: a spike sharper than the sharpest 0.001% of the original, with nothing nearly as sharp in the
    # original within 5 ms. A drum hit the EQ made a bit brighter is not a click.
    d2o, _ = _clicks(orig, 0)
    thr = max(float(np.percentile(d2o, 99.999)) * 1.5, 1.0)
    d2m, _ = _clicks(out, thr)
    w = int(0.005 * SR)
    from scipy.ndimage import maximum_filter1d
    near = maximum_filter1d(d2o, size=2 * w + 1)[:len(d2m)]
    cand = np.flatnonzero((d2m > thr) & (d2m > 2.5 * near))
    # A click is a lone jump of a few samples; a burst of sharp samples is a consonant ("t", "k", "ch") that
    # the vocal polish made audible, which is the point of making the vocal crisp.
    hot = (d2m > thr / 2).astype(np.int32)
    density = np.convolve(hot, np.ones(2 * w + 1, dtype=np.int32), mode="same")
    new = cand[density[cand] <= 3]
    times = sorted({round(i / SR, 1) for i in new})
    checks["new_clicks"] = len(times)
    if times:
        problems.append(f"{len(times)} click(s) not in the original: {', '.join(f'{t}s' for t in times[:6])}")

    # Tone: mastering EQ is capped at 2.5 dB; more than 4.5 dB of change anywhere means something went wrong.
    c, lo = band_spectrum(orig, SR)
    _, lm = band_spectrum(out, SR)
    band = (c >= 40) & (c <= 14000)
    diff = (lm - np.mean(lm[band])) - (lo - np.mean(lo[band]))
    checks["max_tone_change_db"] = round(float(np.max(np.abs(diff[band]))), 2)
    if checks["max_tone_change_db"] > 4.5:
        f = c[band][np.argmax(np.abs(diff[band]))]
        problems.append(f"tone changed {checks['max_tone_change_db']} dB around {f:.0f} Hz")
    # Duller than the original = lower quality to the ear (Burning). Compare the top end against the mids.
    top = (c >= 6000) & (c <= 14000)
    mids = (c >= 500) & (c <= 2000)
    checks["top_end_change_db"] = round(float(np.mean(diff[top]) - np.mean(diff[mids])), 2)
    if checks["top_end_change_db"] < -1.5:
        problems.append(f"duller than the original ({checks['top_end_change_db']} dB less top end)")
    loud_drop = report["before"]["lufs"] - checks["lufs"]
    if loud_drop > 0.3 and report["before"]["lufs"] <= -7.0:
        problems.append(f"quieter than the original by {loud_drop:.1f} dB")

    # Phone speakers and club systems play in mono.
    checks["stereo_correlation"] = round(correlation(out), 3)
    mono = meter.integrated_loudness(np.repeat(out.mean(axis=1, keepdims=True), 2, axis=1))
    checks["mono_loss_db"] = round(float(lufs - mono), 2)
    if checks["mono_loss_db"] > 2.0 or checks["stereo_correlation"] < 0.2:
        problems.append(f"loses {checks['mono_loss_db']} dB in mono (phase problem)")

    notes = report.get("notes", [])
    if notes:
        fixed = sum(n["status"] == "corrected" for n in notes)
        between = sum(n["status"] == "between notes (left natural)" for n in notes)
        checks["fixed_share"] = round(fixed / len(notes), 3)
        checks["between_share"] = round(between / len(notes), 3)
        if between / len(notes) > 0.08:
            problems.append(f"{between} notes sit between scale notes - the key ({report.get('key')}) may be wrong")
        if fixed / len(notes) > 0.25:
            problems.append(f"{fixed} of {len(notes)} notes corrected - unusually many, check the key ({report.get('key')})")
        if report.get("key_close"):
            checks["key_close"] = report["key_close"]
        if (folder / "vocal_after.mp3").exists():
            from .comfort import measure
            c = measure(audio_io.load(folder / "vocal_after.mp3"), SR)
            if c:
                checks["ear_comfort"] = c
                if c["sib_vs_vowel"] > -4.0:
                    problems.append(f"\"s\" sounds still sharp ({c['sib_vs_vowel']:+.1f} dB vs the vowels)")
                if c["harsh_vs_body"] > -3.5:
                    problems.append(f"vocal still harsh ({c['harsh_vs_body']:+.1f} dB of 2.5-5 kHz vs the body)")
        p, info = _retune_check(folder, report)
        problems += p
        checks.update(info)

    result = {"pass": not problems, "problems": problems, "checks": checks}
    (folder / "qc.json").write_text(json.dumps(result, indent=1))
    return result


if __name__ == "__main__":
    r = check(sys.argv[1], sys.argv[2])
    print("PASS" if r["pass"] else "PROBLEMS:\n  " + "\n  ".join(r["problems"]))
    print(json.dumps(r["checks"], indent=1))
