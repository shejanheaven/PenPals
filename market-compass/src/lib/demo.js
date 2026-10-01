// Made-up data for "demo mode": lets you explore the app offline. It is NOT
// real and is labeled everywhere it appears. Real data is the default.

import { kindOf } from './universe.js'
import { annotate } from './sentiment.js'

function hash(str) {
  let h = 2166136261
  for (let i = 0; i < str.length; i++) h = Math.imul(h ^ str.charCodeAt(i), 16777619)
  return h >>> 0
}

function rng(seed) {
  let a = seed
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function gauss(rand) {
  return Math.sqrt(-2 * Math.log(rand() || 1e-9)) * Math.cos(2 * Math.PI * rand())
}

export function demoHistory(symbol, days = 1827) {
  const rand = rng(hash(symbol))
  const crypto = kindOf(symbol) === 'crypto'
  const vol = (crypto ? 0.035 : 0.017) * (0.7 + rand() * 0.6)
  let price = (crypto ? 5 + rand() * 900 : 20 + rand() * 400)
  const candles = []
  const day = 86400000
  const end = new Date()
  end.setUTCHours(crypto ? 0 : 14, crypto ? 0 : 30, 0, 0)
  let drift = 0
  const step = crypto ? 1 : 1
  for (let d = days; d >= 0; d -= step) {
    const t = end.getTime() - d * day
    const wd = new Date(t).getUTCDay()
    if (!crypto && (wd === 0 || wd === 6)) continue
    if (rand() < 0.02) drift = (rand() - 0.45) * vol * 0.2 // regime change
    const r = drift + vol * gauss(rand)
    const o = price * (1 + vol * 0.2 * gauss(rand))
    const c = Math.max(0.01, o * Math.exp(r))
    const h = Math.max(o, c) * (1 + Math.abs(gauss(rand)) * vol * 0.4)
    const l = Math.min(o, c) * (1 - Math.abs(gauss(rand)) * vol * 0.4)
    const v = Math.round((crypto ? 2e7 : 4e7) * (0.5 + rand()) * (1 + Math.abs(r) / vol / 3))
    candles.push({ t, o, h, l, c, v })
    price = c
  }
  const last = candles[candles.length - 1]
  return { symbol, name: symbol, currency: 'USD', exchange: 'DEMO', price: last.c, previousClose: candles[candles.length - 2].c, time: last.t, candles, source: 'Demo data (not real)', demo: true }
}

export function demoIntraday(symbol) {
  const daily = demoHistory(symbol)
  const rand = rng(hash(symbol + 'intra'))
  const last = daily.candles[daily.candles.length - 1]
  const n = 78
  const candles = []
  let p = last.o
  const start = Date.now() - n * 300000
  for (let i = 0; i < n; i++) {
    const o = p
    const c = o * Math.exp((Math.log(last.c / last.o) / n) + 0.002 * gauss(rand))
    candles.push({ t: start + i * 300000, o, h: Math.max(o, c) * 1.001, l: Math.min(o, c) * 0.999, c, v: 1e5 * (0.5 + rand()) })
    p = c
  }
  return { ...daily, candles, price: p }
}

export function demoQuote(symbol, jitter = 0) {
  const h = demoHistory(symbol)
  const closes = h.candles.slice(-40).map(c => c.c)
  const price = h.price * (1 + jitter)
  return { symbol, name: symbol, price, previousClose: h.previousClose, change: price - h.previousClose, changePct: price / h.previousClose - 1, time: Date.now(), spark: closes, source: 'Demo', demo: true }
}

const DEMO_HEADLINES = [
  '[DEMO] {name} beats estimates as revenue jumps on strong demand',
  '[DEMO] Analysts upgrade {name}, raise price target',
  '[DEMO] {name} faces regulatory probe over business practices',
  '[DEMO] Fed holds interest rates steady, signals patience on cuts',
  '[DEMO] {name} shares slide after cautious outlook',
  '[DEMO] Markets rally as inflation cools more than expected',
]

export function demoNews(name = 'The market') {
  const rand = rng(hash(name))
  return {
    items: DEMO_HEADLINES.map((t, i) => annotate({
      title: t.replace('{name}', name), link: '#', source: 'Demo', time: Date.now() - (i * 9 + rand() * 6) * 3600000, summary: 'Made-up headline for demo mode.',
    })),
    sources: [{ source: 'Demo', ok: true }],
    fetchedAt: Date.now(),
  }
}
