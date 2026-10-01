"""`make_video.py --check`: shows which services are set up and whether they answer."""

from __future__ import annotations

import asyncio
import subprocess

import requests

from .config import Settings
from .images import ImageGenerator
from .llm import ScriptLLM
from .util import ffmpeg_exe
from .voice import Narrator


def _line(ok: bool | None, name: str, detail: str) -> None:
    mark = {True: "OK  ", False: "FAIL", None: "--  "}[ok]
    print(f"  [{mark}] {name:<13} {detail}")


def _get(url: str, **kw) -> requests.Response:
    return requests.get(url, timeout=25, **kw)


def run_checks(s: Settings) -> int:
    if s.free_only:
        print("\nFREE_ONLY=true: only free services will be used.")
    print("\nScript writing")
    k = s.key
    if s.free_only:
        _line(None, "claude", "skipped (FREE_ONLY=true)")
    elif k("ANTHROPIC_API_KEY"):
        try:
            import anthropic
            anthropic.Anthropic(api_key=k("ANTHROPIC_API_KEY")).models.retrieve(s.anthropic_model)
            _line(True, "claude", s.anthropic_model)
        except Exception as exc:  # noqa: BLE001
            _line(False, "claude", str(exc)[:120])
    else:
        _line(None, "claude", "no ANTHROPIC_API_KEY (optional, paid)")
    if k("GEMINI_API_KEY"):
        try:
            r = _get("https://generativelanguage.googleapis.com/v1beta/models",
                     headers={"x-goog-api-key": k("GEMINI_API_KEY")})
            _line(r.ok, "gemini", s.gemini_model if r.ok else r.text[:120])
        except requests.RequestException as exc:
            _line(False, "gemini", str(exc)[:120])
    else:
        _line(None, "gemini", "no GEMINI_API_KEY (free - recommended)")
    if k("GROQ_API_KEY"):
        try:
            r = _get("https://api.groq.com/openai/v1/models",
                     headers={"Authorization": f"Bearer {k('GROQ_API_KEY')}"})
            _line(r.ok, "groq", s.groq_model if r.ok else r.text[:120])
        except requests.RequestException as exc:
            _line(False, "groq", str(exc)[:120])
    else:
        _line(None, "groq", "no GROQ_API_KEY (free, optional)")

    cf_ok = None
    if k("CLOUDFLARE_ACCOUNT_ID") and k("CLOUDFLARE_API_TOKEN"):
        try:
            r = _get("https://api.cloudflare.com/client/v4/user/tokens/verify",
                     headers={"Authorization": f"Bearer {k('CLOUDFLARE_API_TOKEN')}"})
            cf_ok = r.ok and r.json().get("success", False)
            _line(cf_ok, "cloudflare", "token valid (text + images)" if cf_ok else r.text[:120])
        except requests.RequestException as exc:
            cf_ok = False
            _line(False, "cloudflare", str(exc)[:120])
    else:
        _line(None, "cloudflare", "no CLOUDFLARE_ACCOUNT_ID / CLOUDFLARE_API_TOKEN (free)")
    if k("POLLINATIONS_API_KEY"):
        try:
            r = _get("https://gen.pollinations.ai/account/balance",
                     headers={"Authorization": f"Bearer {k('POLLINATIONS_API_KEY')}"})
            _line(r.ok, "pollinations", r.text[:80] if r.ok else r.text[:120])
        except requests.RequestException as exc:
            _line(False, "pollinations", str(exc)[:120])
    else:
        _line(None, "pollinations", "no POLLINATIONS_API_KEY (optional)")

    print("\nImages")
    gen = ImageGenerator(s)
    hf = next((p for p in gen.providers if p.name == "higgsfield"), None)
    if s.free_only:
        _line(None, "higgsfield", "skipped (FREE_ONLY=true)")
    elif hf:
        try:
            status = hf.account_status()  # type: ignore[attr-defined]
            ok = "credits" in status.lower() and "expired" not in status.lower()
            _line(ok, "higgsfield", status.splitlines()[0][:110] if status else "no output")
        except Exception as exc:  # noqa: BLE001
            _line(False, "higgsfield", str(exc)[:120])
    else:
        _line(None, "higgsfield", "CLI not found (paid, optional)")
    local = any(p.name == "local" for p in gen.providers)
    _line(True if local else None, "local GPU",
          "ready - free and unlimited" if local else
          "not set up (NVIDIA cards: run setup-local-images.bat)")
    try:
        r = requests.get("https://image.pollinations.ai/prompt/test", timeout=60,
                         params={"width": 64, "height": 64, "nologo": "true", "seed": 1})
        ok = r.ok and r.headers.get("content-type", "").startswith("image/")
        _line(ok, "pollinations", "free images without an account work" if ok else
              f"HTTP {r.status_code} {r.text[:80]}")
    except requests.RequestException as exc:
        _line(False, "pollinations", str(exc)[:120])
    print(f"  order used: {gen.describe()}")

    print("\nVoice")
    if s.free_only:
        _line(None, "elevenlabs", "skipped (FREE_ONLY=true)")
    elif k("ELEVENLABS_API_KEY"):
        try:
            r = _get("https://api.elevenlabs.io/v1/user/subscription",
                     headers={"xi-api-key": k("ELEVENLABS_API_KEY")})
            if r.ok:
                d = r.json()
                left = d.get("character_limit", 0) - d.get("character_count", 0)
                _line(True, "elevenlabs", f"{left:,} characters left this month")
            else:
                _line(False, "elevenlabs", r.text[:120])
        except requests.RequestException as exc:
            _line(False, "elevenlabs", str(exc)[:120])
    else:
        _line(None, "elevenlabs", "no ELEVENLABS_API_KEY (optional, paid)")
    try:
        import edge_tts

        voices = asyncio.run(edge_tts.list_voices())
        found = any(v.get("ShortName") == s.edge_voice for v in voices)
        _line(found, "edge", f"{s.edge_voice} {'available' if found else 'NOT FOUND'} "
                             f"(free, {len(voices)} voices)")
    except ImportError:
        _line(False, "edge", "pip install edge-tts")
    except Exception as exc:  # noqa: BLE001
        _line(False, "edge", str(exc)[:120])
    print(f"  order used: {Narrator(s).describe()}")

    print("\nVideo")
    try:
        out = subprocess.run([ffmpeg_exe(), "-version"], capture_output=True, text=True).stdout
        _line(True, "ffmpeg", out.splitlines()[0][:100])
    except Exception as exc:  # noqa: BLE001
        _line(False, "ffmpeg", str(exc)[:120])
    if s.fb_page_id and s.fb_page_token:
        try:
            r = _get(f"https://graph.facebook.com/{s.fb_graph_version}/{s.fb_page_id}",
                     params={"fields": "name", "access_token": s.fb_page_token})
            _line(r.ok, "facebook", r.json().get("name", r.text[:100]) if r.ok else r.text[:120])
        except requests.RequestException as exc:
            _line(False, "facebook", str(exc)[:120])
    else:
        _line(None, "facebook", "auto-posting not set up (optional)")

    llm = ScriptLLM(s)
    print(f"\nScript order used: {llm.describe()}")
    if not llm.ready:
        print("\nNo script service yet - add a free GEMINI_API_KEY, or use --script/--plan.")
    if not gen.ready:
        print("\nNo image service yet - add one (see README), or use --draft to preview.")
    return 0
