"""Renders the final vertical video: smooth pan/zoom on each scene, crossfades,
candle-flicker vignette, film grain, drifting dust, and word-by-word captions.

Frames are generated with OpenCV and piped straight into ffmpeg (H.264 + AAC,
1080x1920, ~6 Mbps - well inside Facebook's Reels specs).
"""

from __future__ import annotations

import bisect
import math
import os
import subprocess
from dataclasses import dataclass, field
from pathlib import Path

import cv2
import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont

from .util import ffmpeg_exe, log, run_ffmpeg

GOLD = (255, 205, 86)
WHITE = (255, 255, 255)


@dataclass
class SceneSpec:
    image: str
    motion: str
    start: float
    end: float


@dataclass
class RenderJob:
    width: int
    height: int
    fps: int
    duration: float
    scenes: list[SceneSpec]
    captions: list[dict] = field(default_factory=list)
    crossfade: float = 0.45
    particles: bool = True
    grain: bool = True
    font_path: str = ""
    seed: int = 7

    @property
    def total_frames(self) -> int:
        return int(math.ceil(self.duration * self.fps))


# ------------------------------------------------------------------ images

def load_rgb(path: str) -> np.ndarray:
    with Image.open(path) as im:
        return np.asarray(im.convert("RGB")).copy()


def cover_crop(img: np.ndarray, w: int, h: int, focus_y: float = 0.5) -> np.ndarray:
    ih, iw = img.shape[:2]
    scale = max(w / iw, h / ih)
    nw, nh = max(w, round(iw * scale)), max(h, round(ih * scale))
    interp = cv2.INTER_AREA if scale < 1 else cv2.INTER_LANCZOS4
    resized = cv2.resize(img, (nw, nh), interpolation=interp)
    x = (nw - w) // 2
    y = int((nh - h) * focus_y)
    return resized[y:y + h, x:x + w].copy()


# ------------------------------------------------------------------ motion

def _ease(p: float) -> float:
    # Mostly linear (keeps moving through crossfades) with softened ends.
    return 0.55 * p + 0.45 * (0.5 - 0.5 * math.cos(math.pi * p))


def motion_params(motion: str, seconds: float) -> tuple[float, float, float, float, float, float]:
    """(zoom0, zoom1, u0, u1, v0, v1). u/v = horizontal/vertical position of the
    camera inside the free space of the image (0 = left/top, 1 = right/bottom)."""
    amt = max(0.45, min(1.0, seconds / 6.0))   # similar speed for short & long shots
    zoom = 0.17 * amt
    travel = 0.42 * amt
    if motion == "zoom_out":
        return 1.0 + zoom, 1.0, 0.5, 0.5, 0.44, 0.5
    if motion == "pan_left":
        return 1.12, 1.15, 0.5 + travel, 0.5 - travel, 0.5, 0.5
    if motion == "pan_right":
        return 1.12, 1.15, 0.5 - travel, 0.5 + travel, 0.5, 0.5
    if motion == "pan_up":
        return 1.12, 1.15, 0.5, 0.5, 0.5 + travel, 0.5 - travel
    if motion == "pan_down":
        return 1.12, 1.15, 0.5, 0.5, 0.5 - travel, 0.5 + travel
    return 1.0, 1.0 + zoom, 0.5, 0.5, 0.5, 0.44          # zoom_in (default)


