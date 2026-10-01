import { getQuote } from '../server/market.js'
import { cached, cleanSymbol, json, mapLimit } from '../server/http.js'

// GET /api/quotes?symbols=AAPL,MSFT,BTC-USD  (max 40)
export async function GET(request) {
  const url = new URL(request.url)
  const symbols = [...new Set((url.searchParams.get('symbols') || '').split(',').map(cleanSymbol).filter(Boolean))].slice(0, 40)
  if (!symbols.length) return json({ error: 'Missing symbols' }, { status: 400 })
  const results = await mapLimit(symbols, 8, s => cached(`q:${s}`, 8000, () => getQuote(s)))
  const quotes = {}
  const errors = {}
  symbols.forEach((s, i) => {
    if (results[i]?.error) errors[s] = results[i].error
    else quotes[s] = results[i]
  })
  return json({ quotes, errors, time: Date.now() }, { cache: 10, swr: 20 })
}
