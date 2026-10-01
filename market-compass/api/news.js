import { getNews } from '../server/news.js'
import { cached, cleanSymbol, json } from '../server/http.js'

// GET /api/news?symbol=AAPL&name=Apple&kind=stock
// GET /api/news?scope=market   |   /api/news?scope=crypto
export async function GET(request) {
  const url = new URL(request.url)
  const scope = ['market', 'crypto'].includes(url.searchParams.get('scope')) ? url.searchParams.get('scope') : null
  const symbol = cleanSymbol(url.searchParams.get('symbol'))
  if (!scope && !symbol) return json({ error: 'Pass a symbol or scope' }, { status: 400 })
  const name = (url.searchParams.get('name') || symbol || '').replace(/[^\w .&'-]/g, '').slice(0, 60)
  const kind = url.searchParams.get('kind') === 'crypto' ? 'crypto' : 'stock'
  const key = scope ? `n:${scope}` : `n:${symbol}:${name}`
  try {
    const data = await cached(key, 300000, () => getNews({ symbol, name, kind, scope }))
    return json(data, { cache: 600, swr: 1200 })
  } catch (e) {
    return json({ error: e.message, items: [] }, { status: 502 })
  }
}
