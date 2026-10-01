// The signal engine. For each asset it:
//   1. scores today from -1 (strong sell) to +1 (strong buy) using nine
//      research-backed factors, each explained in plain English;
//   2. runs two strategies over years of real history (trend-following and
//      buy-the-dip-in-an-uptrend), testing each on older data and then on
//      recent data it never saw (walk-forward), so "proven" means something;
//   3. turns the strongest valid setup into a trade plan: entry, stop-loss,
//      target, how long to hold, and how much to risk;
//   4. guards against known traps: earnings dates, stormy markets, bad ticks.
//
// Research behind the factors (for the curious):
//   trend & time-series momentum ...... Moskowitz, Ooi & Pedersen (2012)
//   12-month momentum ................. Jegadeesh & Titman (1993)
//   52-week-high proximity ............ George & Hwang (2004)
//   relative strength vs. market ...... Jegadeesh & Titman; Asness et al. (2013)
//   short-term pullbacks in uptrends .. Connors & Alvarez (2009)
//   volatility-scaled risk ............ Moreira & Muir (2017)
//   news sentiment .................... Tetlock (2007)

import { sma, ema, rsi, macd, bollinger, atr, roc, volatility, upDownVolume, rollingMax } from './indicators.js'

export const WEIGHTS = {
  trend: 0.2,
  momentum: 0.15,
  longterm: 0.1,
  relative: 0.1,
  rsi: 0.1,
  stretch: 0.07,
  volume: 0.08,
  news: 0.1,
  market: 0.1,
}

export const THRESHOLDS = { strongBuy: 0.45, buy: 0.15, sell: -0.15, strongSell: -0.45 }

export const ACTIONS = {
  'strong-buy': { label: 'Strong Buy', tone: 'good', short: 'BUY' },
  buy: { label: 'Buy', tone: 'good', short: 'BUY' },
  hold: { label: 'Hold / Wait', tone: 'neutral', short: 'WAIT' },
  sell: { label: 'Sell / Avoid', tone: 'critical', short: 'SELL' },
  'strong-sell': { label: 'Strong Sell', tone: 'critical', short: 'SELL' },
}

export const MAX_HOLD_DAYS = 20
const HORIZON = 5 // days used to grade whether a signal was "right"
const DAY = 86400000

// Self-check / self-tuning windows (in bars, counted back from today):
//   [train: TRAIN_BARS] [gap: HORIZON] [validate: VALID_BARS] [last HORIZON bars: outcome not known yet]
export const TRAIN_BARS = 250
export const VALID_BARS = 40
const CALIB_SPAN = TRAIN_BARS + VALID_BARS + 3 * HORIZON
export const FACTOR_KEYS = Object.keys(WEIGHTS)

// Weighted average of the factors present in a bar, like scoreBar does.
export function combine(fvec, weights = WEIGHTS) {
  let sum = 0, wsum = 0
  for (const k of FACTOR_KEYS) {
    const v = fvec[k]
    if (v == null) continue
    const w = weights[k] ?? WEIGHTS[k]
    sum += v * w
    wsum += w
  }
  return wsum ? sum / wsum : 0
}

function pearson(xs, ys) {
  const n = xs.length
  if (n < 3) return 0
  let mx = 0, my = 0
  for (let i = 0; i < n; i++) { mx += xs[i]; my += ys[i] }
  mx /= n; my /= n
  let sxy = 0, sxx = 0, syy = 0
  for (let i = 0; i < n; i++) {
    const dx = xs[i] - mx, dy = ys[i] - my
    sxy += dx * dy; sxx += dx * dx; syy += dy * dy
  }
  return sxx && syy ? sxy / Math.sqrt(sxx * syy) : 0
}

function callStats(rows, scoreOf) {
  let buyN = 0, buyHit = 0, sellN = 0, sellHit = 0, up = 0
  const xs = [], ys = []
  for (const row of rows) {
    const sc = scoreOf(row)
    xs.push(sc); ys.push(row.r)
    if (row.r > 0) up++
    const a = actionFor(sc)
    if (isBuy(a)) { buyN++; if (row.r > 0) buyHit++ }
    else if (isSell(a)) { sellN++; if (row.r < 0) sellHit++ }
  }
  return {
    n: rows.length, ic: pearson(xs, ys),
    buyHit: buyN ? buyHit / buyN : null, buyN,
    sellHit: sellN ? sellHit / sellN : null, sellN,
    baseUp: rows.length ? up / rows.length : null,
  }
}

