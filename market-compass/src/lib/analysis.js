// Glue between the data layer and the signal engine, plus the shared
// "scan everything" job used by the Today and Ideas pages.

import { useEffect, useState, useSyncExternalStore } from 'react'
import { fetchEarnings, fetchHistory, fetchNews } from './data.js'
import { analyze, benchmarkContext, calibrateWeights } from './signals.js'
import { newsScore } from './sentiment.js'
import { BENCHMARK, BENCHMARK_NAME, infoFor, kindOf, UNIVERSE } from './universe.js'
import { getState } from './store.js'

const moodCache = new Map()
async function moodFor(kind) {
  const bench = BENCHMARK[kind]
  const hit = moodCache.get(bench)
  if (hit && hit.expires > Date.now()) return hit.value
  const value = fetchHistory(bench).then(h => benchmarkContext(h.candles)).catch(() => null)
  moodCache.set(bench, { value, expires: Date.now() + 600000 })
  return value
}

export async function loadAsset(symbol) {
  const kind = kindOf(symbol)
  const info = infoFor(symbol)
  const [history, bench, news, earnings] = await Promise.all([
    fetchHistory(symbol),
    moodFor(kind),
    fetchNews({ symbol, name: info.name !== symbol ? info.name : '', kind }).catch(() => null),
    fetchEarnings(symbol).catch(() => null),
  ])
  const name = info.name !== symbol ? info.name : history.name || symbol
  return { symbol, kind, name, info, history, bench, news, earnings }
}

// ---- Self-tuning state (per asset class), saved so it applies on next visit --

const CAL_KEY = 'mc.calibration.v1'
function loadCalibration() {
  try {
    const c = JSON.parse(localStorage.getItem(CAL_KEY))
    if (c && Date.now() - c.at < 3 * 86400000) return c.byKind || {}
  } catch {}
  return {}
}
let calibration = loadCalibration()
export const getCalibration = kind => calibration[kind] || null
const weightsFor = kind => (calibration[kind]?.used ? calibration[kind].weights : undefined)

export function runAnalysis(asset, livePrice) {
  if (!asset) return null
  // Ignore a live tick that disagrees wildly with the history (bad tick,
  // different data source mid-split, etc.): it would corrupt every level.
  const lastClose = asset.history.candles.at(-1)?.c
  if (livePrice && lastClose && Math.abs(Math.log(livePrice / lastClose)) > 0.25) livePrice = undefined
  return analyze(asset.history.candles, {
    news: asset.news ? newsScore(asset.news.items) : null,
    bench: asset.bench,
    benchmarkName: BENCHMARK_NAME[asset.kind],
    kind: asset.kind,
    isBenchmark: BENCHMARK[asset.kind] === asset.symbol,
    earningsDate: asset.earnings?.date || null,
    weights: weightsFor(asset.kind),
    livePrice,
  })
}

export function useAsset(symbol) {
  const [state, setState] = useState({ loading: true, error: null, asset: null })
  useEffect(() => {
    let alive = true
    setState(s => ({ loading: true, error: null, asset: s.asset?.symbol === symbol ? s.asset : null }))
    loadAsset(symbol)
      .then(asset => alive && setState({ loading: false, error: null, asset }))
      .catch(e => alive && setState({ loading: false, error: e.message, asset: null }))
    return () => { alive = false }
  }, [symbol])
  return state
}

// ---- Scan -------------------------------------------------------------------

let scan = { status: 'idle', phase: '', results: {}, errors: {}, done: 0, total: 0, finishedAt: 0, calibration }
const scanListeners = new Set()
const setScan = patch => { scan = { ...scan, ...patch }; scanListeners.forEach(l => l()) }

