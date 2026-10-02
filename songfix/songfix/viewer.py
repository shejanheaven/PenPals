"""Before/after listening page: waveform A/B, a pitch chart for every fixed note, mastering readout."""
import json
import shutil
from collections import Counter
from pathlib import Path

import librosa
import numpy as np

from . import audio_io
from .analysis import relative_key

TEMPLATE = Path(__file__).with_name("viewer.html")
PAD = 0.35  # seconds of context shown either side of a fixed note


def _peaks(x, n=800):
    a = np.abs(x).max(axis=1)
    edges = np.linspace(0, len(a), n + 1).astype(int)
    return [round(float(a[s:e].max()), 3) if e > s else 0.0 for s, e in zip(edges[:-1], edges[1:])]


def _note_card(n, track):
    t = np.asarray(track["t"])
    midi = np.array([np.nan if m is None else m for m in track["midi"]])
    shift = np.asarray(track["shift"])
    w0, w1 = n["t0"] - PAD, n["t1"] + PAD
    sel = np.flatnonzero((t >= w0) & (t <= w1))
    before = (midi[sel] - n["target"]) * 100
    after = before + shift[sel] * 100
    pts = lambda c: [[round(float(tt - w0), 3), None if not np.isfinite(v) else round(float(v), 1)]
                     for tt, v in zip(t[sel], c)]
    inside = (t[sel] >= n["t0"]) & (t[sel] <= n["t1"]) & np.isfinite(after)
    after_off = int(round(float(np.median(after[inside])))) if inside.any() else 0
    return {"t0": n["t0"], "t1": n["t1"], "note": librosa.midi_to_note(int(n["target"]), unicode=False),
            "off": int(round(n["off_cents"])), "shift": int(round(n["shift"] * 100)),
            "before": pts(before), "after": pts(after), "win": [round(w0, 3), round(w1, 3)],
            "after_off": after_off}


def write_page(report, out_dir, mix, final, vocals=None, tuned=None, final_mp3=None, sr=audio_io.SR):
    """Write index.html plus the four MP3s it plays into out_dir; return the page path."""
    out_dir = Path(out_dir)
    track = report.get("pitch_track")
    fixed = [n for n in report.get("notes", []) if n["status"] == "corrected"]
    tuned_run = track is not None and tuned is not None
    data = {
        "song": Path(report["song"]).stem,
        "duration": len(final) / sr,
        "before": report["before"], "after": report["after"],
        "key": report.get("key"),
        "relative_key": relative_key(report["key"]) if report.get("key") not in (None, "chromatic") else "",
        "key_close": report.get("key_close"),
        "tuned": tuned_run, "mastered": "mastering" in report,
        "ceiling": report["settings"]["ceiling"],
        "counts": dict(Counter(n["status"] for n in report.get("notes", []))),
        "notes": [_note_card(n, track) for n in fixed] if tuned_run else [],
        "peaks": _peaks(final), "peaks_before": _peaks(mix),
        "lufs_gain_db": round(report["after"]["lufs"] - report["before"]["lufs"], 2),
    }
    if "mastering" in report:
        data["eq"] = report["mastering"]["eq"]
        data["glue"] = report["mastering"].get("glue_gr_db", 0.0)

    audio_io.save_mp3(out_dir / "before.mp3", mix)
    if final_mp3 and Path(final_mp3).exists():
        shutil.copyfile(final_mp3, out_dir / "after.mp3")
    else:
        audio_io.save_mp3(out_dir / "after.mp3", final)
    if tuned_run:
        audio_io.save_mp3(out_dir / "vocal_before.mp3", vocals, bitrate="192k")
        audio_io.save_mp3(out_dir / "vocal_after.mp3", tuned, bitrate="192k")

    html = TEMPLATE.read_text(encoding="utf-8")
    # "</" inside a JSON string would end the <script> block early.
    blob = json.dumps(data, separators=(",", ":")).replace("</", "<\\/")
    html = html.replace("__SONGFIX_TITLE__", data["song"].replace("&", "&amp;").replace("<", "&lt;"))
    html = html.replace("__SONGFIX_DATA__", blob)
    page = out_dir / "index.html"
    page.write_text(html, encoding="utf-8")
    return page
