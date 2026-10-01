"""Offline tests: every external service is faked, everything else runs for real
(alignment, captions, rendering, ffmpeg). Run with:  python -m pytest tests -q
"""

from __future__ import annotations

import base64
import io
import json
import os
import subprocess
import sys
import types
from pathlib import Path

import pytest
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from shorts import images, llm, planner, timeline, voice  # noqa: E402
from shorts.config import Settings  # noqa: E402
from shorts.util import ffmpeg_exe, media_duration  # noqa: E402

KAABA = """Before Islam, the Kaaba in Mecca was not a place of one God. Historical narrations
describe around 360 idols in and around it — gods of stone and wood, one for almost every
day of the year. People traveled from across Arabia to worship them. When the Prophet
finally entered Mecca, he pointed at each idol, and one by one, they fell. A nation of a
thousand gods, returning to One."""


def settings(tmp_path: Path, **over) -> Settings:
    s = Settings()
    s.output_dir = tmp_path / "out"
    s.width, s.height, s.fps = 360, 640, 12
    s.keys = {k: "" for k in ("ANTHROPIC_API_KEY", "GEMINI_API_KEY", "GROQ_API_KEY",
                              "CLOUDFLARE_ACCOUNT_ID", "CLOUDFLARE_API_TOKEN",
                              "POLLINATIONS_API_KEY", "ELEVENLABS_API_KEY")}
    for k, v in over.items():
        if k.isupper():
            s.keys[k] = v
        else:
            setattr(s, k, v)
    return s


def tone_mp3(seconds: float) -> bytes:
    out = subprocess.run([ffmpeg_exe(), "-loglevel", "error", "-f", "lavfi", "-i",
                          f"sine=frequency=220:duration={seconds}", "-f", "mp3", "-"],
                         capture_output=True, check=True)
    return out.stdout


def png_bytes(w=512, h=512, color=(120, 80, 40)) -> bytes:
    buf = io.BytesIO()
    Image.new("RGB", (w, h), color).save(buf, "PNG")
    return buf.getvalue()


class FakeResp:
    def __init__(self, status=200, payload=None, content=b"", ctype="application/json"):
        self.status_code = status
        self._payload = payload
        self.content = content
        self.headers = {"content-type": ctype}
        self.text = json.dumps(payload) if payload is not None else content[:100].decode("latin1")
        self.ok = status < 400

    def json(self):
        return self._payload


# ----------------------------------------------------------------- parsing

def test_extract_json_variants():
    assert llm.extract_json('{"a": 1}') == {"a": 1}
    assert llm.extract_json('Sure!\n```json\n{"a": [1, 2,]}\n```') == {"a": [1, 2]}
    assert llm.extract_json('noise {"a": {"b": 2}} trailing') == {"a": {"b": 2}}
    with pytest.raises(llm.LLMError):
        llm.extract_json("no json here")


def test_parse_script_file_formats():
    structured = ("SCRIPT 1\n\nTitle: The Kaaba\nTopic: Mecca\nHook: Before Islam...\n\n"
                  "Script:\n" + KAABA + "\n\nVisual style suggestion: desert\n"
                  "Accuracy note: historical narrations\n\n**SCRIPT 2**\nTitle: Second\n"
                  "Script: " + KAABA)
    items = planner.parse_script_file(structured)
    assert [i["title"] for i in items] == ["The Kaaba", "Second"]
    assert items[0]["accuracy_note"] == "historical narrations"
    assert items[0]["script"].startswith("Before Islam")
    plain = planner.parse_script_file(KAABA + "\n---\n" + KAABA)
    assert len(plain) == 2 and plain[0]["hook"].startswith("Before Islam")


def test_heuristic_scenes_cover_script():
    plan = planner.heuristic_scenes(planner.clean_script(KAABA))
    assert planner.coverage(KAABA, plan["scenes"]) == 1.0
    assert all(s["motion"] for s in plan["scenes"])
    assert plan["scenes"][-1]["motion"] in ("zoom_out", "pan_up")


# ----------------------------------------------------------------- timing

def fake_spoken(text: str, drop_every: int = 0, rate: float = 0.32):
    words, t = [], 0.2
    for i, w in enumerate(text.split()):
        if drop_every and i % drop_every == 3:
            t += rate
            continue
        words.append({"text": w.strip(",.—"), "start": t, "end": t + rate * 0.8})
        t += rate + (0.35 if w.endswith(".") else 0)
    return words, t + 0.3