// Self-tuning across many assets. Measures how well each factor predicted the
// next 5 days on the training window (information coefficient), nudges its
// weight up or down (never flips it), then tests the tuned weights on the
// validation window that training never saw. Tuned weights are used only if
// they beat the standard ones there; otherwise the standard weights stay.
export function calibrateWeights(rows, base = WEIGHTS) {
  const train = rows.filter(r => r.seg === 'train' && r.r != null)
  const valid = rows.filter(r => r.seg === 'valid' && r.r != null)
  const ics = {}
  const tuned = { ...base }
  for (const k of FACTOR_KEYS) {
    if (k === 'news') continue // no historical news archive to learn from
    const pts = train.filter(r => r.f[k] != null)
    if (pts.length < 200) continue
    ics[k] = pearson(pts.map(r => r.f[k]), pts.map(r => r.r))
    tuned[k] = base[k] * clamp(1 + 8 * ics[k], 0.25, 2)
  }
  const total = Object.values(base).reduce((a, b) => a + b, 0)
  const tTotal = Object.values(tuned).reduce((a, b) => a + b, 0)
  for (const k of Object.keys(tuned)) tuned[k] = (tuned[k] / tTotal) * total
  const before = callStats(valid, row => combine(row.f, base))
  const after = callStats(valid, row => combine(row.f, tuned))
  const used = valid.length >= 200 && train.length >= 1000 &&
    after.ic > before.ic + 0.01 && (after.buyHit ?? 0) >= (before.buyHit ?? 0) - 0.01
  return { weights: used ? tuned : { ...base }, tuned, ics, before, after, used, trainN: train.length, validN: valid.length }
}

const clamp = (x, lo = -1, hi = 1) => Math.max(lo, Math.min(hi, x))
const pct = x => `${Math.abs(x * 100).toFixed(0)}%`

export function actionFor(score) {
  if (score >= THRESHOLDS.strongBuy) return 'strong-buy'
  if (score >= THRESHOLDS.buy) return 'buy'
  if (score <= THRESHOLDS.strongSell) return 'strong-sell'
  if (score <= THRESHOLDS.sell) return 'sell'
  return 'hold'
}

export const isBuy = a => a === 'buy' || a === 'strong-buy'
export const isSell = a => a === 'sell' || a === 'strong-sell'

export function dayKey(t) {
  return new Date(t).toISOString().slice(0, 10)
}

export function computeIndicators(candles, kind = 'stock') {
  const closes = candles.map(c => c.c)
  const year = kind === 'crypto' ? 365 : 252
  const month = Math.round(year / 12)
  const hasVolume = candles.slice(-30).some(c => c.v > 0)
  return {
    closes,
    year,
    sma5: sma(closes, 5),
    sma20: sma(closes, 20),
    sma50: sma(closes, 50),
    sma200: sma(closes, 200),
    ema21: ema(closes, 21),
    rsi: rsi(closes, 14),
    rsi2: rsi(closes, 2),
    macd: macd(closes),
    bb: bollinger(closes, 20, 2),
    atr: atr(candles, 14),
    roc20: roc(closes, 20),
    vol20: volatility(closes, 20),
    vol60: volatility(closes, 60),
    hi52: rollingMax(candles.map(c => c.h), year),
    // 12-month return, skipping the most recent month (the classic momentum measure)
    mom12: closes.map((_, i) => (i >= year ? closes[i - month] / closes[i - year] - 1 : null)),
    udv: hasVolume ? upDownVolume(candles, 20) : closes.map(() => null),
  }
}

// ---- Benchmark context (S&P 500 for stocks, Bitcoin for crypto) --------------

export function benchmarkContext(benchCandles) {
  const closes = benchCandles.map(c => c.c)
  const s50 = sma(closes, 50), s200 = sma(closes, 200)
  const vol = volatility(closes, 20)
  const mood = new Map(), close = new Map(), volRatio = new Map()
  const recentVols = []
  benchCandles.forEach((c, i) => {
    const k = dayKey(c.t)
    close.set(k, c.c)
    if (s50[i] != null) {
      let m = closes[i] > s50[i] ? 0.5 : -0.5
      if (s200[i] != null) m += closes[i] > s200[i] ? 0.5 : -0.5
      else m *= 2
      mood.set(k, m)
    }
    if (vol[i] != null) {
      recentVols.push(vol[i])
      if (recentVols.length > 252) recentVols.shift()
      if (recentVols.length >= 60) {
        const sorted = [...recentVols].sort((a, b) => a - b)
        volRatio.set(k, vol[i] / sorted[Math.floor(sorted.length / 2)])
      }
    }
  })
  return { mood, close, volRatio }
}

// Backwards-compatible: just the mood map.
export const marketMood = benchCandles => benchmarkContext(benchCandles).mood

function lookup(map, t) {
  if (!map) return null
  for (let k = 0; k <= 4; k++) {
    const v = map.get(dayKey(t - k * DAY))
    if (v != null) return v
  }
  return null
}

