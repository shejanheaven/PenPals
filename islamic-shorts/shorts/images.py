"""Scene image generation.

Providers, tried in this order when IMAGE_PROVIDER=auto:

  higgsfield   your Higgsfield CLI (GPT Image 2, true 9:16) - uses Higgsfield credits
  local        free, unlimited, on your own NVIDIA graphics card (SDXL-Lightning;
               setup-local-images.bat installs it, ~12 GB one-time download)
  cloudflare   Workers AI FLUX.1 schnell - free daily allowance (square images,
               the renderer pans across them to fill the vertical frame)
  pollinations free, no account needed (rate limited); with POLLINATIONS_API_KEY it
               uses your account instead

FREE_ONLY=true (or --free) skips the paid ones.

If one provider fails for a scene, the next configured provider is tried.
"""

from __future__ import annotations

import base64
import glob
import importlib.util
import io
import os
import re
import shlex
import shutil
import subprocess
import threading
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path
from urllib.parse import quote

import requests
from PIL import Image

from .config import Settings
from .prompts import split_image_prompt, style_for
from .util import FatalProviderError, RetryableError, is_windows, log, raise_for_http, retry


class ContentFlagged(RuntimeError):
    """The provider's safety filter rejected the prompt."""


SOFTEN = [
    (r"\b(blood|bloody|bleeding|gore|corpse|corpses|dead bodies|slaughter\w*)\b", "shadow"),
    (r"\b(buried alive|burying|bury)\b", "a lost child, symbolized by an empty cradle"),
    (r"\b(sword|swords|spear|spears|dagger|weapons?)\b", "banners"),
    (r"\b(kill\w*|murder\w*|execut\w*|behead\w*|stab\w*)\b", "conflict"),
    (r"\b(naked|nude|bare-chested|shirtless)\b", "robed"),
    (r"\b(war|battle|warriors?)\b", "tension"),
]


def soften_prompt(prompt: str) -> str:
    out = prompt
    for pattern, repl in SOFTEN:
        out = re.sub(pattern, repl, out, flags=re.I)
    return "Peaceful, respectful, family-friendly sacred artwork. " + out


def save_image(data: bytes, out_path: Path) -> None:
    img = Image.open(io.BytesIO(data))
    img.load()
    if img.mode != "RGB":
        img = img.convert("RGB")
    if min(img.size) < 256:
        raise RuntimeError(f"image too small ({img.size})")
    out_path.parent.mkdir(parents=True, exist_ok=True)
    tmp = out_path.with_suffix(".tmp.png")
    img.save(tmp, "PNG", optimize=False)
    os.replace(tmp, out_path)


class ImageProvider:
    name = "base"
    workers = 3
    paid = False

    def __init__(self, settings: Settings):
        self.s = settings

    def available(self) -> bool:
        return False

    def generate(self, prompt: str, seed: int) -> bytes:
        raise NotImplementedError


