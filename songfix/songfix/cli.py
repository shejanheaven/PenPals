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
    t.add_argument("--min-cents", type=float, default=10,
                   help="only fix notes at least this many cents off (default 10; 100 cents = 1 semitone)")
    t.add_argument("--strength", type=float, default=1.0,
                   help="how far to pull off notes toward the right pitch, 0-1 (default 1.0)")
    t.add_argument("--tuning", type=float, default=None,
                   help="the song's reference pitch in cents from A=440 (default: measured from the beat)")
    t.add_argument("--no-smooth", action="store_true",
                   help="don't smooth auto-tune note flips, instant jumps and chatter")
    t.add_argument("--no-declip", action="store_true", help="don't rebuild clipped peaks in the song")
    t.add_argument("--vocals", help="use your own vocal stem instead of auto-separating")
    t.add_argument("--beat", help="use your own instrumental stem (needed with --vocals)")
    t.add_argument("--best-separation", action="store_true",
                   help="use two separation models and average them (cleaner, 2x slower)")
    t.add_argument("--vocal-level", type=float, default=0.0,
                   help="turn the vocal up/down in dB before mastering (default 0)")

    m = p.add_argument_group("mastering")
    m.add_argument("--no-master", action="store_true", help="skip mastering")
    m.add_argument("--loudness", type=float, default=None,
                   help="target loudness in LUFS (default: your reference songs' loudness, otherwise -9 to -8; "
                        "streaming-safe: -14, loud rap/EDM: -7)")
    m.add_argument("--ceiling", type=float, default=-1.0,
                   help="true-peak ceiling in dBTP (default -1.0, prevents clipping after MP3/streaming)")
    m.add_argument("--reference", help="a song whose sound you like - the EQ moves your track toward it "
                                       "(default: the closest songs in the references folder)")
    m.add_argument("--no-references", action="store_true", help="ignore the references folder")
    m.add_argument("--eq-amount", type=float, default=0.5,
                   help="how strongly to apply the automatic EQ, 0-1 (default 0.5)")
    m.add_argument("--no-glue", action="store_true", help="skip the gentle bus compressor")
    m.add_argument("--no-polish", action="store_true",
                   help="don't de-ess or soften harshness on the vocal")
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
    original = mix
    if not args.no_declip:
        from .restore import declip
        mix, n_clip = declip(mix)
        if n_clip:
            report["declipped_peaks"] = n_clip
            log(f"  rebuilt {n_clip} clipped (flat-topped) peaks in the render")

    plan, track = [], None
    vocals = tuned = raw_vocals = None
    tuned_mix = mix
    if not args.no_tune or args.vocal_level or not args.no_polish:
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

        raw_vocals = tuned = vocals
        if not args.no_tune:
            from . import tune
            if args.tuning is not None:
                tuning = args.tuning
            else:
                tuning, tinfo = analysis.estimate_song_tuning(beat, vocals, SR)
                report["tuning_check"] = tinfo
                if tinfo["chose"] != "beat":
                    log(f"  the beat's sections disagree on tuning ({tinfo['beat_sections']}); "
                        f"following the part that matches the vocal ({tuning:+.0f} cents)")
            if not args.no_smooth:
                # Smooth what a too-fast auto-tune left behind (note flips, instant jumps, chatter on rasp)
                # before judging the notes. Two passes at most: every pass re-renders those spots.
                from .retune import smooth_vocal
                log("  checking the auto-tune for note flips, instant jumps and chatter...")
                infos = []
                for _ in range(2):
                    vocals, sinfo = smooth_vocal(vocals, SR, tuning, log=log)
                    infos.append(sinfo)
                    if sinfo.get("kept_original") or "warble_after" not in sinfo:
                        break
                report["autotune_smoothing"] = infos
                tuned = vocals
            log("  tracking vocal pitch...")
            times, midi, voiced = tune.track_pitch(vocals.mean(axis=1), SR)
            report["tuning_cents"] = round(tuning, 1)
            if abs(tuning) >= 5:
                log(f"  the beat is tuned {tuning:+.0f} cents from A=440 - the vocal is tuned to the beat")
            key, allowed_at = args.key, None
            if key == "auto":
                rel = midi - tuning / 100
                chroma = analysis.beat_chroma(beat, SR, tuning)
                key, ranked, cover = analysis.detect_scale(beat, SR, rel, tuning, chroma=chroma[1])
                allowed_at, sections = analysis.scale_map(times, rel, chroma)
                report["key_candidates"], report["key_sections"] = ranked, sections
                log(f"  detected key: {key} (same notes as {analysis.relative_key(key)}); "
                    f"{cover:.0%} of the held notes fit it")
                if ranked[0][1] - ranked[1][1] < 0.012:
                    report["key_close"] = ranked[1][0]
                    log(f"  (close call with {ranked[1][0]} - the note they disagree on is left alone)")
                changes = {tuple(n) for _, n in sections}
                if len(changes) > 1:
                    log(f"  the key shifts between sections - each section is tuned to its own key")
            report["key"] = key
            tuned, plan, track = tune.correct_vocals(
                vocals, SR, key, min_cents=args.min_cents, strength=args.strength,
                track={"times": times, "midi": midi, "voiced": voiced}, tuning_cents=tuning,
                allowed_at=allowed_at, log=log)
        if not args.no_polish:
            from .comfort import polish
            log("  making the vocal crisp and easy on the ears...")
            tuned, pinfo = polish(tuned, SR)
            # Sit the vocal on top of the beat: lift a buried vocal (more than 2 dB under the beat) to ~1 dB
            # under, by up to 3 dB; tame one piled far on top. args.vocal_level still applies on top of this.
            import pyloudnorm as pyln
            meter = pyln.Meter(SR)
            rel = meter.integrated_loudness(tuned) - meter.integrated_loudness(beat)
            lift = min(-1.0 - rel, 3.0) if rel < -2.0 else max(3.0 - rel, -2.0) if rel > 4.0 else 0.0
            if lift:
                tuned = tuned * 10 ** (lift / 20)
                log(f"  vocal was {rel:+.1f} dB vs the beat - moved {lift:+.1f} dB so it sits on top")
            pinfo["vocal_vs_beat_db"], pinfo["vocal_lift_db"] = round(rel, 1), round(lift, 1)
            report["vocal_polish"] = pinfo
        tuned = tuned * 10 ** (args.vocal_level / 20)
        tuned_mix = beat + tuned
        if not args.no_stems:
            audio_io.save_wav(out_dir / "vocals_original.wav", raw_vocals)
            audio_io.save_wav(out_dir / "vocals_tuned.wav", tuned)
            audio_io.save_wav(out_dir / "instrumental.wav", beat)

    final = tuned_mix
    if not args.no_master:
        from .master import master
        reference = audio_io.load(args.reference) if args.reference else None
        picked, loudness = None, args.loudness
        if reference is None and not args.no_references:
            from . import references
            picked = references.pick(tuned_mix, SR, references.library(log=log))
            if picked:
                log(f"  matching to references: {', '.join(picked['names'])}")
                if loudness is None:
                    loudness = float(np.clip(picked["lufs"], -11.0, -7.0))
        log("  mastering...")
        final, minfo = master(tuned_mix, SR, target_lufs=loudness, ceiling_dbtp=args.ceiling,
                              reference=reference, target_curve=picked["curve"] if picked else None,
                              eq_amount=0.7 if (picked or reference is not None) else args.eq_amount,
                              glue=not args.no_glue, log=log)
        if picked:
            minfo["references"] = picked["names"]
        pinfo = report.get("vocal_polish")
        if pinfo and pinfo.get("before"):
            b, a = pinfo["before"], pinfo["after"]
            crisp = []
            if pinfo.get("mud_cut_db"):
                crisp.append(f"cleared {pinfo['mud_cut_db']:.1f} dB of boxiness around 300 Hz")
            if pinfo.get("leveled"):
                crisp.append(f"evened out the level (swings {b['level_spread']:.0f} -> {a['level_spread']:.0f} dB) "
                             "so every word comes through")
            if pinfo.get("air_db"):
                crisp.append(f"added {pinfo['air_db']:.1f} dB of air above 10 kHz")
            if pinfo.get("vocal_lift_db"):
                crisp.append(f"moved the vocal {pinfo['vocal_lift_db']:+.1f} dB so it sits on top of the beat")
            if crisp:
                minfo["steps"].insert(0, "Made the vocal crisp: " + "; ".join(crisp))
            minfo["steps"].insert(1 if crisp else 0,
                                  f"Kept it easy on the ears: \"s\" sounds {b['sib_vs_vowel']:+.1f} -> "
                                  f"{a['sib_vs_vowel']:+.1f} dB vs the vowels, harshness {b['harsh_vs_body']:+.1f} -> "
                                  f"{a['harsh_vs_body']:+.1f} dB vs the body of the voice")
        report["mastering"] = minfo
    report["after"] = analysis.measure(final, SR)

    name = f"{song.stem} (songfix)"
    audio_io.save_wav(out_dir / f"{name}.wav", final)
    audio_io.save_mp3(out_dir / f"{name}.mp3", final)

    report["notes"] = [{k: (round(v, 3) if isinstance(v, float) else v)
                        for k, v in p.items() if k not in ("start", "end", "frames")} for p in plan]
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
        page = write_page(report, out_dir, original, final, vocals=raw_vocals,
                          tuned=tuned, final_mp3=out_dir / f"{name}.mp3",
                          downloads=[f"{name}.wav", f"{name}.mp3"])
    log(f"  after:  {report['after']['lufs']} LUFS, true peak {report['after']['true_peak_dbtp']} dBTP")
    log(f"done in {time.time() - t_start:.0f}s -> {out_dir}")
    if not args.no_page and not args.no_open:
        import webbrowser
        if sys.stdin is not None and sys.stdin.isatty():
            # Served over local http so seeking, exact loudness matching and the download buttons all work.
            from .viewer import serve
            server, url = serve(out_dir)
            webbrowser.open(url)
            try:
                input("  your before/after page is open in the browser - press Enter here when you're done listening ")
            except EOFError:
                pass
            server.shutdown()
        else:
            webbrowser.open(page.resolve().as_uri())
    return out_dir
