// The app grading itself: what it said 1 week and ~1 month ago across every
// asset it tracks, how that turned out, and what self-tuning changed.

import { Stat } from './ui.jsx'
import { fmtPct } from '../lib/format.js'
import { isBuy, isSell } from '../lib/signals.js'

const FACTOR_LABELS = {
  trend: 'Trend', momentum: 'Momentum (weeks)', longterm: 'Momentum (12 months)', relative: 'Strength vs. market',
  rsi: 'RSI', stretch: 'Price vs. normal range', volume: 'Volume', news: 'News', market: 'Market mood',
}

function callsSummary(results, key) {
  const withCall = results.filter(r => r[key])
  const buys = withCall.filter(r => isBuy(r[key].action))
  const sells = withCall.filter(r => isSell(r[key].action))
  const avg = arr => (arr.length ? arr.reduce((s, r) => s + r[key].ret, 0) / arr.length : null)
  return {
    buyN: buys.length, buyRight: buys.length ? buys.filter(r => r[key].ret > 0).length / buys.length : null, buyAvg: avg(buys),
    sellN: sells.length, sellRight: sells.length ? sells.filter(r => r[key].ret < 0).length / sells.length : null,
    allAvg: avg(withCall),
  }
}

function pooled(results, key) {
  let n = 0, hits = 0, base = 0, baseN = 0
  for (const r of results) {
    const w = r[key]
    if (!w) continue
    if (w.buyN) { n += w.buyN; hits += w.buyHit * w.buyN }
    if (w.baseUp != null) { base += w.baseUp * w.n; baseN += w.n }
  }
  return { n, hit: n ? hits / n : null, base: baseN ? base / baseN : null }
}

export default function ReportCard({ results, calibration, compact = false }) {
  if (!results.length) return null
  const week = callsSummary(results, 'call5')
  const month = callsSummary(results, 'call20')
  const p20 = pooled(results, 'w20')
  const p60 = pooled(results, 'w60')
  const verdict = (right, n) => (n ? `${fmtPct(right, { sign: false, digits: 0 })} right` : 'no calls')

  return (
    <div className="stack">
      <div className="grid-auto">
        <Stat label="Buy calls 1 week ago" value={verdict(week.buyRight, week.buyN)} sub={week.buyN ? `${week.buyN} calls · avg ${fmtPct(week.buyAvg)} vs ${fmtPct(week.allAvg)} for everything` : ''} />
        <Stat label="Buy calls ~1 month ago" value={verdict(month.buyRight, month.buyN)} sub={month.buyN ? `${month.buyN} calls · avg ${fmtPct(month.buyAvg)} vs ${fmtPct(month.allAvg)} for everything` : ''} />
        <Stat label="Sell calls 1 week ago" value={verdict(week.sellRight, week.sellN)} sub={week.sellN ? `${week.sellN} calls (right = price fell)` : ''} />
        <Stat label="Buy calls, last 3 months" value={p60.hit != null ? `${fmtPct(p60.hit, { sign: false, digits: 0 })} right` : '—'} sub={p60.base != null ? `vs ${fmtPct(p60.base, { sign: false, digits: 0 })} for a random day · ${p60.n} calls` : ''} />
      </div>
      {!compact && <>
        <p className="small text-2">
          Each call is replayed using only the data available that day, then graded 5 days later (for the last two columns) or against today's price (for the first two). Last month's buy calls were right {p20.hit != null ? fmtPct(p20.hit, { sign: false, digits: 0 }) : '—'} of the time, vs. {p20.base != null ? fmtPct(p20.base, { sign: false, digits: 0 }) : '—'} for picking a random day.
          {p60.hit != null && p60.base != null && (p60.hit > p60.base + 0.02
            ? ' The app has had a real edge recently.'
            : p60.hit < p60.base - 0.02
              ? ' The app has struggled recently. Markets go through phases where these signals work less well; trade smaller until it recovers.'
              : ' Recently the edge has been small. Stick to Top picks and keep sizes modest.')}
        </p>
        {calibration && Object.entries(calibration).map(([kind, cal]) => <TuningLine key={kind} kind={kind} cal={cal} />)}
      </>}
    </div>
  )
}

function TuningLine({ kind, cal }) {
  const changes = Object.keys(cal.ics || {})
    .map(k => ({ k, ic: cal.ics[k] }))
    .sort((a, b) => b.ic - a.ic)
  const best = changes.slice(0, 2).filter(c => c.ic > 0).map(c => FACTOR_LABELS[c.k])
  const worst = changes.slice(-2).filter(c => c.ic < 0).map(c => FACTOR_LABELS[c.k])
  return (
    <div className="callout small">
      <strong>Self-tuning, {kind === 'crypto' ? 'crypto' : 'stocks'}</strong> (learned from {cal.trainN.toLocaleString()} past days, tested on {cal.validN.toLocaleString()} newer days it never saw):{' '}
      {best.length > 0 && <>most predictive lately: <strong>{best.join(', ')}</strong>. </>}
      {worst.length > 0 && <>least useful: {worst.join(', ')}. </>}
      {cal.used
        ? <>Tuned weights lifted buy-call accuracy on the unseen days from {fmtPct(cal.before.buyHit, { sign: false, digits: 0 })} to <strong>{fmtPct(cal.after.buyHit, { sign: false, digits: 0 })}</strong>, so they're <span className="good">in use ✓</span>.</>
        : <>Tuning didn't beat the standard settings on the unseen days ({fmtPct(cal.before.buyHit, { sign: false, digits: 0 })} vs {fmtPct(cal.after.buyHit, { sign: false, digits: 0 })}), so the app <strong>kept the standard settings</strong>. That guards against chasing noise.</>}
    </div>
  )
}
