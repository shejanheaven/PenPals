import test from 'node:test'
import assert from 'node:assert/strict'
import { normalizeCandles, parseCoinbaseCandles, parseKrakenOhlc, parseStooqCsv, parseYahooChart, krakenPair } from '../server/market.js'
import { decodeEntities, parseFeed } from '../server/news.js'
import { parseCalendarEvents } from '../server/earnings.js'

test('Yahoo chart: parses bars, skips nulls, merges duplicate live bar', () => {
  const result = {
    meta: { currency: 'USD', symbol: 'AAPL', exchangeName: 'NMS', fullExchangeName: 'NasdaqGS', regularMarketPrice: 231.5, regularMarketTime: 1727800000, longName: 'Apple Inc.', previousClose: 229.1 },
    // Fri 09-27, Mon 09-30, a duplicate live bar later on 09-30, and an empty bar
    timestamp: [1727443800, 1727703000, 1727707000, 1727789400],
    indicators: { quote: [{
      open: [228, 229, 230.1, null], high: [230, 231, 232, null], low: [227, 228, 229.8, null], close: [229, 229.1, 231.5, null], volume: [100, 200, 50, null],
    }] },
  }
  const d = parseYahooChart(result)
  assert.equal(d.name, 'Apple Inc.')
  assert.equal(d.price, 231.5)
  assert.equal(d.previousClose, 229.1)
  assert.equal(d.candles.length, 2) // empty bar dropped, live bar merged into 09-30
  assert.equal(d.candles[1].c, 231.5)
  assert.equal(d.candles[1].o, 229)
  assert.equal(d.exchange, 'NasdaqGS')
})

test('Yahoo intraday keeps every bar and uses chartPreviousClose', () => {
  const result = {
    meta: { symbol: 'BTC-USD', regularMarketPrice: 64000, chartPreviousClose: 63000 },
    timestamp: [1727740800, 1727741100],
    indicators: { quote: [{ open: [63000, 63100], high: [63200, 63300], low: [62900, 63000], close: [63100, 63250], volume: [5, 6] }] },
  }
  const d = parseYahooChart(result, true)
  assert.equal(d.candles.length, 2)
  assert.equal(d.previousClose, 63000)
})

test('Coinbase candles: [time, low, high, open, close, volume] newest first', () => {
  const c = parseCoinbaseCandles([[1727740800, 60000, 64000, 61000, 63000, 1200.5], [1727654400, 59000, 62000, 60000, 61000, 900]])
  assert.equal(c[0].t, 1727654400000)
  assert.deepEqual(c[1], { t: 1727740800000, l: 60000, h: 64000, o: 61000, c: 63000, v: 1200.5 })
})

test('Kraken OHLC + pair names', () => {
  const body = { error: [], result: { XXBTZUSD: [[1727740800, '61000.0', '64000.0', '60000.0', '63000.0', '62000.0', '1200.5', 5000]], last: 1727740800 } }
  assert.deepEqual(parseKrakenOhlc(body)[0], { t: 1727740800000, o: 61000, h: 64000, l: 60000, c: 63000, v: 1200.5 })
  assert.equal(krakenPair('BTC-USD'), 'XBTUSD')
  assert.equal(krakenPair('DOGE-USD'), 'XDGUSD')
  assert.equal(krakenPair('SOL-USD'), 'SOLUSD')
})

test('Stooq CSV', () => {
  const rows = parseStooqCsv('Date,Open,High,Low,Close,Volume\n2026-09-29,10,11,9,10.5,1000\n2026-09-30,10.5,12,10,11.5,2000\n')
  assert.equal(rows.length, 2)
  assert.equal(rows[1].c, 11.5)
  assert.deepEqual(parseStooqCsv('No data'), [])
})

test('normalizeCandles drops bad bars and fixes inconsistent highs/lows', () => {
  const c = normalizeCandles([{ t: 1, o: 10, h: 9, l: 11, c: 10.5, v: null }, { t: 86400001, o: 0, h: 0, l: 0, c: 0 }])
  assert.equal(c.length, 1)
  assert.equal(c[0].h, 10.5)
  assert.equal(c[0].l, 10)
  assert.equal(c[0].v, 0)
})

test('Google News RSS: strips publisher suffix, reads source', () => {
  const xml = `<?xml version="1.0"?><rss><channel><title>AAPL stock</title>
  <item><title>Apple stock rises after iPhone demand beats forecasts - CNBC</title><link>https://news.google.com/rss/articles/abc?oc=5</link><guid isPermaLink="false">abc</guid><pubDate>Tue, 30 Sep 2026 14:05:00 GMT</pubDate><description>&lt;a href="x"&gt;Apple stock rises&lt;/a&gt;&amp;nbsp;&amp;nbsp;&lt;font color="#6f6f6f"&gt;CNBC&lt;/font&gt;</description><source url="https://www.cnbc.com">CNBC</source></item>
  </channel></rss>`
  const [item] = parseFeed(xml, 'Google News')
  assert.equal(item.title, 'Apple stock rises after iPhone demand beats forecasts')
  assert.equal(item.source, 'CNBC')
  assert.equal(item.time, Date.parse('Tue, 30 Sep 2026 14:05:00 GMT'))
  assert.match(item.link, /^https:\/\/news.google.com/)
})

test('CDATA feeds (CoinDesk style) and Atom entries', () => {
  const rss = `<rss><channel><item><title><![CDATA[Bitcoin ETF inflows hit record & keep climbing]]></title><link>https://www.coindesk.com/a</link><pubDate>Wed, 01 Oct 2026 08:00:00 +0000</pubDate><description><![CDATA[<p>Flows</p>]]></description></item></channel></rss>`
  const [a] = parseFeed(rss, 'CoinDesk')
  assert.equal(a.title, 'Bitcoin ETF inflows hit record & keep climbing')
  assert.equal(a.source, 'CoinDesk')
  assert.equal(a.summary, 'Flows')
  const atom = `<feed><entry><title>Market wrap</title><link href="https://x.com/1"/><updated>2026-10-01T10:00:00Z</updated></entry></feed>`
  const [b] = parseFeed(atom, 'X')
  assert.equal(b.link, 'https://x.com/1')
  assert.equal(decodeEntities('Q&amp;A &#8217; &#x27;'), "Q&A ’ '")
})

test('Yahoo calendarEvents: next upcoming earnings date', () => {
  const soon = Math.floor(Date.now() / 1000) + 10 * 86400
  const body = { quoteSummary: { result: [{ calendarEvents: { earnings: { earningsDate: [{ raw: soon + 86400, fmt: 'x' }, { raw: soon, fmt: 'y' }] } } }] } }
  assert.equal(parseCalendarEvents(body), soon * 1000)
  assert.equal(parseCalendarEvents({}), null)
})