class HiggsfieldProvider(ImageProvider):
    name = "higgsfield"
    workers = 4
    paid = True

    def __init__(self, settings: Settings):
        super().__init__(settings)
        self.exe = self._find_cli()

    def _find_cli(self) -> list[str] | None:
        if self.s.higgsfield_cli:
            p = Path(self.s.higgsfield_cli).expanduser()
            return [str(p)] if p.exists() else None
        candidates: list[str] = []
        if is_windows():
            # npm installs a .cmd shim; call the real hf.exe so prompts are passed
            # safely (cmd.exe would mangle characters such as & | ^ % ").
            appdata = os.environ.get("APPDATA", "")
            candidates += glob.glob(os.path.join(appdata, "npm", "node_modules", "@higgsfield",
                                                 "cli", "vendor", "hf.exe"))
            if not candidates:
                try:
                    root = subprocess.run("npm root -g", capture_output=True, text=True,
                                          timeout=30, shell=True).stdout.strip()
                    if root:
                        candidates += glob.glob(os.path.join(root, "@higgsfield", "cli",
                                                             "vendor", "hf.exe"))
                except (OSError, subprocess.SubprocessError):
                    pass
            home = Path.home()
            candidates += [str(home / ".local" / "bin" / "higgsfield.exe"),
                           str(home / ".local" / "bin" / "hf.exe")]
        for name in ("higgsfield", "higgs"):
            found = shutil.which(name)
            if found:
                candidates.append(found)
        candidates += [str(Path.home() / ".local" / "bin" / "higgsfield"), "/usr/local/bin/higgsfield"]
        for c in candidates:
            if c and Path(c).exists():
                return [c]
        return None

    def available(self) -> bool:
        return self.exe is not None

    def _run(self, args: list[str], timeout: int) -> subprocess.CompletedProcess:
        exe = self.exe[0]
        if is_windows() and exe.lower().endswith((".cmd", ".bat")):
            args = [re.sub(r'[&|<>^%"]', " ", a) for a in args]
        return subprocess.run(self.exe + args, capture_output=True, text=True,
                              encoding="utf-8", errors="replace", timeout=timeout)

    def account_status(self) -> str:
        proc = self._run(["account", "status"], timeout=60)
        return (proc.stdout + proc.stderr).strip()

    def generate(self, prompt: str, seed: int) -> bytes:
        args = ["generate", "create", self.s.higgsfield_image_model,
                "--prompt", prompt, "--aspect_ratio", "9:16"]
        if self.s.higgsfield_image_args:
            args += shlex.split(self.s.higgsfield_image_args, posix=not is_windows())
        args += ["--wait", "--wait-timeout", "12m"]
        try:
            proc = self._run(args, timeout=15 * 60)
        except subprocess.TimeoutExpired as exc:
            raise RetryableError("Higgsfield timed out") from exc
        out = (proc.stdout or "") + "\n" + (proc.stderr or "")
        low = out.lower()
        if "not_enough_credits" in low or "not enough credits" in low:
            raise FatalProviderError("Higgsfield: not enough credits")
        if "session expired" in low or "not authenticated" in low or "unauthorized" in low:
            raise FatalProviderError("Higgsfield: not logged in - run `higgsfield auth login`")
        if re.search(r'status\s+"?nsfw', low) or (proc.returncode != 0 and "nsfw" in low):
            raise ContentFlagged("Higgsfield safety filter flagged the prompt")
        urls = re.findall(r"https://\S+", proc.stdout or "")
        urls = [u.rstrip(".,;)\"'") for u in urls]
        if proc.returncode != 0 or not urls:
            tail = out.strip()[-300:]
            if re.search(r"HTTP 5\d\d|timed? ?out|cannot reach|connection|temporar", out, re.I):
                raise RetryableError(f"Higgsfield: {tail}")
            raise RuntimeError(f"Higgsfield failed (exit {proc.returncode}): {tail}")
        url = next((u for u in urls if re.search(r"\.(png|jpe?g|webp)(\?|$)", u, re.I)), urls[-1])
        return download(url)


def download(url: str) -> bytes:
    def get() -> bytes:
        resp = requests.get(url, timeout=120)
        raise_for_http(resp, "download")
        return resp.content
    return retry(get, what="image download")


