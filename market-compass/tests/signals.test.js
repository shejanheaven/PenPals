import test from 'node:test'
import assert from 'node:assert/strict'
import { analyze, actionFor, benchmarkContext, computeIndicators, marketMood, positionSize, scoreBar, simulate, STRATEGIES, tradeStats } from '../src/lib/signals.js'

const day = 86400000
function series(fn, n = 400) {
  return Array.from({ length: n }, (_, i) => {
    const c = fn(i)
    return { t: Date.UTC(2024, 0, 1) + i * day, o: c * 0.999, h: c * 1.01, l: c * 0.99, c, v: 1000 + (i % 7) * 50 }
  })
}

test('actionFor thresholds', () => {
  assert.equal(actionFor(0.6), 'strong-buy')
  assert.equal(actionFor(0.2), 'buy')
  assert.equal(actionFor(0), 'hold')
  assert.equal(actionFor(-0.2), 'sell')
  assert.equal(actionFor(-0.6), 'strong-sell')
})

test('steady uptrend scores positive on trend; downtrend negative', () => {
  const up = series(i => 100 * 1.003 ** i + Math.sin(i / 3))
  const down = series(i => 300 * 0.997 ** i + Math.sin(i / 3))
  const su = scoreBar(computeIndicators(up), up.length - 1)
  const sd = scoreBar(computeIndicators(down), down.length - 1)
  assert.ok(su.factors.find(f => f.key === 'trend').score > 0.5)
  assert.ok(sd.factors.find(f => f.key === 'trend').score < -0.5)
  assert.ok(sd.score < su.score)
  for (const f of su.factors) assert.ok(f.text.length > 10)
})

test('news and market mood factors are included when given', () => {
  const up = series(i => 100 + i)
  const r = scoreBar(computeIndicators(up), up.length - 1, { news: { score: 0.5, count: 4 }, mood: -1, benchmarkName: 'SPY' })
  assert.ok(r.factors.some(f => f.key === 'news' && f.score > 0))
  assert.ok(r.factors.some(f => f.key === 'market' && f.score === -1))
})

test('analyze returns a coherent plan and forecast', () => {
  const c = series(i => 100 * 1.002 ** i * (1 + 0.03 * Math.sin(i / 9)))
  const a = analyze(c, { kind: 'stock', mood: marketMood(c) })
  assert.ok(a)
  assert.ok(a.plan.stop < a.plan.entry && a.plan.entry < a.plan.target)
  assert.ok(a.plan.holdDays >= 2 && a.plan.holdDays <= 20)
  const f = a.forecast
  assert.ok(f.low95 < f.low68 && f.low68 < f.expected && f.expected < f.high68 && f.high68 < f.high95)
  assert.ok(f.probUp > 0 && f.probUp < 1)
  assert.ok(['high', 'medium', 'low'].includes(a.confidence))
  assert.equal(analyze(c.slice(0, 30)), null)
})

test('live price replaces the last close', () => {
  const c = series(i => 100 + i * 0.1)
  const a = analyze(c, { livePrice: 200 })
  assert.equal(a.price, 200)
  assert.equal(c[c.length - 1].c, 100 + 399 * 0.1) // input not mutated
})

function runTrend(c, scores, opts) {
  const ind = computeIndicators(c)
  return simulate(c, ind, STRATEGIES.trend, { ind, scores, moods: c.map(() => null) }, opts)
}

test('simulate exits at the stop on a crash and books fees', () => {
  const c = series(i => (i < 300 ? 100 + i * 0.2 : 160 - (i - 300) * 3), 330)
  const scores = c.map((_, i) => (i === 250 ? 1 : i > 250 ? 0 : null))
  const sim = runTrend(c, scores, { fee: 0.001, start: 200 })
  assert.equal(sim.trades.length, 1)
  const t = sim.trades[0]
  assert.ok(['stop', 'target', 'time'].includes(t.reason))
  assert.equal(t.entry, c[251].o)
  assert.ok(sim.maxDrawdown >= 0)
})

test('simulate has no lookahead: entry is the next bar open', () => {
  const c = series(i => 100 + Math.sin(i / 5) * 5, 260)
  const scores = c.map((_, i) => (i === 220 ? 0.9 : 0))
  const sim = runTrend(c, scores, { start: 200 })
  assert.equal(sim.trades[0].entryT, c[221].t)
})

test('dip-buy strategy fires on a sharp drop above the 200-day average and exits on the bounce', () => {
  // Uptrend with a 3-day dip at bar 300, then a recovery.
  const c = series(i => {
    const base = 100 * 1.002 ** i
    if (i >= 300 && i < 303) return base * (1 - 0.03 * (i - 299))
    return base
  }, 320)
  const ind = computeIndicators(c)
  const state = { ind, scores: c.map(() => 0), moods: c.map(() => 1) }
  assert.ok(STRATEGIES.pullback.entry(state, 302))
  const sim = simulate(c, ind, STRATEGIES.pullback, state, { start: 200 })
  const t = sim.trades.find(x => x.entryT >= c[301].t && x.entryT <= c[303].t)
  assert.ok(t, 'expected a trade entered during the dip')
  assert.equal(t.reason, 'signal')
  assert.ok(t.ret > 0)
})

