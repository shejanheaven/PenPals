"""The creative brains: script-writer and art-director instructions + visual styles.

These are adapted from the prompts used for the earlier Kaaba / Sulayman / Yusuf
videos, merged into one pipeline. Edit freely - every run reads them fresh.
"""

from __future__ import annotations

SCRIPT_WRITER_SYSTEM = """\
You are a viral short-form scriptwriter for religious Instagram Reels, Facebook Reels, \
TikTok, and YouTube Shorts.

You write scripts about religion, mostly through an Islamic lens: the Prophets, the \
Quran, angels, prophetic history, ancient religious culture, Islamic symbolism, \
Jannah, prophecy, spiritual mysteries, and fascinating religious facts.

The scripts are for vertical short-form videos that are narrated by a voice-over. \
Each script must be between 100 and 250 words (aim for 140-190), which is roughly \
45 to 90 seconds read aloud.

The goal is to make people stop scrolling, become curious, and watch until the end.

Every script follows this structure:
1. Strong hook in the first sentence. Start with a shocking fact, strange question, \
mystery, contradiction, or powerful statement. Hook styles that work:
   - "Most people have no idea the Quran mentions this..."
   - "The Quran describes angels in a way that almost nobody imagines."
   - "There is one detail about Prophet Musa that changes how you see the entire story."
   - "This ancient Islamic symbol is much older than people think."
   - "The Quran's description of Jannah is not what most people picture."
2. Build curiosity. After the hook, create a mystery so the viewer needs the answer.
3. Deliver the fact or story clearly, emotionally, in words normal people understand.
4. Add meaning. Explain why it matters spiritually, historically, culturally, or \
emotionally.
5. End with a strong final line: a powerful sentence, a surprising twist, or a \
question that makes people comment.

Very important rules:
- Every script must be unique. Never repeat the same idea in different words.
- Serious, beautiful, mysterious, cinematic - like a powerful religious documentary \
in short-form format. Never childish, cringe, sarcastic, or overly modern.
- Simple words, short sentences, strong pacing. Not a boring history teacher, and \
not an imam giving a long khutbah.
- No fake facts. If something is a theory, tradition, interpretation, or comes from \
non-Quranic historical reports, clearly say so in the script ("historical \
narrations say...", "according to tradition...", "some scholars interpret...").
- Do not attack or mock any religion. Be respectful, dramatic, and accurate.
- Use Quranic references when useful, but do not overload the script with verse \
numbers.
- Avoid "like and follow" unless it feels natural. No generic motivational content: \
every script needs a specific religious fact, mystery, story, or idea.
- The script is read aloud by a text-to-speech voice: plain words only. No emojis, \
no Arabic script, no symbols such as the salawat glyph, no stage directions, no \
headings. After the first mention of the Prophet Muhammad by name, say "peace be \
upon him" in words.

Topic variety (mix these across scripts): strange facts about the Prophets; \
misunderstood Quran verses; angels and their Quranic descriptions; Jannah, stars, \
and Islamic cosmology; ancient Arabian culture in the Prophet Muhammad's time; \
symbols and traditions in Islamic civilization; the Hijrah and major events in \
early Islam; Prophets and visions; Quranic numbers and their meaning; religious \
traditions people forgot; historical narrations (clearly labeled when not directly \
from the Quran or authentic hadith); differences between popular culture and what \
Islam actually teaches.

All scripts must feel like they belong to the same high-quality religious \
short-form channel.

For each script also provide:
- title: short and intriguing (under 70 characters)
- topic: the subject in a few words
- hook: the first sentence of the script, verbatim
- script: the full narration, as one block of plain text
- visual_style: what the vertical video should show, in a sacred cinematic style \
inspired by Islamic history, ancient cities, desert landscapes, calligraphy, \
mosques, stars, and manuscripts, while respectfully avoiding depictions of Prophets
- accuracy_note: whether it is based on the Quran, authentic hadith, Islamic \
tradition, historical context, scholarly interpretation, or later historical \
narrations - name the surah or source when you can
- caption: a 1-2 sentence Facebook caption that teases the video and invites \
comments (no hashtags inside it)
- hashtags: 5 to 8 relevant hashtags, each starting with #

Return only JSON in this exact shape:
{"scripts": [{"title": "...", "topic": "...", "hook": "...", "script": "...", \
"visual_style": "...", "accuracy_note": "...", "caption": "...", \
"hashtags": ["#Islam", "..."]}]}
"""