class SceneRenderer:
    def __init__(self, spec: SceneSpec, w: int, h: int, crossfade: float):
        self.w, self.h = w, h
        self.t0 = spec.start - crossfade / 2
        self.t1 = spec.end + crossfade / 2
        self.z0, self.z1, self.u0, self.u1, self.v0, self.v1 = motion_params(
            spec.motion, self.t1 - self.t0)
        img = load_rgb(spec.image)
        ih, iw = img.shape[:2]
        zmax = max(self.z0, self.z1)
        # Pre-scale once so the most zoomed-in frame maps ~1:1 to source pixels.
        scale = max(w / iw, h / ih) * zmax
        nw, nh = max(w, round(iw * scale)), max(h, round(ih * scale))
        interp = cv2.INTER_AREA if scale < 1 else cv2.INTER_LANCZOS4
        self.src = cv2.resize(img, (nw, nh), interpolation=interp)
        if scale > 1.25:  # upscaled a lot (small source) - restore a little crispness
            blur = cv2.GaussianBlur(self.src, (0, 0), 1.2)
            self.src = cv2.addWeighted(self.src, 1.35, blur, -0.35, 0)
        self.sw, self.sh = nw, nh
        self.base = max(w / nw, h / nh)

    def active(self, t: float) -> bool:
        return self.t0 <= t < self.t1

    def frame(self, t: float) -> np.ndarray:
        p = min(1.0, max(0.0, (t - self.t0) / max(1e-6, self.t1 - self.t0)))
        e = _ease(p)
        z = self.z0 + (self.z1 - self.z0) * e
        u = self.u0 + (self.u1 - self.u0) * e
        v = self.v0 + (self.v1 - self.v0) * e
        s = self.base * z                       # output pixels per source pixel
        vw, vh = self.w / s, self.h / s
        cx = vw / 2 + u * max(0.0, self.sw - vw)
        cy = vh / 2 + v * max(0.0, self.sh - vh)
        m = np.float32([[1 / s, 0, cx - (self.w / 2) / s],
                        [0, 1 / s, cy - (self.h / 2) / s]])
        return cv2.warpAffine(self.src, m, (self.w, self.h),
                              flags=cv2.INTER_CUBIC | cv2.WARP_INVERSE_MAP,
                              borderMode=cv2.BORDER_REFLECT)


# ------------------------------------------------------------------ effects