// ---- Scoring -------------------------------------------------------------------

// Score one bar. ctx: { news, mood, rel, benchmarkName, isBenchmark }
export function scoreBar(ind, i, ctx = {}) {
  const price = ind.closes[i]
  const a = ind.atr[i]
  const factors = []

  // 1. Trend
  if (ind.sma50[i] != null) {
    let s = price > ind.sma50[i] ? 0.35 : -0.35
    if (ind.sma200[i] != null) s += ind.sma50[i] > ind.sma200[i] ? 0.35 : -0.35
    const prev = ind.sma50[i - 10]
    if (prev) s += clamp(((ind.sma50[i] / prev) - 1) * 10, -0.3, 0.3)
    const above50 = price > ind.sma50[i]
    const golden = ind.sma200[i] != null ? ind.sma50[i] > ind.sma200[i] : null
    let text
    if (above50 && golden) text = 'Uptrend: the price is above its 50-day average, and the 50-day is above the 200-day. Buyers have been in control for months.'
    else if (!above50 && golden === false) text = 'Downtrend: the price is below its 50-day average, and the 50-day is below the 200-day. Sellers have been in control.'
    else if (above50) text = 'Recovering: the price climbed back above its 50-day average, but the longer-term trend has not turned up yet.'
    else text = 'Weakening: the price slipped below its 50-day average, even though the longer-term trend is still up.'
    factors.push({ key: 'trend', label: 'Trend', score: clamp(s), text })
  }

  // 2. Short-term momentum (MACD + 20-day change)
  const h = ind.macd.hist[i], hPrev = ind.macd.hist[i - 1]
  if (h != null && a) {
    const r = ind.roc20[i] ?? 0
    const vol = ind.vol20[i] || 0.02
    const s = 0.6 * Math.tanh(h / (0.15 * a)) + 0.4 * Math.tanh(r / (vol * Math.sqrt(20)))
    const rising = hPrev != null && h > hPrev
    const move = `${r >= 0 ? 'up' : 'down'} ${Math.abs(r * 100).toFixed(1)}% over 20 days`
    let text
    if (h > 0 && rising) text = `Momentum is building: ${move}, and buyers are pushing harder (MACD rising).`
    else if (h > 0) text = `Momentum is positive but fading: ${move}, and the push is slowing.`
    else if (rising) text = `Momentum is negative but improving: ${move}, and selling is easing.`
    else text = `Momentum is negative and getting worse: ${move} (MACD falling).`
    factors.push({ key: 'momentum', label: 'Momentum (weeks)', score: clamp(s), text })
  }

  // 3. Long-term momentum: 12-month return and distance from the 52-week high
  if (ind.mom12[i] != null && ind.hi52[i]) {
    const m = ind.mom12[i]
    const fromHigh = price / ind.hi52[i] - 1
    const s = 0.55 * Math.tanh(m / 0.3) + 0.45 * clamp((fromHigh + 0.12) / 0.12)
    let text = `${m >= 0 ? 'Up' : 'Down'} ${pct(m)} over the past year, `
    text += fromHigh > -0.05
      ? 'and trading near its 52-week high. Leaders like this have tended to keep leading.'
      : fromHigh > -0.2
        ? `and ${pct(fromHigh)} below its 52-week high.`
        : `and ${pct(fromHigh)} below its 52-week high. Beaten-down assets often stay down for a while.`
    factors.push({ key: 'longterm', label: 'Momentum (12 months)', score: clamp(s), text })
  }

  // 4. Relative strength vs. the benchmark (6 months)
  if (ctx.rel != null && !ctx.isBenchmark) {
    const s = clamp(Math.tanh(ctx.rel.diff / 0.15))
    const name = ctx.benchmarkName?.includes('Bitcoin') ? 'Bitcoin' : 'the S&P 500'
    const text = ctx.rel.diff > 0.03
      ? `Beating ${name}: ${ctx.rel.asset >= 0 ? 'up' : 'down'} ${pct(ctx.rel.asset)} vs. ${ctx.rel.bench >= 0 ? 'up' : 'down'} ${pct(ctx.rel.bench)} over 6 months. Strong relative performers tend to stay strong.`
      : ctx.rel.diff < -0.03
        ? `Lagging ${name}: ${ctx.rel.asset >= 0 ? 'up' : 'down'} ${pct(ctx.rel.asset)} vs. ${ctx.rel.bench >= 0 ? 'up' : 'down'} ${pct(ctx.rel.bench)} over 6 months. Money is flowing elsewhere.`
        : `Moving in line with ${name} over 6 months.`
    factors.push({ key: 'relative', label: 'Strength vs. market', score: s, text })
  }

  // 5. RSI
  const r = ind.rsi[i]
  if (r != null) {
    const up = ind.sma50[i] != null && price > ind.sma50[i]
    let s, text
    if (r < 25) { s = 0.8; text = `RSI ${r.toFixed(0)}: very oversold. Sellers may be exhausted, and a bounce is common from here.` }
    else if (r < 35) { s = up ? 0.6 : 0.35; text = `RSI ${r.toFixed(0)}: oversold. The price has fallen fast and is often due for a bounce.` }
    else if (r < 45) { s = up ? 0.35 : -0.1; text = up ? `RSI ${r.toFixed(0)}: a dip inside an uptrend, which is often a good entry.` : `RSI ${r.toFixed(0)}: weak, but not stretched yet.` }
    else if (r < 62) { s = 0.15; text = `RSI ${r.toFixed(0)}: healthy, with room to run in either direction.` }
    else if (r < 72) { s = -0.1; text = `RSI ${r.toFixed(0)}: getting warm. Strong, but late buyers are piling in.` }
    else if (r < 80) { s = -0.55; text = `RSI ${r.toFixed(0)}: overbought. The price ran up fast; pullbacks are common from here.` }
    else { s = -0.85; text = `RSI ${r.toFixed(0)}: extremely overbought. Chasing here is risky.` }
    factors.push({ key: 'rsi', label: 'Overbought / oversold (RSI)', score: s, text })
  }

  // 6. Stretch (Bollinger %B)
  const b = ind.bb.pctB[i]
  if (b != null) {
    const s = clamp((0.5 - b) * 1.2, -0.8, 0.8)
    let text
    if (b > 1) text = 'Stretched above its normal range (upper Bollinger band). Prices usually cool off before going higher.'
    else if (b < 0) text = 'Stretched below its normal range (lower Bollinger band). A snap-back is common.'
    else if (b > 0.8) text = 'Near the top of its normal 20-day range.'
    else if (b < 0.2) text = 'Near the bottom of its normal 20-day range: cheaper than usual.'
    else text = 'In the middle of its normal 20-day range.'
    factors.push({ key: 'stretch', label: 'Price vs. normal range', score: s, text })
  }

  // 7. Volume
  const u = ind.udv[i]
  if (u != null) {
    const s = clamp(Math.tanh(Math.log(u) * 1.5))
    const text = u > 1.15
      ? `More volume traded on up days than down days (${u.toFixed(2)}x). Real buying is behind the move.`
      : u < 0.87
        ? `More volume traded on down days than up days (${(1 / u).toFixed(2)}x). Sellers are more active.`
        : 'Volume is balanced between buyers and sellers.'
    factors.push({ key: 'volume', label: 'Volume (buyers vs. sellers)', score: s, text })
  }

  // 8. News
  if (ctx.news && ctx.news.count) {
    const s = clamp(ctx.news.score * 1.6)
    const text = s > 0.2
      ? `Recent news is mostly positive (${ctx.news.count} headlines in the last few days).`
      : s < -0.2
        ? `Recent news is mostly negative (${ctx.news.count} headlines in the last few days).`
        : `Recent news is mixed or neutral (${ctx.news.count} headlines).`
    factors.push({ key: 'news', label: 'News sentiment', score: s, text })
  }

  // 9. Overall market
  const mood = ctx.mood ?? null
  if (mood != null) {
    const name = ctx.benchmarkName || 'the market'
    const text = mood > 0.5
      ? `${name} is in an uptrend. A rising tide lifts most boats.`
      : mood < -0.5
        ? `${name} is in a downtrend. Most things fall when the whole market falls, so be extra careful.`
        : `${name} is mixed and choppy right now.`
    factors.push({ key: 'market', label: 'Overall market mood', score: mood, text })
  }

  const weights = ctx.weights || WEIGHTS
  let sum = 0, wsum = 0
  for (const f of factors) {
    f.weight = weights[f.key] ?? WEIGHTS[f.key]
    sum += f.score * f.weight
    wsum += f.weight
  }
  return { score: wsum ? sum / wsum : 0, factors }
}

