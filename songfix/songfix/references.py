"""Reference library: put finished pro songs you love in songfix/references/.

Each master is matched to the few references whose tonal balance is closest
to the song, so a rap song gets matched to rap references and a ballad to
ballads, whatever mix of genres the folder holds.
"""
import json
from pathlib import Path

import numpy as np
import pyloudnorm as pyln

from . import audio_io
from .audio_io import SR
from .master import band_spectrum

REF_DIR = Path(__file__).resolve().parent.parent / "references"
AUDIO_EXT = {".wav", ".mp3", ".flac", ".m4a", ".aac", ".ogg", ".aif", ".aiff", ".opus"}
CACHE_NAME = ".songfix-cache.json"


def _shape(centers, levels):
    """Tonal balance with the overall level removed, so only the shape is compared."""
    band = (centers >= 40) & (centers <= 14000)
    return levels - np.mean(levels[band])


def library(ref_dir=REF_DIR, log=print):
    """Profiles of every song in ref_dir, cached so each one is only analysed once."""
    ref_dir = Path(ref_dir)
    files = sorted(p for p in ref_dir.glob("*") if p.suffix.lower() in AUDIO_EXT) if ref_dir.is_dir() else []
    if not files:
        return []
    cache_path = ref_dir / CACHE_NAME
    try:
        cache = json.loads(cache_path.read_text())
    except (OSError, ValueError):
        cache = {}
    meter, out, changed = pyln.Meter(SR), [], False
    for f in files:
        st = f.stat()
        key = f"{f.name}|{st.st_size}|{int(st.st_mtime)}"
        if key not in cache:
            log(f"  learning reference: {f.name}")
            x = audio_io.load(f)
            centers, levels = band_spectrum(x, SR)
            cache[key] = {"name": f.name, "centers": centers.tolist(), "levels": levels.tolist(),
                          "lufs": round(float(meter.integrated_loudness(x)), 2)}
            changed = True
        out.append(cache[key])
    if changed:
        live = {k: v for k, v in cache.items() if any(k.startswith(f.name + "|") for f in files)}
        try:
            cache_path.write_text(json.dumps(live))
        except OSError:
            pass
    return out


def pick(x, sr, refs, n=3):
    """Average the n references closest in tonal balance to x.

    Returns {"names", "curve": (centers, levels), "lufs"} or None when refs is empty."""
    if not refs:
        return None
    centers, lvl = band_spectrum(x, sr)
    band = (centers >= 40) & (centers <= 14000)
    song = _shape(centers, lvl)
    scored = []
    for r in refs:
        rl = np.interp(np.log2(centers), np.log2(r["centers"]), r["levels"])
        shape = _shape(centers, rl)
        scored.append((float(np.sqrt(np.mean((shape - song)[band] ** 2))), shape, r))
    scored.sort(key=lambda s: s[0])
    best = scored[:n]
    return {"names": [r["name"] for _, _, r in best],
            "curve": (centers, np.mean([s for _, s, _ in best], axis=0)),
            "lufs": float(np.median([r["lufs"] for _, _, r in best]))}
