// Collection value over time. Pure helpers so they can be unit-tested (see test/history.test.js).

export const itemValue = (it) => (it.estimate?.value || 0) * (it.qty || 1);

export function portfolio(items) {
  return {
    total: items.reduce((s, it) => s + itemValue(it), 0),
    count: items.reduce((s, it) => s + (it.qty || 1), 0),
  };
}

const DAY = 86_400_000;
const dayOf = (ts) => {
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

/**
 * snapshots: [{ day: "YYYY-MM-DD", total, count }] oldest first. days: window length, or 0 for all time.
 * Compares the latest snapshot with the last one on or before the window start
 * (or the oldest inside the window). Null until there are two days to compare.
 */
export function historyStats(snapshots, days = 30, now = Date.now()) {
  if (!snapshots?.length) return null;
  const start = days ? dayOf(now - days * DAY) : "";
  const before = snapshots.filter((s) => s.day <= start);
  const inside = snapshots.filter((s) => s.day > start);
  const points = [...before.slice(-1), ...inside];
  if (points.length < 2) return null;
  const base = points[0];
  const last = points[points.length - 1];
  const change = Math.round((last.total - base.total) * 100) / 100;
  return {
    points,
    since: base.day,
    change,
    pct: base.total > 0 ? change / base.total : null,
    cardsAdded: last.count - base.count,
  };
}

/** SVG polyline points for a sparkline in a w×h box, spaced by date so gaps between days show. */
export function sparkPath(points, w = 100, h = 32, pad = 2) {
  const vals = points.map((p) => p.total);
  const min = Math.min(...vals);
  const span = Math.max(...vals) - min || 1;
  const t = points.map((p) => Date.parse(p.day));
  const tSpan = t[t.length - 1] - t[0] || 1;
  const x = (i) => pad + ((t[i] - t[0]) / tSpan) * (w - pad * 2);
  const y = (v) => h - pad - ((v - min) / span) * (h - pad * 2);
  return vals.map((v, i) => `${x(i).toFixed(2)},${y(v).toFixed(2)}`).join(" ");
}
