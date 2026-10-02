"""Before/after listening page: waveform A/B, a pitch chart for every fixed note, mastering readout."""
import functools
import http.server
import json
import os
import re
import shutil
import threading
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
    # Worst remaining error over the held part of the note, smoothed like the tuner sees it (vibrato averaged out).
    span = n["t1"] - n["t0"]
    inside = (t[sel] >= n["t0"] + 0.2 * span) & (t[sel] <= n["t0"] + 0.9 * span) & np.isfinite(after)
    held = after[inside]
    if len(held) >= 3:
        held = np.convolve(held, np.ones(min(len(held), 9)) / min(len(held), 9), mode="valid")
    after_off = int(round(float(held[np.argmax(np.abs(held))]))) if len(held) else 0
    return {"t0": n["t0"], "t1": n["t1"], "note": librosa.midi_to_note(int(n["target"]), unicode=False),
            "off": int(round(n.get("worst_cents", n["off_cents"]))), "shift": int(round(n["shift"] * 100)),
            "drift": abs(n.get("worst_cents", n["off_cents"]) - n["off_cents"]) >= 8,
            "before": pts(before), "after": pts(after), "win": [round(w0, 3), round(w1, 3)],
            "after_off": after_off}


def write_page(report, out_dir, mix, final, vocals=None, tuned=None, final_mp3=None, downloads=(),
               sr=audio_io.SR):
    """Write index.html plus the four MP3s it plays into out_dir; return the page path.

    downloads: file names in out_dir to offer as download buttons (the finished master)."""
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
        "downloads": [{"file": f, "label": Path(f).suffix.lstrip(".").upper()} for f in downloads],
    }
    if "mastering" in report:
        data["eq"] = report["mastering"]["eq"]
        data["steps"] = report["mastering"].get("steps", [])
        data["references"] = report["mastering"].get("references", [])

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


class _Slice:
    """File object that stops after `left` bytes, for HTTP range responses."""

    def __init__(self, f, left):
        self.f, self.left = f, left

    def read(self, n=-1):
        n = self.left if n < 0 else min(n, self.left)
        data = self.f.read(n)
        self.left -= len(data)
        return data

    def close(self):
        self.f.close()


class _Handler(http.server.SimpleHTTPRequestHandler):
    """Static files with byte ranges, which browsers need to seek inside audio."""

    def send_head(self):
        path = self.translate_path(self.path)
        m = re.fullmatch(r"bytes=(\d*)-(\d*)", (self.headers.get("Range") or "").strip())
        if not m or not os.path.isfile(path) or m.groups() == ("", ""):
            return super().send_head()
        size = os.path.getsize(path)
        a, b = m.groups()
        start, end = (size - int(b), size - 1) if a == "" else (int(a), min(int(b), size - 1) if b else size - 1)
        start = max(0, start)
        if start >= size or end < start:
            self.send_error(416)
            return None
        f = open(path, "rb")
        f.seek(start)
        self.send_response(206)
        self.send_header("Content-Type", self.guess_type(path))
        self.send_header("Content-Range", f"bytes {start}-{end}/{size}")
        self.send_header("Content-Length", str(end - start + 1))
        self.end_headers()
        return _Slice(f, end - start + 1)

    def end_headers(self):
        self.send_header("Accept-Ranges", "bytes")
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def log_message(self, *args):
        pass


def serve(out_dir):
    """Serve out_dir on a free localhost port in a background thread. Returns (server, url)."""
    handler = functools.partial(_Handler, directory=str(out_dir))
    server = http.server.ThreadingHTTPServer(("127.0.0.1", 0), handler)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    return server, f"http://127.0.0.1:{server.server_address[1]}/"
