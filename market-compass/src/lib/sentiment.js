// Headline sentiment and "why it matters" tagging. A finance-tuned word list,
// not a language model: fast, free and predictable, but it reads headlines
// literally. The optional AI briefing on the asset page goes deeper.

const PHRASES = [
  ['all-time high', 2], ['record high', 2], ['raises guidance', 2.5], ['raised guidance', 2.5],
  ['beats estimates', 2.5], ['tops estimates', 2.5], ['better than expected', 2], ['stronger than expected', 2],
  ['price target raised', 1.5], ['raises price target', 1.5], ['share buyback', 1.5], ['stock buyback', 1.5],
  ['dividend increase', 1.5], ['etf approval', 2.5], ['etf inflows', 1.5], ['rate cut', 1.5], ['rate cuts', 1.5],
  ['cuts guidance', -2.5], ['lowers guidance', -2.5], ['cut guidance', -2.5], ['misses estimates', -2.5],
  ['worse than expected', -2], ['weaker than expected', -2], ['price target cut', -1.5], ['lowers price target', -1.5],
  ['rate hike', -1.5], ['rate hikes', -1.5], ['hotter than expected', -1.5], ['class action', -2],
  ['sec charges', -2.5], ['sec sues', -2.5], ['chapter 11', -3], ['going concern', -3], ['etf outflows', -1.5],
  ['52-week low', -1.5], ['52-week high', 1.5], ['short seller', -1.5], ['profit warning', -2.5],
]

const WORDS = {
  beat: 2, beats: 2, surge: 2, surges: 2, surged: 2, soar: 2, soars: 2, soared: 2, jump: 1.5, jumps: 1.5,
  jumped: 1.5, rally: 1.5, rallies: 1.5, rallied: 1.5, gain: 1, gains: 1, gained: 1, rise: 1, rises: 1,
  rose: 1, climbs: 1, climbed: 1, record: 1, upgrade: 2, upgrades: 2, upgraded: 2, outperform: 1.5,
  bullish: 1.5, growth: 1, profit: 1, profitable: 1.5, strong: 1, strength: 1, approval: 1.5, approved: 1.5,
  approves: 1.5, partnership: 1, partners: 0.5, buyback: 1.5, breakthrough: 1.5, expands: 1, expansion: 1,
  wins: 1, won: 1, launch: 0.5, launches: 0.5, adoption: 1, inflows: 1, rebound: 1, rebounds: 1, recovers: 1,
  recovery: 1, boost: 1, boosts: 1, optimism: 1, optimistic: 1, upbeat: 1.5, accelerates: 1, tops: 1,
  exceeds: 1.5, higher: 0.5, highs: 1, milestone: 1, robust: 1, booming: 1.5, deal: 0.5,
  miss: -2, misses: -2, missed: -2, plunge: -2.5, plunges: -2.5, plunged: -2.5, plummet: -2.5,
  plummets: -2.5, tumble: -2, tumbles: -2, tumbled: -2, slump: -2, slumps: -2, sink: -1.5, sinks: -1.5,
  drop: -1.5, drops: -1.5, dropped: -1.5, fall: -1, falls: -1, fell: -1, slide: -1, slides: -1, decline: -1,
  declines: -1, lower: -0.5, downgrade: -2, downgrades: -2, downgraded: -2, underperform: -1.5,
  bearish: -1.5, loss: -1.5, losses: -1.5, lawsuit: -1.5, sued: -1.5, sues: -1.5, probe: -1.5,
  investigation: -1.5, fraud: -3, recall: -1.5, layoffs: -1, warns: -1.5, warning: -1.5,
  bankruptcy: -3, bankrupt: -3, default: -2, hack: -2.5, hacked: -2.5, exploit: -2.5, exploited: -2.5,
  breach: -2, ban: -2, bans: -2, banned: -2, crackdown: -2, delist: -2.5, delisted: -2.5, outflows: -1,
  selloff: -2, 'sell-off': -2, crash: -2.5, crashes: -2.5, fears: -1, fear: -1, worries: -1, concerns: -1,
  tariff: -1, tariffs: -1, recession: -1.5, resigns: -1, resignation: -1, weak: -1, weakness: -1,
  volatile: -0.5, slowdown: -1, cut: -0.5, cuts: -0.5, halted: -1.5, suspends: -1.5, liquidation: -1.5,
  liquidations: -1.5, scam: -2.5, penalty: -1.5, fine: -0.5, fined: -1.5, antitrust: -1, shortfall: -1.5,
}

const NEGATORS = new Set(['not', 'no', 'never', "didn't", "doesn't", "won't", 'fails', 'failed', 'without'])

