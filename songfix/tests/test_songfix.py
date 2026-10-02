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
