"""Narration voice-over with word timings (used for captions and scene cuts).

Providers, tried in this order when VOICE_PROVIDER=auto:

  elevenlabs  ELEVENLABS_API_KEY - most natural voice, exact word timings (paid plan)
  edge        Microsoft Edge neural voices - free, no account, exact word timings
  kokoro      offline open-source voice (pip install kokoro-onnx soundfile);
              downloads a ~115 MB model once, timings are estimated
"""

from __future__ import annotations

import asyncio
import base64
import importlib.util
import re
from pathlib import Path

import requests

from .config import APP_DIR, Settings
from .planner import split_sentences
from .util import (FatalProviderError, RetryableError, log, media_duration,
                   raise_for_http, retry, run_ffmpeg)

KOKORO_FILES = {
    "kokoro-v1.0.int8.onnx": "https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.0/kokoro-v1.0.int8.onnx",
    "voices-v1.0.bin": "https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.0/voices-v1.0.bin",
}


def speakable(text: str) -> str:
    """Tidy narration for TTS: drop symbols/markdown a voice would read out."""
    text = text.replace("ﷺ", "peace be upon him").replace("ﷻ", "")
    text = re.sub(r"[*_#`~|<>\[\]{}]", "", text)
    text = re.sub(r"\s+", " ", text)
    return text.strip()


def estimate_words(text: str, start: float, end: float) -> list[dict]:
    """Spread words over [start, end] weighted by length; pauses after punctuation."""
    words = text.split()
    if not words:
        return []
    weights = []
    for w in words:
        wt = len(re.sub(r"\W", "", w)) + 2.0
        if w.endswith((".", "!", "?")):
            wt += 4.0
        elif w.endswith((",", ";", ":", "—", "-")):
            wt += 2.0
        weights.append(wt)
    total = sum(weights)
    span = max(0.1, end - start)
    out, t = [], start
    for w, wt in zip(words, weights):
        dur = span * wt / total
        out.append({"text": w, "start": round(t, 3), "end": round(t + dur * 0.85, 3)})
        t += dur
    return out


class VoiceProvider:
    name = "base"
    paid = False

    def __init__(self, settings: Settings):
        self.s = settings

    def available(self) -> bool:
        return False

    def synthesize(self, text: str, out_dir: Path) -> tuple[Path, list[dict]]:
        raise NotImplementedError


class ElevenLabsVoice(VoiceProvider):
    name = "elevenlabs"
    paid = True

    def available(self) -> bool:
        return bool(self.s.key("ELEVENLABS_API_KEY"))

    def synthesize(self, text: str, out_dir: Path) -> tuple[Path, list[dict]]:
        url = (f"https://api.elevenlabs.io/v1/text-to-speech/"
               f"{self.s.elevenlabs_voice_id}/with-timestamps")
        body = {
            "text": text,
            "model_id": self.s.elevenlabs_model,
            "voice_settings": {"stability": 0.5, "similarity_boost": 0.8,
                               "style": 0.15, "use_speaker_boost": True},
        }

        def call():
            resp = requests.post(url, json=body, timeout=300,
                                 params={"output_format": "mp3_44100_128"},
                                 headers={"xi-api-key": self.s.key("ELEVENLABS_API_KEY")})
            if resp.status_code in (401, 402) or "quota_exceeded" in resp.text[:500]:
                raise FatalProviderError(f"ElevenLabs: {resp.text[:300]}")
            raise_for_http(resp, "ElevenLabs")
            return resp.json()

        data = retry(call, what="ElevenLabs voice")
        raw = out_dir / "voice_raw.mp3"
        raw.write_bytes(base64.b64decode(data["audio_base64"]))
        align = data.get("alignment") or data.get("normalized_alignment") or {}
        words = chars_to_words(align.get("characters") or [],
                               align.get("character_start_times_seconds") or [],
                               align.get("character_end_times_seconds") or [])
        return raw, words


def chars_to_words(chars: list[str], starts: list[float], ends: list[float]) -> list[dict]:
    words, cur, w_start, w_end = [], "", None, None
    for ch, st, en in zip(chars, starts, ends):
        if ch.isspace():
            if cur.strip():
                words.append({"text": cur, "start": w_start, "end": w_end})
            cur, w_start = "", None
            continue
        if w_start is None:
            w_start = st
        cur += ch
        w_end = en
    if cur.strip():
        words.append({"text": cur, "start": w_start, "end": w_end})
    return words


