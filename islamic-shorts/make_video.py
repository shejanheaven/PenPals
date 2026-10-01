#!/usr/bin/env python3
"""Islamic Shorts - make finished vertical videos for Facebook Reels in one run.

Examples
  python make_video.py "the night Prophet Yunus was swallowed by the whale"
  python make_video.py --count 10                 # 10 videos, AI picks the topics
  python make_video.py "angels in the Quran" --count 3
  python make_video.py --script my_scripts.txt    # your own script(s)
  python make_video.py --plan plan.json           # plan written in Claude Code
  python make_video.py --free "Hajj"              # only free services
  python make_video.py --draft "Hajj"             # free preview with stand-in art
  python make_video.py --project latest --redo 4,9    # regenerate scene 4 and 9
  python make_video.py --check                    # see which services are ready
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

from shorts.config import APP_DIR, Settings


def parse_args(argv: list[str]) -> argparse.Namespace:
    p = argparse.ArgumentParser(
        description="Generate Islamic short videos: script, scenes, voice, panning, captions.",
        formatter_class=argparse.RawDescriptionHelpFormatter, epilog=__doc__)
    p.add_argument("topic", nargs="?", default="", help="topic or theme (optional)")
    p.add_argument("--count", "-n", type=int, default=1, help="number of videos to make")
    p.add_argument("--topics", type=Path, help="text file with one topic per line")
    p.add_argument("--script", type=Path, help="text file with your own script(s)")
    p.add_argument("--plan", type=Path, help="JSON plan (e.g. written by Claude Code)")
    p.add_argument("--project", action="append", default=[],
                   help="re-run an existing project folder (name, path, or 'latest')")
    p.add_argument("--redo", default="", help="scene numbers to regenerate, e.g. 3,7")
    p.add_argument("--revoice", action="store_true", help="record the voice-over again")
    p.add_argument("--rerender", action="store_true",
                   help="only re-render the video from existing images and voice")
    p.add_argument("--draft", action="store_true",
                   help="free preview: stand-in images instead of AI art")
    p.add_argument("--plan-only", action="store_true",
                   help="write scripts and scene plans, then stop")
    p.add_argument("--free", action="store_true",
                   help="only use free services (skip Claude API, Higgsfield, ElevenLabs)")
    p.add_argument("--style", choices=["fresco", "miniature", "cinematic"])
    p.add_argument("--writer", help="script service: auto, claude, gemini, groq, "
                                    "cloudflare, pollinations")
    p.add_argument("--images", help="image service: auto, higgsfield, cloudflare, pollinations")
    p.add_argument("--voice", help="voice service: auto, elevenlabs, edge, kokoro")
    p.add_argument("--music", help="background audio file (optional)")
    p.add_argument("--no-captions", action="store_true")
    p.add_argument("--no-particles", action="store_true")
    p.add_argument("--no-grain", action="store_true")
    p.add_argument("--publish", action="store_true", help="post to your Facebook Page as a Reel")
    p.add_argument("--check", action="store_true", help="test which services are configured")
    return p.parse_args(argv)


def resolve_project(name: str, settings: Settings) -> Path:
    out = settings.output_dir
    if name == "latest":
        folders = sorted((d for d in out.iterdir() if (d / "project.json").exists()),
                         key=lambda d: (d / "project.json").stat().st_mtime) if out.exists() else []
        if not folders:
            raise SystemExit("No projects found in the output folder yet.")
        return folders[-1]
    for cand in (Path(name), out / name, APP_DIR / name):
        if (cand / "project.json").exists():
            return cand.resolve()
    matches = [d for d in out.iterdir() if name.lower() in d.name.lower()
               and (d / "project.json").exists()] if out.exists() else []
    if len(matches) == 1:
        return matches[0]
    raise SystemExit(f"Project '{name}' not found in {out}")


def main(argv: list[str]) -> int:
    args = parse_args(argv)
    settings = Settings.load()
    if args.free:
        settings.free_only = True
    if args.style:
        settings.style = args.style
    if args.writer:
        settings.script_provider = args.writer.lower()
    if args.images:
        settings.image_provider = args.images.lower()
    if args.voice:
        settings.voice_provider = args.voice.lower()
    if args.music:
        settings.music = args.music
    if args.no_captions:
        settings.captions = False
    if args.no_particles:
        settings.particles = False
    if args.no_grain:
        settings.grain = False

    if args.check:
        from shorts.doctor import run_checks
        return run_checks(settings)

    from shorts.pipeline import Pipeline
    from shorts.util import log

    pipe = Pipeline(settings)
    log(f"Services{' (free only)' if settings.free_only else ''} - script: "
        f"{pipe.llm.describe()} | images: {pipe.images.describe()} | "
        f"voice: {pipe.narrator.describe()}")

    redo = {int(x) for x in args.redo.replace(" ", "").split(",") if x.isdigit()}
    if args.project:
        folders = [resolve_project(name, settings) for name in args.project]
    else:
        topics = None
        if args.topics:
            topics = [ln.strip() for ln in args.topics.read_text(encoding="utf-8").splitlines()
                      if ln.strip() and not ln.strip().startswith("#")]
        folders = pipe.plan(topic=args.topic, count=max(1, args.count), topics=topics,
                            script_file=args.script, plan_file=args.plan,
                            style=settings.style)
    if args.plan_only:
        for f in folders:
            log(f"Planned: {f}")
        return 0

    outputs = pipe.produce(folders, redo=redo, revoice=args.revoice, draft=args.draft,
                           publish=args.publish, rerender_only=args.rerender)
    print()
    for o in outputs:
        print(f"  VIDEO  {o}")
    print(f"\n{len(outputs)} of {len(folders)} video(s) finished. "
          f"Each folder also has post.txt (caption + hashtags), cover.jpg and storyboard.jpg.")
    return 0 if len(outputs) == len(folders) else 1


if __name__ == "__main__":
    try:
        sys.exit(main(sys.argv[1:]))
    except KeyboardInterrupt:
        print("\nStopped.")
        sys.exit(130)
