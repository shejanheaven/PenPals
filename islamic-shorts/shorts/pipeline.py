"""One-sweep orchestration: plan -> (images || voice) -> timeline -> render -> post."""

from __future__ import annotations

import hashlib
import json
import random
import shutil
import threading
import time
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime
from pathlib import Path

from . import planner
from .config import APP_DIR, Settings
from .images import ImageGenerator, placeholder_image
from .llm import ScriptLLM
from .prompts import full_image_prompt, style_for
from .render import (RenderJob, SceneSpec, build_audio, make_cover, make_storyboard,
                     render_video)
from .timeline import caption_chunks, scene_bounds, word_times
from .util import log, read_json, set_log_file, slugify, write_json
from .voice import Narrator

FONT = APP_DIR / "assets" / "fonts" / "Poppins-ExtraBold.ttf"
TAIL_SECONDS = 1.0


class Pipeline:
    def __init__(self, settings: Settings):
        self.s = settings
        self.s.output_dir.mkdir(parents=True, exist_ok=True)
        set_log_file(self.s.output_dir / "last_run.log")
        self.llm = ScriptLLM(settings)
        self.images = ImageGenerator(settings)
        self.narrator = Narrator(settings)
        self._history_lock = threading.Lock()

    # ------------------------------------------------------------- history

    @property
    def history_path(self) -> Path:
        return self.s.output_dir / "history.json"

    def covered_topics(self) -> list[str]:
        hist = read_json(self.history_path, []) or []
        return [h.get("title", "") for h in hist if h.get("title")]

    def _remember(self, project: dict, folder: Path) -> None:
        with self._history_lock:
            hist = read_json(self.history_path, []) or []
            if not any(h.get("folder") == folder.name for h in hist):
                hist.append({"title": project["title"], "topic": project.get("topic", ""),
                             "date": datetime.now().strftime("%Y-%m-%d"),
                             "folder": folder.name})
                write_json(self.history_path, hist)

    # ------------------------------------------------------------- planning

    def _new_folder(self, title: str) -> Path:
        base = f"{datetime.now().strftime('%Y-%m-%d')}_{slugify(title)}"
        folder = self.s.output_dir / base
        n = 2
        while folder.exists():
            folder = self.s.output_dir / f"{base}-{n}"
            n += 1
        folder.mkdir(parents=True)
        return folder

    def _save_project(self, meta: dict, scene_plan: dict, style: str) -> Path:
        folder = self._new_folder(meta["title"])
        project = {
            "version": 1,
            "created": datetime.now().isoformat(timespec="seconds"),
            **meta,
            "style": style,
            "continuity": scene_plan.get("continuity", ""),
            "scenes": scene_plan["scenes"],
        }
        write_json(folder / "project.json", project)
        (folder / "script.txt").write_text(meta["script"] + "\n", encoding="utf-8")
        log(f"Planned '{meta['title']}' -> {folder.name} ({len(project['scenes'])} scenes)")
        return folder

    def plan(self, *, topic: str = "", count: int = 1, topics: list[str] | None = None,
             script_file: Path | None = None, plan_file: Path | None = None,
             style: str = "") -> list[Path]:
        style = style or self.s.style
        if plan_file:
            return self._plan_from_file(plan_file, style)
        if script_file:
            scripts = planner.parse_script_file(script_file.read_text(encoding="utf-8"))
            if not scripts:
                raise SystemExit(f"No script found in {script_file}")
            log(f"Loaded {len(scripts)} script(s) from {script_file.name}")
        else:
            avoid = self.covered_topics()
            if topics:
                scripts = planner.write_scripts(self.llm, len(topics), topics, avoid)
            elif topic and count == 1:
                scripts = planner.write_scripts(self.llm, 1, [topic], avoid)
            else:
                scripts = planner.write_scripts(self.llm, count, None, avoid, theme=topic)

        def direct(meta: dict) -> Path:
            scene_plan = planner.plan_scenes(self.llm, meta["title"], meta["script"])
            return self._save_project(meta, scene_plan, style)

        with ThreadPoolExecutor(max_workers=3) as pool:
            return list(pool.map(direct, scripts))

    def _plan_from_file(self, plan_file: Path, style: str) -> list[Path]:
        data = json.loads(plan_file.read_text(encoding="utf-8"))
        items = data.get("videos", [data]) if isinstance(data, dict) else data
        folders = []
        for item in items:
            meta = planner._normalize_script(item)
            if item.get("scenes"):
                scenes = [{"text": str(s.get("text", "")).strip(),
                           "visual": str(s.get("visual", "")).strip(),
                           "prompt": str(s.get("prompt", "")).strip(),
                           "motion": str(s.get("motion", ""))} for s in item["scenes"]
                          if str(s.get("prompt", "")).strip()]
                planner._fix_motions(scenes)
                scene_plan = {"continuity": item.get("continuity", ""), "scenes": scenes}
                if not meta["script"]:
                    meta["script"] = " ".join(s["text"] for s in scenes)
            else:
                scene_plan = planner.plan_scenes(self.llm, meta["title"], meta["script"])
            folders.append(self._save_project(meta, scene_plan, item.get("style") or style))
        return folders

    # ------------------------------------------------------------- assets

    def prepare_assets(self, folder: Path, redo: set[int] | None = None,
                       revoice: bool = False, draft: bool = False) -> None:
        project = read_json(folder / "project.json")
        if not project:
            raise SystemExit(f"{folder} has no project.json")
        redo = redo or set()
        img_dir = folder / "images"
        img_dir.mkdir(exist_ok=True)
        scenes = project["scenes"]

        jobs = []
        for i, sc in enumerate(scenes, start=1):
            path = img_dir / f"scene_{i:02d}.png"
            provider = str(sc.get("image_provider", ""))
            stand_in = provider == "placeholder" or provider.startswith("reused")
            needs = i in redo or not path.exists() or (stand_in and not draft)
            if not needs:
                continue
            if i in redo and path.exists():
                path.unlink()
            sc.pop("image_provider", None)
            if draft:
                placeholder_image(sc.get("visual") or sc["text"], i, path)
                sc["image_provider"] = "placeholder"
                continue
            seed = random.randint(1, 2**31 - 1) if i in redo else int(
                hashlib.md5(f"{folder.name}-{i}".encode()).hexdigest()[:7], 16)
            prompt = full_image_prompt(sc["prompt"], project.get("style", self.s.style))
            jobs.append((prompt, path, seed, f"scene {i}"))

        def do_voice():
            voice_file = folder / "voice.wav"
            if revoice or not voice_file.exists() or not project.get("voice"):
                project["voice"] = self.narrator.narrate(project["script"], folder)

        voice_error: list[BaseException] = []
        voice_thread = threading.Thread(
            target=lambda: _capture(do_voice, voice_error), daemon=True)
        voice_thread.start()

        if jobs:
            if not self.images.ready:
                voice_thread.join()
                raise SystemExit(
                    "No image service is configured. Install/login the Higgsfield CLI, or "
                    "add a free CLOUDFLARE_ACCOUNT_ID + CLOUDFLARE_API_TOKEN (or "
                    "POLLINATIONS_API_KEY) to .env. To preview without images, run "
                    "with --draft.")
            log(f"Generating {len(jobs)} image(s) with {self.images.describe()}...")
            results = self.images.generate_many(jobs)
            failed = []
            for i, sc in enumerate(scenes, start=1):
                res = results.get(f"scene {i}")
                if isinstance(res, str):
                    sc["image_provider"] = res
                elif isinstance(res, Exception):
                    failed.append(i)
            if failed:
                self._fill_missing(folder, scenes, failed)

        voice_thread.join()
        write_json(folder / "project.json", project)
        if voice_error:
            raise voice_error[0]

    def _fill_missing(self, folder: Path, scenes: list[dict], failed: list[int]) -> None:
        img_dir = folder / "images"
        ok = [i for i in range(1, len(scenes) + 1)
              if (img_dir / f"scene_{i:02d}.png").exists() and i not in failed]
        if not ok:
            raise RuntimeError("Every scene image failed - see the messages above.")
        for i in failed:
            donor = min(ok, key=lambda k: abs(k - i))
            shutil.copyfile(img_dir / f"scene_{donor:02d}.png", img_dir / f"scene_{i:02d}.png")
            scenes[i - 1]["image_provider"] = f"reused-{donor}"
            log(f"  Scene {i} image failed everywhere; reusing scene {donor}'s image for "
                f"now. Running --project \"{folder.name}\" again will retry it.")

    # ------------------------------------------------------------- assembly

    def assemble(self, folder: Path, publish: bool = False) -> Path:
        project = read_json(folder / "project.json")
        voice = project.get("voice")
        if not voice or not (folder / voice["file"]).exists():
            raise RuntimeError("No voice-over yet - run without --rerender first.")
        started = time.time()
        duration = voice["duration"] + TAIL_SECONDS
        words = word_times(voice["text"], voice["words"], voice["duration"])
        bounds = scene_bounds(voice["text"], project["scenes"], words, duration)
        chunks = caption_chunks(words) if self.s.captions else []

        specs = []
        for i, (sc, (a, b)) in enumerate(zip(project["scenes"], bounds), start=1):
            sc["start"], sc["end"] = a, b
            specs.append(SceneSpec(str(folder / "images" / f"scene_{i:02d}.png"),
                                   sc.get("motion", "zoom_in"), a, b))
        write_json(folder / "project.json", project)

        audio = folder / "audio.m4a"
        music = self.s.music
        if music and not Path(music).is_absolute():
            music = str(APP_DIR / music)
        build_audio(folder / voice["file"], duration, audio, music, self.s.music_volume)

        job = RenderJob(width=self.s.width, height=self.s.height, fps=self.s.fps,
                        duration=duration, scenes=specs, captions=chunks,
                        crossfade=self.s.crossfade, particles=self.s.particles,
                        grain=self.s.grain, font_path=str(FONT),
                        seed=int(hashlib.md5(folder.name.encode()).hexdigest()[:6], 16))
        out = folder / f"{slugify(project['title'], 60)}.mp4"
        log(f"Rendering {duration:.1f}s video ({len(specs)} scenes)...")
        render_video(job, audio, out)
        audio.unlink(missing_ok=True)

        make_cover(specs[0].image, project["title"], str(FONT), folder / "cover.jpg")
        make_storyboard([s.image for s in specs], folder / "storyboard.jpg")
        self._write_post(folder, project, duration)
        log(f"Done: {out} ({time.time() - started:.0f}s render)")
        if any(sc.get("image_provider") == "placeholder" for sc in project["scenes"]):
            log("  (draft images - run again with --project to generate the real ones)")

        if publish:
            from .publish import publish_reel
            caption = (project.get("caption") or project.get("hook", "")) + "\n\n" + \
                " ".join(project.get("hashtags", []))
            vid = publish_reel(self.s, out, caption.strip())
            project["facebook_video_id"] = vid
            write_json(folder / "project.json", project)
        self._remember(project, folder)
        return out

    def _write_post(self, folder: Path, project: dict, duration: float) -> None:
        tags = " ".join(project.get("hashtags", []))
        caption = project.get("caption") or (
            f"{project.get('hook', '')} Did you know this? Tell us in the comments.").strip()
        style = style_for(project.get("style", "fresco"))["label"]
        text = (
            f"TITLE\n{project['title']}\n\n"
            f"CAPTION (paste into Facebook)\n{caption}\n\n{tags}\n\n"
            f"ACCURACY NOTE (double-check before posting)\n"
            f"{project.get('accuracy_note') or 'n/a'}\n\n"
            f"LENGTH  {duration:.0f}s   STYLE  {style}   VOICE  "
            f"{project.get('voice', {}).get('provider', '?')}\n\n"
            f"SCRIPT\n{project['script']}\n"
        )
        (folder / "post.txt").write_text(text, encoding="utf-8")

    # ------------------------------------------------------------- batch

    def produce(self, folders: list[Path], redo: set[int] | None = None,
                revoice: bool = False, draft: bool = False, publish: bool = False,
                rerender_only: bool = False) -> list[Path]:
        """Make every video. While one video renders (CPU), the next one's images
        and voice are generated (network) in the background."""
        outputs: list[Path] = []
        failures: list[str] = []
        if not folders:
            return outputs

        def prep(folder: Path) -> None:
            if not rerender_only:
                self.prepare_assets(folder, redo, revoice, draft)

        with ThreadPoolExecutor(max_workers=1) as background:
            pending = background.submit(prep, folders[0])
            for idx, folder in enumerate(folders):
                try:
                    pending.result()
                    ready = True
                except BaseException as exc:  # noqa: BLE001
                    if isinstance(exc, (KeyboardInterrupt, SystemExit)):
                        raise
                    ready = False
                    failures.append(f"{folder.name}: {exc}")
                    log(f"FAILED preparing {folder.name}: {exc}")
                if idx + 1 < len(folders):
                    pending = background.submit(prep, folders[idx + 1])
                if not ready:
                    continue
                try:
                    outputs.append(self.assemble(folder, publish))
                except Exception as exc:  # noqa: BLE001
                    failures.append(f"{folder.name}: {exc}")
                    log(f"FAILED rendering {folder.name}: {exc}")
        if failures:
            log("Some videos failed:\n  " + "\n  ".join(failures))
        return outputs


def _capture(fn, errors: list) -> None:
    try:
        fn()
    except BaseException as exc:  # noqa: BLE001
        errors.append(exc)
