import { getHistory } from '../server/market.js'
import { cached, cleanSymbol, json } from '../server/http.js'

// GET /api/history?symbol=AAPL&range=5y&interval=1d
export async function GET(request) {
  const url = new URL(request.url)
  const symbol = cleanSymbol(url.searchParams.get('symbol'))
  if (!symbol) return json({ error: 'Missing or invalid symbol' }, { status: 400 })
  const range = ['1d', '5d', '1mo', '3mo', '6mo', '1y', '2y', '5y'].includes(url.searchParams.get('range')) ? url.searchParams.get('range') : '5y'
  const interval = ['1d', '5m', '15m', '1h'].includes(url.searchParams.get('interval')) ? url.searchParams.get('interval') : '1d'
  const intraday = interval !== '1d'
  try {
    const data = await cached(`h:${symbol}:${range}:${interval}`, intraday ? 30000 : 120000, () => getHistory(symbol, range, interval))
    return json(data, { cache: intraday ? 30 : 180, swr: intraday ? 60 : 600 })
  } catch (e) {
    return json({ error: e.message }, { status: e.notFound ? 404 : 502 })
  }
}
