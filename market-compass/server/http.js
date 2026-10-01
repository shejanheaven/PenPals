// Small helpers shared by the /api functions.

export const BROWSER_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Safari/537.36'

export async function fetchWithTimeout(url, { timeout = 7000, headers = {}, ...opts } = {}) {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), timeout)
  try {
    return await fetch(url, {
      ...opts,
      headers: { 'User-Agent': BROWSER_UA, Accept: '*/*', ...headers },
      signal: ctrl.signal,
    })
  } finally {
    clearTimeout(timer)
  }
}

export function json(data, { status = 200, cache = 0, swr = 0 } = {}) {
  const headers = { 'Content-Type': 'application/json; charset=utf-8' }
  headers['Cache-Control'] = cache
    ? `public, max-age=${Math.min(cache, 15)}, s-maxage=${cache}, stale-while-revalidate=${swr || cache * 2}`
    : 'no-store'
  return new Response(JSON.stringify(data), { status, headers })
}

// Per-instance memory cache so a warm function doesn't refetch upstream data
// for every visitor. The CDN cache (s-maxage) does the heavy lifting.
const memo = new Map()
export async function cached(key, ttlMs, fn) {
  const hit = memo.get(key)
  if (hit && hit.expires > Date.now()) return hit.value
  const value = await fn()
  memo.set(key, { value, expires: Date.now() + ttlMs })
  if (memo.size > 500) memo.delete(memo.keys().next().value)
  return value
}

export async function mapLimit(items, limit, fn) {
  const out = new Array(items.length)
  let next = 0
  async function worker() {
    while (next < items.length) {
      const i = next++
      try { out[i] = await fn(items[i], i) } catch (e) { out[i] = { error: e.message || String(e) } }
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker))
  return out
}

const SYMBOL_RE = /^[A-Za-z0-9.^=-]{1,20}$/
export function cleanSymbol(s) {
  const v = String(s || '').trim().toUpperCase()
  return SYMBOL_RE.test(v) ? v : null
}
