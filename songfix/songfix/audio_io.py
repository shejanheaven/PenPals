import shutil
import subprocess

import numpy as np
import soundfile as sf

SR = 44100


def load(path, sr=SR):
    """Decode any audio file ffmpeg understands to float64 stereo (n, 2)."""
    if not shutil.which("ffmpeg"):
        raise RuntimeError("ffmpeg is required (https://ffmpeg.org/download.html)")
    cmd = ["ffmpeg", "-v", "error", "-i", str(path), "-f", "f32le", "-ac", "2", "-ar", str(sr), "-"]
    raw = subprocess.run(cmd, check=True, capture_output=True).stdout
    return np.frombuffer(raw, dtype=np.float32).reshape(-1, 2).astype(np.float64)


def save_wav(path, x, sr=SR):
    sf.write(str(path), np.clip(x, -1, 1).astype(np.float32), sr, subtype="PCM_24")


def save_mp3(path, x, sr=SR, bitrate="320k"):
    cmd = ["ffmpeg", "-v", "error", "-y", "-f", "f32le", "-ac", "2", "-ar", str(sr), "-i", "-",
           "-c:a", "libmp3lame", "-b:a", bitrate, str(path)]
    subprocess.run(cmd, input=np.clip(x, -1, 1).astype(np.float32).tobytes(), check=True)
