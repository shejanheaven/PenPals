import numpy as np
import pytest

from songfix.master import limit, true_peak
from songfix.psola import shift_region
from songfix.tune import nearest_scale_note, parse_key

SR = 44100


def harmonic_tone(f0, seconds=1.5):
    t = np.arange(int(SR * seconds)) / SR
    x = sum(0.3 / h * np.sin(2 * np.pi * f0 * h * t) for h in range(1, 6))
    return np.stack([x, x], axis=1)


def measured_f0(x):
    import librosa
    f = librosa.yin(x[:, 0], fmin=100, fmax=600, sr=SR, frame_length=4096)
    return float(np.median(f[5:-5]))


def test_psola_is_exact_when_not_shifting():
    x = harmonic_tone(220)
    n = len(x)
    a, b, seg = shift_region(x, np.full(n, 220.0), np.ones(n), 2000, n - 2000, SR)
    assert b - a > n // 2
    assert np.max(np.abs(seg - x[a:b])) < 1e-9


def test_psola_shifts_by_the_requested_amount():
    x = harmonic_tone(220)
    n = len(x)
    ratio = np.ones(n)
    ratio[int(0.3 * SR):int(1.2 * SR)] = 2 ** (30 / 1200)  # +30 cents
    a, b, seg = shift_region(x, np.full(n, 220.0), ratio, 2000, n - 2000, SR)
    y = x.copy()
    y[a:b] = seg
    mid = y[int(0.45 * SR):int(1.05 * SR)]
    cents = 1200 * np.log2(measured_f0(mid) / 220)
    assert abs(cents - 30) < 3


@pytest.mark.parametrize("text,expected", [
    ("C major", (0, "major")), ("A minor", (9, "minor")), ("F#m", (6, "minor")),
    ("Bb major", (10, "major")), ("chromatic", (0, "chromatic")),
])
def test_parse_key(text, expected):
    assert parse_key(text) == expected


def test_nearest_scale_note():
    assert nearest_scale_note(61.4, 0, "major") == 62  # C#4+40c -> D4 in C major
    assert nearest_scale_note(60.2, 0, "major") == 60


def test_limiter_respects_true_peak_ceiling():
    rng = np.random.default_rng(0)
    x = rng.normal(0, 0.5, (SR * 2, 2))
    y, _ = limit(x, SR, ceiling_dbtp=-1.0)
    assert 20 * np.log10(true_peak(y)) <= -0.9


def test_viewer_page_has_fixed_note_and_audio(tmp_path):
    import json
    import re
    from songfix.viewer import write_page

    mix = harmonic_tone(220, seconds=2.0) * 0.5
    t = np.round(np.arange(0, 2.0, 0.023), 3)
    track = {"t": t.tolist(), "midi": [57.2] * len(t), "shift": [-0.2 if 0.5 <= x <= 1.0 else 0.0 for x in t]}
    note = {"t0": 0.5, "t1": 1.0, "center": 57.2, "wobble": 0.0, "trend": 0.0, "target": 57,
            "off_cents": 20.0, "shift": -0.2, "status": "corrected"}
    report = {"song": "demo </script> song.wav", "before": {"lufs": -10.0, "true_peak_dbtp": 1.0, "bandwidth_hz": 22050},
              "after": {"lufs": -9.0, "true_peak_dbtp": -1.1, "bandwidth_hz": 22050}, "key": "A minor",
              "settings": {"ceiling": -1.0}, "notes": [note, {**note, "status": "in tune"}], "pitch_track": track}
    page = write_page(report, tmp_path, mix, mix, vocals=mix, tuned=mix)
    html = page.read_text(encoding="utf-8")
    assert "__SONGFIX" not in html
    data = json.loads(re.search(r"const DATA = (.*);\n", html).group(1).replace("<\\/", "</"))
    assert [n["note"] for n in data["notes"]] == ["A3"]
    assert data["notes"][0]["off"] == 20 and data["notes"][0]["after_off"] == 0
    assert data["counts"] == {"corrected": 1, "in tune": 1} and data["relative_key"] == "C major"
    assert html.count("</script>") == 1
    for f in ("before.mp3", "after.mp3", "vocal_before.mp3", "vocal_after.mp3"):
        assert (tmp_path / f).stat().st_size > 0