function relativeAt(ind, candles, i, bench) {
  const back = Math.round(ind.year / 2)
  if (!bench || i < back) return null
  const b0 = lookup(bench.close, candles[i - back].t), b1 = lookup(bench.close, candles[i].t)
  if (!b0 || !b1) return null
  const asset = ind.closes[i] / ind.closes[i - back] - 1
  const benchRet = b1 / b0 - 1
  return { asset, bench: benchRet, diff: (1 + asset) / (1 + benchRet) - 1 }
}

// ---- Strategies ------------------------------------------------------------------

export const STRATEGIES = {
  trend: {
    key: 'trend',
    name: 'Trend-following',
    blurb: 'Buy when most signals line up in an uptrend; ride it until the target, the stop, or the signal turns.',
    stopAtr: 2, targetAtr: 3, maxHold: MAX_HOLD_DAYS,
    entry: (s, i) => s.scores[i] != null && s.scores[i] >= THRESHOLDS.buy,
    exit: (s, i) => s.scores[i] != null && s.scores[i] <= THRESHOLDS.sell,
  },
  pullback: {
    key: 'pullback',
    name: 'Buy the dip in an uptrend',
    blurb: 'Buy a sharp 1–3 day drop in something that is still above its 200-day average; sell on the first bounce.',
    stopAtr: 2.5, targetAtr: null, maxHold: 10,
    entry: (s, i) => {
      const { ind } = s
      return ind.sma200[i] != null && ind.closes[i] > ind.sma200[i] && ind.rsi2[i] != null && ind.rsi2[i] < 10 && (s.moods[i] == null || s.moods[i] > -1)
    },
    exit: (s, i) => s.ind.sma5[i] != null && s.ind.closes[i] > s.ind.sma5[i],
  },
}

