"""Level finished masters to one loudness so an album plays evenly from track to track.

    .venv\\Scripts\\python album_level.py "<album folder with WAV/>" [-8.0]

Each WAV in <album>/WAV is replaced (not edited in place: hard links to the single-song masters are broken
first) by a copy at the target loudness: louder tracks are simply turned down; quieter ones are raised
through the same soft clipper + true-peak limiter as the mastering chain, so nothing clips. MP3s are
re-made from the levelled WAVs.
"""
import sys
from pathlib import Path

import numpy as np
import pyloudnorm as pyln

sys.path.insert(0, str(Path(__file__).resolve().parent))
from songfix import audio_io  # noqa: E402
from songfix.audio_io import SR  # noqa: E402
from songfix.master import limit, soft_clip, true_peak  # noqa: E402


def level(x, target, ceiling_dbtp=-1.0):
    meter = pyln.Meter(SR)
    ceiling = 10 ** (ceiling_dbtp / 20)
    g = target - meter.integrated_loudness(x)
    if g <= 0:
        return x * 10 ** (g / 20)
    for _ in range(5):
        y, _ = limit(soft_clip(x * 10 ** (g / 20), ceiling), SR, ceiling_dbtp - 0.1)
        err = target - meter.integrated_loudness(y)
        if abs(err) < 0.1:
            break
        g += err
    tp = true_peak(y)
    return y * (ceiling / tp) if tp > ceiling else y


def main(album, target=-8.0):
    album = Path(album)
    meter = pyln.Meter(SR)
    for wav in sorted((album / "WAV").glob("*.wav")):
        x = audio_io.load(wav)
        before = meter.integrated_loudness(x)
        y = level(x, target)
        wav.unlink()  # break the hard link so the single-song master is untouched
        audio_io.save_wav(wav, y)
        mp3 = album / "MP3" / (wav.stem + ".mp3")
        mp3.unlink(missing_ok=True)
        audio_io.save_mp3(mp3, y)
        print(f"{wav.stem:30s} {before:6.2f} -> {meter.integrated_loudness(y):6.2f} LUFS, "
              f"peak {20 * np.log10(true_peak(y)):5.2f} dBTP", flush=True)


if __name__ == "__main__":
    main(sys.argv[1], float(sys.argv[2]) if len(sys.argv) > 2 else -8.0)