class CloudflareProvider(ImageProvider):
    name = "cloudflare"
    workers = 4

    def available(self) -> bool:
        return bool(self.s.key("CLOUDFLARE_ACCOUNT_ID") and self.s.key("CLOUDFLARE_API_TOKEN"))

    def generate(self, prompt: str, seed: int) -> bytes:
        acct = self.s.key("CLOUDFLARE_ACCOUNT_ID")
        url = f"https://api.cloudflare.com/client/v4/accounts/{acct}/ai/run/{self.s.cloudflare_image_model}"
        body = {"prompt": prompt[:2048], "steps": self.s.cloudflare_image_steps, "seed": seed}
        resp = requests.post(url, json=body, timeout=180,
                             headers={"Authorization": f"Bearer {self.s.key('CLOUDFLARE_API_TOKEN')}"})
        if resp.status_code == 400 and "seed" in resp.text:
            body.pop("seed")
            resp = requests.post(url, json=body, timeout=180,
                                 headers={"Authorization": f"Bearer {self.s.key('CLOUDFLARE_API_TOKEN')}"})
        text = resp.text[:600].lower() if resp.status_code >= 400 else ""
        if "nsfw" in text or "flagged" in text:
            raise ContentFlagged("Cloudflare safety filter flagged the prompt")
        if any(w in text for w in ("neuron", "allocation", "daily free")):
            raise FatalProviderError("Cloudflare: free daily allowance used up "
                                     "(resets at 00:00 UTC)")
        raise_for_http(resp, "Cloudflare")
        ctype = resp.headers.get("content-type", "")
        if ctype.startswith("image/"):
            return resp.content
        data = resp.json()
        image_b64 = (data.get("result") or {}).get("image")
        if not image_b64:
            raise RuntimeError(f"Cloudflare returned no image: {str(data)[:300]}")
        return base64.b64decode(image_b64)


class PollinationsProvider(ImageProvider):
    name = "pollinations"
    _gate = threading.Lock()
    _last_call = 0.0
    FREE_GAP_SECONDS = 6.0

    def available(self) -> bool:
        return True   # works without an account (rate limited)

    @property
    def workers(self) -> int:  # type: ignore[override]
        return 2 if self.s.key("POLLINATIONS_API_KEY") else 1

    def generate(self, prompt: str, seed: int) -> bytes:
        key = self.s.key("POLLINATIONS_API_KEY")
        if key:
            url = "https://gen.pollinations.ai/image/" + quote(prompt[:1800], safe="")
            params = {"model": self.s.pollinations_image_model, "width": 1088,
                      "height": 1920, "seed": seed}
            resp = requests.get(url, params=params, timeout=240,
                                headers={"Authorization": f"Bearer {key}"})
            if resp.status_code == 402:
                raise FatalProviderError("Pollinations: out of credits")
        else:
            # Free no-account endpoint: one request at a time, a few seconds apart.
            with PollinationsProvider._gate:
                wait = PollinationsProvider._last_call + self.FREE_GAP_SECONDS - time.time()
                if wait > 0:
                    time.sleep(wait)
                PollinationsProvider._last_call = time.time()
            url = "https://image.pollinations.ai/prompt/" + quote(prompt[:1500], safe="")
            params = {"width": 1080, "height": 1920, "seed": seed, "nologo": "true",
                      "private": "true", "enhance": "false",
                      "model": self.s.pollinations_free_model}
            resp = requests.get(url, params=params, timeout=300)
            if resp.status_code in (401, 402, 403):
                raise FatalProviderError(
                    "Pollinations no longer allows free use without an account "
                    f"(HTTP {resp.status_code}). Add a POLLINATIONS_API_KEY or use another "
                    "image service.")
        raise_for_http(resp, "Pollinations")
        if not resp.headers.get("content-type", "").startswith("image/"):
            raise RuntimeError(f"Pollinations returned {resp.headers.get('content-type')}: "
                               f"{resp.text[:200]}")
        return resp.content