// Simulate one strategy: enter at the next day's open, exit at the stop or
// target (intraday), or at the next open after an exit signal / time limit.
export function simulate(candles, ind, strategy, state, { fee = 0.001, start = 200 } = {}) {
  const n = candles.length
  const trades = []
  let pos = null
  let equity = 1, peak = 1, maxDD = 0
  const begin = Math.min(Math.max(start, 60), n - 2)
  for (let i = begin; i < n; i++) {
    const bar = candles[i]
    if (pos) {
      const first = i === pos.idx
      let exit = null, reason = null, exitIdx = i
      if (bar.l <= pos.stop) { exit = first ? pos.stop : Math.min(bar.o, pos.stop); reason = 'stop' }
      else if (pos.target && bar.h >= pos.target) { exit = first ? pos.target : Math.max(bar.o, pos.target); reason = 'target' }
      else if (i + 1 < n && (strategy.exit(state, i) || i - pos.idx + 1 >= strategy.maxHold)) {
        exit = candles[i + 1].o; exitIdx = i + 1
        reason = strategy.exit(state, i) ? 'signal' : 'time'
      }
      const mark = exit ?? bar.c
      const open = equity * ((mark * (1 - fee)) / (pos.entry * (1 + fee)))
      peak = Math.max(peak, open)
      maxDD = Math.max(maxDD, 1 - open / peak)
      if (exit != null) {
        const ret = (exit * (1 - fee)) / (pos.entry * (1 + fee)) - 1
        equity *= 1 + ret
        trades.push({ entryIdx: pos.idx, entryT: candles[pos.idx].t, exitT: candles[exitIdx].t, entry: pos.entry, exit, ret, days: exitIdx - pos.idx + 1, reason })
        pos = null
        i = exitIdx // can't re-enter before the bar we exited on
        continue
      }
    } else if (i + 1 < n && ind.atr[i] && strategy.entry(state, i)) {
      const entry = candles[i + 1].o
      pos = {
        idx: i + 1, entry,
        stop: Math.max(entry - strategy.stopAtr * ind.atr[i], entry * 0.5),
        target: strategy.targetAtr ? entry + strategy.targetAtr * ind.atr[i] : null,
      }
    }
  }
  return { trades, maxDrawdown: maxDD, open: pos }
}

export function tradeStats(trades) {
  if (!trades.length) return { count: 0, winRate: null, avgWin: null, avgLoss: null, expectancy: null, profitFactor: null, totalReturn: 0, medianHold: null }
  const wins = trades.filter(t => t.ret > 0), losses = trades.filter(t => t.ret <= 0)
  const gw = wins.reduce((s, t) => s + t.ret, 0), gl = -losses.reduce((s, t) => s + t.ret, 0)
  const holds = trades.map(t => t.days).sort((a, b) => a - b)
  return {
    count: trades.length,
    winRate: wins.length / trades.length,
    avgWin: wins.length ? gw / wins.length : null,
    avgLoss: losses.length ? -gl / losses.length : null,
    expectancy: (gw - gl) / trades.length,
    profitFactor: gl ? gw / gl : (wins.length ? Infinity : null),
    totalReturn: trades.reduce((e, t) => e * (1 + t.ret), 1) - 1,
    medianHold: holds[Math.floor(holds.length / 2)],
  }
}