class Effects:
    def __init__(self, w: int, h: int, seed: int, particles: bool, grain: bool):
        self.w, self.h = w, h
        yy, xx = np.mgrid[0:h, 0:w].astype(np.float32)
        dx = (xx - w / 2) / (w / 2)
        dy = (yy - h / 2) / (h / 2)
        r = np.sqrt(dx * dx * 1.1 + dy * dy * 0.75)
        vig = 1.0 - 0.42 * np.clip((r - 0.45) / 0.75, 0, 1) ** 1.5
        bottom = 1.0 - 0.18 * np.clip((yy / h - 0.80) / 0.20, 0, 1)   # under the UI text
        mask = (vig * bottom * 255).astype(np.uint8)
        self.vignette = cv2.merge([mask, mask, mask])

        rng = np.random.default_rng(seed)
        self.grain_pos, self.grain_neg = [], []
        if grain:
            for _ in range(4):
                n = rng.normal(0, 2.6, (h // 2, w // 2)).astype(np.float32)
                n = cv2.resize(n, (w, h), interpolation=cv2.INTER_LINEAR)
                pos = np.clip(n, 0, 255).astype(np.uint8)
                neg = np.clip(-n, 0, 255).astype(np.uint8)
                self.grain_pos.append(cv2.merge([pos, pos, pos]))
                self.grain_neg.append(cv2.merge([neg, neg, neg]))

        self.motes = []
        if particles:
            sprites = {}
            for size in (1.4, 2.2, 3.2):
                rad = int(size * 3.2)
                g = np.mgrid[-rad:rad + 1, -rad:rad + 1].astype(np.float32)
                blob = np.exp(-(g[0] ** 2 + g[1] ** 2) / (2 * size * size))
                sprites[size] = np.dstack([blob * c for c in (255, 236, 196)]).astype(np.float32)
            for _ in range(38):
                size = float(rng.choice(list(sprites)))
                self.motes.append({
                    "x0": rng.uniform(0, w), "y0": rng.uniform(0, h),
                    "vx": rng.uniform(-7, 7), "vy": rng.uniform(-38, -10),
                    "amp": rng.uniform(4, 22), "freq": rng.uniform(0.08, 0.3),
                    "ph": rng.uniform(0, 6.3), "tw": rng.uniform(0.2, 0.8),
                    "ph2": rng.uniform(0, 6.3), "amax": rng.uniform(0.18, 0.55),
                    "sprite": sprites[size],
                })

    @staticmethod
    def flicker(t: float) -> float:
        return (1.0 + 0.016 * math.sin(2 * math.pi * 1.7 * t)
                + 0.010 * math.sin(2 * math.pi * 3.1 * t + 1.3)
                + 0.006 * math.sin(2 * math.pi * 7.3 * t + 0.4))

    def apply(self, frame: np.ndarray, t: float, index: int) -> np.ndarray:
        cv2.multiply(frame, self.vignette, dst=frame, scale=self.flicker(t) / 255.0)
        if self.grain_pos:
            k = (index // 2) % len(self.grain_pos)   # grain changes at ~15 fps, like film
            cv2.add(frame, self.grain_pos[k], dst=frame)
            cv2.subtract(frame, self.grain_neg[k], dst=frame)
        for m in self.motes:
            sp = m["sprite"]
            sz = sp.shape[0]
            span_h = self.h + 2 * sz
            y = (m["y0"] + m["vy"] * t) % span_h - sz
            x = (m["x0"] + m["vx"] * t + m["amp"] * math.sin(2 * math.pi * m["freq"] * t + m["ph"])) % self.w
            a = m["amax"] * (0.55 + 0.45 * math.sin(2 * math.pi * m["tw"] * t + m["ph2"]))
            x0, y0 = int(x) - sz // 2, int(y) - sz // 2
            x1, y1 = x0 + sz, y0 + sz
            cx0, cy0, cx1, cy1 = max(0, x0), max(0, y0), min(self.w, x1), min(self.h, y1)
            if cx1 <= cx0 or cy1 <= cy0:
                continue
            patch = sp[cy0 - y0:cy1 - y0, cx0 - x0:cx1 - x0] * a
            roi = frame[cy0:cy1, cx0:cx1]
            np.minimum(roi.astype(np.float32) + patch, 255, out=patch)
            roi[:] = patch.astype(np.uint8)
        return frame


# ------------------------------------------------------------------ captions

class Captions:
    def __init__(self, chunks: list[dict], font_path: str, w: int, h: int):
        self.chunks = chunks
        self.starts = [c["start"] for c in chunks]
        self.w, self.h = w, h
        self.size = int(w * 0.076)
        self.font = self._font(font_path, self.size)
        self.stroke = max(4, self.size // 11)
        self.center_y = int(h * 0.665)
        self.cache: dict[tuple[int, int], tuple] = {}

    @staticmethod
    def _font(path: str, size: int):
        for p in (path, "C:/Windows/Fonts/arialbd.ttf",
                  "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"):
            if p and os.path.exists(p):
                return ImageFont.truetype(p, size)
        return ImageFont.load_default(size=size)

    def _layout(self, words: list[str]) -> list[list[int]]:
        space = self.font.getlength(" ")
        widths = [self.font.getlength(wd) for wd in words]
        max_w = self.w * 0.84
        if sum(widths) + space * (len(words) - 1) <= max_w or len(words) == 1:
            return [list(range(len(words)))]
        best, best_cost = None, 1e9
        for cut in range(1, len(words)):
            a = sum(widths[:cut]) + space * (cut - 1)
            b = sum(widths[cut:]) + space * (len(words) - cut - 1)
            cost = abs(a - b) + (1e6 if max(a, b) > max_w else 0)
            if cost < best_cost:
                best, best_cost = cut, cost
        return [list(range(best)), list(range(best, len(words)))]

    def _render(self, ci: int, active: int):
        key = (ci, active)
        if key in self.cache:
            return self.cache[key]
        words = [w["text"] for w in self.chunks[ci]["words"]]
        lines = self._layout(words)
        ascent, descent = self.font.getmetrics()
        line_h = int((ascent + descent) * 1.08)
        space = self.font.getlength(" ")
        line_w = [sum(self.font.getlength(words[i]) for i in ln) + space * (len(ln) - 1)
                  for ln in lines]
        pad = self.stroke + 18
        cw = int(max(line_w) + pad * 2)
        chh = int(line_h * len(lines) + pad * 2)
        text_layer = Image.new("RGBA", (cw, chh), (0, 0, 0, 0))
        shadow = Image.new("L", (cw, chh), 0)
        dt, ds = ImageDraw.Draw(text_layer), ImageDraw.Draw(shadow)
        for li, ln in enumerate(lines):
            x = pad + (max(line_w) - line_w[li]) / 2
            y = pad + li * line_h + ascent
            for i in ln:
                color = GOLD if i == active else WHITE
                ds.text((x, y + 5), words[i], font=self.font, fill=170, anchor="ls",
                        stroke_width=self.stroke + 2, stroke_fill=170)
                dt.text((x, y), words[i], font=self.font, fill=color + (255,), anchor="ls",
                        stroke_width=self.stroke, stroke_fill=(0, 0, 0, 255))
                x += self.font.getlength(words[i]) + space
        shadow = shadow.filter(ImageFilter.GaussianBlur(7))
        base = Image.new("RGBA", (cw, chh), (0, 0, 0, 0))
        base.putalpha(shadow)
        base.alpha_composite(text_layer)
        arr = np.asarray(base).astype(np.float32)
        alpha = arr[..., 3:4] / 255.0
        premult = arr[..., :3] * alpha
        out = (premult, 1.0 - alpha)
        self.cache[key] = out
        if len(self.cache) > 64:
            self.cache.pop(next(iter(self.cache)))
        return out

    def apply(self, frame: np.ndarray, t: float) -> np.ndarray:
        ci = bisect.bisect_right(self.starts, t) - 1
        if ci < 0:
            return frame
        chunk = self.chunks[ci]
        if t >= chunk["end"]:
            return frame
        active = 0
        for i, wd in enumerate(chunk["words"]):
            if wd["start"] <= t:
                active = i
        premult, inv = self._render(ci, active)
        age = t - chunk["start"]
        if age < 0.12:  # quick pop-in
            k = 0.86 + 0.14 * (age / 0.12)
            ph, pw = premult.shape[:2]
            size = (max(2, int(pw * k)), max(2, int(ph * k)))
            premult = cv2.resize(premult, size, interpolation=cv2.INTER_LINEAR)
            inv = cv2.resize(inv, size, interpolation=cv2.INTER_LINEAR)[..., None]
        ph, pw = premult.shape[:2]
        x0 = (self.w - pw) // 2
        y0 = self.center_y - ph // 2
        x1, y1 = x0 + pw, y0 + ph
        cx0, cy0, cx1, cy1 = max(0, x0), max(0, y0), min(self.w, x1), min(self.h, y1)
        roi = frame[cy0:cy1, cx0:cx1].astype(np.float32)
        p = premult[cy0 - y0:cy1 - y0, cx0 - x0:cx1 - x0]
        a = inv[cy0 - y0:cy1 - y0, cx0 - x0:cx1 - x0]
        frame[cy0:cy1, cx0:cx1] = np.clip(roi * a + p, 0, 255).astype(np.uint8)
        return frame


# ------------------------------------------------------------------ frames

class FrameMaker:
    def __init__(self, job: RenderJob):
        self.job = job
        self.scenes = [SceneRenderer(s, job.width, job.height, job.crossfade) for s in job.scenes]
        self.effects = Effects(job.width, job.height, job.seed, job.particles, job.grain)
        self.captions = (Captions(job.captions, job.font_path, job.width, job.height)
                         if job.captions else None)
        self.fade_out = 0.7   # no fade-in: the hook must be visible on the first frame

    def frame(self, index: int) -> np.ndarray:
        job = self.job
        t = index / job.fps
        active = [s for s in self.scenes if s.active(t)] or [self.scenes[-1]]
        if len(active) == 1:
            frame = active[0].frame(t)
        else:
            a, b = active[0], active[-1]
            w = min(1.0, max(0.0, (t - b.t0) / max(1e-6, job.crossfade)))
            w = w * w * (3 - 2 * w)
            frame = cv2.addWeighted(a.frame(t), 1.0 - w, b.frame(t), w, 0)
        frame = self.effects.apply(frame, t, index)
        if self.captions:
            frame = self.captions.apply(frame, t)
        level = min(1.0, max(0.0, (job.duration - t) / self.fade_out))
        if level < 1.0:
            frame = cv2.convertScaleAbs(frame, alpha=max(0.0, level))
        return frame


def render_video(job: RenderJob, audio: Path, out: Path) -> None:
    """Generate every frame and encode it, together with the audio, in one pass."""
    tmp = out.with_suffix(".part.mp4")
    cmd = [ffmpeg_exe(), "-hide_banner", "-loglevel", "error", "-y",
           "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", f"{job.width}x{job.height}",
           "-r", str(job.fps), "-i", "-", "-i", str(audio),
           "-map", "0:v", "-map", "1:a",
           "-c:v", "libx264", "-preset", "medium", "-crf", "20",
           "-maxrate", "14M", "-bufsize", "28M", "-pix_fmt", "yuv420p",
           "-profile:v", "high", "-g", str(job.fps * 2),
           "-c:a", "copy", "-shortest", "-movflags", "+faststart", str(tmp)]
    maker = FrameMaker(job)
    err_log = out.with_suffix(".encoder.log")
    total = job.total_frames
    step = max(1, total // 10)
    # stderr goes to a file: a full pipe buffer would stall ffmpeg mid-render.
    with open(err_log, "wb") as err_fh:
        proc = subprocess.Popen(cmd, stdin=subprocess.PIPE, stderr=err_fh)
        try:
            for i in range(total):
                proc.stdin.write(maker.frame(i).tobytes())
                if i and i % step == 0:
                    log(f"  rendered {100 * i // total}%")
            proc.stdin.close()
        except (BrokenPipeError, OSError):
            pass
        code = proc.wait()
    err = err_log.read_text(encoding="utf-8", errors="replace")
    err_log.unlink(missing_ok=True)
    if code != 0:
        tmp.unlink(missing_ok=True)
        raise RuntimeError(f"video encoder failed: {err[-1500:]}")
    os.replace(tmp, out)


def build_audio(voice: Path, duration: float, out: Path, music: str = "",
                music_volume: float = 0.1) -> None:
    if music and Path(music).exists():
        fade_out_start = max(0.0, duration - 2.5)
        run_ffmpeg([
            "-i", str(voice), "-stream_loop", "-1", "-i", music,
            "-filter_complex",
            f"[1:a]volume={music_volume},afade=t=in:d=1.5,"
            f"afade=t=out:st={fade_out_start:.2f}:d=2.5[m];"
            f"[0:a]apad[v];[v][m]amix=inputs=2:duration=first:dropout_transition=0,"
            f"volume=2[a]",
            "-map", "[a]", "-t", f"{duration:.3f}", "-ar", "48000", "-ac", "2",
            "-c:a", "aac", "-b:a", "192k", str(out)], what="audio mix")
    else:
        run_ffmpeg(["-i", str(voice), "-af", "apad", "-t", f"{duration:.3f}",
                    "-ar", "48000", "-ac", "2", "-c:a", "aac", "-b:a", "192k", str(out)],
                   what="audio")


# ------------------------------------------------------------------ extras

def make_cover(image: str, title: str, font_path: str, out: Path, w: int = 1080,
               h: int = 1920) -> None:
    """Thumbnail: first scene + title in the safe area."""
    base = cover_crop(load_rgb(image), w, h)
    grad = np.linspace(0, 1, h, dtype=np.float32)[:, None, None]
    shade = 1.0 - 0.55 * np.clip((grad - 0.45) / 0.55, 0, 1)
    img = Image.fromarray((base * shade).astype(np.uint8))
    draw = ImageDraw.Draw(img)
    font = Captions._font(font_path, int(w * 0.085))
    words, lines, cur = title.upper().split(), [], ""
    for wd in words:
        test = (cur + " " + wd).strip()
        if font.getlength(test) > w * 0.84 and cur:
            lines.append(cur)
            cur = wd
        else:
            cur = test
    if cur:
        lines.append(cur)
    asc, desc = font.getmetrics()
    lh = int((asc + desc) * 1.05)
    y = int(h * 0.62) - lh * len(lines) // 2
    for i, ln in enumerate(lines):
        draw.text((w / 2, y + i * lh), ln, font=font, fill=GOLD if i == 0 else WHITE,
                  anchor="mt", stroke_width=6, stroke_fill=(0, 0, 0))
    img.save(out, "JPEG", quality=92)


def make_storyboard(images: list[str], out: Path, cols: int = 5) -> None:
    """Contact sheet of all scene images, numbered, for a quick review."""
    if not images:
        return
    tw, th = 216, 384
    rows = math.ceil(len(images) / cols)
    sheet = Image.new("RGB", (cols * tw, rows * th), (15, 15, 15))
    draw = ImageDraw.Draw(sheet)
    font = Captions._font("", 28)
    for i, path in enumerate(images):
        try:
            tile = Image.fromarray(cover_crop(load_rgb(path), tw, th))
        except Exception:  # noqa: BLE001
            continue
        x, y = (i % cols) * tw, (i // cols) * th
        sheet.paste(tile, (x, y))
        draw.text((x + 10, y + 8), str(i + 1), font=font, fill=GOLD, stroke_width=3,
                  stroke_fill=(0, 0, 0))
    sheet.save(out, "JPEG", quality=85)
