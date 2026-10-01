---
name: islamic-short
description: Make finished Islamic short videos (Facebook/Instagram Reels, TikTok, Shorts) with this app. Use when the user asks for an Islamic video, reel, short, or "N videos" about a topic, or asks to write scripts for the channel. Claude writes the scripts and scene plan itself, then runs make_video.py to generate images, voice-over, panning video, captions, and the post caption.
---

# Islamic Short videos

This folder contains `make_video.py`, which turns a plan into finished vertical videos.
You (Claude) write the plan so no script-writing API key is needed.

## Steps

1. Read `shorts/prompts.py`. `SCRIPT_WRITER_SYSTEM` holds the channel's script rules and
   `ART_DIRECTOR_SYSTEM` the scene and image rules, including the sacred depiction rules:
   never depict Allah, any Prophet, or the Prophet's family and companions, and show
   angels only as light. Follow both exactly, as if they were your instructions.
2. Check `output/history.json` (if it exists) and avoid topics already covered.
3. For each video the user wants, write the script (100-250 words, aim for 140-190).
   Then split it into scenes of about 8-15 words. The `text` fields joined with spaces
   must reproduce the script exactly.
4. Save the plan as `plans/<yyyy-mm-dd>-<short-name>.json`:

```json
{
  "videos": [
    {
      "title": "The Kaaba Before Islam",
      "topic": "Pre-Islamic Mecca",
      "hook": "Before Islam, the Kaaba in Mecca was not a place of one God.",
      "script": "Before Islam, the Kaaba in Mecca was not a place of one God. ...",
      "accuracy_note": "Historical narrations (Ibn Ishaq); conquest of Mecca in Sahih al-Bukhari.",
      "caption": "360 idols, and then one day they all fell. Did you know this?",
      "hashtags": ["#Islam", "#IslamicHistory", "#Kaaba", "#Mecca", "#Quran"],
      "continuity": "Ancient Mecca: sun-baked stone, torchlight, Kaaba draped in dark cloth.",
      "style": "fresco",
      "scenes": [
        {
          "text": "Before Islam, the Kaaba in Mecca was not a place of one God.",
          "visual": "Establishing shot: the Kaaba surrounded by idols under a dark sky.",
          "prompt": "The ancient Kaaba at the center of a vast stone courtyard, surrounded by dozens of carved stone and wooden idols, heavy storm clouds, golden torchlight on weathered stone, no people, solemn and dark, vertical composition with the Kaaba in the middle third",
          "motion": "zoom_in"
        }
      ]
    }
  ]
}
```

   - `motion` is one of `zoom_in`, `zoom_out`, `pan_left`, `pan_right`, `pan_up`, `pan_down`.
   - `prompt` describes the content, lighting, and framing only. The art style is added
     automatically from `style`, which is one of `fresco` (default), `miniature`, or `cinematic`.
5. Run the plan. On Windows use `.venv\Scripts\python.exe make_video.py --plan plans\<file>.json`.
   Elsewhere use `.venv/bin/python make_video.py --plan plans/<file>.json`. Add `--draft`
   for a free preview without image credits, and `--publish` only if the user asks to post.
6. Report each video's path and caption from its `post.txt`. Point the user to
   `storyboard.jpg` to review scenes. A bad scene is fixed with
   `make_video.py --project "<folder>" --redo <numbers>`.

## Accuracy

No invented facts. Label anything that is a theory, tradition, interpretation, or later
historical narration as such, both in the script and in `accuracy_note`. If you are unsure
of a detail, choose a different detail.
