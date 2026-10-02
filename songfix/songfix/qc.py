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
    fixed = [n for n in report.get("notes", []) if n["status"] == "corrected"]
    if not fixed or not (folder / "vocal_after.mp3").exists():
        return [], {"notes_checked": 0}
    v = audio_io.load(folder / "vocal_after.mp3").mean(axis=1)
    times, midi, voiced = tune.track_pitch(v, SR)
    worse, off = [], []
    for n in fixed:
        span = n["t1"] - n["t0"]
        sel = (times >= n["t0"] + 0.2 * span) & (times <= n["t0"] + 0.9 * span) & voiced
        if sel.sum() < 3:
            continue
        cents = 100 * (tune.despike(midi[sel]) - n["target"])
        cents = cents[np.abs(cents) < 60]  # frames of the neighbouring note at the edges of very short notes
        if len(cents) < 3:
            continue
        k = min(len(cents), 9)
        err = float(np.median(np.abs(np.convolve(cents, np.ones(k) / k, mode="valid"))))
        if err > abs(n["worst_cents"]) + 2:
            worse.append(f"{n['t0']:.1f}s")
        elif err > (12 if span >= 0.15 else 18):  # pitch of very short notes is both heard and measured more loosely
            off.append(f"{n['t0']:.1f}s ({err:.0f} cents)")
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

    # Clicks: anything sharper than the sharpest 0.001% of the original is suspicious.
    d2o, _ = _clicks(orig, 0)
    thr = max(float(np.percentile(d2o, 99.999)) * 1.5, 1.0)
    _, co = _clicks(orig, thr)
    _, cm = _clicks(out, thr)
    checks["clicks_original"], checks["clicks_master"] = co, cm
    if cm > 3 * co + 20:
        problems.append(f"{cm - co} new click-like spikes (original has {co})")

    # Tone: mastering EQ is capped at 2.5 dB; more than 4.5 dB of change anywhere means something went wrong.
    c, lo = band_spectrum(orig, SR)
    _, lm = band_spectrum(out, SR)
    band = (c >= 40) & (c <= 14000)
    diff = (lm - np.mean(lm[band])) - (lo - np.mean(lo[band]))
    checks["max_tone_change_db"] = round(float(np.max(np.abs(diff[band]))), 2)
    if checks["max_tone_change_db"] > 4.5:
        f = c[band][np.argmax(np.abs(diff[band]))]
        problems.append(f"tone changed {checks['max_tone_change_db']} dB around {f:.0f} Hz")

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
