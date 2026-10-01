import { getEarnings } from '../server/earnings.js'
import { cached, cleanSymbol, json } from '../server/http.js'

// GET /api/earnings?symbol=AAPL  ->  { date: <ms> | null, source }
export async function GET(request) {
  const symbol = cleanSymbol(new URL(request.url).searchParams.get('symbol'))
  if (!symbol) return json({ error: 'Missing symbol' }, { status: 400 })
  if (/-USD$/.test(symbol)) return json({ date: null, source: null }, { cache: 86400 })
  const data = await cached(`e:${symbol}`, 6 * 3600000, () => getEarnings(symbol))
  return json(data, { cache: data.error ? 600 : 21600 })
}
