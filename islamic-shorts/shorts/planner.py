"""Turns topics or scripts into a full video plan: narration + illustrated scenes."""

from __future__ import annotations

import difflib
import re

from . import prompts
from .llm import LLMError, ScriptLLM
from .util import log

WORD_RE = re.compile(r"[\w']+", re.UNICODE)


def tokens(text: str) -> list[str]:
    return [t.lower().strip("'") for t in WORD_RE.findall(text) if t.strip("'")]


SENTENCE_RE = re.compile(r'(?<=[.!?])\s+|(?<=[.!?]["\'\u201d\u2019)])\s+')


def split_sentences(text: str) -> list[str]:
    return [s.strip() for s in SENTENCE_RE.split(text) if s and s.strip()]


def word_count(text: str) -> int:
    return len(tokens(text))


def clean_script(text: str) -> str:
    text = text.replace("\r", "")
    text = re.sub(r"\*\*|__|#+ ", "", text)               # markdown emphasis/headings
    text = re.sub(r"\[(?:pause|music|sfx)[^\]]*\]", "", text, flags=re.I)
    text = re.sub(r"[ \t]+", " ", text)
    text = re.sub(r"\n{2,}", "\n\n", text)
    return text.strip().strip('"').strip("“”").strip()


# ---------------------------------------------------------------- script writing

def _validate_scripts(data: dict) -> None:
    items = data.get("scripts")
    if not isinstance(items, list) or not items:
        raise LLMError("no scripts in reply")
    for item in items:
        if not isinstance(item, dict) or word_count(str(item.get("script", ""))) < 40:
            raise LLMError("a script was missing or too short")


def _normalize_script(item: dict) -> dict:
    script = clean_script(str(item.get("script", "")))
    first_sentence = (split_sentences(script) or [""])[0]
    tags = []
    for tag in item.get("hashtags") or []:
        tag = "#" + re.sub(r"[^\w]", "", str(tag).lstrip("#"))
        if len(tag) > 1 and tag.lower() not in {t.lower() for t in tags}:
            tags.append(tag)
    return {
        "title": str(item.get("title") or first_sentence[:60]).strip(),
        "topic": str(item.get("topic") or "").strip(),
        "hook": str(item.get("hook") or first_sentence).strip(),
        "script": script,
        "visual_style": str(item.get("visual_style") or "").strip(),
        "accuracy_note": str(item.get("accuracy_note") or "").strip(),
        "caption": str(item.get("caption") or "").strip(),
        "hashtags": tags or ["#Islam", "#Quran", "#IslamicHistory", "#Prophets",
                             "#Muslim"],
    }


def write_scripts(llm: ScriptLLM, count: int, topics: list[str] | None,
                  avoid: list[str], theme: str = "") -> list[dict]:
    wanted = len(topics) if topics else count
    results: list[dict] = []
    pending_topics = list(topics) if topics else None
    while len(results) < wanted:
        batch = min(8, wanted - len(results))
        batch_topics = pending_topics[:batch] if pending_topics else None
        log(f"Writing {batch} script(s) with {llm.describe()}...")
        data = llm.generate_json(
            prompts.SCRIPT_WRITER_SYSTEM,
            prompts.scripts_request(batch, batch_topics,
                                    avoid + [r["title"] for r in results], theme),
            prompts.SCRIPTS_SCHEMA, validate=_validate_scripts, what="scripts")
        new = [_normalize_script(x) for x in data["scripts"]][:batch]
        if not new:
            raise LLMError("The script writer returned no scripts.")
        results.extend(new)
        if pending_topics:
            pending_topics = pending_topics[len(new):]
    return results[:wanted]


# ---------------------------------------------------------------- art direction

def coverage(script: str, scenes: list[dict]) -> float:
    a = tokens(script)
    b = tokens(" ".join(s.get("text", "") for s in scenes))
    if not a:
        return 0.0
    sm = difflib.SequenceMatcher(None, a, b, autojunk=False)
    matched = sum(m.size for m in sm.get_matching_blocks())
    return matched / len(a)


def _fix_motions(scenes: list[dict]) -> None:
    cycle = ["zoom_in", "pan_right", "zoom_out", "pan_up", "pan_left", "zoom_in", "pan_down"]
    for i, sc in enumerate(scenes):
        m = str(sc.get("motion", "")).strip().lower().replace("-", "_").replace(" ", "_")
        if m not in prompts.MOTIONS:
            m = cycle[i % len(cycle)]
        if i >= 2 and scenes[i - 1]["motion"] == m and scenes[i - 2]["motion"] == m:
            m = next(x for x in cycle if x != m)
        sc["motion"] = m
    if scenes and scenes[-1]["motion"] not in ("zoom_out", "pan_up"):
        scenes[-1]["motion"] = "zoom_out"   # endings breathe out