class LocalProvider(ImageProvider):
    """Free, unlimited images on your own NVIDIA GPU with SDXL-Lightning (4 steps).
    Models download once from Hugging Face (~12 GB) into the normal HF cache."""

    name = "local"
    workers = 1
    _pipe = None
    _load_lock = threading.Lock()
    _run_lock = threading.Lock()
    BASE = "stabilityai/stable-diffusion-xl-base-1.0"
    LIGHTNING = ("ByteDance/SDXL-Lightning", "sdxl_lightning_4step_unet.safetensors")

    def available(self) -> bool:
        if not all(importlib.util.find_spec(m) for m in ("torch", "diffusers", "transformers")):
            return False
        try:
            import torch
            return bool(torch.cuda.is_available())
        except Exception:  # noqa: BLE001
            return False

    def _get_pipe(self):
        with LocalProvider._load_lock:
            if LocalProvider._pipe is not None:
                return LocalProvider._pipe
            import torch
            from diffusers import (EulerDiscreteScheduler, StableDiffusionXLPipeline,
                                   UNet2DConditionModel)
            from huggingface_hub import hf_hub_download
            from safetensors.torch import load_file

            log("  Loading the free local image model (the first time downloads ~12 GB)...")
            unet = UNet2DConditionModel.from_pretrained(
                self.BASE, subfolder="unet", variant="fp16", torch_dtype=torch.float16)
            unet.load_state_dict(load_file(hf_hub_download(*self.LIGHTNING)))
            pipe = StableDiffusionXLPipeline.from_pretrained(
                self.BASE, unet=unet, torch_dtype=torch.float16, variant="fp16")
            pipe.scheduler = EulerDiscreteScheduler.from_config(
                pipe.scheduler.config, timestep_spacing="trailing")
            vram_gb = torch.cuda.get_device_properties(0).total_memory / 2**30
            if vram_gb < 11:
                pipe.enable_model_cpu_offload()   # fits 6-10 GB cards
            else:
                pipe.to("cuda")
            pipe.set_progress_bar_config(disable=True)
            LocalProvider._pipe = pipe
            log(f"  Local image model ready on {torch.cuda.get_device_name(0)} "
                f"({vram_gb:.0f} GB)")
            return pipe

    def generate(self, prompt: str, seed: int) -> bytes:
        import torch

        style_name, body = split_image_prompt(prompt)
        short = style_for(style_name)["short"]
        pipe = self._get_pipe()
        with LocalProvider._run_lock:
            image = pipe(prompt=body, prompt_2=f"{short}, {body}",
                         num_inference_steps=4, guidance_scale=0,
                         width=768, height=1344,
                         generator=torch.Generator("cpu").manual_seed(seed)).images[0]
        buf = io.BytesIO()
        image.save(buf, "PNG")
        return buf.getvalue()


PROVIDERS = {
    "higgsfield": HiggsfieldProvider,
    "local": LocalProvider,
    "cloudflare": CloudflareProvider,
    "pollinations": PollinationsProvider,
}


class ImageGenerator:
    def __init__(self, settings: Settings):
        choice = settings.image_provider
        order = list(PROVIDERS)
        if choice != "auto":
            if choice not in PROVIDERS:
                raise SystemExit(f"Unknown IMAGE_PROVIDER '{choice}'. "
                                 f"Use one of: auto, {', '.join(PROVIDERS)}")
            order.remove(choice)
            order.insert(0, choice)
        self.s = settings
        if settings.free_only:
            order = [n for n in order if not PROVIDERS[n].paid]
        self.providers = [p for p in (PROVIDERS[n](settings) for n in order) if p.available()]
        self._dead: set[str] = set()
        self._lock = threading.Lock()

    @property
    def ready(self) -> bool:
        return bool(self.providers)

    def describe(self) -> str:
        return " -> ".join(p.name for p in self.providers) or "none"

    def _alive(self) -> list[ImageProvider]:
        with self._lock:
            return [p for p in self.providers if p.name not in self._dead]

    def generate_one(self, prompt: str, out_path: Path, seed: int, label: str) -> str:
        errors = []
        for provider in self._alive():
            attempt_prompt = prompt
            for attempt in range(2):
                try:
                    started = time.time()
                    data = retry(lambda: provider.generate(attempt_prompt, seed),
                                 attempts=3, base_delay=8,
                                 what=f"{label} ({provider.name})")
                    save_image(data, out_path)
                    log(f"  {label} done via {provider.name} ({time.time() - started:.0f}s)")
                    return provider.name
                except ContentFlagged as exc:
                    errors.append(f"{provider.name}: {exc}")
                    if attempt == 0:
                        log(f"  {label} was flagged by {provider.name}; retrying with a "
                            "gentler prompt")
                        attempt_prompt = soften_prompt(prompt)
                        continue
                    break
                except FatalProviderError as exc:
                    log(f"  {provider.name} disabled for this run: {exc}")
                    with self._lock:
                        self._dead.add(provider.name)
                    errors.append(str(exc))
                    break
                except Exception as exc:  # noqa: BLE001 - keep other scenes going
                    errors.append(f"{provider.name}: {exc}")
                    log(f"  {label} failed on {provider.name}: {exc}")
                    break
        raise RuntimeError("; ".join(errors[-3:]) or "no image provider available")

    def generate_many(self, jobs: list[tuple[str, Path, int, str]]) -> dict[str, str | Exception]:
        """jobs: (prompt, out_path, seed, label). Returns label -> provider name or error."""
        if not jobs:
            return {}
        alive = self._alive()
        per_provider = alive[0].workers if alive else 1
        workers = max(1, min(per_provider, self.s.image_workers, len(jobs)))
        results: dict[str, str | Exception] = {}
        with ThreadPoolExecutor(max_workers=workers) as pool:
            futures = {pool.submit(self.generate_one, *job): job[3] for job in jobs}
            for fut in as_completed(futures):
                label = futures[fut]
                try:
                    results[label] = fut.result()
                except Exception as exc:  # noqa: BLE001
                    results[label] = exc
        return results