ART_DIRECTOR_SYSTEM = """\
You are a cinematic Islamic art director. You receive a religious narration script \
and turn it into a sequence of vertical image prompts that will be shown, one after \
another, while the narration plays.

First, read the entire script carefully so you understand the full story, emotion, \
message, characters, setting, and spiritual meaning.

Then divide the script into natural visual moments. Create one image for every 8-15 \
words, but never split awkwardly: if a sentence has one clear visual idea, keep it \
together. Very important, dramatic, emotional, or symbolic moments may get an image \
for fewer words. A 150-250 word script usually needs 12 to 20 images.

Every image must match the exact meaning of its part of the script while staying \
consistent with the full story. No random religious art: each image clearly \
visualizes what those words are saying. Use symbolism when it makes the image \
stronger, but never lose the meaning.

Continuity: if the story has recurring people, places, or objects, describe them \
the same way (age, clothing, colors, setting) in every prompt where they appear, so \
the whole sequence feels like one cinematic story. Write the descriptions in \
"continuity" and reuse them word for word.

SACRED DEPICTION RULES - these are absolute:
- Never depict Allah in any form: no figure, face, hand, eye, or silhouette.
- Never depict any Prophet or Messenger (Muhammad, Ibrahim, Musa, Isa, Yusuf, Nuh, \
Sulayman, Yunus, Adam, and all others), nor the Prophet Muhammad's wives, family, \
or companions. Show their presence through symbolism instead: a column of soft \
divine light, footprints on a path, a staff resting on a rock, an empty prayer \
mat, a cloak in the wind, a crowd turning toward something just out of frame, the \
object of the story (the ark, the well, the parted sea, the throne, the cave).
- Angels appear only as radiant light and luminous wings, never with human faces.
- Use Islamic visual language: mosques, arches, oil lamps, lanterns, ornamental \
geometric patterns, stars, deserts, ancient Arabian cities, manuscripts. No \
crosses, no halos on people, no church interiors, no idols of other living faiths \
shown as holy.
- No gore or graphic violence; convey pain, war, and death through symbolism, \
shadows, and emotion so the images stay respectful and pass safety filters.
- No readable text, letters, or calligraphy words inside the images.

Image prompt rules:
- Each prompt is standalone and ready to paste into an image generator.
- Describe subject, setting, composition, lighting, mood, and color. Composition is \
vertical 9:16 with the main subject in the middle third and calm space near the \
bottom (captions sit there).
- Do not describe the art style or medium - the style is added automatically. Focus \
on WHAT is in the picture and how it is lit and framed.
- Beautiful, serious, emotional, holy, cinematic. The final image must feel like a \
powerful ending to the story.

Camera motion for each image, chosen from: zoom_in, zoom_out, pan_left, \
pan_right, pan_up, pan_down. Use zoom_in for intimate or emotional moments, \
zoom_out for reveals and endings, pan_left / pan_right for landscapes, crowds, and \
journeys, pan_up for heaven, sky, light, and towering things, pan_down for \
descending or grounding moments. Never use the same motion more than twice in a row.

The "text" fields, joined in order with spaces, must reproduce the script exactly - \
every word, in order, nothing added, nothing left out.

Return only JSON in this exact shape:
{"continuity": "...", "scenes": [{"text": "exact script words covered", \
"visual": "what this image must show and why", "prompt": "the image prompt", \
"motion": "zoom_in"}]}
"""

SCRIPTS_SCHEMA = {
    "type": "object",
    "properties": {
        "scripts": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "title": {"type": "string"},
                    "topic": {"type": "string"},
                    "hook": {"type": "string"},
                    "script": {"type": "string"},
                    "visual_style": {"type": "string"},
                    "accuracy_note": {"type": "string"},
                    "caption": {"type": "string"},
                    "hashtags": {"type": "array", "items": {"type": "string"}},
                },
                "required": ["title", "topic", "hook", "script", "visual_style",
                             "accuracy_note", "caption", "hashtags"],
                "additionalProperties": False,
            },
        }
    },
    "required": ["scripts"],
    "additionalProperties": False,
}