def test_word_times_monotonic_with_gaps():
    text = voice.speakable(KAABA)
    spoken, dur = fake_spoken(text, drop_every=7)
    words = timeline.word_times(text, spoken, dur)
    assert len(words) == len(text.split())
    starts = [w["start"] for w in words]
    assert starts == sorted(starts)
    assert all(0 <= w["start"] < w["end"] <= dur + 0.5 for w in words)


def test_scene_bounds_with_paraphrased_scene_text():
    text = voice.speakable(KAABA)
    spoken, dur = fake_spoken(text)
    words = timeline.word_times(text, spoken, dur)
    scenes = [{"text": "Before Islam, the Kaaba in Mecca was not a place of one God."},
              {"text": "Historical narrations describe roughly 360 idols around it"},
              {"text": "gods of stone and wood, one for nearly every day of the year."},
              {"text": "Pilgrims traveled across Arabia to worship them."},
              {"text": "When the Prophet entered Mecca he pointed at each idol"},
              {"text": "and one by one, they fell."},
              {"text": "A nation of a thousand gods, returning to One."}]
    bounds = timeline.scene_bounds(text, scenes, words, dur)
    assert len(bounds) == len(scenes)
    assert bounds[0][0] == 0 and abs(bounds[-1][1] - dur) < 1e-6
    for (a, b), (c, _) in zip(bounds, bounds[1:]):
        assert b == c and b - a >= 1.0
    # "and one by one" should start right where those words are spoken
    idx = next(i for i, w in enumerate(words) if w["text"].startswith("one") and
               words[i - 1]["text"] == "and")
    assert abs(bounds[5][0] - words[idx - 1]["start"]) < 0.6


def test_caption_chunks():
    words = [{"text": t, "start": i * 0.4, "end": i * 0.4 + 0.3}
             for i, t in enumerate("Before Islam, the Kaaba in Mecca was not.".split())]
    chunks = timeline.caption_chunks(words)
    texts = [" ".join(w["text"] for w in c["words"]) for c in chunks]
    assert texts[0] == "Before Islam"            # breaks after the comma
    assert all(len(c["words"]) <= 3 for c in chunks)
    assert texts[-1].endswith("not")             # trailing period removed


def test_elevenlabs_char_alignment():
    chars = list("Peace be")
    starts = [i * 0.1 for i in range(len(chars))]
    ends = [s + 0.08 for s in starts]
    words = voice.chars_to_words(chars, starts, ends)
    assert [w["text"] for w in words] == ["Peace", "be"]
    assert words[1]["start"] == pytest.approx(0.6)


# ----------------------------------------------------------------- script services

SCRIPT_REPLY = {"scripts": [{
    "title": "The Kaaba Before Islam", "topic": "Mecca", "hook": "Before Islam...",
    "script": KAABA, "visual_style": "desert", "accuracy_note": "historical narrations",
    "caption": "What changed everything?", "hashtags": ["Islam", "#Quran"]}]}


def test_gemini_request_and_parse(monkeypatch, tmp_path):
    seen = {}

    def fake_post(url, json=None, headers=None, timeout=None, **kw):
        seen.update(url=url, body=json, headers=headers)
        return FakeResp(payload={"candidates": [{"content": {"parts": [
            {"text": "thinking...", "thought": True},
            {"text": __import__("json").dumps(SCRIPT_REPLY)}]}, "finishReason": "STOP"}]})

    monkeypatch.setattr(llm.requests, "post", fake_post)
    s = settings(tmp_path, GEMINI_API_KEY="g-key")
    writer = llm.ScriptLLM(s)
    assert writer.describe() == "gemini"
    out = planner.write_scripts(writer, 1, ["Kaaba"], [])
    assert out[0]["title"] == "The Kaaba Before Islam"
    assert out[0]["hashtags"] == ["#Islam", "#Quran"]
    assert "gemini-flash-latest:generateContent" in seen["url"]
    assert seen["headers"]["x-goog-api-key"] == "g-key"
    assert seen["body"]["generationConfig"]["responseMimeType"] == "application/json"


def test_openai_compatible_fallback_chain(monkeypatch, tmp_path):
    calls = []

    def fake_post(url, json=None, headers=None, timeout=None, **kw):
        calls.append(url)
        if "groq" in url:
            return FakeResp(401, {"error": "bad key"})
        return FakeResp(payload={"choices": [{"message": {"content": __import__("json").dumps(
            SCRIPT_REPLY)}, "finish_reason": "stop"}]})

    monkeypatch.setattr(llm.requests, "post", fake_post)
    s = settings(tmp_path, GROQ_API_KEY="x", CLOUDFLARE_ACCOUNT_ID="acc",
                 CLOUDFLARE_API_TOKEN="tok")
    writer = llm.ScriptLLM(s)
    assert writer.describe() == "groq -> cloudflare"
    out = planner.write_scripts(writer, 1, None, [])
    assert out[0]["script"].startswith("Before Islam")
    assert any("accounts/acc/ai/v1/chat/completions" in c for c in calls)
    assert writer.describe() == "cloudflare"          # groq dropped after 401