def placeholder_image(text: str, number: int, out_path: Path, w: int = 1088,
                      h: int = 1920) -> None:
    """Free stand-in art for --draft runs (check script, voice, timing and captions
    before spending image credits). Real images replace these on the next run."""
    import numpy as np
    from PIL import ImageDraw, ImageFilter, ImageFont

    rng = np.random.default_rng(number * 7919 + len(text))
    top = np.array(rng.choice([(38, 26, 18), (20, 24, 40), (30, 20, 30)]), dtype=np.float32)
    bottom = np.array(rng.choice([(196, 140, 70), (150, 110, 60), (120, 90, 120)]),
                      dtype=np.float32)
    grad = np.linspace(0, 1, h, dtype=np.float32)[:, None, None]
    arr = top * (1 - grad) + bottom * grad
    arr = np.repeat(arr, w, axis=1)
    img = Image.fromarray(arr.clip(0, 255).astype("uint8"))
    glow = Image.new("L", (w, h), 0)
    gd = ImageDraw.Draw(glow)
    for _ in range(6):
        x, y, r = rng.uniform(0, w), rng.uniform(0, h * 0.7), rng.uniform(80, 320)
        gd.ellipse([x - r, y - r, x + r, y + r], fill=int(rng.uniform(60, 140)))
    glow = glow.filter(ImageFilter.GaussianBlur(90))
    img = Image.composite(Image.new("RGB", (w, h), (255, 222, 160)), img, glow)
    draw = ImageDraw.Draw(img)
    font_path = Path(__file__).resolve().parent.parent / "assets" / "fonts" / "Poppins-ExtraBold.ttf"
    try:
        font = ImageFont.truetype(str(font_path), 44)
        big = ImageFont.truetype(str(font_path), 120)
    except OSError:
        font = big = ImageFont.load_default()
    draw.text((w / 2, h * 0.18), f"DRAFT {number}", font=big, fill=(255, 255, 255),
              anchor="mm", stroke_width=4, stroke_fill=(0, 0, 0))
    words, line, lines = text.split(), "", []
    for wd in words:
        if len(line) + len(wd) > 34:
            lines.append(line)
            line = wd
        else:
            line = (line + " " + wd).strip()
    lines.append(line)
    for i, ln in enumerate(lines[:12]):
        draw.text((w / 2, h * 0.30 + i * 58), ln, font=font, fill=(255, 245, 225),
                  anchor="mm", stroke_width=3, stroke_fill=(0, 0, 0))
    out_path.parent.mkdir(parents=True, exist_ok=True)
    img.save(out_path, "PNG")