def sung_line(parts):
    """Synthetic singer: parts are (seconds, midi or None for silence, cents(u, t) with u = 0..1 across the note)."""
    import librosa
    f0 = []
    for dur, midi, cents in parts:
        n = int(dur * SR)
        f0.append(np.zeros(n) if midi is None else
                  librosa.midi_to_hz(midi + cents(np.arange(n) / n, np.arange(n) / SR) / 100))
    f0 = np.concatenate(f0)
    ph = 2 * np.pi * np.cumsum(f0) / SR
    x = sum((0.5 / h) * np.sin(h * ph) for h in range(1, 12))
    x = 0.3 * x * np.convolve((f0 > 0).astype(float), np.ones(441) / 441, mode="same")
    return np.stack([x, x], axis=1)


def test_tuner_fixes_offsets_drift_and_short_notes_but_keeps_vibrato_and_slides():
    from songfix import tune
    gap = (0.15, None, None)
    x = sung_line([
        gap, (0.6, 60, lambda u, t: 25 + 0 * u),                                   # sharp all the way
        gap, (0.9, 64, lambda u, t: np.where(u < 0.4, 0, -35 * (u - 0.4) / 0.6)),  # sags flat
        gap, (0.11, 67, lambda u, t: -20 + 0 * u),                                 # short and flat
        gap, (1.0, 65, lambda u, t: 40 * np.sin(2 * np.pi * 5.5 * t)),             # in tune, wide vibrato
        gap, (0.5, 62, lambda u, t: 100 * u),                                      # intended slide
        gap])
    tuned, plan, _ = tune.correct_vocals(x, SR, "C major", log=lambda *a: None)
    assert [p["status"] for p in plan] == ["corrected"] * 3 + ["in tune", "slide/run (left natural)"]
    assert abs(plan[1]["worst_cents"]) > 25
    times, midi, voiced = tune.track_pitch(tuned.mean(axis=1), SR)
    after = tune.find_notes(times, midi, voiced)
    for nt in after[:3]:
        core = midi[nt["start"]:nt["end"]]
        core = core[int(len(core) * 0.2):int(len(core) * 0.9) + 1]
        target = tune.nearest_scale_note(nt["center"], 0, "major")
        assert np.max(np.abs(np.convolve(core, np.ones(9) / 9, mode="valid") - target)) * 100 < 6
    assert np.array_equal(tuned[int(2.8 * SR):int(3.3 * SR)], x[int(2.8 * SR):int(3.3 * SR)])  # vibrato note untouched


def noisy_mix(seconds=6.0, seed=0):
    rng = np.random.default_rng(seed)
    n = int(SR * seconds)
    t = np.arange(n) / SR
    kick = np.sin(2 * np.pi * 55 * t) * np.exp(-((t % 0.5) * 12))
    hats = rng.standard_normal(n) * (((t * 4) % 1) < 0.05) * 0.3
    pad = 0.2 * np.sin(2 * np.pi * 220 * t) + 0.1 * rng.standard_normal(n)
    left, right = kick + hats + pad, kick + 0.8 * hats + pad + 0.02 * rng.standard_normal(n)
    return 0.4 * np.stack([left, right], axis=1)


def test_band_split_adds_back_exactly():
    from songfix.master import split_bands
    x = noisy_mix(2.0)
    assert np.max(np.abs(sum(split_bands(x, SR)) - x)) < 1e-12


def test_widening_keeps_mono_identical():
    from songfix.master import widen_highs
    x = noisy_mix(2.0)
    y = widen_highs(x, SR, 1.5)
    assert np.max(np.abs(y.sum(axis=1) - x.sum(axis=1))) < 1e-12
    assert np.std(y[:, 0] - y[:, 1]) > np.std(x[:, 0] - x[:, 1])


