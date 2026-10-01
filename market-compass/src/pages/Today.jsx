import { useMemo } from 'react'
import IdeaTable, { rankBuys, rankSells } from '../components/IdeaTable.jsx'
import ReportCard from '../components/ReportCard.jsx'
import { ActionBadge, Change, ConfidenceBadge, LiveDot, MarketPill, Sparkline, TopPickBadge, go, useLive } from '../components/ui.jsx'
import { runScan, useScan } from '../lib/analysis.js'
import { fmtMoney, fmtPct, fmtPrice, timeAgo } from '../lib/format.js'
import { displaySymbol, infoFor } from '../lib/universe.js'
import { useStore } from '../lib/store.js'

const MOOD = ['SPY', 'QQQ', 'BTC-USD']

export default function Today() {
  const scan = useScan()
  const watchlist = useStore(s => s.watchlist)
  const paper = useStore(s => s.paper)
  const { quotes } = useLive([...MOOD, ...watchlist, ...Object.keys(paper.positions)])
  const results = Object.values(scan.results)
  const buys = useMemo(() => rankBuys(results), [scan.results])
  const sells = useMemo(() => rankSells(results), [scan.results])

  const moodScore = MOOD.map(s => scan.results[s]?.score).filter(v => v != null)
  const avg = moodScore.length ? moodScore.reduce((a, b) => a + b, 0) / moodScore.length : null
  const mood = avg == null ? null : avg > 0.15 ? ['good', 'Positive', 'Most of the market is trending up. Good conditions for buy signals.'] : avg < -0.15 ? ['critical', 'Negative', 'The market is under pressure. Trade smaller, or sit out and wait.'] : ['neutral', 'Mixed', 'No strong direction. Be picky and only take the clearest setups.']

  const breadth = results.length ? results.filter(r => r.above50).length / results.length : null
  const stormy = results.some(r => r.riskScale < 1)
  const value = paper.cash + Object.values(paper.positions).reduce((s, p) => s + p.units * (quotes[p.symbol]?.price ?? p.cost / p.units), 0)
  const hour = new Date().getHours()

  return (
    <div className="stack">
      <div className="page-head">
        <h1>{hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening'} 👋</h1>
        <p>Your daily game plan from real market data: how the market feels, the best setups right now, and exactly what to do.</p>
        <div className="row wrap" style={{ marginTop: 8, gap: 16 }}><MarketPill kind="stock" /><MarketPill kind="crypto" /></div>
      </div>

      {scan.status === 'running' && (
        <div className="card">
          <div className="spread small"><span>{scan.phase === 'Self-checking' ? 'Checking its own recent calls and self-tuning…' : `Analyzing ${scan.total} stocks & cryptos with live data…`}</span><span className="muted">{scan.done}/{scan.total}</span></div>
          <div className="progress" style={{ marginTop: 8 }}><span style={{ width: `${(scan.done / Math.max(1, scan.total)) * 100}%` }} /></div>
        </div>
      )}
      {scan.status === 'done' && Object.keys(scan.errors).length > 0 && Object.keys(scan.results).length === 0 && (
        <div className="banner bad">⚠️ <div><strong>Couldn't reach market data.</strong> {Object.values(scan.errors)[0]}<div className="row" style={{ marginTop: 8 }}><button className="btn small" onClick={() => runScan(true)}>Try again</button><a className="btn small" href="#/settings">Settings</a></div></div></div>
      )}

      <section className="card">
        <div className="card-head">
          <h2>Market mood {mood && <span className={`badge ${mood[0]}`} style={{ marginLeft: 6 }}>{mood[1]}</span>}</h2>
          <span className="tiny muted">{scan.finishedAt ? `updated ${timeAgo(scan.finishedAt)}` : ''}</span>
        </div>
        {mood && <p className="small text-2" style={{ marginBottom: 12 }}>{mood[2]}{breadth != null && <> <strong>{Math.round(breadth * 100)}%</strong> of the {results.length} assets the app tracks are above their 50-day average{breadth > 0.6 ? ' (broad strength)' : breadth < 0.4 ? ' (broad weakness)' : ''}.</>}{stormy && <> 🌪️ <strong>Stormy:</strong> volatility is well above normal, so the app is cutting position sizes in half.</>}</p>}
        <div className="grid-3">
          {MOOD.map(s => {
            const r = scan.results[s], q = quotes[s]
            return (
              <button key={s} className="stat" style={{ textAlign: 'left', border: 0, cursor: 'pointer' }} onClick={() => go(`/asset/${s}`)}>
                <div className="spread"><span className="stat-label">{infoFor(s).name}</span><LiveDot live={q?.live} /></div>
                <div className="spread" style={{ alignItems: 'flex-end' }}>
                  <div>
                    <div className="stat-value">{fmtPrice(q?.price ?? r?.price)}</div>
                    <Change value={q?.changePct ?? r?.changePct} className="small" />
                  </div>
                  <Sparkline data={q?.spark?.length > 3 ? q.spark : r?.spark} />
                </div>
                {r && <div style={{ marginTop: 6 }}><ActionBadge action={r.action} /></div>}
              </button>
            )
          })}
        </div>
      </section>

      <div className="grid-2">
        <section className="card">
          <div className="card-head"><h2>🟢 Best buys right now</h2><a className="small" href="#/ideas">All ideas →</a></div>
          <p className="tiny muted" style={{ marginTop: -6, marginBottom: 10 }}>★ Top picks first: they pass every safety check. Others are weaker setups; use a smaller size.</p>
          {buys.slice(0, 4).map(r => <IdeaCard key={r.symbol} r={r} q={quotes[r.symbol]} />)}
          {scan.status === 'done' && !buys.length && <p className="small text-2">No buy signals today. That's normal in a falling market. Cash is a position too.</p>}
        </section>
        <section className="card">
          <div className="card-head"><h2>🔴 Sell or avoid</h2><a className="small" href="#/ideas?view=sell">All →</a></div>
          {sells.slice(0, 4).map(r => <IdeaCard key={r.symbol} r={r} q={quotes[r.symbol]} />)}
          {scan.status === 'done' && !sells.length && <p className="small text-2">Nothing flashing sell right now.</p>}
        </section>
      </div>

      {scan.status === 'done' && results.length > 0 && (
        <section className="card">
          <div className="card-head"><h2>📋 Was the app right?</h2><a className="small" href="#/ideas">Full report card →</a></div>
          <ReportCard results={results} calibration={scan.calibration} compact />
        </section>
      )}

      <section className="card flush">
        <div className="card-head" style={{ padding: '16px 18px 0' }}><h2>Your watchlist</h2><span className="tiny muted">Search ↑ to add any stock or crypto</span></div>
        <IdeaTable rows={watchlist.map(s => scan.results[s]).filter(Boolean)} quotes={quotes} showReason={false} empty={scan.status === 'running' ? 'Loading…' : 'Your watchlist is empty.'} />
      </section>

      <div className="grid-2">
        <section className="card">
          <div className="card-head"><h2>Practice account</h2><a className="small" href="#/practice">Open →</a></div>
          <div className="stat-value" style={{ fontSize: '1.8rem' }}>{fmtMoney(value)}</div>
          <div className="small"><Change value={value / paper.start - 1} /> <span className="muted">since you started with {fmtMoney(paper.start)} of fake money</span></div>
          <p className="small text-2" style={{ marginTop: 10 }}>Prove the system works for <em>you</em> here first. Aim for 1–3 months of practice before using real money.</p>
        </section>
        <section className="card">
          <div className="card-head"><h2>✅ Daily checklist (10 minutes)</h2></div>
          <ol className="small text-2">
            <li>Check the <strong>market mood</strong> above. Negative? Trade smaller or skip today.</li>
            <li>Review open trades: did any hit a stop or target? Is any past its sell-by date?</li>
            <li>Pick at most <strong>1–2 new trades</strong> from Best buys, only with high or medium confidence.</li>
            <li>Read the news on those assets. Avoid buying stocks right before an earnings report.</li>
            <li>Place a <strong>limit</strong> order, then immediately set the <strong>stop-loss</strong>.</li>
            <li>Write it down: what, why, entry, stop, target. Then close the app.</li>
          </ol>
        </section>
      </div>
    </div>
  )
}

function IdeaCard({ r, q }) {
  const price = q?.price ?? r.price
  return (
    <button className="stat" style={{ width: '100%', textAlign: 'left', border: 0, cursor: 'pointer', marginBottom: 8, display: 'block' }} onClick={() => go(`/asset/${r.symbol}`)}>
      <div className="spread">
        <div className="row" style={{ gap: 8 }}><span className="sym">{displaySymbol(r.symbol)}</span><span className="sym-name">{r.name}</span></div>
        <div className="row wrap" style={{ gap: 6, justifyContent: 'flex-end' }}><TopPickBadge show={r.topPick} /><ActionBadge action={r.action} /><ConfidenceBadge level={r.confidence} /></div>
      </div>
      <div className="small text-2" style={{ marginTop: 6 }}>{r.reason}</div>
      <div className="row wrap tiny muted" style={{ marginTop: 6, gap: 12 }}>
        <span>Now {fmtPrice(price)}</span>
        {(r.action === 'buy' || r.action === 'strong-buy') && <>
          <span>Buy ≤ {fmtPrice(r.entry)}</span><span>Stop {fmtPrice(r.stop)}</span><span>Target {fmtPrice(r.target)}</span><span>Hold ~{r.holdDays}d</span>
        </>}
        <span>Chance up: {fmtPct(r.probUp, { sign: false, digits: 0 })}</span>
        {r.strategy === 'pullback' && <span>Dip-buy setup</span>}
        {r.proven && <span>Proven ✓{r.oosWinRate != null ? ` (${fmtPct(r.oosWinRate, { sign: false, digits: 0 })} wins on unseen data)` : ''}</span>}
      </div>
    </button>
  )
}
