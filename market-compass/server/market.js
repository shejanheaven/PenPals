// Real market data, no API keys needed. Each asset type has a chain of free
// sources, tried in order until one answers:
//   stocks:  Yahoo Finance (query1, query2) -> Stooq (daily only) -> Finnhub (quotes, if FINNHUB_KEY)
//   crypto:  Yahoo Finance -> Coinbase Exchange -> Kraken

import { fetchWithTimeout } from './http.js'

export const isCrypto = symbol => /-USD$/.test(symbol)

// Collapse duplicate bars for the same day (Yahoo sometimes appends the live
// bar next to today's daily bar) and drop bars without a close.
export function normalizeCandles(candles, intraday = false) {
  const out = []
  for (const c of candles) {
    if (!(c.c > 0)) continue
    const bar = {
      t: c.t,
      o: c.o > 0 ? c.o : c.c,
      h: Math.max(c.h || 0, c.o || 0, c.c),
      l: Math.min(c.l > 0 ? c.l : c.c, c.o > 0 ? c.o : c.c, c.c),
      c: c.c,
      v: c.v > 0 ? c.v : 0,
    }
    const prev = out[out.length - 1]
    if (prev && !intraday && new Date(prev.t).toISOString().slice(0, 10) === new Date(bar.t).toISOString().slice(0, 10)) {
      out[out.length - 1] = { ...bar, t: prev.t, o: prev.o, h: Math.max(prev.h, bar.h), l: Math.min(prev.l, bar.l), v: Math.max(prev.v, bar.v) }
    } else if (!prev || bar.t > prev.t) {
      out.push(bar)
    }
  }
  return out
}

// ---- Yahoo Finance --------------------------------------------------------

export function parseYahooChart(result, intraday = false) {
  const ts = result.timestamp || []
  const q = result.indicators?.quote?.[0] || {}
  const raw = ts.map((t, i) => ({
    t: t * 1000, o: q.open?.[i], h: q.high?.[i], l: q.low?.[i], c: q.close?.[i], v: q.volume?.[i],
  }))
  const candles = normalizeCandles(raw, intraday)
  const m = result.meta || {}
  const last = candles[candles.length - 1]
  return {
    symbol: m.symbol,
    name: m.longName || m.shortName || m.symbol,
    currency: m.currency || 'USD',
    exchange: m.fullExchangeName || m.exchangeName || '',
    price: m.regularMarketPrice ?? last?.c ?? null,
    previousClose: intraday ? (m.chartPreviousClose ?? m.previousClose ?? null) : (m.previousClose ?? null),
    dayHigh: m.regularMarketDayHigh ?? null,
    dayLow: m.regularMarketDayLow ?? null,
    time: m.regularMarketTime ? m.regularMarketTime * 1000 : last?.t ?? null,
    candles,
    source: 'Yahoo Finance',
  }
}

async function yahoo(symbol, range, interval) {
  const intraday = /m$|h$/.test(interval)
  let lastErr
  for (const host of ['query1', 'query2']) {
    const url = `https://${host}.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}` +
      `?range=${range}&interval=${interval}&includePrePost=false&events=div%2Csplit`
    try {
      const res = await fetchWithTimeout(url, { headers: { Accept: 'application/json' } })
      if (res.status === 404) throw Object.assign(new Error(`Unknown symbol ${symbol}`), { notFound: true })
      if (!res.ok) { lastErr = new Error(`Yahoo ${res.status}`); continue }
      const body = await res.json()
      const result = body?.chart?.result?.[0]
      if (!result) {
        const msg = body?.chart?.error?.description || 'no data'
        if (/No data found|delisted/i.test(msg)) throw Object.assign(new Error(`Unknown symbol ${symbol}`), { notFound: true })
        lastErr = new Error(`Yahoo: ${msg}`)
        continue
      }
      const parsed = parseYahooChart(result, intraday)
      if (parsed.candles.length) return parsed
      lastErr = new Error('Yahoo returned no candles')
    } catch (e) {
      if (e.notFound) throw e
      lastErr = e
    }
  }
  throw lastErr
}

