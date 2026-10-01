// Real news from free RSS feeds (Yahoo Finance, Google News, CNBC,
// MarketWatch, CoinDesk, Cointelegraph), plus Finnhub when FINNHUB_KEY is set.
// Headlines are de-duplicated, scored and tagged with why they matter.

import { fetchWithTimeout, mapLimit } from './http.js'
import { annotate } from '../src/lib/sentiment.js'

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' }

export function decodeEntities(s) {
  return String(s || '')
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(+d))
    .replace(/&([a-z]+);/gi, (m, n) => ENTITIES[n.toLowerCase()] ?? m)
}

const stripTags = s => s.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim()

function tag(block, name) {
  const m = block.match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`, 'i'))
  return m ? m[1].trim() : ''
}

export function parseFeed(xml, fallbackSource) {
  const blocks = xml.match(/<item[\s>][\s\S]*?<\/item>/gi) || xml.match(/<entry[\s>][\s\S]*?<\/entry>/gi) || []
  return blocks.map(b => {
    let title = stripTags(decodeEntities(tag(b, 'title')))
    let source = stripTags(decodeEntities(tag(b, 'source'))) || fallbackSource
    // Google News appends " - Publisher" to every title.
    const dash = title.lastIndexOf(' - ')
    if (dash > 20 && source && title.slice(dash + 3).trim() === source) title = title.slice(0, dash).trim()
    let link = decodeEntities(tag(b, 'link')).trim()
    if (!link) link = (b.match(/<link[^>]*href="([^"]+)"/i) || [])[1] || ''
    const date = tag(b, 'pubDate') || tag(b, 'dc:date') || tag(b, 'published') || tag(b, 'updated')
    const summary = stripTags(decodeEntities(tag(b, 'description') || tag(b, 'summary'))).slice(0, 280)
    return { title, link, source, time: Date.parse(decodeEntities(date)) || null, summary }
  }).filter(i => i.title && i.time)
}

const gnews = q => `https://news.google.com/rss/search?q=${encodeURIComponent(q)}&hl=en-US&gl=US&ceid=US:en`

const FEEDS = {
  coindesk: ['https://www.coindesk.com/arc/outboundfeeds/rss/', 'CoinDesk'],
  cointelegraph: ['https://cointelegraph.com/rss', 'Cointelegraph'],
  cnbc: ['https://search.cnbc.com/rs/search/combinedcms/view.xml?partnerId=wrss01&id=100003114', 'CNBC'],
  cnbcMarkets: ['https://search.cnbc.com/rs/search/combinedcms/view.xml?partnerId=wrss01&id=20910258', 'CNBC'],
  marketwatch: ['https://feeds.content.dowjones.io/public/rss/mw_topstories', 'MarketWatch'],
}

async function readFeed(url, source) {
  const res = await fetchWithTimeout(url, { timeout: 6000, headers: { Accept: 'application/rss+xml, application/xml, text/xml, */*' } })
  if (!res.ok) throw new Error(`${source} ${res.status}`)
  return parseFeed(await res.text(), source)
}

async function finnhub(path) {
  const key = process.env.FINNHUB_KEY
  if (!key) return []
  const res = await fetchWithTimeout(`https://finnhub.io/api/v1/${path}&token=${key}`)
  if (!res.ok) throw new Error(`Finnhub ${res.status}`)
  const rows = await res.json()
  return (Array.isArray(rows) ? rows : []).map(r => ({
    title: r.headline, link: r.url, source: r.source || 'Finnhub', time: r.datetime * 1000, summary: (r.summary || '').slice(0, 280),
  })).filter(i => i.title && i.time)
}

const ymd = t => new Date(t).toISOString().slice(0, 10)

function plan({ symbol, name, kind, scope }) {
  if (scope === 'market') {
    return [
      [gnews('stock market today when:1d'), 'Google News'],
      [gnews('Federal Reserve OR inflation OR "jobs report" OR CPI when:3d'), 'Google News'],
      FEEDS.cnbc, FEEDS.cnbcMarkets, FEEDS.marketwatch,
      ['finnhub:news?category=general', 'Finnhub'],
    ]
  }
  if (scope === 'crypto') {
    return [
      FEEDS.coindesk, FEEDS.cointelegraph,
      [gnews('crypto market bitcoin when:1d'), 'Google News'],
      ['finnhub:news?category=crypto', 'Finnhub'],
    ]
  }
  if (kind === 'crypto') {
    const base = symbol.replace(/-USD$/, '')
    return [
      [gnews(`"${name}" ${base} crypto when:7d`), 'Google News'],
      [...FEEDS.coindesk, [name, base]],
      [...FEEDS.cointelegraph, [name, base]],
    ]
  }
  const to = Date.now()
  return [
    [`https://feeds.finance.yahoo.com/rss/2.0/headline?s=${encodeURIComponent(symbol)}&region=US&lang=en-US`, 'Yahoo Finance'],
    [gnews(`${name && name !== symbol ? `"${name}" OR ` : ''}${symbol} stock when:7d`), 'Google News'],
    [`finnhub:company-news?symbol=${encodeURIComponent(symbol)}&from=${ymd(to - 7 * 86400000)}&to=${ymd(to)}`, 'Finnhub'],
  ]
}

const normTitle = t => t.toLowerCase().replace(/[^a-z0-9 ]/g, '').replace(/\s+/g, ' ').slice(0, 80)

export async function getNews(params) {
  const feeds = plan(params)
  const sources = []
  const lists = await mapLimit(feeds, 6, async ([url, source, keywords]) => {
    try {
      let items = url.startsWith('finnhub:') ? await finnhub(url.slice(8)) : await readFeed(url, source)
      if (keywords) {
        const kws = keywords.filter(Boolean).map(k => k.toLowerCase())
        items = items.filter(i => kws.some(k => new RegExp(`\\b${k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i').test(i.title)))
      }
      if (!(url.startsWith('finnhub:') && !process.env.FINNHUB_KEY)) sources.push({ source, ok: true, count: items.length })
      return items
    } catch (e) {
      sources.push({ source, ok: false, error: e.message })
      return []
    }
  })
  const seen = new Set()
  const cutoff = Date.now() - 14 * 86400000
  const items = lists.flat()
    .filter(i => i.time > cutoff && i.time < Date.now() + 3600000)
    .sort((a, b) => b.time - a.time)
    .filter(i => {
      const k = normTitle(i.title)
      if (seen.has(k)) return false
      seen.add(k)
      return true
    })
    .slice(0, 50)
    .map(annotate)
  return { items, sources, fetchedAt: Date.now() }
}
