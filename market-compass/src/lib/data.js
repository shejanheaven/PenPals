// Browser-side data access: REST calls to our /api functions (cached), plus a
// live price hub that streams real-time ticks:
//   crypto: Coinbase WebSocket (fallback: Kraken WebSocket)
//   stocks: Finnhub WebSocket when a key is configured, otherwise /api/quotes every 15s

import { demoHistory, demoIntraday, demoNews, demoQuote } from './demo.js'
import { kindOf } from './universe.js'

export function isDemo() {
  try {
    if (new URLSearchParams(location.search).get('demo') === '1') return true
    return localStorage.getItem('mc.demo') === '1'
  } catch { return false }
}

export function setDemo(on) {
  try { localStorage.setItem('mc.demo', on ? '1' : '0') } catch {}
  const url = new URL(location.href)
  url.searchParams.delete('demo')
  location.replace(url.toString())
}

const mem = new Map()
const inflight = new Map()

async function getJSON(path, ttlMs) {
  const hit = mem.get(path)
  if (hit && hit.expires > Date.now()) return hit.data
  if (inflight.has(path)) return inflight.get(path)
  const p = (async () => {
    const res = await fetch(path)
    let body = null
    try { body = await res.json() } catch {}
    if (!res.ok) throw new Error(body?.error || `Request failed (${res.status})`)
    mem.set(path, { data: body, expires: Date.now() + ttlMs })
    return body
  })().finally(() => inflight.delete(path))
  inflight.set(path, p)
  return p
}

export function fetchHistory(symbol, { range = '5y', interval = '1d' } = {}) {
  if (isDemo()) return Promise.resolve(interval === '1d' ? demoHistory(symbol) : demoIntraday(symbol))
  const intraday = interval !== '1d'
  return getJSON(`/api/history?symbol=${encodeURIComponent(symbol)}&range=${range}&interval=${interval}`, intraday ? 30000 : 180000)
}

export function fetchNews(params) {
  if (isDemo()) return Promise.resolve(demoNews(params.name || 'The market'))
  const q = params.scope
    ? `scope=${params.scope}`
    : `symbol=${encodeURIComponent(params.symbol)}&name=${encodeURIComponent(params.name || '')}&kind=${params.kind || kindOf(params.symbol)}`
  return getJSON(`/api/news?${q}`, 300000)
}

export function fetchQuotes(symbols) {
  if (isDemo()) {
    const quotes = Object.fromEntries(symbols.map(s => [s, demoQuote(s, (Math.random() - 0.5) * 0.004)]))
    return Promise.resolve({ quotes, errors: {} })
  }
  return getJSON(`/api/quotes?symbols=${symbols.map(encodeURIComponent).join(',')}`, 8000)
}

export function fetchEarnings(symbol) {
  if (isDemo() || kindOf(symbol) === 'crypto') return Promise.resolve({ date: null })
  return getJSON(`/api/earnings?symbol=${encodeURIComponent(symbol)}`, 3600000)
}

let configPromise
export function fetchConfig() {
  if (!configPromise) configPromise = getJSON('/api/config', 600000).catch(() => ({ ai: false, finnhubKey: null }))
  return configPromise
}

export async function fetchBriefing(payload, accessCode) {
  const res = await fetch('/api/analyze', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(accessCode ? { 'x-access-code': accessCode } : {}) },
    body: JSON.stringify(payload),
  })
  const body = await res.json().catch(() => ({}))
  if (!res.ok) throw Object.assign(new Error(body.error || `Failed (${res.status})`), { status: res.status })
  return body
}

// ---------------------------------------------------------------------------
// Live price hub (one shared instance; components subscribe to symbols).

class LiveHub {
  constructor() {
    this.counts = new Map()
    this.listeners = new Set()
    this.quotes = {}
    this.status = { crypto: 'idle', stocks: 'idle', error: null }
    this.cb = null
    this.cbProducts = new Set()
    this.cbFailures = 0
    this.useKraken = false
    this.fh = null
    this.fhSymbols = new Set()
    this.pollTimer = null
    this.demoTimer = null
  }

  subscribe(symbols, listener) {
    for (const s of symbols) this.counts.set(s, (this.counts.get(s) || 0) + 1)
    this.listeners.add(listener)
    listener(this.quotes, this.status)
    this.sync()
    return () => {
      for (const s of symbols) {
        const c = (this.counts.get(s) || 1) - 1
        if (c <= 0) this.counts.delete(s); else this.counts.set(s, c)
      }
      this.listeners.delete(listener)
      this.sync()
    }
  }