export async function runScan(force = false) {
  if (scan.status === 'running') return
  if (!force && scan.finishedAt && Date.now() - scan.finishedAt < 10 * 60000) return
  const symbols = [...new Set([...UNIVERSE.map(a => a.symbol), ...getState().watchlist])]
  setScan({ status: 'running', phase: 'Analyzing', done: 0, total: symbols.length, errors: {} })
  let next = 0
  const results = { ...scan.results }
  const errors = {}
  const assets = new Map()
  const rows = { stock: [], crypto: [] }
  async function worker() {
    while (next < symbols.length) {
      const symbol = symbols[next++]
      try {
        const asset = await loadAsset(symbol)
        const r = runAnalysis(asset)
        if (r) {
          results[symbol] = summarize(asset, r)
          assets.set(symbol, asset)
          rows[asset.kind].push(...r.calibRows)
        }
      } catch (e) {
        errors[symbol] = e.message
      }
      setScan({ done: scan.done + 1, results: { ...results }, errors: { ...errors } })
    }
  }
  await Promise.all(Array.from({ length: 4 }, worker))

  // Self-tune each asset class on the pooled history, check it on the last
  // ~2 months it never trained on, and re-score with it only if it won there.
  setScan({ phase: 'Self-checking' })
  const prevWeights = { stock: weightsFor('stock'), crypto: weightsFor('crypto') }
  for (const kind of ['stock', 'crypto']) {
    if (rows[kind].length) calibration = { ...calibration, [kind]: { ...calibrateWeights(rows[kind]), at: Date.now(), assets: [...assets.values()].filter(a => a.kind === kind).length } }
  }
  try { localStorage.setItem(CAL_KEY, JSON.stringify({ at: Date.now(), byKind: calibration })) } catch {}
  for (const [symbol, asset] of assets) {
    if (JSON.stringify(weightsFor(asset.kind)) === JSON.stringify(prevWeights[asset.kind])) continue
    const r = runAnalysis(asset)
    if (r) results[symbol] = summarize(asset, r)
  }
  setScan({ status: 'done', phase: '', finishedAt: Date.now(), results: { ...results }, calibration })
}

// The scan keeps only what the lists need (not 5 years of candles).
function summarize(asset, r) {
  // One-line reason: the trend in a word, plus the strongest other factor
  // pointing the same way as the signal.
  const trend = r.factors.find(f => f.key === 'trend')
  const trendWord = trend ? trend.text.split(':')[0] : ''
  const dir = Math.sign(r.score) || 1
  const other = r.factors
    .filter(f => !['trend', 'market'].includes(f.key) && Math.sign(f.score) === dir)
    .sort((a, b) => Math.abs(b.score * b.weight) - Math.abs(a.score * a.weight))[0]
  const top = { text: r.strategy === 'pullback'
    ? `${trendWord} · Sharp 1–3 day drop while still above its 200-day average: a classic dip-buy.`
    : [trendWord, other?.text].filter(Boolean).join(' · ') }
  const prev = r.candles[r.candles.length - 2]?.c
  return {
    symbol: asset.symbol, name: asset.name, kind: asset.kind,
    price: r.price, changePct: prev ? r.price / prev - 1 : null,
    score: r.score, action: r.action, confidence: r.confidence, strength: r.strength, edge: r.edge,
    topPick: r.topPick, strategy: r.strategy, proven: !!(r.strategy && r.strategies[r.strategy].proven),
    earnings: r.earnings, riskScale: r.riskScale, mood: r.mood,
    above50: r.indicators.sma50.at(-1) != null && r.price > r.indicators.sma50.at(-1),
    oosWinRate: r.strategy ? r.strategies[r.strategy].oos.winRate : null,
    coldStreak: r.recent.coldStreak,
    w20: r.recent.w20, w60: r.recent.w60,
    call5: r.recent.calls.find(c => c.daysAgo === 5) || null,
    call20: r.recent.calls.find(c => c.daysAgo === 20) || null,
    holdDays: r.plan.holdDays, entry: r.plan.entry, stop: r.plan.stop, target: r.plan.target,
    probUp: r.forecast.probUp,
    winRate: r.backtest.winRate, trades: r.backtest.tradeCount,
    stratReturn: r.backtest.totalReturn, holdReturn: r.backtest.buyHoldReturn,
    reason: top?.text || '',
    spark: r.candles.slice(-60).map(c => c.c),
    newsCount: asset.news?.items?.length || 0,
  }
}

export function useScan({ auto = true } = {}) {
  const snap = useSyncExternalStore(cb => { scanListeners.add(cb); return () => scanListeners.delete(cb) }, () => scan)
  useEffect(() => { if (auto) runScan() }, [auto])
  return snap
}