def test_master_hits_loudness_and_ceiling():
    import pyloudnorm as pyln
    from songfix.master import auto_loudness, master
    x = noisy_mix()
    for target in (None, -10.0):
        y, info = master(x, SR, target_lufs=target, log=lambda *a: None)
        want = auto_loudness(pyln.Meter(SR).integrated_loudness(x)) if target is None else target
        assert abs(pyln.Meter(SR).integrated_loudness(y) - want) < 0.3
        assert true_peak(y) <= 10 ** (-1.0 / 20) + 1e-6
        assert info["steps"]
    assert auto_loudness(-14) == -9.0 and auto_loudness(-6) == -7.0 and auto_loudness(-8.5) == -8.5


def test_reference_picker_prefers_the_closest_sound(tmp_path):
    from songfix import audio_io, references
    from scipy import signal
    base = noisy_mix(4.0)
    dark = signal.sosfiltfilt(signal.butter(2, 800, "lp", fs=SR, output="sos"), base, axis=0)
    bright = signal.sosfiltfilt(signal.butter(2, 3000, "hp", fs=SR, output="sos"), base, axis=0) + 0.2 * base
    audio_io.save_wav(tmp_path / "dark.wav", dark)
    audio_io.save_wav(tmp_path / "bright.wav", bright)
    lib = references.library(tmp_path, log=lambda *a: None)
    assert len(lib) == 2 and (tmp_path / references.CACHE_NAME).exists()
    assert references.pick(dark * 0.5, SR, lib, n=1)["names"] == ["dark.wav"]
    assert references.pick(bright * 0.5, SR, lib, n=1)["names"] == ["bright.wav"]


def test_tuner_follows_a_beat_that_is_not_at_a440():
    from songfix import tune
    gap = (0.15, None, None)
    # Beat tuned 40 cents sharp: the singer is in tune with it on the first note, 25 cents sharp of it on the second.
    x = sung_line([gap, (0.6, 60, lambda u, t: 40 + 0 * u), gap, (0.6, 64, lambda u, t: 65 + 0 * u), gap])
    tuned, plan, _ = tune.correct_vocals(x, SR, "C major", tuning_cents=40, log=lambda *a: None)
    assert [p["status"] for p in plan] == ["in tune", "corrected"]
    times, midi, voiced = tune.track_pitch(tuned.mean(axis=1), SR)
    assert tune.note_error(times, midi - 0.4, plan[1], voiced) < 6
    a, b = int(0.15 * SR), int(0.7 * SR)
    assert np.array_equal(tuned[a:b], x[a:b])  # the note in tune with the beat is untouched


def test_polish_tames_harsh_esses_and_leaves_a_smooth_vocal_alone():
    from scipy import signal
    from songfix.comfort import _tame, measure, polish
    gap = (0.1, None, None)
    smooth = sung_line([gap] + [(0.5, 60 + k, lambda u, t: 0 * u) for k in (0, 2, 4, 5, 7, 9)] + [gap])
    y, info = _tame(smooth, SR)
    assert np.sqrt(np.mean((y - smooth) ** 2)) < 0.05 * np.sqrt(np.mean(smooth ** 2))
    # Add loud "s" bursts (6-9 kHz noise) between the notes: they must come down below the vowels.
    rng = np.random.default_rng(1)
    hiss = signal.sosfiltfilt(signal.butter(4, [6000, 9000], "bp", fs=SR, output="sos"), rng.standard_normal(len(smooth)))
    t = np.arange(len(smooth)) / SR
    hiss *= ((t % 0.6) < 0.08) * 0.5
    harsh = smooth + hiss[:, None]
    before = measure(harsh, SR)["sib_vs_vowel"]
    after = measure(polish(harsh, SR)[0], SR)["sib_vs_vowel"]
    assert before > -4 and after < before - 3


def test_notes_under_a_harmony_are_left_alone():
    from songfix import tune
    gap = (0.15, None, None)
    lead = sung_line([gap, (0.8, 60, lambda u, t: 25 + 0 * u), gap])
    harmony = sung_line([gap, (0.8, 64, lambda u, t: 0 * u), gap])
    _, solo, _ = tune.correct_vocals(lead, SR, "C major", log=lambda *a: None)
    assert solo[0]["status"] == "corrected"
    tuned, plan, _ = tune.correct_vocals(lead + 0.9 * harmony, SR, "C major", log=lambda *a: None)
    assert plan[0]["status"].startswith("harmony")
    assert np.array_equal(tuned, lead + 0.9 * harmony)