export function scoreHeadline(text) {
  let lower = ` ${String(text).toLowerCase()} `
  let sum = 0
  for (const [phrase, w] of PHRASES) {
    if (lower.includes(phrase)) {
      sum += w
      lower = lower.split(phrase).join(' ')
    }
  }
  const tokens = lower.split(/[^a-z0-9'-]+/).filter(Boolean)
  let flip = 0
  for (const t of tokens) {
    if (NEGATORS.has(t)) { flip = 2; continue }
    const w = WORDS[t]
    if (w) sum += flip > 0 ? -w : w
    if (flip > 0) flip--
  }
  return Math.tanh(sum / 3)
}

export const CATEGORIES = {
  earnings: {
    label: 'Earnings',
    words: ['earnings', 'eps', 'revenue', 'quarterly', 'quarter', 'results', 'guidance', 'outlook', 'profit', 'sales'],
    why: 'Earnings show whether the company is making more or less money than Wall Street expected. Stocks often move 5-15% the day after.',
    weight: 3,
  },
  macro: {
    label: 'Economy & Fed',
    words: ['fed', 'federal reserve', 'powell', 'interest rate', 'rate cut', 'rate hike', 'inflation', 'cpi', 'jobs report', 'payrolls', 'unemployment', 'gdp', 'recession', 'treasury', 'yields', 'tariff', 'fomc'],
    why: 'Interest rates and inflation move the whole market at once. Higher rates usually push stocks and crypto down; cuts usually help.',
    weight: 3,
  },
  legal: {
    label: 'Legal & regulation',
    words: ['sec', 'lawsuit', 'sued', 'probe', 'investigation', 'regulator', 'regulation', 'antitrust', 'court', 'judge', 'ban', 'doj', 'ftc', 'settlement', 'fine'],
    why: 'Regulators and courts can block products, add costs or force fines. Uncertainty here usually weighs on price until it is resolved.',
    weight: 2.5,
  },
  security: {
    label: 'Hack / security',
    words: ['hack', 'hacked', 'exploit', 'breach', 'stolen', 'drained', 'vulnerability'],
    why: 'Hacks destroy trust fast. Crypto tokens tied to a hacked project can drop sharply within hours.',
    weight: 3,
  },
  analyst: {
    label: 'Analyst rating',
    words: ['upgrade', 'downgrade', 'price target', 'rating', 'overweight', 'underweight', 'outperform', 'underperform', 'analyst'],
    why: 'When big banks change their rating, many funds follow. The effect is real but usually fades within days.',
    weight: 1.5,
  },
  deal: {
    label: 'Deals & partnerships',
    words: ['acquire', 'acquires', 'acquisition', 'merger', 'merge', 'buyout', 'takeover', 'partnership', 'partners with', 'stake', 'deal'],
    why: 'A company being bought usually jumps toward the offer price; the buyer often dips. Partnerships matter less than headlines suggest.',
    weight: 2,
  },
  crypto: {
    label: 'Crypto market',
    words: ['etf', 'halving', 'stablecoin', 'whale', 'staking', 'on-chain', 'liquidation', 'exchange', 'mining', 'miners', 'defi', 'token'],
    why: 'Fund flows (ETFs), big holders ("whales") and forced liquidations drive crypto in the short term.',
    weight: 2,
  },
  leadership: {
    label: 'Leadership',
    words: ['ceo', 'cfo', 'resigns', 'steps down', 'appoints', 'founder', 'executive'],
    why: 'A surprise leadership change adds uncertainty. Markets usually react more to who replaces them.',
    weight: 1.5,
  },
  product: {
    label: 'Products',
    words: ['launch', 'launches', 'unveils', 'release', 'announces', 'new product', 'chip', 'model', 'ai'],
    why: 'New products matter when they change future sales. Most launches are already expected and move the price little.',
    weight: 1,
  },
}

export function categorize(text) {
  const lower = ` ${String(text).toLowerCase()} `
  let best = null, bestHits = 0
  for (const [key, cat] of Object.entries(CATEGORIES)) {
    let hits = 0
    for (const w of cat.words) {
      const re = new RegExp(`[^a-z]${w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[^a-z]`)
      if (re.test(lower)) hits++
    }
    if (hits * cat.weight > bestHits) { best = key; bestHits = hits * cat.weight }
  }
  return best || 'general'
}

export function whyItMatters(category) {
  return CATEGORIES[category]?.why || 'General market news. On its own it rarely moves the price much.'
}

// High / Medium / Low: how likely a headline is to actually move the price.
export function impactOf(category, sentiment) {
  const weight = CATEGORIES[category]?.weight || 1
  const strength = Math.abs(sentiment) * weight
  if (strength >= 1.5) return 'high'
  if (strength >= 0.6) return 'medium'
  return 'low'
}

export function annotate(item) {
  const sentiment = scoreHeadline(item.title)
  const category = categorize(item.title)
  return { ...item, sentiment, category, impact: impactOf(category, sentiment) }
}

// Recency-weighted average sentiment of headlines from the last few days,
// used as the "news" factor in the signal. Half-life of one day.
export function newsScore(items, now = Date.now()) {
  let sum = 0, weights = 0, count = 0
  for (const it of items) {
    const ageDays = (now - it.time) / 86400000
    if (!(ageDays >= -0.1 && ageDays <= 4)) continue
    const w = 0.5 ** Math.max(ageDays, 0) * (it.impact === 'high' ? 2 : it.impact === 'medium' ? 1.3 : 1)
    sum += it.sentiment * w
    weights += w
    count++
  }
  if (!count) return null
  // Few headlines -> pull toward neutral so one story can't dominate.
  const shrink = count / (count + 3)
  return { score: (sum / weights) * shrink, count }
}
