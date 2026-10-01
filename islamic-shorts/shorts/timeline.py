"""Lines the scenes and captions up with the recorded narration."""

from __future__ import annotations

import difflib
import re

from .planner import tokens

PUNCT_END = (".", "!", "?", ",", ";", ":", "—", "–")


def _script_words(text: str) -> list[dict]:
    """Script words (as written) with their normalized tokens."""
    out = []
    for raw in text.split():
        toks = tokens(raw)
        out.append({"raw": raw, "toks": toks})
    return out


def word_times(script: str, spoken: list[dict], duration: float) -> list[dict]:
    """Give every written script word a start/end time using the TTS word timings.

    The TTS may split or merge words ("360" vs "three hundred sixty", "Allah's"),
    so the two token streams are matched with difflib and gaps are interpolated.
    """
    words = _script_words(script)
    s_tokens, s_owner = [], []
    for i, w in enumerate(words):
        for t in w["toks"]:
            s_tokens.append(t)
            s_owner.append(i)
    v_tokens, v_owner = [], []
    for j, w in enumerate(spoken):
        for t in tokens(str(w.get("text", ""))):
            v_tokens.append(t)
            v_owner.append(j)

    start = [None] * len(words)
    end = [None] * len(words)
    sm = difflib.SequenceMatcher(None, s_tokens, v_tokens, autojunk=False)
    for a, b, size in sm.get_matching_blocks():
        for k in range(size):
            wi, sj = s_owner[a + k], v_owner[b + k]
            st, en = float(spoken[sj]["start"]), float(spoken[sj]["end"])
            start[wi] = st if start[wi] is None else min(start[wi], st)
            end[wi] = en if end[wi] is None else max(end[wi], en)

    # Interpolate words the matcher could not place.
    known = [i for i in range(len(words)) if start[i] is not None]
    if not known:
        step = duration / max(1, len(words))
        for i in range(len(words)):
            start[i], end[i] = i * step, (i + 0.9) * step
    else:
        i = 0
        while i < len(words):
            if start[i] is not None:
                i += 1
                continue
            j = i
            while j < len(words) and start[j] is None:
                j += 1
            # words[i:j] are unplaced; share the gap between their neighbours.
            lo = end[i - 1] if i > 0 else 0.0
            hi = start[j] if j < len(words) else duration
            hi = max(hi, lo + 0.05 * (j - i))
            step = (hi - lo) / (j - i)
            for k in range(i, j):
                start[k] = lo + step * (k - i)
                end[k] = start[k] + step * 0.9
            i = j
    result = []
    for w, st, en in zip(words, start, end):
        result.append({"text": w["raw"], "start": float(st), "end": float(max(en, st + 0.05))})
    # Keep times monotonic.
    for i in range(1, len(result)):
        if result[i]["start"] < result[i - 1]["start"]:
            result[i]["start"] = result[i - 1]["start"]
            result[i]["end"] = max(result[i]["end"], result[i]["start"] + 0.05)
    return result


def scene_bounds(script: str, scenes: list[dict], words: list[dict],
                 duration: float, min_len: float = 1.3) -> list[tuple[float, float]]:
    """Start/end time for each scene. Cuts land in the pause before the scene's
    first word. Very short scenes are stretched by borrowing from neighbours."""
    n = len(scenes)
    s_tokens = []
    for w in _script_words(script):
        s_tokens.append(w["toks"])
    flat, owner = [], []
    for i, toks in enumerate(s_tokens):
        for t in toks:
            flat.append(t)
            owner.append(i)
    scene_flat, scene_owner = [], []
    for k, sc in enumerate(scenes):
        for t in tokens(sc.get("text", "")):
            scene_flat.append(t)
            scene_owner.append(k)

    first_word: list[int | None] = [None] * n
    sm = difflib.SequenceMatcher(None, scene_flat, flat, autojunk=False)
    for a, b, size in sm.get_matching_blocks():
        for k in range(size):
            sc_i = scene_owner[a + k]
            wi = owner[b + k]
            if first_word[sc_i] is None or wi < first_word[sc_i]:
                first_word[sc_i] = wi

    # Scenes that matched nothing: spread them between their neighbours.
    total_words = max(1, len(words))
    for k in range(n):
        if first_word[k] is None:
            prev = next((first_word[j] for j in range(k - 1, -1, -1) if first_word[j] is not None), 0)
            nxt = next((first_word[j] for j in range(k + 1, n) if first_word[j] is not None),
                       total_words)
            first_word[k] = (prev + nxt) // 2 if k else 0
    first_word[0] = 0
    for k in range(1, n):  # monotonic
        first_word[k] = max(first_word[k], first_word[k - 1])

    cuts = [0.0]
    for k in range(1, n):
        wi = min(first_word[k], len(words) - 1)
        if wi <= 0:
            cuts.append(cuts[-1])
            continue
        gap_start = words[wi - 1]["end"]
        gap_end = words[wi]["start"]
        cut = (gap_start + gap_end) / 2 if gap_end > gap_start else gap_end - 0.05
        cuts.append(max(cuts[-1], cut))
    cuts.append(duration)

    bounds = [[cuts[k], cuts[k + 1]] for k in range(n)]
    # Stretch scenes that are too short.
    for _ in range(3):
        for k in range(n):
            length = bounds[k][1] - bounds[k][0]
            if length >= min_len:
                continue
            need = min_len - length
            left = bounds[k - 1][1] - bounds[k - 1][0] - min_len if k > 0 else 0
            right = bounds[k + 1][1] - bounds[k + 1][0] - min_len if k + 1 < n else 0
            take_r = min(max(0.0, right), need)
            if k + 1 < n and take_r > 0:
                bounds[k][1] += take_r
                bounds[k + 1][0] += take_r
                need -= take_r
            take_l = min(max(0.0, left), need)
            if k > 0 and take_l > 0:
                bounds[k][0] -= take_l
                bounds[k - 1][1] -= take_l
    return [(round(a, 3), round(b, 3)) for a, b in bounds]


def caption_chunks(words: list[dict], max_words: int = 3, max_chars: int = 18,
                   linger: float = 0.35) -> list[dict]:
    """Group timed words into short on-screen captions (TikTok/Reels style)."""
    chunks: list[dict] = []
    cur: list[dict] = []

    def flush():
        if cur:
            chunks.append({"words": list(cur), "start": cur[0]["start"], "end": cur[-1]["end"]})
            cur.clear()

    for w in words:
        text = clean_caption_word(w["text"])
        if not text:
            continue
        item = {"text": text, "start": w["start"], "end": w["end"]}
        length = sum(len(x["text"]) + 1 for x in cur) + len(text)
        if cur and (len(cur) >= max_words or length > max_chars):
            flush()
        cur.append(item)
        if w["text"].rstrip("\"'”’)").endswith(PUNCT_END):
            flush()
    flush()
    # Each caption stays until the next one starts (or a short linger).
    for i, ch in enumerate(chunks):
        nxt = chunks[i + 1]["start"] if i + 1 < len(chunks) else ch["end"] + 1.0
        ch["end"] = min(nxt, max(ch["end"] + linger, ch["end"]))
        if nxt - ch["end"] < 0.25:
            ch["end"] = nxt
    return chunks


def clean_caption_word(word: str) -> str:
    word = re.sub(r"[^\w'’?!\-—.,:;\"“”]", "", word, flags=re.UNICODE)
    word = word.strip("\"“”")
    word = word.rstrip(".,;:—–-")
    if not re.search(r"\w", word):
        return ""
    return word