def direct_scenes(llm: ScriptLLM, title: str, script: str) -> dict:
    words = word_count(script)
    target = max(6, min(22, round(words / 11)))

    def validate(data: dict) -> None:
        scenes = data.get("scenes")
        if not isinstance(scenes, list) or len(scenes) < 3:
            raise LLMError("too few scenes")
        for sc in scenes:
            if not str(sc.get("text", "")).strip() or not str(sc.get("prompt", "")).strip():
                raise LLMError("a scene is missing text or prompt")
        cov = coverage(script, scenes)
        if cov < 0.85:
            raise LLMError(f"scenes only cover {cov:.0%} of the script")

    log(f"Directing scenes for '{title}' ({words} words, ~{target} images)...")
    data = llm.generate_json(prompts.ART_DIRECTOR_SYSTEM,
                             prompts.scenes_request(title, script, target),
                             prompts.SCENES_SCHEMA, validate=validate, what="scenes")
    scenes = [{
        "text": str(sc["text"]).strip(),
        "visual": str(sc.get("visual", "")).strip(),
        "prompt": str(sc["prompt"]).strip(),
        "motion": str(sc.get("motion", "")),
    } for sc in data["scenes"]]
    _fix_motions(scenes)
    return {"continuity": str(data.get("continuity", "")).strip(), "scenes": scenes}


def heuristic_scenes(script: str) -> dict:
    """Offline fallback when no script service is configured: split the narration
    into 8-15 word moments and illustrate each one literally."""
    sentences = split_sentences(script)
    chunks: list[str] = []
    for sent in sentences:
        words = sent.split()
        while len(words) > 18:
            cut = 12
            for j in range(8, min(16, len(words) - 4)):
                if words[j - 1].endswith((",", ";", ":", "—", "-")):
                    cut = j
            chunks.append(" ".join(words[:cut]))
            words = words[cut:]
        if words:
            if chunks and len(words) < 5 and len(chunks[-1].split()) < 12:
                chunks[-1] += " " + " ".join(words)
            else:
                chunks.append(" ".join(words))
    scenes = []
    for chunk in chunks:
        scenes.append({
            "text": chunk,
            "visual": chunk,
            "prompt": (f"A sacred, symbolic scene from the ancient Islamic world that "
                       f"illustrates: \"{chunk}\". No prophets or holy figures shown - "
                       f"use light, landscapes, ancient cities, lamps, and people "
                       f"seen from afar"),
            "motion": "",
        })
    _fix_motions(scenes)
    return {"continuity": "", "scenes": scenes}


def plan_scenes(llm: ScriptLLM, title: str, script: str) -> dict:
    if llm.ready:
        try:
            return direct_scenes(llm, title, script)
        except LLMError as exc:
            log(f"Scene planning failed ({exc}); using simple automatic scenes.")
    else:
        log("No script service configured - using simple automatic scenes.")
    return heuristic_scenes(script)


# ---------------------------------------------------------------- script files

_FIELD_LABELS = {
    "title": r"title",
    "topic": r"topic",
    "hook": r"hook",
    "script": r"script",
    "visual_style": r"visual style(?: suggestion)?",
    "accuracy_note": r"accuracy note",
    "caption": r"caption",
    "hashtags": r"hashtags",
    "_words": r"approximate word count",
}


def parse_script_file(text: str) -> list[dict]:
    """Accepts plain narration, several scripts separated by '---', or the
    'SCRIPT 1 / Title: / Script: / Accuracy note:' format from the script prompt."""
    text = text.replace("\r", "")
    blocks = re.split(r"(?im)^\s*[*#\s]*SCRIPT\s+\d+\s*[*:]*\s*$", text)
    blocks = [b for b in blocks if b.strip()]
    if len(blocks) <= 1:
        blocks = [b for b in re.split(r"(?m)^\s*(?:-{3,}|={3,})\s*$", text) if b.strip()]
    results = []
    label_re = re.compile(
        r"(?im)^[\s*#_]*(" + "|".join(_FIELD_LABELS.values()) + r")[\s*_]*:[\s*_]*")
    for block in blocks:
        found = list(label_re.finditer(block))
        if not any(m.group(1).lower().startswith("script") for m in found):
            item = {"script": block}
        else:
            item = {}
            for i, m in enumerate(found):
                end = found[i + 1].start() if i + 1 < len(found) else len(block)
                value = block[m.end():end].strip()
                label = m.group(1).lower()
                for key, pattern in _FIELD_LABELS.items():
                    if re.fullmatch(pattern, label):
                        item[key] = value
                        break
        if isinstance(item.get("hashtags"), str):
            item["hashtags"] = re.findall(r"#\w+", item["hashtags"])
        if word_count(item.get("script", "")) >= 10:
            results.append(_normalize_script(item))
    return results
