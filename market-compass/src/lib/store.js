// Settings, watchlist and the practice (paper trading) account, saved in this
// browser's localStorage. Nothing is sent to a server.

import { useSyncExternalStore } from 'react'
import { DEFAULT_WATCHLIST } from './universe.js'

const KEY = 'mc.state.v1'

const DEFAULTS = {
  onboarded: false,
  watchlist: DEFAULT_WATCHLIST,
  settings: { account: 1000, riskPct: 0.01, broker: 'robinhood', theme: 'system', aiCode: '' },
  paper: { start: 10000, cash: 10000, positions: {}, history: [], createdAt: Date.now() },
}

function load() {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY))
    if (raw) return { ...DEFAULTS, ...raw, settings: { ...DEFAULTS.settings, ...raw.settings }, paper: { ...DEFAULTS.paper, ...raw.paper } }
  } catch {}
  return DEFAULTS
}

let state = load()
const listeners = new Set()

export function getState() { return state }

export function setState(fn) {
  state = typeof fn === 'function' ? fn(state) : { ...state, ...fn }
  try { localStorage.setItem(KEY, JSON.stringify(state)) } catch {}
  for (const l of listeners) l()
}

export function useStore(selector = s => s) {
  return useSyncExternalStore(cb => { listeners.add(cb); return () => listeners.delete(cb) }, () => selector(state))
}

export const updateSettings = patch => setState(s => ({ ...s, settings: { ...s.settings, ...patch } }))

export function toggleWatch(symbol) {
  setState(s => ({
    ...s,
    watchlist: s.watchlist.includes(symbol) ? s.watchlist.filter(x => x !== symbol) : [...s.watchlist, symbol],
  }))
}

// ---- Practice trading -------------------------------------------------------

export function paperBuy({ symbol, price, dollars, stop, target, holdDays, kind }) {
  setState(s => {
    const p = s.paper
    const spend = Math.min(dollars, p.cash)
    if (!(spend > 0) || !(price > 0)) return s
    const units = spend / price
    const existing = p.positions[symbol]
    const position = existing
      ? { ...existing, units: existing.units + units, cost: existing.cost + spend, stop, target }
      : { symbol, kind, units, cost: spend, stop, target, openedAt: Date.now(), sellBy: Date.now() + holdDays * 86400000 * (kind === 'crypto' ? 1 : 1.4) }
    return {
      ...s,
      paper: {
        ...p,
        cash: p.cash - spend,
        positions: { ...p.positions, [symbol]: position },
        history: [{ symbol, side: 'buy', units, price, time: Date.now() }, ...p.history].slice(0, 300),
      },
    }
  })
}

export function paperSell(symbol, price, reason = 'manual') {
  setState(s => {
    const p = s.paper
    const pos = p.positions[symbol]
    if (!pos || !(price > 0)) return s
    const proceeds = pos.units * price
    const positions = { ...p.positions }
    delete positions[symbol]
    return {
      ...s,
      paper: {
        ...p,
        cash: p.cash + proceeds,
        positions,
        history: [{ symbol, side: 'sell', units: pos.units, price, time: Date.now(), pnl: proceeds - pos.cost, ret: proceeds / pos.cost - 1, reason }, ...p.history].slice(0, 300),
      },
    }
  })
}

export function paperReset(start = 10000) {
  setState(s => ({ ...s, paper: { start, cash: start, positions: {}, history: [], createdAt: Date.now() } }))
}

// Auto-close practice positions that hit their stop or target (like real
// stop-loss / take-profit orders would).
export function checkPaperExits(quotes) {
  for (const pos of Object.values(state.paper.positions)) {
    const q = quotes[pos.symbol]
    if (!q?.price) continue
    if (pos.stop && q.price <= pos.stop) paperSell(pos.symbol, q.price, 'stop')
    else if (pos.target && q.price >= pos.target) paperSell(pos.symbol, q.price, 'target')
  }
}
