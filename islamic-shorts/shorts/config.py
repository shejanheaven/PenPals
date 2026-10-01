"""Settings, loaded from environment variables and the app's .env file."""

from __future__ import annotations

import os
from dataclasses import dataclass, field
from pathlib import Path

APP_DIR = Path(__file__).resolve().parent.parent


def load_dotenv(path: Path) -> None:
    """Minimal .env loader. Real environment variables always win."""
    if not path.exists():
        return
    for raw in path.read_text(encoding="utf-8-sig").splitlines():
        line = raw.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        key = key.strip()
        if key.startswith("export "):
            key = key[len("export "):].strip()
        value = value.strip()
        if len(value) >= 2 and value[0] == value[-1] and value[0] in "\"'":
            value = value[1:-1]
        elif " #" in value:
            value = value.split(" #", 1)[0].rstrip()
        if key and key not in os.environ:
            os.environ[key] = value


def env(name: str, default: str = "") -> str:
    return os.environ.get(name, default).strip()


def env_int(name: str, default: int) -> int:
    try:
        return int(env(name, str(default)))
    except ValueError:
        return default


def env_float(name: str, default: float) -> float:
    try:
        return float(env(name, str(default)))
    except ValueError:
        return default


def env_bool(name: str, default: bool) -> bool:
    value = env(name, "")
    if not value:
        return default
    return value.lower() in ("1", "true", "yes", "on")


@dataclass
class Settings:
    output_dir: Path = APP_DIR / "output"
    width: int = 1080
    height: int = 1920
    fps: int = 30

    free_only: bool = False       # never use paid services (Claude API, Higgsfield, ElevenLabs)
    script_provider: str = "auto"
    image_provider: str = "auto"
    voice_provider: str = "auto"
    style: str = "fresco"

    captions: bool = True
    particles: bool = True
    grain: bool = True
    music: str = ""
    music_volume: float = 0.10

    crossfade: float = 0.45
    image_workers: int = 4

    # Script writing (LLM)
    anthropic_model: str = "claude-opus-5-5"
    gemini_model: str = "gemini-flash-latest"
    groq_model: str = "openai/gpt-oss-120b"
    cloudflare_text_model: str = "@cf/meta/llama-3.3-70b-instruct-fp8-fast"
    pollinations_text_model: str = "openai"

    # Images
    higgsfield_cli: str = ""
    higgsfield_image_model: str = "gpt_image_2"
    higgsfield_image_args: str = ""
    cloudflare_image_model: str = "@cf/black-forest-labs/flux-1-schnell"
    cloudflare_image_steps: int = 4
    pollinations_image_model: str = "tongyi-mai/z-image-turbo"
    pollinations_free_model: str = "flux"
    local_image_model: str = "sdxl-lightning"

    # Voice
    elevenlabs_voice_id: str = "nPczCjzI2devNBz1zQrb"  # "Brian" - deep, calm narrator
    elevenlabs_model: str = "eleven_multilingual_v2"
    edge_voice: str = "en-US-ChristopherNeural"
    edge_rate: str = "-6%"
    edge_pitch: str = "-2Hz"
    kokoro_voice: str = "am_michael"
    kokoro_speed: float = 0.92

    # Facebook
    fb_page_id: str = ""
    fb_page_token: str = ""
    fb_graph_version: str = "v24.0"

    keys: dict = field(default_factory=dict)

    @classmethod
    def load(cls) -> "Settings":
        load_dotenv(APP_DIR / ".env")
        s = cls()
        out = env("OUTPUT_DIR")
        if out:
            p = Path(out).expanduser()
            s.output_dir = p if p.is_absolute() else APP_DIR / p
        s.fps = env_int("FPS", s.fps)
        s.free_only = env_bool("FREE_ONLY", s.free_only)
        s.script_provider = env("SCRIPT_PROVIDER", s.script_provider).lower()
        s.image_provider = env("IMAGE_PROVIDER", s.image_provider).lower()
        s.voice_provider = env("VOICE_PROVIDER", s.voice_provider).lower()
        s.style = env("STYLE", s.style).lower()
        s.captions = env_bool("CAPTIONS", s.captions)
        s.particles = env_bool("PARTICLES", s.particles)
        s.grain = env_bool("FILM_GRAIN", s.grain)
        s.music = env("MUSIC", s.music)
        s.music_volume = env_float("MUSIC_VOLUME", s.music_volume)
        s.crossfade = env_float("CROSSFADE_SECONDS", s.crossfade)
        s.image_workers = max(1, env_int("IMAGE_WORKERS", s.image_workers))

        s.anthropic_model = env("ANTHROPIC_MODEL", s.anthropic_model)
        s.gemini_model = env("GEMINI_MODEL", s.gemini_model)
        s.groq_model = env("GROQ_MODEL", s.groq_model)
        s.cloudflare_text_model = env("CLOUDFLARE_TEXT_MODEL", s.cloudflare_text_model)
        s.pollinations_text_model = env("POLLINATIONS_TEXT_MODEL", s.pollinations_text_model)

        s.higgsfield_cli = env("HIGGSFIELD_CLI", s.higgsfield_cli)
        s.higgsfield_image_model = env("HIGGSFIELD_IMAGE_MODEL", s.higgsfield_image_model)
        s.higgsfield_image_args = env("HIGGSFIELD_IMAGE_ARGS", s.higgsfield_image_args)
        s.cloudflare_image_model = env("CLOUDFLARE_IMAGE_MODEL", s.cloudflare_image_model)
        s.cloudflare_image_steps = env_int("CLOUDFLARE_IMAGE_STEPS", s.cloudflare_image_steps)
        s.pollinations_image_model = env("POLLINATIONS_IMAGE_MODEL", s.pollinations_image_model)
        s.pollinations_free_model = env("POLLINATIONS_FREE_MODEL", s.pollinations_free_model)

        s.elevenlabs_voice_id = env("ELEVENLABS_VOICE_ID", s.elevenlabs_voice_id)
        s.elevenlabs_model = env("ELEVENLABS_MODEL", s.elevenlabs_model)
        s.edge_voice = env("EDGE_VOICE", s.edge_voice)
        s.edge_rate = env("EDGE_RATE", s.edge_rate)
        s.edge_pitch = env("EDGE_PITCH", s.edge_pitch)
        s.kokoro_voice = env("KOKORO_VOICE", s.kokoro_voice)
        s.kokoro_speed = env_float("KOKORO_SPEED", s.kokoro_speed)

        s.fb_page_id = env("FB_PAGE_ID")
        s.fb_page_token = env("FB_PAGE_TOKEN")
        s.fb_graph_version = env("FB_GRAPH_VERSION", s.fb_graph_version)

        for name in (
            "ANTHROPIC_API_KEY", "GEMINI_API_KEY", "GROQ_API_KEY",
            "CLOUDFLARE_ACCOUNT_ID", "CLOUDFLARE_API_TOKEN",
            "POLLINATIONS_API_KEY", "ELEVENLABS_API_KEY",
        ):
            s.keys[name] = env(name)
        if not s.keys["GEMINI_API_KEY"]:
            s.keys["GEMINI_API_KEY"] = env("GOOGLE_API_KEY")
        return s

    def key(self, name: str) -> str:
        return self.keys.get(name, "")