// ---- Coinbase Exchange (crypto) -------------------------------------------

export function parseCoinbaseCandles(rows) {
  // [time, low, high, open, close, volume], newest first
  return rows.map(r => ({ t: r[0] * 1000, l: +r[1], h: +r[2], o: +r[3], c: +r[4], v: +r[5] })).sort((a, b) => a.t - b.t)
}

async function coinbase(symbol, days, granularity) {
  const pages = Math.min(Math.ceil(days * 86400 / granularity / 300), 6)
  let all = []
  let end = Date.now()
  for (let p = 0; p < pages; p++) {
    const start = end - 300 * granularity * 1000
    const url = `https://api.exchange.coinbase.com/products/${symbol}/candles?granularity=${granularity}` +
      `&start=${new Date(start).toISOString()}&end=${new Date(end).toISOString()}`
    const res = await fetchWithTimeout(url, { headers: { Accept: 'application/json' } })
    if (!res.ok) { if (p === 0) throw new Error(`Coinbase ${res.status}`); break }
    const rows = await res.json()
    if (!Array.isArray(rows) || !rows.length) break
    all = parseCoinbaseCandles(rows).concat(all)
    end = start
  }
  const candles = normalizeCandles(all, granularity < 86400)
  if (!candles.length) throw new Error('Coinbase returned no candles')
  const last = candles[candles.length - 1]
  return { symbol, name: symbol, currency: 'USD', exchange: 'Coinbase', price: last.c, previousClose: null, time: last.t, candles, source: 'Coinbase' }
}

// ---- Kraken (crypto) ------------------------------------------------------

const KRAKEN_BASE = { BTC: 'XBT', DOGE: 'XDG' }
export const krakenPair = symbol => {
  const base = symbol.replace(/-USD$/, '')
  return `${KRAKEN_BASE[base] || base}USD`
}

export function parseKrakenOhlc(body) {
  const key = Object.keys(body?.result || {}).find(k => k !== 'last')
  const rows = key ? body.result[key] : []
  // [time, open, high, low, close, vwap, volume, count]
  return rows.map(r => ({ t: r[0] * 1000, o: +r[1], h: +r[2], l: +r[3], c: +r[4], v: +r[6] }))
}

async function kraken(symbol, minutes) {
  const url = `https://api.kraken.com/0/public/OHLC?pair=${krakenPair(symbol)}&interval=${minutes}`
  const res = await fetchWithTimeout(url, { headers: { Accept: 'application/json' } })
  if (!res.ok) throw new Error(`Kraken ${res.status}`)
  const body = await res.json()
  if (body.error?.length) throw new Error(`Kraken: ${body.error.join(', ')}`)
  const candles = normalizeCandles(parseKrakenOhlc(body), minutes < 1440)
  if (!candles.length) throw new Error('Kraken returned no candles')
  const last = candles[candles.length - 1]
  return { symbol, name: symbol, currency: 'USD', exchange: 'Kraken', price: last.c, previousClose: null, time: last.t, candles, source: 'Kraken' }
}

// ---- Stooq (stocks, daily) ------------------------------------------------

export function parseStooqCsv(csv) {
  const lines = csv.trim().split(/\r?\n/)
  if (!/^Date,Open,High,Low,Close/i.test(lines[0] || '')) return []
  return lines.slice(1).map(line => {
    const [d, o, h, l, c, v] = line.split(',')
    return { t: Date.parse(`${d}T20:00:00Z`), o: +o, h: +h, l: +l, c: +c, v: +(v || 0) }
  }).filter(c => c.t && c.c > 0)
}