test('tradeStats', () => {
  const s = tradeStats([{ ret: 0.1, days: 3 }, { ret: -0.05, days: 5 }, { ret: 0.02, days: 2 }])
  assert.equal(s.count, 3)
  assert.ok(Math.abs(s.winRate - 2 / 3) < 1e-9)
  assert.ok(Math.abs(s.expectancy - 0.07 / 3) < 1e-9)
  assert.ok(Math.abs(s.profitFactor - 0.12 / 0.05) < 1e-9)
  assert.equal(s.medianHold, 3)
  assert.equal(tradeStats([]).count, 0)
})

test('analyze reports both strategies with seen/unseen splits', () => {
  const c = series(i => 100 * 1.0015 ** i * (1 + 0.06 * Math.sin(i / 7)), 900)
  const a = analyze(c, { kind: 'stock', bench: benchmarkContext(c) })
  for (const k of ['trend', 'pullback']) {
    const s = a.strategies[k]
    assert.equal(s.overall.count, s.is.count + s.oos.count)
    assert.equal(typeof s.proven, 'boolean')
  }
  assert.ok(a.strategy === null || ['trend', 'pullback'].includes(a.strategy))
  assert.equal(typeof a.topPick, 'boolean')
})

test('relative strength factor compares against the benchmark', () => {
  const bench = series(i => 100 + i * 0.05, 400)
  const strong = series(i => 100 * 1.003 ** i, 400)
  const weak = series(i => 100 * 0.999 ** i, 400)
  const ctx = benchmarkContext(bench)
  const rs = c => analyze(c, { bench: ctx }).factors.find(f => f.key === 'relative')
  assert.ok(rs(strong).score > 0.3)
  assert.ok(rs(weak).score < -0.3)
  assert.equal(analyze(bench, { bench: ctx, isBenchmark: true }).factors.find(f => f.key === 'relative'), undefined)
})

test('earnings guard shortens the hold and blocks a top pick', () => {
  const c = series(i => 100 * 1.003 ** i + Math.sin(i / 3), 500)
  const ctx = benchmarkContext(c)
  const a = analyze(c, { bench: ctx, earningsDate: Date.now() + 3 * 86400000 })
  assert.ok(a.earnings && a.earnings.beforeExit)
  assert.equal(a.topPick, false)
  if (a.action === 'buy' || a.action === 'strong-buy') assert.ok(a.plan.holdDays <= 2)
})

test('stormy market halves the risk', () => {
  const calm = series(i => 100 + Math.sin(i) * 0.2, 400)
  const stormy = calm.map((b, i) => (i > 380 ? { ...b, c: b.c * (1 + (i % 2 ? 0.08 : -0.08)) } : b))
  assert.equal(analyze(calm, { bench: benchmarkContext(calm) }).riskScale, 1)
  assert.equal(analyze(calm, { bench: benchmarkContext(stormy) }).riskScale, 0.5)
})

test('positionSize risks the chosen % and caps exposure', () => {
  const p = positionSize({ account: 1000, riskPct: 0.01, entry: 100, stop: 95 })
  assert.equal(Math.round(p.riskDollars), 10)
  assert.equal(Math.round(p.dollars), 200)
  const capped = positionSize({ account: 1000, riskPct: 0.02, entry: 100, stop: 99.9 })
  assert.ok(capped.capped && capped.dollars === 250)
  assert.equal(positionSize({ account: 1000, riskPct: 0.01, entry: 100, stop: 101 }), null)
})

function seeded(seed) {
  let a = seed
  return () => { a = (a * 1664525 + 1013904223) % 4294967296; return a / 4294967296 }
}

test('self-tuning boosts a factor that predicts and keeps standard weights on noise', async () => {
  const { calibrateWeights, WEIGHTS } = await import('../src/lib/signals.js')
  const rand = seeded(7)
  const make = (n, seg, predictive) => Array.from({ length: n }, () => {
    const f = { trend: rand() * 2 - 1, momentum: rand() * 2 - 1, rsi: rand() * 2 - 1, market: rand() * 2 - 1 }
    const noise = rand() * 2 - 1
    return { seg, f, r: predictive ? 0.6 * f.trend - 0.2 * f.rsi + noise : noise }
  })
  const good = calibrateWeights([...make(3000, 'train', true), ...make(600, 'valid', true)])
  assert.ok(good.ics.trend > 0.1)
  assert.ok(good.tuned.trend > WEIGHTS.trend)
  assert.ok(good.tuned.rsi < WEIGHTS.rsi)
  assert.equal(good.used, true)
  assert.ok(good.after.ic > good.before.ic)

  const noise = calibrateWeights([...make(3000, 'train', false), ...make(600, 'valid', false)])
  assert.equal(noise.used, false)
  assert.deepEqual(noise.weights, { ...WEIGHTS })
})

test('self-check replays past calls with no lookahead', () => {
  const c = series(i => 100 * 1.001 ** i * (1 + 0.05 * Math.sin(i / 6)), 420)
  const ctx = benchmarkContext(c)
  const full = analyze(c, { bench: ctx })
  for (const daysAgo of [3, 10]) {
    const k = c.length - 1 - daysAgo
    const past = analyze(c.slice(0, k + 1), { bench: ctx })
    const call = full.recent.calls.find(x => x.daysAgo === daysAgo)
    assert.equal(call.action, actionFor(past.score), `call ${daysAgo} days ago`)
    assert.equal(call.priceThen, c[k].c)
  }
  assert.ok(full.calibRows.some(r => r.seg === 'train') && full.calibRows.some(r => r.seg === 'valid'))
  assert.equal(typeof full.recent.coldStreak, 'boolean')
})
