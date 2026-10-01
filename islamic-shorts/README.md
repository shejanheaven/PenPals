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

The app automatically uses the best service you have set up and falls back to the next
one if a service fails.

| Step | Free | Premium (used automatically if set up) |
|---|---|---|
| Script | **Google Gemini** (free key), Groq, Cloudflare, or **Claude Code** (no key, see below) | Claude API (`ANTHROPIC_API_KEY`) |
| Images | **Cloudflare Workers AI** (about 100 images/day free, square images that the app pans across), Pollinations | **Higgsfield CLI, GPT Image 2** (true 9:16, best quality, uses your credits) |
| Voice | **Microsoft Edge neural voices** (free, no account) | **ElevenLabs** (`ELEVENLABS_API_KEY`) |
| Panning, captions, editing | Built in (FFmpeg), always free | – |

**Recommendation:** use Higgsfield for images if you still have credits. It is the
biggest quality difference, because free image models are noticeably weaker. The free
Edge voice is good. ElevenLabs is a step up if you already pay for it. For scripts, the
free Gemini tier or Claude Code both work well.

## Setup (Windows, about 5 minutes)

1. Install **Python 3.11 or newer** from https://www.python.org/downloads/ and tick
   **"Add python.exe to PATH"**.
2. Double-click **`setup.bat`**. It installs everything, including FFmpeg, and creates
   a `.env` file.
3. Open `.env` in Notepad and add at least:
   - **Script:** `GEMINI_API_KEY`. Get a free key at https://aistudio.google.com/apikey.
   - **Images:** pick one of these.
     - **Higgsfield** (you already used it). Run `npm install -g @higgsfield/cli`, then
       `higgsfield auth login`. Nothing goes in `.env`; the app finds it automatically.
     - **Free Cloudflare:**
       1. Sign up at https://dash.cloudflare.com.
       2. Copy your **Account ID** from the Workers AI page into `CLOUDFLARE_ACCOUNT_ID`.
       3. Go to *My Profile → API Tokens → Create Token → "Workers AI"* and put the token
          in `CLOUDFLARE_API_TOKEN`.
   - **Voice:** nothing needed (free Edge voice). Add `ELEVENLABS_API_KEY` to upgrade.
4. Double-click **`setup.bat`** again, or run `python make_video.py --check`, to see a
   green **OK** next to each working service.

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
make_video.py --images cloudflare --voice edge "Jannah"               force the free services
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
- **"No image service is configured":** log in to Higgsfield or add the Cloudflare
  keys. Use `--draft` meanwhile.
- **Higgsfield says it is not logged in:** run `higgsfield auth login` again. Tokens
  expire.
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