  emit() {
    this.quotes = { ...this.quotes }
    for (const l of this.listeners) l(this.quotes, this.status)
  }

  update(symbol, patch) {
    const prev = this.quotes[symbol] || {}
    const q = { ...prev, ...patch }
    if (q.previousClose && q.price) {
      q.change = q.price - q.previousClose
      q.changePct = q.price / q.previousClose - 1
    }
    this.quotes[symbol] = q
  }

  symbols() { return [...this.counts.keys()] }

  sync() {
    clearTimeout(this.syncTimer)
    this.syncTimer = setTimeout(() => this._sync(), 50)
  }

  async _sync() {
    const all = this.symbols()
    if (isDemo()) {
      if (!this.demoTimer && all.length) {
        const tick = () => {
          for (const s of this.symbols()) {
            const base = this.quotes[s]?.price ?? demoQuote(s).price
            this.update(s, { ...demoQuote(s), price: base * (1 + (Math.random() - 0.5) * 0.002), live: true })
          }
          this.status = { crypto: 'demo', stocks: 'demo', error: null }
          this.emit()
        }
        tick()
        this.demoTimer = setInterval(tick, 2000)
      }
      return
    }
    const crypto = all.filter(s => kindOf(s) === 'crypto')
    const stocks = all.filter(s => kindOf(s) === 'stock')
    this.syncCrypto(crypto)
    const cfg = await fetchConfig()
    if (cfg.finnhubKey) this.syncFinnhub(stocks, cfg.finnhubKey)
    this.ensurePolling(all.length > 0)
  }

  // --- polling (prices for everything; previous close + sparkline) ---
  ensurePolling(on) {
    if (!on) { clearInterval(this.pollTimer); this.pollTimer = null; return }
    if (this.pollTimer) { this.poll(); return }
    this.poll()
    this.pollTimer = setInterval(() => this.poll(), 15000)
  }

  async poll() {
    const all = this.symbols()
    if (!all.length || document.hidden) return
    try {
      for (let i = 0; i < all.length; i += 40) {
        const { quotes, errors } = await fetchQuotes(all.slice(i, i + 40))
        for (const [s, q] of Object.entries(quotes)) {
          const streaming = this.quotes[s]?.streamedAt && Date.now() - this.quotes[s].streamedAt < 30000
          this.update(s, streaming ? { previousClose: q.previousClose, spark: q.spark, name: q.name } : { ...q, live: false })
        }
        for (const [s, e] of Object.entries(errors || {})) this.update(s, { error: e })
      }
      if (this.status.stocks !== 'streaming') this.status = { ...this.status, stocks: 'polling', error: null }
    } catch (e) {
      this.status = { ...this.status, error: e.message }
    }
    this.emit()
  }

  // --- Coinbase WebSocket (crypto ticks) ---
  syncCrypto(symbols) {
    const want = new Set(symbols)
    if (this.useKraken) return this.syncKraken(symbols)
    if (!want.size) {
      if (this.cb) { this.cb.onclose = null; this.cb.close(); this.cb = null; this.cbProducts.clear() }
      return
    }
    if (!this.cb || this.cb.readyState > 1) {
      this.cbProducts = new Set()
      const ws = new WebSocket('wss://ws-feed.exchange.coinbase.com')
      this.cb = ws
      this.status = { ...this.status, crypto: 'connecting' }
      ws.onopen = () => { this.cbFailures = 0; this.cbProducts = new Set(); this.syncCrypto(this.symbols().filter(s => kindOf(s) === 'crypto')) }
      ws.onmessage = ev => {
        const m = JSON.parse(ev.data)
        if (m.type === 'ticker' && m.product_id) {
          const patch = { price: +m.price, streamedAt: Date.now(), live: true, source: 'Coinbase live' }
          if (!this.quotes[m.product_id]?.previousClose && m.open_24h) patch.previousClose = +m.open_24h
          this.update(m.product_id, patch)
          this.status = { ...this.status, crypto: 'streaming' }
          this.scheduleEmit()
        } else if (m.type === 'error') {
          this.status = { ...this.status, error: `Coinbase: ${m.reason || m.message}` }
        }
      }
      ws.onclose = () => {
        this.cb = null
        this.cbFailures++
        if (this.cbFailures >= 3) { this.useKraken = true; this.status = { ...this.status, crypto: 'connecting' } }
        setTimeout(() => this.syncCrypto(this.symbols().filter(s => kindOf(s) === 'crypto')), Math.min(30000, 1000 * 2 ** this.cbFailures))
      }
      return
    }
    if (this.cb.readyState !== 1) return
    const add = [...want].filter(s => !this.cbProducts.has(s))
    const remove = [...this.cbProducts].filter(s => !want.has(s))
    // One message per product: an unknown product only fails its own subscription.
    for (const s of add) this.cb.send(JSON.stringify({ type: 'subscribe', product_ids: [s], channels: ['ticker'] }))
    if (remove.length) this.cb.send(JSON.stringify({ type: 'unsubscribe', product_ids: remove, channels: ['ticker'] }))
    add.forEach(s => this.cbProducts.add(s))
    remove.forEach(s => this.cbProducts.delete(s))
  }