class EdgeVoice(VoiceProvider):
    name = "edge"

    def available(self) -> bool:
        return importlib.util.find_spec("edge_tts") is not None

    def synthesize(self, text: str, out_dir: Path) -> tuple[Path, list[dict]]:
        import edge_tts

        async def run():
            try:
                comm = edge_tts.Communicate(text, self.s.edge_voice, rate=self.s.edge_rate,
                                            pitch=self.s.edge_pitch, boundary="WordBoundary")
            except TypeError:  # edge-tts < 7 always sends word boundaries
                comm = edge_tts.Communicate(text, self.s.edge_voice, rate=self.s.edge_rate,
                                            pitch=self.s.edge_pitch)
            audio, words = bytearray(), []
            async for chunk in comm.stream():
                if chunk["type"] == "audio":
                    audio.extend(chunk["data"])
                elif chunk["type"] == "WordBoundary":
                    start = chunk["offset"] / 1e7
                    words.append({"text": chunk["text"], "start": start,
                                  "end": start + chunk["duration"] / 1e7})
            return bytes(audio), words

        def call():
            try:
                return asyncio.run(run())
            except edge_tts.exceptions.NoAudioReceived as exc:
                raise RuntimeError(f"Edge voice '{self.s.edge_voice}' returned no audio "
                                   "(check EDGE_VOICE)") from exc
            except Exception as exc:  # network / websocket hiccups
                if "403" in str(exc) or "401" in str(exc):
                    raise FatalProviderError(f"Edge TTS refused the connection: {exc}") from exc
                raise RetryableError(f"Edge TTS: {exc}") from exc

        audio, words = retry(call, what="Edge voice")
        if not audio:
            raise RuntimeError("Edge TTS returned no audio")
        raw = out_dir / "voice_raw.mp3"
        raw.write_bytes(audio)
        return raw, words


class KokoroVoice(VoiceProvider):
    name = "kokoro"

    def available(self) -> bool:
        return all(importlib.util.find_spec(m) is not None for m in ("kokoro_onnx", "soundfile"))

    def _model_files(self) -> tuple[Path, Path]:
        model_dir = APP_DIR / "models"
        model_dir.mkdir(exist_ok=True)
        for name, url in KOKORO_FILES.items():
            dest = model_dir / name
            if dest.exists() and dest.stat().st_size > 1_000_000:
                continue
            log(f"  Downloading offline voice model {name} (one time)...")
            with requests.get(url, stream=True, timeout=600) as resp:
                raise_for_http(resp, "Kokoro model download")
                tmp = dest.with_suffix(".part")
                with open(tmp, "wb") as fh:
                    for block in resp.iter_content(1 << 20):
                        fh.write(block)
                tmp.replace(dest)
        return model_dir / "kokoro-v1.0.int8.onnx", model_dir / "voices-v1.0.bin"

    def synthesize(self, text: str, out_dir: Path) -> tuple[Path, list[dict]]:
        import numpy as np
        import soundfile as sf
        from kokoro_onnx import Kokoro

        model, voices = self._model_files()
        kokoro = Kokoro(str(model), str(voices))
        sentences = split_sentences(text)
        pieces, words, t, sr = [], [], 0.0, 24000
        for sent in sentences:
            samples, sr = kokoro.create(sent, voice=self.s.kokoro_voice,
                                        speed=self.s.kokoro_speed, lang="en-us")
            dur = len(samples) / sr
            words += estimate_words(sent, t + 0.05, t + dur - 0.05)
            pause = 0.32 if sent.rstrip().endswith((".", "!", "?")) else 0.15
            pieces += [samples, np.zeros(int(pause * sr), dtype=samples.dtype)]
            t += dur + pause
        raw = out_dir / "voice_raw.wav"
        sf.write(str(raw), np.concatenate(pieces), sr)
        return raw, words


PROVIDERS = {"elevenlabs": ElevenLabsVoice, "edge": EdgeVoice, "kokoro": KokoroVoice}
ALIASES = {"11labs": "elevenlabs", "eleven": "elevenlabs", "microsoft": "edge"}


class Narrator:
    def __init__(self, settings: Settings):
        choice = ALIASES.get(settings.voice_provider, settings.voice_provider)
        order = list(PROVIDERS)
        if choice != "auto":
            if choice not in PROVIDERS:
                raise SystemExit(f"Unknown VOICE_PROVIDER '{choice}'. "
                                 f"Use one of: auto, {', '.join(PROVIDERS)}")
            order.remove(choice)
            order.insert(0, choice)
        if settings.free_only:
            order = [n for n in order if not PROVIDERS[n].paid]
        self.providers = [p for p in (PROVIDERS[n](settings) for n in order) if p.available()]

    def describe(self) -> str:
        return " -> ".join(p.name for p in self.providers) or "none"

    def narrate(self, text: str, out_dir: Path) -> dict:
        """Creates out_dir/voice.wav (normalized) and returns timing info."""
        text = speakable(text)
        errors = []
        for provider in list(self.providers):
            try:
                log(f"Recording voice-over with {provider.name}...")
                raw, words = provider.synthesize(text, out_dir)
                break
            except Exception as exc:  # noqa: BLE001
                errors.append(f"{provider.name}: {exc}")
                log(f"  {provider.name} voice failed: {exc}")
                if isinstance(exc, FatalProviderError):
                    self.providers.remove(provider)
        else:
            raise RuntimeError("No voice service worked: " + "; ".join(errors)
                               if errors else "No voice service is available "
                               "(pip install edge-tts)")

        final = out_dir / "voice.wav"
        # Gentle clean-up: rumble filter + broadcast loudness for social video.
        run_ffmpeg(["-i", str(raw), "-af",
                    "highpass=f=70,loudnorm=I=-15:TP=-1.5:LRA=11",
                    "-ar", "48000", "-ac", "1", str(final)], what="voice normalize")
        raw.unlink(missing_ok=True)
        duration = media_duration(final)
        if not words:
            log("  Voice service gave no word timings; estimating them.")
            words = estimate_words(text, 0.1, duration - 0.1)
        return {"provider": provider.name, "file": final.name, "duration": duration,
                "text": text, "words": words}
