# songfix

Make a finished song sound better automatically:

1. **Fixes out-of-tune vocal notes.** The vocal is pulled out of the beat by an AI separator. Every sung note is checked against the song's key, and only the notes that are actually off get moved onto the right pitch: notes sung sharp or flat, notes that start in tune and then sag or creep off, and short notes that are clearly off. Slides, runs, vibrato and your tone are left alone, so it doesn't sound robotic. Everything that wasn't fixed stays bit-for-bit identical.
2. **Masters the song.** It cleans up rumble, keeps the bass mono, shapes the tone (toward your reference songs if you add some), steadies the low end, tames sibilance and harsh peaks, widens a narrow top end, glues the mix, and brings it to commercial loudness with a soft clipper and a true-peak limiter. The result is loud and clean, with no clipping or crackle on phones, Spotify or SoundCloud.
3. **Opens a before/after page** where you can A/B the original against the fix, see every corrected note, and download the finished WAV or MP3. A `report.md` lists the same in text.

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

## Make it sound like the records you love

Put 5-15 finished, professionally mastered songs you love into the `references/` folder (WAV or 320 kbps MP3, any mix of genres). Every master is then matched to the 3 references whose sound is closest to it: their tonal balance and their loudness. A rap song gets matched to your rap references, a ballad to your ballads. Without references, songfix smooths the song's own tonal balance and masters to -9 to -8 LUFS.

## Useful options

```bash
# Key detection is automatic. If notes get pulled to the wrong place, tell it the key:
python -m songfix song.wav --key "A minor"        # also: "F#m", "Bb major", "chromatic"

# Fix more notes (smaller mistakes):
python -m songfix song.wav --min-cents 6

# Match one specific song instead of the references folder (or ignore the folder):
python -m songfix song.wav --reference "favourite song.mp3"
python -m songfix song.wav --no-references

# Loudness: default is your references' loudness, else -9 to -8 LUFS. -14 suits streaming; -7 is very loud rap/EDM:
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
| Note decisions | notes are segmented; each note's centre and its slow drift (pitch smoothed over 0.2 s, so vibrato is kept) are compared with the nearest scale note. Notes 10+ cents off are fixed; steady short notes too. Slides, runs, bends past 45 cents and notes halfway between two scale notes are left as sung |
| Pitch shifting | TD-PSOLA: formant-preserving and sample-exact where nothing is shifted, so there are no seams |
| EQ | linear-phase FIR toward the average tonal curve of the 3 closest reference songs, or one reference track, or the song's own smoothed curve; max ±2.5 dB |
| Multiband | complementary 3-band split (exact reconstruction): soft-knee compression on the lows (<150 Hz) to steady the low end, fast compression on the highs (>5 kHz) against sibilance; mids untouched |
| Width | side channel lifted above 3 kHz on narrow mixes only; the mono sum is unchanged |
| Soft clip | 4x-oversampled tanh shoulder that rounds the first ~1.5 dB of peaks before the limiter |
| Limiter | 4x-oversampled look-ahead true-peak limiter, with loudness hit by iterating on integrated LUFS (ITU-R BS.1770) |

Run the tests with `python -m pytest tests`.
