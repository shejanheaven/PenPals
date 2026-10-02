import argparse
import json
import sys
import time
from pathlib import Path

import numpy as np

from . import audio_io, analysis
from .audio_io import SR


def log(*a, **k):
    print(*a, **k, flush=True)


def build_parser():
    p = argparse.ArgumentParser(
        prog="songfix",
        description="Fix out-of-tune vocal notes and master a finished song.",
    )
    p.add_argument("song", help="your song (wav, mp3, m4a, flac, ...)")
    p.add_argument("-o", "--out", help="output folder (default: <song>_songfix next to the song)")

    t = p.add_argument_group("pitch correction")
    t.add_argument("--key", default="auto",
                   help="song key, e.g. 'C major', 'A minor', 'F#m', or 'chromatic' (default: auto-detect)")
    t.add_argument("--no-tune", action="store_true", help="skip vocal pitch correction")
    t.add_argument("--min-cents", type=float, default=15,
                   help="only fix notes at least this many cents off (default 15; 100 cents = 1 semitone)")
    t.add_argument("--strength", type=float, default=1.0,
                   help="how far to pull off notes toward the right pitch, 0-1 (default 1.0)")
    t.add_argument("--vocals", help="use your own vocal stem instead of auto-separating")
    t.add_argument("--beat", help="use your own instrumental stem (needed with --vocals)")
    t.add_argument("--best-separation", action="store_true",
                   help="use two separation models and average them (cleaner, 2x slower)")
    t.add_argument("--vocal-level", type=float, default=0.0,
                   help="turn the vocal up/down in dB before mastering (default 0)")

    m = p.add_argument_group("mastering")
    m.add_argument("--no-master", action="store_true", help="skip mastering")
    m.add_argument("--loudness", type=float, default=-9.0,
                   help="target loudness in LUFS (default -9; streaming-safe: -14, loud rap/EDM: -7)")
    m.add_argument("--ceiling", type=float, default=-1.0,
                   help="true-peak ceiling in dBTP (default -1.0, prevents clipping after MP3/streaming)")
    m.add_argument("--reference", help="a song whose sound you like - the EQ moves your track toward it")
    m.add_argument("--eq-amount", type=float, default=0.5,
                   help="how strongly to apply the automatic EQ, 0-1 (default 0.5)")
    m.add_argument("--no-glue", action="store_true", help="skip the gentle bus compressor")
    m.add_argument("--no-stems", action="store_true", help="don't save the separated vocal/instrumental files")
    p.add_argument("--no-page", action="store_true", help="don't write the before/after listening page")
    p.add_argument("--no-open", action="store_true", help="write the page but don't open it in the browser")
    return p


def main(argv=None):
    args = build_parser().parse_args(argv)
    song = Path(args.song)
    out_dir = Path(args.out) if args.out else song.with_name(song.stem + "_songfix")
    out_dir.mkdir(parents=True, exist_ok=True)
    t_start = time.time()

    log(f"songfix: {song.name}")
    mix = audio_io.load(song)
    report = {"song": song.name, "duration_s": round(len(mix) / SR, 2), "settings": vars(args)}
    report["before"] = analysis.measure(mix, SR)
    log(f"  before: {report['before']['lufs']} LUFS, true peak {report['before']['true_peak_dbtp']} dBTP")

    plan, track = [], None
    vocals = tuned = None
    tuned_mix = mix
    if not args.no_tune or args.vocal_level:
        if args.vocals:
            if not args.beat:
                sys.exit("--vocals needs --beat too")
            vocals, beat = audio_io.load(args.vocals), audio_io.load(args.beat)
            n = min(len(vocals), len(beat))
            vocals, beat = vocals[:n], beat[:n]
        else:
            from .separate import separate_vocals
            models = ("UVR-MDX-NET-Voc_FT.onnx", "Kim_Vocal_2.onnx") if args.best_separation \
                else ("UVR-MDX-NET-Voc_FT.onnx",)
            vocals, beat = separate_vocals(mix, SR, models=models, log=log)

        tuned = vocals
        if not args.no_tune:
            from . import tune
            log("  tracking vocal pitch...")
            times, midi, voiced = tune.track_pitch(vocals.mean(axis=1), SR)
            key = args.key
            if key == "auto":
                key, ranked = analysis.detect_key(beat, SR, vocal_midi=midi)
                report["key_candidates"] = ranked
                log(f"  detected key: {key} (same notes as {analysis.relative_key(key)})")
                if ranked[0][1] - ranked[1][1] < 0.03 and ranked[1][0] != analysis.relative_key(key):
                    report["key_close"] = ranked[1][0]
                    log(f"  (close call with {ranked[1][0]} - if notes sound wrong, rerun with --key)")
            report["key"] = key
            tuned, plan, track = tune.correct_vocals(
                vocals, SR, key, min_cents=args.min_cents, strength=args.strength,
                track={"times": times, "midi": midi, "voiced": voiced}, log=log)
        tuned = tuned * 10 ** (args.vocal_level / 20)
        tuned_mix = beat + tuned
        if not args.no_stems:
            audio_io.save_wav(out_dir / "vocals_original.wav", vocals)
            audio_io.save_wav(out_dir / "vocals_tuned.wav", tuned)
            audio_io.save_wav(out_dir / "instrumental.wav", beat)

    final = tuned_mix
    if not args.no_master:
        from .master import master
        reference = audio_io.load(args.reference) if args.reference else None
        log("  mastering...")
        final, minfo = master(tuned_mix, SR, target_lufs=args.loudness, ceiling_dbtp=args.ceiling,
                              reference=reference, eq_amount=args.eq_amount,
                              glue=not args.no_glue, log=log)
        report["mastering"] = minfo
    report["after"] = analysis.measure(final, SR)

    name = f"{song.stem} (songfix)"
    audio_io.save_wav(out_dir / f"{name}.wav", final)
    audio_io.save_mp3(out_dir / f"{name}.mp3", final)

    report["notes"] = [{k: (round(v, 3) if isinstance(v, float) else v)
                        for k, v in p.items() if k not in ("start", "end")} for p in plan]
    if track is not None:
        step = 2  # ~23 ms resolution is plenty for plotting
        report["pitch_track"] = {
            "t": np.round(track["times"][::step], 3).tolist(),
            "midi": [None if not np.isfinite(m) else round(float(m), 3) for m in track["midi"][::step]],
            "shift": np.round(track["curve"][::step], 3).tolist(),
        }
    (out_dir / "report.json").write_text(json.dumps(report, indent=1))
    from .report import write_markdown
    write_markdown(report, out_dir / "report.md")
    if not args.no_page:
        from .viewer import write_page
        log("  writing before/after page...")
        page = write_page(report, out_dir, mix, final, vocals=vocals,
                          tuned=tuned if plan else None, final_mp3=out_dir / f"{name}.mp3")
        if not args.no_open:
            import webbrowser
            webbrowser.open(page.resolve().as_uri())
    log(f"  after:  {report['after']['lufs']} LUFS, true peak {report['after']['true_peak_dbtp']} dBTP")
    log(f"done in {time.time() - t_start:.0f}s -> {out_dir}")
    return out_dir
