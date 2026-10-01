# Islamic Shorts

One click turns a topic into a finished vertical video for Facebook Reels (and Instagram,
TikTok, YouTube Shorts). Each video goes through these steps in a single run:

1. **Script.** Your viral-script prompt: hook, mystery, story, meaning, strong ending.
   Sources are labeled, there are no fake facts, and a different topic is picked every time.
2. **Scenes.** The art-director prompt splits the script into one illustrated moment per
   8–15 words. Characters stay consistent, and Allah, the Prophets, and the Prophet's
   family and companions are never depicted.
3. **Images.** Generated in parallel. The default style is the Renaissance-fresco look
   from the earlier videos.
4. **Voice-over.** Recorded at the same time as the images.
5. **Video.**
   - A smooth zoom or pan on every scene, with cuts timed to the narration.
   - Crossfades, a candle-flicker vignette, film grain, and drifting golden dust.
   - Word-by-word captions with the spoken word in gold.
   - 1080x1920 output at about 6 Mbps.
6. **Posting kit.** `post.txt` holds the caption, hashtags, and an accuracy note to
   double-check. You also get `cover.jpg` (thumbnail) and `storyboard.jpg` (every scene
   at a glance).
7. **Optional.** Auto-post to your Facebook Page as a Reel.

## Which services it uses

Out of the box everything is **free and needs no accounts or keys**. `FREE_ONLY=true`
in `.env` (the default) guarantees no paid service is ever used.

| Step | Free (default) | Paid upgrades (only when `FREE_ONLY=false`) |
|---|---|---|
| Script | Already-written plans, **Claude Code** (no key, see below), free **Pollinations** (no account), or free keys for Gemini / Groq / Cloudflare | Claude API |
| Images | **Your NVIDIA graphics card** (SDXL-Lightning, unlimited, run `setup-local-images.bat` once), free **Pollinations** (no account, rate limited), or free **Cloudflare** keys (~100/day) | Higgsfield CLI, GPT Image 2 |
| Voice | **Microsoft Edge neural voices** (no account) | ElevenLabs |
| Panning, captions, editing | Built in (FFmpeg) | – |

Each step automatically uses the best free option that is available and falls back to
the next one if a service fails.

## Setup (Windows, about 5 minutes)

**Fastest way:** open **PowerShell** and paste this one line. It installs everything
into `Desktop\Islamic Shorts App`, picks a free image source, and makes the first
three videos:

```powershell
irm https://raw.githubusercontent.com/shejanheaven/PenPals/refs/heads/claude/compassionate-ramanujan-7hzji4/islamic-shorts/install-and-run.ps1 | iex
```

Or do it step by step:

1. Install **Python 3.11 or newer** from https://www.python.org/downloads/ and tick
   **"Add python.exe to PATH"**.
2. Double-click **`setup.bat`**. It installs everything, including FFmpeg, and creates
   a `.env` file. Nothing in `.env` has to be filled in.
3. **Optional, recommended if you have an NVIDIA graphics card:** double-click
   **`setup-local-images.bat`**. Images are then made on your own PC: free, unlimited,
   and no waiting on anyone's servers. The first video downloads the image model once
   (about 12 GB).
4. Run `python make_video.py --check` (setup.bat does this) to see which services work.

Then double-click **`Make Video.bat`**, type a topic (or leave it empty), and choose how
many videos. The finished videos appear in the `output` folder.

## Everyday use

Run these from this folder with `.venv\Scripts\python.exe make_video.py ...`, or use the
`.bat` files.

```text
make_video.py "the night Prophet Yunus was swallowed by the whale"    one video on a topic
make_video.py --count 10                                              10 videos, fresh topics
make_video.py "angels in the Quran" --count 3                         3 angles on one theme
make_video.py --topics topics.txt                                     one video per line
make_video.py --script my_scripts.txt                                 your own script(s)
make_video.py --draft "Hajj"                                          free preview, stand-in art
make_video.py --project latest                                        finish a draft with real images
make_video.py --project latest --redo 4,9                             regenerate scenes 4 and 9
make_video.py --project latest --revoice                              record the voice again
make_video.py --project latest --rerender --no-particles              re-render only, no dust
make_video.py --style miniature "the Night Journey"                   Persian-miniature look
make_video.py --free "Jannah"                                         only free services
make_video.py --images local "Jannah"                                 force the GPU images
make_video.py --check                                                 test your setup
```

- **`--script`** accepts plain narration, several scripts separated by `---`, or the
  "SCRIPT 1 / Title: / Script: / Accuracy note:" format your 10-script prompt produces.
  You can paste that output straight into a `.txt` file.
