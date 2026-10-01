import librosa

from .analysis import relative_key


def _fmt_note(midi):
    return librosa.midi_to_note(int(midi), unicode=False)


def write_markdown(r, path):
    b, a = r["before"], r["after"]
    lines = [f"# songfix report - {r['song']}", ""]
    lines += ["## Before / after", "",
              "| | Before | After |", "|---|---|---|",
              f"| Loudness (LUFS) | {b['lufs']} | {a['lufs']} |",
              f"| True peak (dBTP) | {b['true_peak_dbtp']} | {a['true_peak_dbtp']} |",
              f"| Samples at/over 0 dBFS (clipping) | {b['clipped_samples']} | {a['clipped_samples']} |",
              f"| Stereo correlation | {b['stereo_correlation']} | {a['stereo_correlation']} |",
              ""]
    if "key" in r:
        lines += [f"**Key:** {r['key']} (same notes as {relative_key(r['key'])})", ""]
    fixed = [n for n in r.get("notes", []) if n["status"] == "corrected"]
    if r.get("notes"):
        lines += [f"## Pitch correction - {len(fixed)} of {len(r['notes'])} sung notes fixed", ""]
        if fixed:
            lines += ["| Time | Note | Was off by | Moved |", "|---|---|---|---|"]
            for n in fixed:
                m, s = divmod(n["t0"], 60)
                lines.append(f"| {int(m)}:{s:05.2f} | {_fmt_note(n['target'])} | "
                             f"{n['off_cents']:+.0f} cents ({'sharp' if n['off_cents'] > 0 else 'flat'}) | "
                             f"{n['shift'] * 100:+.0f} cents |")
            lines.append("")
        skipped = [n for n in r["notes"] if n["status"] not in ("corrected", "in tune", "too short (left natural)")]
        if skipped:
            lines += [f"{len(skipped)} more notes were off-centre but sound like slides/runs, so they were "
                      "left natural on purpose.", ""]
    if "mastering" in r:
        eq = r["mastering"]["eq"]
        moves = sorted(zip(eq["freqs"], eq["gain_db"]), key=lambda fg: -abs(fg[1]))[:5]
        lines += ["## Mastering", "",
                  "- Removed sub-rumble below 25 Hz and made the bass mono below 120 Hz",
                  "- Gentle tonal-balance EQ, biggest moves: " +
                  ", ".join(f"{f:.0f} Hz {g:+.1f} dB" for f, g in sorted(moves)),
                  f"- Glue compression: ~{r['mastering'].get('glue_gr_db', 0):.1f} dB on the loudest parts",
                  f"- True-peak limiter: up to {r['mastering']['limiter_max_gr_db']:.1f} dB of peak reduction, "
                  f"ceiling {r['settings']['ceiling']} dBTP",
                  ""]
    tips = []
    if b["bandwidth_hz"] < 17500:
        tips.append(f"Your file has nothing above ~{b['bandwidth_hz'] / 1000:.1f} kHz - that's the fingerprint of a "
                    "low-bitrate MP3/AAC export. Export WAV (or 320 kbps) from your DAW and run songfix on that "
                    "for a crisper top end.")
    if b["true_peak_dbtp"] > 0:
        tips.append("The original peaks above 0 dB, which means audible clipping/crackle on many players. "
                    "The master now stays under the ceiling.")
    if tips:
        lines += ["## Tips", ""] + [f"- {t}" for t in tips] + [""]
    path.write_text("\n".join(lines))