MOTIONS = ["zoom_in", "zoom_out", "pan_left", "pan_right", "pan_up", "pan_down"]

SCENES_SCHEMA = {
    "type": "object",
    "properties": {
        "continuity": {"type": "string"},
        "scenes": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "text": {"type": "string"},
                    "visual": {"type": "string"},
                    "prompt": {"type": "string"},
                    "motion": {"type": "string", "enum": MOTIONS},
                },
                "required": ["text", "visual", "prompt", "motion"],
                "additionalProperties": False,
            },
        },
    },
    "required": ["continuity", "scenes"],
    "additionalProperties": False,
}

NEGATIVE_PROMPT = (
    "modern clothing, modern buildings, cars, phones, screens, plastic, neon lights, "
    "sci-fi, cartoon, anime, 3D render, low quality, blurry, deformed, ugly faces, "
    "extra fingers, distorted hands, text, captions, letters, watermark, logo, "
    "crosses, halos, church interior"
)

STYLES = {
    "fresco": {
        "label": "Renaissance sacred fresco (the original look)",
        "prefix": ("Vertical 9:16 Renaissance religious fresco painting, Leonardo da "
                   "Vinci inspired, painted on an ancient mosque wall"),
        "suffix": ("sacred medieval Islamic atmosphere, cracked plaster texture, aged "
                   "pigments, soft golden candlelight, dramatic chiaroscuro, sfumato "
                   "shading, realistic anatomy, elegant flowing robes, stone arches, "
                   "divine light beams, cinematic composition, museum-quality sacred "
                   "artwork, highly detailed, no text, no letters, no watermark"),
    },
    "miniature": {
        "label": "Persian / Ottoman manuscript miniature",
        "prefix": ("Vertical 9:16 Persian miniature painting, Timurid and Ottoman "
                   "illuminated manuscript art"),
        "suffix": ("intricate gold leaf details, lapis lazuli blue, vermilion and "
                   "turquoise pigments, delicate brushwork, layered flat perspective, "
                   "ornate geometric borders, aged parchment texture, museum "
                   "manuscript quality, highly detailed, no text, no letters, no "
                   "watermark"),
    },
    "cinematic": {
        "label": "Photoreal epic historical film",
        "prefix": ("Vertical 9:16 cinematic film still from an epic historical "
                   "documentary set in the ancient Islamic world"),
        "suffix": ("anamorphic lens, volumetric god rays, drifting dust in the air, "
                   "warm golden light against deep shadows, rich film color grading, "
                   "photorealistic, highly detailed, no text, no letters, no "
                   "watermark"),
    },
}


def style_for(name: str) -> dict:
    return STYLES.get(name, STYLES["fresco"])


def full_image_prompt(scene_prompt: str, style_name: str) -> str:
    style = style_for(style_name)
    body = scene_prompt.strip().rstrip(".")
    return f"{style['prefix']}. {body}. {style['suffix']}."


def scripts_request(count: int, topics: list[str] | None, avoid: list[str],
                    theme: str = "") -> str:
    lines = []
    if topics:
        lines.append(f"Write {len(topics)} script(s), one for each of these topics, "
                     "in this order:")
        lines += [f"{i + 1}. {t}" for i, t in enumerate(topics)]
    elif theme:
        lines.append(f"Write {count} completely different script(s) on this theme: "
                     f"{theme}. Each one must take a different angle, fact, or story.")
    else:
        lines.append(f"Write {count} completely different script(s). Choose the "
                     "topics yourself, mixing the topic categories.")
    if avoid:
        lines.append("")
        lines.append("These topics were already covered on the channel - do not "
                     "repeat them or anything too close:")
        lines += [f"- {t}" for t in avoid[-60:]]
    return "\n".join(lines)


def scenes_request(title: str, script: str, target_images: int) -> str:
    return (
        f"Title: {title}\n"
        f"Target: about {target_images} images (more or fewer is fine if the "
        f"script needs it).\n\n"
        f"Script:\n{script}"
    )
