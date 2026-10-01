"""Small shared helpers: logging, retries, ffmpeg lookup, JSON files."""

from __future__ import annotations

import json
import os
import random
import re
import shutil
import subprocess
import sys
import threading
import time
import unicodedata
from pathlib import Path
from typing import Callable, TypeVar

T = TypeVar("T")

_log_lock = threading.Lock()
_log_file: Path | None = None


def set_log_file(path: Path | None) -> None:
    global _log_file
    _log_file = path


def log(msg: str) -> None:
    line = f"[{time.strftime('%H:%M:%S')}] {msg}"
    with _log_lock:
        try:
            print(line, flush=True)
        except UnicodeEncodeError:
            print(line.encode("ascii", "replace").decode(), flush=True)
        if _log_file is not None:
            try:
                with open(_log_file, "a", encoding="utf-8") as fh:
                    fh.write(line + "\n")
            except OSError:
                pass


class FatalProviderError(RuntimeError):
    """The provider cannot be used any more in this run (bad key, no credits...)."""


class RetryableError(RuntimeError):
    """Temporary failure (rate limit, 5xx, timeout) worth retrying."""


def retry(fn: Callable[[], T], attempts: int = 4, base_delay: float = 3.0,
          what: str = "request") -> T:
    """Run fn, retrying RetryableError / network errors with exponential backoff."""
    import requests  # local import keeps module import cheap

    last: Exception | None = None
    for i in range(attempts):
        try:
            return fn()
        except FatalProviderError:
            raise
        except (RetryableError, requests.ConnectionError, requests.Timeout) as exc:
            last = exc
            if i == attempts - 1:
                break
            delay = base_delay * (2 ** i) + random.uniform(0, 1.5)
            wait = getattr(exc, "retry_after", None)
            if isinstance(wait, (int, float)) and wait > 0:
                delay = max(delay, min(float(wait), 120.0))
            log(f"  {what} failed ({exc}); retrying in {delay:.0f}s")
            time.sleep(delay)
    assert last is not None
    raise last


def raise_for_http(resp, what: str) -> None:
    """Translate an HTTP error response into Fatal/Retryable errors."""
    if resp.status_code < 400:
        return
    body = resp.text[:500].replace("\n", " ")
    if resp.status_code in (408, 409, 425, 429) or resp.status_code >= 500:
        err = RetryableError(f"{what}: HTTP {resp.status_code} {body}")
        ra = resp.headers.get("retry-after")
        if ra:
            try:
                err.retry_after = float(ra)  # type: ignore[attr-defined]
            except ValueError:
                pass
        raise err
    if resp.status_code in (401, 402, 403):
        raise FatalProviderError(f"{what}: HTTP {resp.status_code} {body}")
    raise RuntimeError(f"{what}: HTTP {resp.status_code} {body}")


def slugify(text: str, max_len: int = 48) -> str:
    text = unicodedata.normalize("NFKD", text).encode("ascii", "ignore").decode()
    text = re.sub(r"[^a-zA-Z0-9]+", "-", text).strip("-").lower()
    return (text[:max_len].rstrip("-")) or "video"


def read_json(path: Path, default=None):
    try:
        return json.loads(Path(path).read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return default


def write_json(path: Path, data) -> None:
    path = Path(path)
    tmp = path.with_suffix(path.suffix + ".tmp")
    tmp.write_text(json.dumps(data, indent=2, ensure_ascii=False), encoding="utf-8")
    os.replace(tmp, path)


_ffmpeg: str | None = None


def ffmpeg_exe() -> str:
    """System ffmpeg if available, else the static build bundled with imageio-ffmpeg."""
    global _ffmpeg
    if _ffmpeg:
        return _ffmpeg
    found = os.environ.get("FFMPEG_BINARY") or shutil.which("ffmpeg")
    if not found:
        try:
            import imageio_ffmpeg

            found = imageio_ffmpeg.get_ffmpeg_exe()
        except Exception as exc:  # pragma: no cover - depends on install
            raise RuntimeError(
                "ffmpeg not found. Run setup again (pip install imageio-ffmpeg) "
                "or install ffmpeg and add it to PATH."
            ) from exc
    _ffmpeg = found
    return found


def run_ffmpeg(args: list[str], what: str = "ffmpeg") -> None:
    cmd = [ffmpeg_exe(), "-hide_banner", "-loglevel", "error", "-y", *args]
    proc = subprocess.run(cmd, capture_output=True, text=True, encoding="utf-8",
                          errors="replace")
    if proc.returncode != 0:
        raise RuntimeError(f"{what} failed: {proc.stderr.strip()[-1500:]}")


def media_duration(path: Path) -> float:
    """Duration in seconds, read via ffmpeg (no ffprobe needed)."""
    proc = subprocess.run([ffmpeg_exe(), "-hide_banner", "-i", str(path)],
                          capture_output=True, text=True, encoding="utf-8",
                          errors="replace")
    m = re.search(r"Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)", proc.stderr)
    if not m:
        raise RuntimeError(f"Could not read duration of {path}")
    h, mnt, sec = m.groups()
    return int(h) * 3600 + int(mnt) * 60 + float(sec)


def is_windows() -> bool:
    return sys.platform.startswith("win")