- **Fixing a scene:** open `storyboard.jpg`, note the numbers you don't like, then run
  `--redo` (or double-click **`Fix a Scene.bat`**). Only those images are regenerated,
  and the video is rebuilt in about a minute.
- **Drafts first:** `--draft` costs nothing. It makes the script, voice, timing, and
  captions with plain stand-in images, so you can approve a video before spending image
  credits. Running `--project <folder>` later swaps in real images.
- **Batches:** while one video renders, the next one's images and voice are already
  being generated.

## Writing the scripts with Claude Code (no API key)

Open Claude Code in this folder and ask, for example, *"make 3 Islamic shorts about
lesser-known prophets"*. The included skill (`.claude/skills/islamic-short`) has Claude
do the following:

1. Write the scripts and scene plan using the same rules as the app.
2. Save the plan to `plans/`.
3. Run `make_video.py --plan ...`.

This gets you Claude-quality scripts through your existing Claude subscription.

## What each video folder contains

```text
output/2026-10-01_the-kaaba-before-islam/
  the-kaaba-before-islam.mp4   the video
  post.txt                     caption, hashtags, accuracy note, script
  cover.jpg                    thumbnail with the title
  storyboard.jpg               all scene images, numbered
  images/scene_01.png ...      the scene images
  voice.wav                    narration
  project.json                 the full plan (edit prompts or motions here, then --rerender or --redo)
```

`output/history.json` remembers every title so new runs never repeat a topic.

## Auto-posting to Facebook (optional)

You need a Page access token with the `pages_show_list`, `pages_read_engagement`, and
`pages_manage_posts` permissions:

1. Go to https://developers.facebook.com and create an app of type **Business**.
2. Open the **Graph API Explorer**.
3. Select your app, add those three permissions, and click **Generate Access Token**.
4. In the *User or Page* dropdown, pick your Page and copy the token.
5. For a token that doesn't expire, exchange it for a long-lived one (*Access Token
   Debugger → Extend*) and generate the Page token again.
6. Put `FB_PAGE_ID` (shown in your Page's *About → Page transparency*) and
   `FB_PAGE_TOKEN` in `.env`.
7. Add `--publish` to post as soon as a video is rendered.

`--check` confirms the token works. The upload uses Facebook's Reels publishing API.
It could not be tested against a live Page while this was being built, so try it on one
video first. You can always upload by hand using `post.txt`.

## Tuning

- **Voice:** `EDGE_VOICE` (try `en-US-AndrewNeural` or `en-GB-RyanNeural`), `EDGE_RATE`,
  `ELEVENLABS_VOICE_ID`.
- **Look:** `STYLE` (`fresco`, `miniature`, `cinematic`), `CAPTIONS`, `PARTICLES`, and
  `FILM_GRAIN` in `.env`.
- **Prompts:** the full script and art-direction prompts are in `shorts/prompts.py`.
  Edit them freely.
- **Background audio:** set `MUSIC=path\to\file.mp3`. Off by default, since many
  viewers prefer narration only. A vocals-only nasheed or nature ambience works well.
- **Offline voice:** run `.venv\Scripts\pip install kokoro-onnx soundfile` and set
  `VOICE_PROVIDER=kokoro`. This is a backup voice that works with no internet.

## Troubleshooting

- **Run `--check` first.** It tests every key and service.
- **Every image failed:** the free no-account Pollinations service may be busy or may
  have changed its rules. Run `setup-local-images.bat` (NVIDIA cards) or add free
  Cloudflare keys, then run `--project latest` to finish the video. Use `--draft`
  meanwhile.
- **Local images are slow or run out of memory:** cards under 11 GB automatically
  offload part of the model to system memory. Close games or other GPU apps while
  rendering.
- **Higgsfield says it is not logged in (paid mode):** run `higgsfield auth login`
  again. Tokens expire.
- **Cloudflare "daily allowance used up":** the free tier resets at 00:00 UTC. The app
  automatically moves on to your next image service.
- **A scene image was flagged:** the app retries once with a gentler prompt, then tries
  your other services. Scenes that still fail reuse a neighboring image and print the
  exact `--redo` command to fix them.
- `output/last_run.log` has the full log of the last run.

## For developers

```text
python -m pytest tests -q      offline tests: every external service is faked,
                               alignment, rendering and FFmpeg run for real
```

Code layout:

- `shorts/llm.py`: script services
- `shorts/planner.py`: scripts and scenes
- `shorts/images.py`: image services
- `shorts/voice.py`: voices
- `shorts/timeline.py`: word, scene, and caption timing
- `shorts/render.py`: motion, effects, captions, and encoding
- `shorts/pipeline.py`: runs everything
- `shorts/publish.py`: Facebook upload