async function stooq(symbol, days) {
  const s = symbol.toLowerCase().replace(/\./g, '-')
  const res = await fetchWithTimeout(`https://stooq.com/q/d/l/?s=${s}.us&i=d`)
  if (!res.ok) throw new Error(`Stooq ${res.status}`)
  const all = parseStooqCsv(await res.text())
  const candles = normalizeCandles(all.filter(c => c.t > Date.now() - days * 86400000))
  if (!candles.length) throw new Error('Stooq returned no data')
  const last = candles[candles.length - 1]
  return { symbol, name: symbol, currency: 'USD', exchange: '', price: last.c, previousClose: null, time: last.t, candles, source: 'Stooq' }
}

// ---- Public API -----------------------------------------------------------

const RANGE_DAYS = { '1d': 1, '5d': 5, '1mo': 31, '3mo': 92, '6mo': 183, '1y': 366, '2y': 731, '5y': 1827 }

export async function getHistory(symbol, range = '5y', interval = '1d') {
  const days = RANGE_DAYS[range] || 731
  const intraday = interval !== '1d'
  const minutes = intraday ? parseInt(interval, 10) || 5 : 1440
  const attempts = [() => yahoo(symbol, range, interval)]
  if (isCrypto(symbol)) {
    attempts.push(() => coinbase(symbol, days, intraday ? Math.max(300, minutes * 60) : 86400))
    attempts.push(() => kraken(symbol, intraday ? Math.max(5, minutes) : 1440))
  } else if (!intraday) {
    attempts.push(() => stooq(symbol, days))
  }
  const errors = []
  for (const attempt of attempts) {
    try {
      const data = await attempt()
      if (intraday) {
        // Keep only the latest session/day of intraday bars.
        const cutoff = data.candles[data.candles.length - 1].t - (isCrypto(symbol) ? 86400000 : 16 * 3600000)
        data.candles = data.candles.filter(c => c.t > cutoff)
      }
      return data
    } catch (e) {
      if (e.notFound) throw e
      errors.push(e.message)
    }
  }
  throw new Error(`All data sources failed for ${symbol}: ${errors.join(' | ')}`)
}

// Latest price + today's change. Uses intraday bars so the change is vs.
// yesterday's close, and returns a small intraday sparkline.
export async function getQuote(symbol) {
  try {
    const d = await yahoo(symbol, '1d', '5m')
    const closes = d.candles.map(c => c.c)
    return {
      symbol, name: d.name, price: d.price, previousClose: d.previousClose,
      change: d.previousClose ? d.price - d.previousClose : null,
      changePct: d.previousClose ? d.price / d.previousClose - 1 : null,
      time: d.time, spark: downsample(closes, 40), source: d.source,
    }
  } catch (e) {
    if (e.notFound) throw e
    if (isCrypto(symbol)) return coinbaseQuote(symbol)
    if (process.env.FINNHUB_KEY) return finnhubQuote(symbol)
    throw e
  }
}

async function coinbaseQuote(symbol) {
  const res = await fetchWithTimeout(`https://api.exchange.coinbase.com/products/${symbol}/stats`, { headers: { Accept: 'application/json' } })
  if (!res.ok) throw new Error(`Coinbase ${res.status}`)
  const s = await res.json()
  const price = +s.last, open = +s.open
  return { symbol, name: symbol, price, previousClose: open, change: price - open, changePct: price / open - 1, time: Date.now(), spark: [], source: 'Coinbase (24h)' }
}

async function finnhubQuote(symbol) {
  const res = await fetchWithTimeout(`https://finnhub.io/api/v1/quote?symbol=${encodeURIComponent(symbol)}&token=${process.env.FINNHUB_KEY}`)
  if (!res.ok) throw new Error(`Finnhub ${res.status}`)
  const q = await res.json()
  if (!q.c) throw new Error('Finnhub: no quote')
  return { symbol, name: symbol, price: q.c, previousClose: q.pc, change: q.d, changePct: q.dp / 100, time: q.t * 1000, spark: [], source: 'Finnhub' }
}

export function downsample(arr, n) {
  if (arr.length <= n) return arr
  const step = (arr.length - 1) / (n - 1)
  return Array.from({ length: n }, (_, i) => arr[Math.round(i * step)])
}
