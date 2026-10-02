# songfix

Make a finished song sound better automatically:

1. **Fixes out-of-tune vocal notes.** The vocal is pulled out of the beat by an AI separator. Every sung note is checked against the song's key, and only the notes that are actually off get moved onto the right pitch. Slides, runs, vibrato and your tone are left alone, so it doesn't sound robotic. Everything that wasn't fixed stays bit-for-bit identical.
2. **Masters the song.** It cleans up rumble, keeps the bass mono, applies gentle EQ to smooth harsh or muddy spots, adds light glue compression, and sets the loudness with a true-peak limiter. The result is loud and clean, with no clipping or crackle on phones, Spotify or SoundCloud.
3. **Writes a report** listing which notes were fixed (with timestamps), what the mastering changed, and tips.

## Quick start

You need **Python 3.10+** and **ffmpeg**.

```bash
cd songfix
pip install -r requirements.txt
python -m songfix "my song.wav"
```

On Windows, **drag one or more song files onto `fix-my-song.bat`**. The first time, it sets up its own Python environment in `.venv` (needs Python 3.10-3.13 and ffmpeg: `winget install Python.Python.3.13 Gyan.FFmpeg`).

The first run downloads the vocal-separation model (~65 MB). A 2-3 minute song takes 2-6 minutes on a normal laptop.

You get a folder `my song_songfix/` with:

| File | What it is |
|---|---|
| `my song (songfix).wav` | the finished master (24-bit WAV, use this for distribution) |
| `my song (songfix).mp3` | 320 kbps MP3 for sharing |
| `index.html` | the before/after page, opened in your browser when the run finishes: A/B the original against the fix, a pitch chart for every corrected note with a Listen button, and the mastering meters and EQ. It plays `before.mp3`, `after.mp3`, `vocal_before.mp3` and `vocal_after.mp3` from the same folder |
| `report.md` | what was fixed and changed |
| `vocals_original.wav`, `vocals_tuned.wav`, `instrumental.wav` | the separated stems, before and after tuning |

## Useful options

```bash
# Key detection is automatic. If notes get pulled to the wrong place, tell it the key:
python -m songfix song.wav --key "A minor"        # also: "F#m", "Bb major", "chromatic"

# Fix more notes (smaller mistakes):
python -m songfix song.wav --min-cents 10

# Make it sound like a song you love (EQ moves toward the reference):
python -m songfix song.wav --reference "favourite song.mp3"

# Loudness: -9 LUFS is the default. -14 suits streaming; -7 is very loud rap/EDM:
python -m songfix song.wav --loudness -8

# Turn the vocal up 1.5 dB before mastering:
python -m songfix song.wav --vocal-level 1.5

# Have your own stems? They beat any AI separation:
python -m songfix song.wav --vocals vocal.wav --beat beat.wav

# Cleaner separation (two models averaged, about 2x slower):
python -m songfix song.wav --best-separation

# Only master, or only tune:
python -m songfix song.wav --no-tune
python -m songfix song.wav --no-master

# Don't open the before/after page in the browser (or don't write it at all):
python -m songfix song.wav --no-open
python -m songfix song.wav --no-page
```

Run `python -m songfix --help` for everything.

## Tips for the best result

- **Feed it a WAV, not a low-bitrate MP3/M4A.** A 128 kbps export throws away everything above ~16 kHz, and no tool can bring that back. Export WAV from your DAW.
- **Leave headroom in your mixdown.** Peaks around -3 to -6 dBFS are fine. songfix handles the loudness.
- **Already used auto-tune?** That's fine. songfix only touches notes that are still off.

## How it works

| Step | Method |
|---|---|
| Vocal separation | UVR MDX-Net (ONNX, CPU). The instrumental is computed as `mix - vocals`, so beat + vocal adds back to the exact original |
| Pitch tracking | pYIN for voicing, refined with YIN for sub-cent accuracy |
| Note decisions | notes are segmented and the note centre is compared with the nearest scale note. Short flicks, slides and ambiguous notes are skipped |
| Pitch shifting | TD-PSOLA: formant-preserving and sample-exact where nothing is shifted, so there are no seams |
| EQ | linear-phase FIR that fills dips and trims bumps relative to the song's own smoothed tonal curve (or a reference track), max ±2.5 dB |
| Limiter | 4x-oversampled look-ahead true-peak limiter, with loudness hit by iterating on integrated LUFS (ITU-R BS.1770) |

Run the tests with `python -m pytest tests`.