// Walk-forward check: the first 60% of the history is "seen", the last 40%
// is "unseen". A strategy is proven on an asset only if it made money in both
// parts, with enough trades for the result to mean something.
function evaluate(candles, ind, strategy, state, opts) {
  const sim = simulate(candles, ind, strategy, state, opts)
  const begin = Math.min(Math.max(opts.start, 60), candles.length - 2)
  const split = begin + Math.floor((candles.length - begin) * 0.6)
  const is = tradeStats(sim.trades.filter(t => t.entryIdx < split))
  const oos = tradeStats(sim.trades.filter(t => t.entryIdx >= split))
  const overall = tradeStats(sim.trades)
  const proven = overall.count >= 8 && is.count >= 3 && oos.count >= 3 &&
    is.expectancy > 0 && oos.expectancy > 0 && overall.profitFactor > 1.15
  return { key: strategy.key, name: strategy.name, blurb: strategy.blurb, trades: sim.trades, maxDrawdown: sim.maxDrawdown, overall, is, oos, proven, splitT: candles[split]?.t }
}

// Inverse-free normal CDF approximation (Abramowitz-Stegun).
function normCdf(x) {
  const t = 1 / (1 + 0.2316419 * Math.abs(x))
  const d = 0.3989423 * Math.exp(-x * x / 2)
  const p = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))))
  return x > 0 ? 1 - p : p
}