def test_claude_provider_uses_structured_output(monkeypatch, tmp_path):
    captured = {}

    class Block:
        type = "text"
        text = json.dumps(SCRIPT_REPLY)

    class Msg:
        stop_reason = "end_turn"
        content = [Block()]

    class Stream:
        def __enter__(self):
            return self

        def __exit__(self, *a):
            return False

        def get_final_message(self):
            return Msg()

    class FakeClient:
        def __init__(self, **kw):
            self.beta = types.SimpleNamespace(messages=types.SimpleNamespace(stream=self.stream))

        def stream(self, **kw):
            captured.update(kw)
            return Stream()

    import anthropic
    monkeypatch.setattr(anthropic, "Anthropic", FakeClient)
    s = settings(tmp_path, ANTHROPIC_API_KEY="sk-ant")
    writer = llm.ScriptLLM(s)
    assert writer.describe().startswith("claude")
    out = planner.write_scripts(writer, 1, None, [])
    assert out[0]["title"] == "The Kaaba Before Islam"
    assert captured["model"] == "claude-opus-5-5"
    assert captured["fallbacks"] == "default"
    assert captured["betas"] == ["server-side-fallback-2026-07-01"]
    assert captured["output_config"]["format"]["type"] == "json_schema"


# ----------------------------------------------------------------- images

def test_cloudflare_and_pollinations_images(monkeypatch, tmp_path):
    def fake_post(url, json=None, headers=None, timeout=None, **kw):
        assert "@cf/black-forest-labs/flux-1-schnell" in url
        assert headers["Authorization"] == "Bearer tok"
        return FakeResp(payload={"result": {"image": base64.b64encode(png_bytes()).decode()},
                                 "success": True})

    def fake_get(url, params=None, headers=None, timeout=None, **kw):
        assert url.startswith("https://gen.pollinations.ai/image/")
        assert params["height"] == 1920
        return FakeResp(content=png_bytes(544, 960), ctype="image/png")

    monkeypatch.setattr(images.requests, "post", fake_post)
    monkeypatch.setattr(images.requests, "get", fake_get)
    s = settings(tmp_path, CLOUDFLARE_ACCOUNT_ID="acc", CLOUDFLARE_API_TOKEN="tok",
                 POLLINATIONS_API_KEY="pk")
    s.image_provider = "cloudflare"
    gen = images.ImageGenerator(s)
    assert gen.describe() == "cloudflare -> pollinations"
    res = gen.generate_many([("a desert at dawn", tmp_path / "a.png", 1, "scene 1")])
    assert res["scene 1"] == "cloudflare" and (tmp_path / "a.png").exists()
    s.image_provider = "pollinations"
    res = images.ImageGenerator(s).generate_many([("x", tmp_path / "b.png", 2, "scene 2")])
    assert res["scene 2"] == "pollinations"


def test_higgsfield_cli_with_nsfw_retry(monkeypatch, tmp_path):
    counter = tmp_path / "count"
    fake = tmp_path / "fake_hf.py"
    fake.write_text(
        "import sys, pathlib\n"
        f"c = pathlib.Path({str(counter)!r})\n"
        "n = int(c.read_text()) if c.exists() else 0\n"
        "c.write_text(str(n + 1))\n"
        "args = sys.argv[1:]\n"
        "assert args[:3] == ['generate', 'create', 'gpt_image_2'], args\n"
        "assert '--aspect_ratio' in args and '9:16' in args and '--wait' in args\n"
        "if n == 0:\n"
        "    print('abc ended with status \"nsfw\"'); sys.exit(3)\n"
        "print('https://cdn.example.com/hf_123.png')\n")
    launcher = tmp_path / ("hf.bat" if os.name == "nt" else "hf")
    if os.name == "nt":
        launcher.write_text(f'@"{sys.executable}" "{fake}" %*\n')
    else:
        launcher.write_text(f'#!/bin/sh\nexec "{sys.executable}" "{fake}" "$@"\n')
        launcher.chmod(0o755)
    monkeypatch.setattr(images, "download", lambda url: png_bytes(576, 1024))
    s = settings(tmp_path, higgsfield_cli=str(launcher))
    s.image_provider = "higgsfield"
    gen = images.ImageGenerator(s)
    assert gen.describe() == "higgsfield"
    res = gen.generate_many([("warriors with swords at dusk", tmp_path / "h.png", 1, "scene 1")])
    assert res["scene 1"] == "higgsfield"
    assert counter.read_text() == "2"                  # flagged once, softened, succeeded


