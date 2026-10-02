"""Run songfix over every song picked in a batch plan (see plan_batch.py), resumable.

    .venv\\Scripts\\python batch_downloads.py plan.json "C:\\Users\\you\\Downloads\\songfix masters"

Each song gets its own folder with the before/after page; the finished WAV and
MP3 of every song are also linked into Masters/ with clean names, and index.html
lists every song with links to its page and downloads.
"""
import ctypes
import html
import json
import os
import sys
import time
import traceback
from pathlib import Path
from urllib.parse import quote

sys.path.insert(0, str(Path(__file__).resolve().parent))
from songfix.cli import main as songfix  # noqa: E402

BELOW_NORMAL = 0x4000


def title(key):
    return key[len("untitled "):] if key.startswith("untitled ") else key.title()


def link_or_copy(src, dst):
    dst.unlink(missing_ok=True)
    try:
        os.link(src, dst)  # same drive: no extra disk space
    except OSError:
        import shutil
        shutil.copyfile(src, dst)


def gallery(root, plan):
    rows = []
    for e in plan:
        name = title(e["song"])
        folder = root / "songs" / name
        rep = folder / "report.json"
        if not rep.exists():
            state = "failed - see batch.log" if (folder / "FAILED").exists() else "waiting"
            rows.append(f'<tr><td>{html.escape(name)}</td><td colspan="4" class="muted">{state}</td></tr>')
            continue
        r = json.loads(rep.read_text())
        fixed = sum(1 for n in r.get("notes", []) if n["status"] == "corrected")
        page = quote(f"songs/{name}/index.html")
        rows.append(
            f'<tr><td><a href="{page}">{html.escape(name)}</a></td>'
            f'<td class="num">{fixed} of {len(r.get("notes", []))}</td>'
            f'<td class="num">{r["before"]["lufs"]:.1f} → {r["after"]["lufs"]:.1f}</td>'
            f'<td class="num">{r["before"]["true_peak_dbtp"]:+.1f} → {r["after"]["true_peak_dbtp"]:+.1f}</td>'
            f'<td><a href="{quote(f"Masters/{name}.wav")}" download>WAV</a> · '
            f'<a href="{quote(f"Masters/{name}.mp3")}" download>MP3</a></td></tr>')
    done = sum(1 for e in plan if (root / "songs" / title(e["song"]) / "report.json").exists())
    (root / "index.html").write_text(f"""<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>songfix masters</title>
<style>
:root {{ --bg: #eceef2; --panel: #fff; --ink: #14161b; --muted: #5b6170; --line: #d3d7df; --accent: #2945cf; }}
@media (prefers-color-scheme: dark) {{ :root {{ --bg: #101217; --panel: #191c23; --ink: #e7e9ee; --muted: #9aa1ae; --line: #2b303b; --accent: #8296ff; }} }}
body {{ margin: 0; background: var(--bg); color: var(--ink); font: 15px/1.5 system-ui, -apple-system, "Segoe UI", sans-serif; padding: 28px 16px 56px; }}
main {{ max-width: 900px; margin: 0 auto; display: grid; gap: 16px; }}
h1 {{ margin: 0; font-size: 32px; }}
.muted {{ color: var(--muted); }}
.wrap {{ background: var(--panel); border: 1px solid var(--line); border-radius: 12px; overflow-x: auto; }}
table {{ border-collapse: collapse; width: 100%; }}
th, td {{ text-align: left; padding: 9px 12px; border-bottom: 1px solid var(--line); white-space: nowrap; }}
th {{ font-size: 12px; text-transform: uppercase; letter-spacing: .06em; color: var(--muted); font-weight: 500; }}
td.num {{ font-variant-numeric: tabular-nums; font-family: ui-monospace, Menlo, monospace; font-size: 14px; }}
a {{ color: var(--accent); }}
</style></head><body><main>
<h1>songfix masters</h1>
<p class="muted">{done} of {len(plan)} songs done. Click a song for its before/after page. Every finished WAV and MP3
is also in the <b>Masters</b> folder next to this page.</p>
<div class="wrap"><table>
<tr><th>Song</th><th>Notes fixed</th><th>Loudness (LUFS)</th><th>True peak (dBTP)</th><th>Download</th></tr>
{chr(10).join(rows)}
</table></div></main></body></html>""", encoding="utf-8")


def run(plan_path, root):
    from ctypes import wintypes
    k32 = ctypes.windll.kernel32
    k32.GetCurrentProcess.restype = wintypes.HANDLE
    k32.SetPriorityClass.argtypes = (wintypes.HANDLE, wintypes.DWORD)
    k32.SetPriorityClass(k32.GetCurrentProcess(), BELOW_NORMAL)  # the game server always gets the CPU first
    plan = json.loads(Path(plan_path).read_text())
    root = Path(root)
    (root / "songs").mkdir(parents=True, exist_ok=True)
    (root / "Masters").mkdir(exist_ok=True)
    log = open(root / "batch.log", "a", encoding="utf-8", buffering=1)
    gallery(root, plan)
    for i, e in enumerate(plan, 1):
        name = title(e["song"])
        out = root / "songs" / name
        if (out / "index.html").exists():
            continue
        src = Path(e["source"])
        log.write(f"[{time.strftime('%H:%M:%S')}] {i}/{len(plan)} {name} <- {src.name}\n")
        print(f"\n=== {i}/{len(plan)} {name} ===", flush=True)
        try:
            songfix([str(src), "-o", str(out), "--no-stems", "--no-open"])
            (out / "FAILED").unlink(missing_ok=True)
            for ext in ("wav", "mp3"):
                link_or_copy(out / f"{src.stem} (songfix).{ext}", root / "Masters" / f"{name}.{ext}")
        except Exception:
            out.mkdir(parents=True, exist_ok=True)
            (out / "FAILED").write_text(traceback.format_exc())
            log.write(traceback.format_exc() + "\n")
        gallery(root, plan)
    log.write(f"[{time.strftime('%H:%M:%S')}] all done\n")


if __name__ == "__main__":
    run(sys.argv[1], sys.argv[2])
