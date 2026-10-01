// Next earnings date for a stock. Holding through an earnings report is close
// to a coin flip with a big move, so the app plans trades to end before it.
//   1. Finnhub earnings calendar (if FINNHUB_KEY is set)
//   2. Yahoo Finance calendarEvents (needs a session cookie + "crumb")

import { fetchWithTimeout } from './http.js'

const ymd = t => new Date(t).toISOString().slice(0, 10)

async function finnhub(symbol) {
  const key = process.env.FINNHUB_KEY
  if (!key) return null
  const from = ymd(Date.now() - 86400000), to = ymd(Date.now() + 75 * 86400000)
  const res = await fetchWithTimeout(`https://finnhub.io/api/v1/calendar/earnings?from=${from}&to=${to}&symbol=${encodeURIComponent(symbol)}&token=${key}`)
  if (!res.ok) throw new Error(`Finnhub ${res.status}`)
  const body = await res.json()
  const next = (body.earningsCalendar || []).map(e => Date.parse(`${e.date}T${e.hour === 'amc' ? '21:00' : '12:00'}:00Z`)).filter(Boolean).sort((a, b) => a - b)[0]
  return next ? { date: next, source: 'Finnhub' } : { date: null, source: 'Finnhub' }
}

let session = null // { cookie, crumb, expires }
async function yahooSession() {
  if (session && session.expires > Date.now()) return session
  const res = await fetchWithTimeout('https://fc.yahoo.com', { redirect: 'manual' })
  const cookies = (res.headers.getSetCookie?.() || []).map(c => c.split(';')[0]).filter(Boolean)
  if (!cookies.length) throw new Error('Yahoo: no session cookie')
  const cookie = cookies.join('; ')
  const cr = await fetchWithTimeout('https://query2.finance.yahoo.com/v1/test/getcrumb', { headers: { Cookie: cookie } })
  const crumb = (await cr.text()).trim()
  if (!cr.ok || !crumb || crumb.includes('<')) throw new Error('Yahoo: no crumb')
  session = { cookie, crumb, expires: Date.now() + 3600000 }
  return session
}

export function parseCalendarEvents(body) {
  const dates = body?.quoteSummary?.result?.[0]?.calendarEvents?.earnings?.earningsDate || []
  const next = dates.map(d => (d.raw ?? 0) * 1000).filter(t => t > Date.now() - 86400000).sort((a, b) => a - b)[0]
  return next || null
}

async function yahoo(symbol) {
  const s = await yahooSession()
  const res = await fetchWithTimeout(
    `https://query2.finance.yahoo.com/v10/finance/quoteSummary/${encodeURIComponent(symbol)}?modules=calendarEvents&crumb=${encodeURIComponent(s.crumb)}`,
    { headers: { Cookie: s.cookie, Accept: 'application/json' } },
  )
  if (res.status === 401 || res.status === 403) { session = null; throw new Error(`Yahoo ${res.status}`) }
  if (!res.ok) throw new Error(`Yahoo ${res.status}`)
  return { date: parseCalendarEvents(await res.json()), source: 'Yahoo Finance' }
}

export async function getEarnings(symbol) {
  const errors = []
  for (const source of [finnhub, yahoo]) {
    try {
      const r = await source(symbol)
      if (r) return r
    } catch (e) { errors.push(e.message) }
  }
  return { date: null, source: null, error: errors.join(' | ') || 'unavailable' }
}