def test_disputed_note_between_two_close_keys_is_left_alone():
    from songfix import tune
    from songfix.analysis import _allowed
    scores = np.zeros(12)
    scores[11], scores[6] = 0.853, 0.849  # B major vs F# major: they differ only on E vs E#
    allowed = _allowed(scores, 0.012)
    assert allowed[4] and allowed[5]  # both E and F are allowed, so neither gets pulled to the other
    assert tune.nearest_allowed(64.3, allowed) == 64 and tune.nearest_allowed(64.7, allowed) == 65


def test_crisp_fixes_a_muddy_dull_uneven_vocal_and_leaves_a_crisp_one_mostly_alone():
    from scipy import signal
    from songfix.comfort import _biquad, crisp, measure
    gap = (0.1, None, None)
    rng = np.random.default_rng(2)
    voice = sung_line([gap] + [(0.6, 57 + k, lambda u, t: 0 * u) for k in (0, 2, 4, 5, 7, 9, 11, 12) * 2] + [gap])
    voice = _biquad(_biquad(voice, SR, "peak", 1500, 12.0, q=0.6), SR, "peak", 300, -4.0)  # vocal resonances
    breath = signal.sosfiltfilt(signal.butter(4, 9000, "hp", fs=SR, output="sos"), rng.standard_normal(len(voice)))
    crisp_voice = voice + 0.01 * breath[:, None] * (np.abs(voice) > 0.01)
    good = measure(crisp_voice, SR)
    _, info = crisp(crisp_voice, SR)
    assert info["mud_cut_db"] < 1.5 and not info.get("leveled")
    # Make it boxy, dull and uneven: +11 dB at 300 Hz, -8 dB above 10 kHz, every other 2.4 s phrase 10 dB down.
    bad = _biquad(_biquad(crisp_voice, SR, "peak", 300, 11.0), SR, "shelf", 10000, -8.0)
    t = np.arange(len(bad)) / SR
    bad = bad * np.where(((t - 0.1) // 2.4) % 2 == 1, 10 ** (-10 / 20), 1.0)[:, None]
    b = measure(bad, SR)
    y, info = crisp(bad, SR)
    a = measure(y, SR)
    assert b["mud"] > 3.5 and a["mud"] < b["mud"] and a["mud"] <= 3.5  # trimmed to the target, no further
    assert b["air"] < -10 and a["air"] > b["air"] + 2
    assert b["level_spread"] > 6 and a["level_spread"] < b["level_spread"] - 3


def test_autotune_flip_is_held_and_instant_jump_becomes_a_glide():
    from songfix import retune, tune
    gap = (0.15, None, None)
    # Held A3 with a 70 ms flip down to G#3 in the middle, then an instant jump up to C4.
    flip = lambda u, t: np.where((t > 0.40) & (t < 0.47), -100.0, 0.0)
    x = sung_line([gap, (0.9, 57, flip), (0.6, 60, lambda u, t: 0 * u), gap])
    y, info = retune.smooth_vocal(x, SR, log=lambda *a: None)
    assert info["warble_found"] >= 1 and info["snaps_found"] >= 1 and not info.get("kept_original")
    times, midi, voiced = tune.track_pitch(y.mean(axis=1), SR)
    held = (times > 0.25) & (times < 0.95) & voiced
    assert np.all(np.abs(midi[held] - 57) < 0.5)  # the flip is gone
    jump = (times > 1.0) & (times < 1.1) & voiced
    between = np.sum((midi[jump] > 57.3) & (midi[jump] < 59.7))
    assert between * tune.HOP / tune.ANALYSIS_SR >= 0.03  # the jump now glides for at least 30 ms


def test_declip_rebuilds_flat_peaks():
    from songfix.restore import declip
    t = np.arange(SR) / SR
    clean = np.sin(2 * np.pi * 110 * t)
    clipped = np.clip(clean, -0.7, 0.7)
    x = np.stack([clipped, clipped], axis=1)
    y, runs = declip(x)
    assert runs > 20
    err_before = np.sqrt(np.mean((x[:, 0] - clean) ** 2))
    err_after = np.sqrt(np.mean((y[:, 0] - clean) ** 2))
    assert err_after < 0.3 * err_before
