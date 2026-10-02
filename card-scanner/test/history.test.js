import { test } from "node:test";
import assert from "node:assert/strict";
import { historyStats, itemValue, portfolio, sparkPath } from "../src/lib/history.js";

const now = new Date(2026, 9, 1, 15).getTime(); // 1 Oct 2026, local time
const snaps = [
  { day: "2026-08-01", total: 100, count: 10 },
  { day: "2026-09-01", total: 200, count: 12 },
  { day: "2026-09-25", total: 240, count: 12 },
  { day: "2026-09-30", total: 220, count: 12 },
  { day: "2026-10-01", total: 230, count: 13 },
];

test("portfolio totals respect quantity and missing prices", () => {
  const items = [{ estimate: { value: 10 }, qty: 3 }, { estimate: { value: 2.5 } }, { estimate: null, qty: 2 }];
  assert.equal(itemValue(items[0]), 30);
  assert.deepEqual(portfolio(items), { total: 32.5, count: 6 });
});

test("30-day change uses the last snapshot before the window as the baseline", () => {
  const s = historyStats(snaps, 30, now);
  assert.equal(s.since, "2026-09-01");
  assert.equal(s.change, 30);
  assert.equal(s.pct, 0.15);
  assert.equal(s.cardsAdded, 1);
  assert.equal(s.points.length, 4);
});

test("7-day window and all-time window", () => {
  const week = historyStats(snaps, 7, now);
  assert.equal(week.since, "2026-09-01"); // nothing between Sep 1 and Sep 24, so Sep 1 is still the baseline
  const recent = historyStats(snaps.slice(1), 3, now);
  assert.equal(recent.since, "2026-09-25");
  assert.equal(recent.change, -10);
  const all = historyStats(snaps, 0, now);
  assert.equal(all.since, "2026-08-01");
  assert.equal(all.change, 130);
});

test("no trend until there are two days to compare", () => {
  assert.equal(historyStats([], 30, now), null);
  assert.equal(historyStats([snaps[4]], 30, now), null);
  assert.equal(historyStats([{ day: "2026-10-01", total: 0, count: 0 }, { day: "2026-10-02", total: 5, count: 1 }], 0, now).pct, null);
});

test("sparkline spaces points by date and fits the box", () => {
  const pts = sparkPath(snaps.slice(1), 100, 32, 2).split(" ").map((p) => p.split(",").map(Number));
  assert.equal(pts[0][0], 2);
  assert.equal(pts[pts.length - 1][0], 98);
  assert.ok(pts[1][0] > 70); // Sep 25 sits near the right, not a quarter of the way along
  for (const [, y] of pts) assert.ok(y >= 2 && y <= 30);
  assert.equal(pts[0][1], 30); // lowest value at the bottom
});