// ---- Full analysis ---------------------------------------------------------------
// opts: { news, bench (benchmarkContext), mood (legacy Map), benchmarkName, kind,
//         livePrice, isBenchmark, earningsDate (ms) }
export function analyze(rawCandles, opts = {}) {
  const candles = rawCandles.slice()
  if (opts.livePrice && candles.length) {
    const last = { ...candles[candles.length - 1] }
    last.c = opts.livePrice
    last.h = Math.max(last.h, opts.livePrice)
    last.l = Math.min(last.l, opts.livePrice)
    candles[candles.length - 1] = last
  }
  const n = candles.length
  if (n < 60) return null
  const kind = opts.kind || 'stock'
  const ind = computeIndicators(candles, kind)
  const fee = kind === 'crypto' ? 0.004 : 0.0005
  const bench = opts.bench || (opts.mood ? { mood: opts.mood, close: null, volRatio: null } : null)

  // Historical scores (all technical factors + market; there's no news archive).
  // Strategy backtests always use the standard weights, so self-tuning can't
  // leak into the "proven" test. Recent factor values are kept for the
  // self-check and for tuning.
  const weights = opts.weights || WEIGHTS
  const moods = candles.map(c => lookup(bench?.mood, c.t))
  const fvecs = new Array(n).fill(null)
  const scores = candles.map((c, i) => {
    if (i < 50) return null
    const r = scoreBar(ind, i, { mood: moods[i], rel: relativeAt(ind, candles, i, bench), isBenchmark: opts.isBenchmark })
    if (i >= n - CALIB_SPAN) fvecs[i] = Object.fromEntries(r.factors.map(f => [f.key, f.score]))
    return r.score
  })
  const liveScore = i => (fvecs[i] ? combine(fvecs[i], weights) : scores[i])
  const state = { ind, scores, moods }
  const start = n > 320 ? 200 : 60
  const strategies = {
    trend: evaluate(candles, ind, STRATEGIES.trend, state, { fee, start }),
    pullback: evaluate(candles, ind, STRATEGIES.pullback, state, { fee, start }),
  }

  // Signal accuracy (composite score) vs. the base rate.
  const begin = Math.min(start, n - 2)
  let buyN = 0, buyHit = 0, sellN = 0, sellHit = 0, baseN = 0, baseUp = 0
  const fwd = { buy: [], hold: [], sell: [] }
  for (let i = begin; i < n - HORIZON; i++) {
    if (scores[i] == null) continue
    const ch = Math.log(candles[i + HORIZON].c / candles[i].c)
    baseN++
    if (ch > 0) baseUp++
    const act = actionFor(scores[i])
    if (isBuy(act)) { buyN++; if (ch > 0) buyHit++; fwd.buy.push(ch) }
    else if (isSell(act)) { sellN++; if (ch < 0) sellHit++; fwd.sell.push(ch) }
    else fwd.hold.push(ch)
  }
  const mean = arr => (arr.length ? arr.reduce((s, x) => s + x, 0) / arr.length : 0)
  const accuracy = {
    horizon: HORIZON,
    buy: buyN ? buyHit / buyN : null, buyN,
    sell: sellN ? sellHit / sellN : null, sellN,
    baseUp: baseN ? baseUp / baseN : null, baseN,
  }

  // Today
  const i = n - 1
  const t = candles[i].t
  const mood = moods[i]
  const rel = relativeAt(ind, candles, i, bench)
  const { score, factors } = scoreBar(ind, i, { news: opts.news, mood, rel, benchmarkName: opts.benchmarkName, isBenchmark: opts.isBenchmark, weights })
  const price = candles[i].c
  const a = ind.atr[i] || price * 0.02
  const dailyVol = ind.vol60[i] || ind.vol20[i] || 0.02

  // Which setup is live today? Prefer a proven one; then the better track record.
  const live = []
  if (isBuy(actionFor(score))) live.push(strategies.trend)
  if (STRATEGIES.pullback.entry(state, i) && score > THRESHOLDS.strongSell) {
    // A dip-buy only overrides a weak composite score if it has worked on this asset.
    if (strategies.pullback.proven || score >= 0) live.push(strategies.pullback)
  }
  live.sort((x, y) => (y.proven - x.proven) || ((y.overall.expectancy ?? -1) - (x.overall.expectancy ?? -1)))
  const chosen = live[0] || null

  let action = actionFor(score)
  if (chosen && !isBuy(action)) action = 'buy'
  const strat = chosen ? STRATEGIES[chosen.key] : STRATEGIES.trend
  const stats = chosen || strategies.trend

  // Hold period: how long this setup's past trades on this asset lasted.
  let holdDays = stats.overall.count >= 5 && stats.overall.medianHold
    ? Math.max(2, Math.min(strat.maxHold, stats.overall.medianHold))
    : chosen?.key === 'pullback' ? 5 : 7

  // Entry, stop, target
  let entry = price, stretched = false
  if (chosen?.key !== 'pullback' && isBuy(action)) {
    const hot = (ind.rsi[i] ?? 50) > 70 || (ind.bb.pctB[i] ?? 0.5) > 0.95
    const dip = ind.sma20[i] && ind.sma20[i] < price ? Math.max(ind.sma20[i], price - 1.5 * a) : null
    if (hot && dip) { entry = dip; stretched = true }
  }
  const stop = Math.max(entry - strat.stopAtr * a, entry * 0.5)
  const target = strat.targetAtr
    ? entry + strat.targetAtr * a
    : Math.max(ind.sma5[i] ?? 0, entry + 0.75 * a)
  const exitRule = chosen?.key === 'pullback'
    ? 'Sell on the first day it closes above its 5-day average (around the target), at the stop, or after 10 days.'
    : 'Sell at the target, at the stop, if the signal turns to Sell, or on the sell-by date.'

  // Earnings guard (stocks): don't hold through an earnings report.
  let earnings = null
  if (opts.earningsDate && opts.earningsDate > Date.now() - DAY) {
    const daysAway = Math.ceil((opts.earningsDate - Date.now()) / DAY)
    const holdCalendar = Math.ceil(holdDays * (kind === 'crypto' ? 1 : 1.45))
    earnings = { date: opts.earningsDate, daysAway, beforeExit: daysAway <= holdCalendar + 1 }
    if (earnings.beforeExit && isBuy(action)) holdDays = Math.max(1, Math.floor((daysAway - 1) / (kind === 'crypto' ? 1 : 1.45)))
  }

  // Stormy market: halve the risk when the benchmark's volatility is way above normal.
  const volRatio = lookup(bench?.volRatio, t)
  const riskScale = volRatio && volRatio > 1.6 ? 0.5 : 1

  // Probability range for the hold period. Drift comes from this setup's past
  // trades (or similar past scores), halved so it can't overpromise.
  const bucket = isBuy(action) ? 'buy' : isSell(action) ? 'sell' : 'hold'
  let driftPerDay = 0
  if (chosen && chosen.overall.count >= 8 && chosen.overall.medianHold) driftPerDay = 0.5 * Math.log(1 + chosen.overall.expectancy) / chosen.overall.medianHold
  else if (fwd[bucket].length >= 15) driftPerDay = 0.5 * mean(fwd[bucket]) / HORIZON
  const h = holdDays
  const mu = driftPerDay * h
  const sd = dailyVol * Math.sqrt(h)
  const forecast = {
    days: h,
    expected: price * Math.exp(mu),
    low68: price * Math.exp(mu - sd), high68: price * Math.exp(mu + sd),
    low95: price * Math.exp(mu - 1.96 * sd), high95: price * Math.exp(mu + 1.96 * sd),
    probUp: normCdf(mu / sd),
  }

  // Self-check: what would the app have said on each recent day (using only
  // data up to that day), and what happened next?
  const volNorm = k => (ind.vol60[k] || ind.vol20[k] || 0.02) * Math.sqrt(HORIZON)
  const calls = []
  for (let k = Math.max(50, n - 21); k < n - 1; k++) {
    const a = actionFor(liveScore(k))
    const ret = price / candles[k].c - 1
    calls.push({ t: candles[k].t, daysAgo: n - 1 - k, action: a, priceThen: candles[k].c, ret, right: isBuy(a) ? ret > 0 : isSell(a) ? ret < 0 : null })
  }
  const windowStats = w => callStats(
    Array.from({ length: w }, (_, j) => n - 1 - HORIZON - j).filter(k => k >= 50 && fvecs[k] != null)
      .map(k => ({ k, r: Math.log(candles[k + HORIZON].c / candles[k].c) })),
    row => liveScore(row.k),
  )
  const recent = { calls, w20: windowStats(20), w60: windowStats(60) }
  const w60 = recent.w60
  const coldStreak = w60.buyN >= 10 && w60.buyHit != null && w60.baseUp != null && w60.buyHit < w60.baseUp - 0.05
  recent.coldStreak = coldStreak

  // Rows for cross-asset self-tuning (vol-normalized 5-day outcomes).
  const calibRows = []
  for (let k = Math.max(50, n - CALIB_SPAN); k < n; k++) {
    if (!fvecs[k]) continue
    const fromEnd = n - 1 - k
    let seg = null
    if (fromEnd >= HORIZON && fromEnd < HORIZON + VALID_BARS) seg = 'valid'
    else if (fromEnd >= 2 * HORIZON + VALID_BARS && fromEnd < 2 * HORIZON + VALID_BARS + TRAIN_BARS) seg = 'train'
    if (!seg) continue
    calibRows.push({ seg, f: fvecs[k], r: Math.log(candles[k + HORIZON].c / candles[k].c) / volNorm(k) })
  }

  // Confidence & top pick
  const acc = bucket === 'sell' ? accuracy.sell : accuracy.buy
  const accN = bucket === 'sell' ? accuracy.sellN : accuracy.buyN
  const base = bucket === 'sell' ? 1 - (accuracy.baseUp ?? 0.5) : accuracy.baseUp ?? 0.5
  const edge = acc != null && accN >= 15 ? acc - base : null
  const agreeing = factors.filter(f => Math.sign(f.score) === Math.sign(score || 1) && Math.abs(f.score) > 0.1).length
  const marketOk = mood == null || mood >= 0 || opts.isBenchmark
  let confidence = 'low'
  if (isBuy(action) && chosen) {
    const strongRecord = chosen.proven && (chosen.oos.winRate ?? 0) >= 0.5
    if (strongRecord && marketOk && (chosen.key === 'pullback' || agreeing >= 5) && !earnings?.beforeExit) confidence = 'high'
    else if (chosen.proven || (Math.abs(score) >= 0.25 && (edge == null || edge >= 0))) confidence = 'medium'
  } else if (isSell(action)) {
    if (Math.abs(score) >= 0.4 && edge != null && edge >= 0.03 && agreeing >= 5) confidence = 'high'
    else if (Math.abs(score) >= 0.25) confidence = 'medium'
  }
  // The app has been wrong on this asset more often than chance lately: trust it less.
  if (coldStreak && isBuy(action)) confidence = confidence === 'high' ? 'medium' : 'low'
  const topPick = isBuy(action) && !!chosen?.proven && marketOk && !earnings?.beforeExit && confidence !== 'low' && !coldStreak
  const strength = Math.round(Math.min(1, Math.abs(score) / 0.7) * 100)

  const shown = chosen || strategies.trend
  const backtest = {
    ...shown.overall,
    tradeCount: shown.overall.count,
    trades: shown.trades,
    maxDrawdown: shown.maxDrawdown,
    buyHoldReturn: candles[begin] ? candles[n - 1].c / (candles[begin].o || candles[begin].c) - 1 : null,
    periodDays: Math.round((candles[n - 1].t - candles[begin].t) / DAY),
    accuracy,
  }

  return {
    price, score, action, factors, confidence, strength, edge, topPick, recent, calibRows, weights,
    strategy: chosen?.key || null, strategies, riskScale, volRatio, earnings,
    plan: { entry, stretched, stop, target, holdDays, atr: a, riskPerUnit: entry - stop, exitRule, strategy: chosen?.key || 'trend' },
    forecast, backtest, indicators: ind, candles, scores, dailyVol, fee, mood,
  }
}

// Position sizing: risk a fixed % of the account between entry and stop,
// never more than maxPct of the account in one position.
export function positionSize({ account, riskPct, entry, stop, maxPct = 0.25 }) {
  const riskDollars = account * riskPct
  const perUnit = entry - stop
  if (!(perUnit > 0) || !(entry > 0)) return null
  let units = riskDollars / perUnit
  let dollars = units * entry
  let capped = false
  if (dollars > account * maxPct) {
    dollars = account * maxPct
    units = dollars / entry
    capped = true
  }
  return { units, dollars, riskDollars: units * perUnit, capped }
}