  // --- Kraken WebSocket v2 (fallback for crypto) ---
  syncKraken(symbols) {
    const toPair = s => s.replace('-USD', '/USD')
    if (!symbols.length) { if (this.kr) { this.kr.onclose = null; this.kr.close(); this.kr = null } return }
    if (!this.kr || this.kr.readyState > 1) {
      const ws = new WebSocket('wss://ws.kraken.com/v2')
      this.kr = ws
      this.krPairs = new Set()
      ws.onopen = () => this.syncKraken(this.symbols().filter(s => kindOf(s) === 'crypto'))
      ws.onmessage = ev => {
        const m = JSON.parse(ev.data)
        if (m.channel === 'ticker' && Array.isArray(m.data)) {
          for (const d of m.data) {
            this.update(d.symbol.replace('/USD', '-USD'), { price: +d.last, streamedAt: Date.now(), live: true, source: 'Kraken live' })
          }
          this.status = { ...this.status, crypto: 'streaming' }
          this.scheduleEmit()
        }
      }
      ws.onclose = () => { this.kr = null; setTimeout(() => this.syncKraken(this.symbols().filter(s => kindOf(s) === 'crypto')), 5000) }
      return
    }
    if (this.kr.readyState !== 1) return
    const add = symbols.filter(s => !this.krPairs.has(s))
    if (add.length) this.kr.send(JSON.stringify({ method: 'subscribe', params: { channel: 'ticker', symbol: add.map(toPair) } }))
    add.forEach(s => this.krPairs.add(s))
  }

  // --- Finnhub WebSocket (US stock trades, needs free key) ---
  syncFinnhub(symbols, key) {
    const want = new Set(symbols)
    if (!want.size) return
    if (!this.fh || this.fh.readyState > 1) {
      const ws = new WebSocket(`wss://ws.finnhub.io?token=${encodeURIComponent(key)}`)
      this.fh = ws
      this.fhSymbols = new Set()
      ws.onopen = () => this.syncFinnhub(this.symbols().filter(s => kindOf(s) === 'stock'), key)
      ws.onmessage = ev => {
        const m = JSON.parse(ev.data)
        if (m.type !== 'trade') return
        const latest = {}
        for (const t of m.data || []) if (!latest[t.s] || t.t > latest[t.s].t) latest[t.s] = t
        for (const t of Object.values(latest)) this.update(t.s, { price: t.p, streamedAt: Date.now(), live: true, source: 'Finnhub live' })
        this.status = { ...this.status, stocks: 'streaming' }
        this.scheduleEmit()
      }
      ws.onclose = () => { this.fh = null; setTimeout(() => this.syncFinnhub(this.symbols().filter(s => kindOf(s) === 'stock'), key), 10000) }
      return
    }
    if (this.fh.readyState !== 1) return
    for (const s of want) if (!this.fhSymbols.has(s)) { this.fh.send(JSON.stringify({ type: 'subscribe', symbol: s })); this.fhSymbols.add(s) }
    for (const s of [...this.fhSymbols]) if (!want.has(s)) { this.fh.send(JSON.stringify({ type: 'unsubscribe', symbol: s })); this.fhSymbols.delete(s) }
  }

  // Ticks can arrive many times per second; repaint at most ~4x/sec.
  scheduleEmit() {
    if (this.emitTimer) return
    this.emitTimer = setTimeout(() => { this.emitTimer = null; this.emit() }, 250)
  }
}

export const liveHub = new LiveHub()