# ----------------------------------------------------------------- voices

def test_edge_voice_mocked(monkeypatch, tmp_path):
    import edge_tts

    audio = tone_mp3(3.0)

    class FakeCommunicate:
        def __init__(self, text, voice_name, **kw):
            assert kw["boundary"] == "WordBoundary"
            self.words = text.split()

        async def stream(self):
            yield {"type": "audio", "data": audio}
            for i, w in enumerate(self.words[:8]):
                yield {"type": "WordBoundary", "offset": int(i * 0.35 * 1e7),
                       "duration": int(0.3 * 1e7), "text": w}

    monkeypatch.setattr(edge_tts, "Communicate", FakeCommunicate)
    s = settings(tmp_path)
    s.voice_provider = "edge"
    result = voice.Narrator(s).narrate("Peace be upon him, said the narrator softly today.",
                                       tmp_path)
    assert result["provider"] == "edge"
    assert 2.8 < result["duration"] < 3.3
    assert result["words"][1] == {"text": "be", "start": pytest.approx(0.35),
                                  "end": pytest.approx(0.65)}
    assert (tmp_path / "voice.wav").exists() and not (tmp_path / "voice_raw.mp3").exists()


def test_elevenlabs_voice_mocked(monkeypatch, tmp_path):
    text = "One God"
    chars = list(text)

    def fake_post(url, json=None, params=None, headers=None, timeout=None):
        assert "/with-timestamps" in url and headers["xi-api-key"] == "el"
        return FakeResp(payload={
            "audio_base64": base64.b64encode(tone_mp3(1.5)).decode(),
            "alignment": {"characters": chars,
                          "character_start_times_seconds": [i * 0.1 for i in range(len(chars))],
                          "character_end_times_seconds": [i * 0.1 + 0.09 for i in range(len(chars))]}})

    monkeypatch.setattr(voice.requests, "post", fake_post)
    s = settings(tmp_path, ELEVENLABS_API_KEY="el")
    result = voice.Narrator(s).narrate(text, tmp_path)
    assert result["provider"] == "elevenlabs"
    assert [w["text"] for w in result["words"]] == ["One", "God"]


# ----------------------------------------------------------------- full run

def test_full_pipeline_with_fake_services(monkeypatch, tmp_path):
    """Topic -> scripts -> scenes -> voice -> render, with fake script/voice services
    and free draft images. Checks the finished MP4 and side files."""
    from shorts import pipeline

    scene_reply = {"continuity": "", "scenes": [
        {"text": s, "visual": s, "prompt": f"scene about {s}", "motion": m}
        for s, m in zip(planner.split_sentences(KAABA.replace("\n", " ")),
                        ["zoom_in", "pan_left", "pan_up", "zoom_in", "zoom_out"])]}

    class FakeLLM(llm.Provider):
        name = "fake"

        def available(self):
            return True

        def generate_json(self, system, user, schema):
            return SCRIPT_REPLY if "scripts" in schema["properties"] else scene_reply

    class FakeVoice(voice.VoiceProvider):
        name = "fakevoice"

        def available(self):
            return True

        def synthesize(self, text, out_dir):
            raw = out_dir / "voice_raw.mp3"
            raw.write_bytes(tone_mp3(12.0))
            return raw, voice.estimate_words(text, 0.2, 11.8)

    monkeypatch.setattr(llm, "PROVIDERS", {"fake": FakeLLM})
    monkeypatch.setattr(voice, "PROVIDERS", {"fakevoice": FakeVoice})
    s = settings(tmp_path)
    pipe = pipeline.Pipeline(s)
    folders = pipe.plan(topic="the Kaaba", count=1)
    assert len(folders) == 1
    outs = pipe.produce(folders, draft=True)
    assert len(outs) == 1 and outs[0].exists()
    dur = media_duration(outs[0])
    assert 12.5 < dur < 13.6
    for name in ("cover.jpg", "storyboard.jpg", "post.txt", "project.json", "voice.wav"):
        assert (folders[0] / name).exists(), name
    post = (folders[0] / "post.txt").read_text(encoding="utf-8")
    assert "What changed everything?" in post and "#Quran" in post
    proj = json.loads((folders[0] / "project.json").read_text(encoding="utf-8"))
    assert len(proj["scenes"]) == 5
    assert all(sc["image_provider"] == "placeholder" for sc in proj["scenes"])
    history = json.loads((s.output_dir / "history.json").read_text(encoding="utf-8"))
    assert history[0]["title"] == "The Kaaba Before Islam"
