import { useMemo, useState } from 'react'
import IdeaTable, { rankBuys, rankSells, rankTop } from '../components/IdeaTable.jsx'
import ReportCard from '../components/ReportCard.jsx'
import { useLive } from '../components/ui.jsx'
import { runScan, useScan } from '../lib/analysis.js'
import { timeAgo } from '../lib/format.js'

export default function Ideas({ query }) {
  const scan = useScan()
  const [view, setView] = useState(query.get('view') || 'top')
  const [kind, setKind] = useState('all')
  const results = Object.values(scan.results).filter(r => kind === 'all' || r.kind === kind)
  const rows = useMemo(() => {
    if (view === 'top') return rankTop(results)
    if (view === 'buy') return rankBuys(results)
    if (view === 'sell') return rankSells(results)
    return [...results].sort((a, b) => b.score - a.score)
  }, [scan.results, view, kind])
  const { quotes } = useLive(rows.slice(0, 40).map(r => r.symbol))

  return (
    <div className="stack">
      <div className="page-head">
        <h1>Trade ideas</h1>
        <p>Every asset below is scored daily from real prices, volume, news and the overall market mood. Strongest setups come first. Tap any row for the full plan: entry, stop-loss, target, how long to hold, and how to do it in your app.</p>
      </div>
      <div className="spread" style={{ flexWrap: 'wrap' }}>
        <div className="row wrap">
          <div className="seg" role="group" aria-label="Signal">
            {[['top', '★ Top picks'], ['buy', 'All buys'], ['sell', 'Sell / avoid'], ['all', 'Everything']].map(([k, l]) => <button key={k} className={view === k ? 'active' : ''} onClick={() => setView(k)}>{l}</button>)}
          </div>
          <div className="seg" role="group" aria-label="Asset type">
            {[['all', 'All'], ['stock', 'Stocks'], ['crypto', 'Crypto']].map(([k, l]) => <button key={k} className={kind === k ? 'active' : ''} onClick={() => setKind(k)}>{l}</button>)}
          </div>
        </div>
        <div className="row small muted">
          {scan.status === 'running' ? `${scan.phase || 'Scanning'} ${scan.done}/${scan.total}…` : scan.finishedAt ? `Updated ${timeAgo(scan.finishedAt)}` : ''}
          <button className="btn small" onClick={() => runScan(true)} disabled={scan.status === 'running'}>Refresh</button>
        </div>
      </div>
      {scan.status === 'running' && <div className="progress"><span style={{ width: `${(scan.done / Math.max(1, scan.total)) * 100}%` }} /></div>}
      <section className="card flush">
        <IdeaTable rows={rows} quotes={quotes} empty={scan.status === 'running' ? 'Scanning…' : view === 'top' ? 'No top picks right now: nothing passes every check today. That is the filter working. Check "All buys" for weaker setups, or wait.' : view === 'buy' ? 'No buy signals right now. Waiting is fine.' : 'Nothing here right now.'} />
      </section>
      {scan.status === 'done' && (
        <section className="card">
          <div className="card-head"><h2>📋 Report card: was the app right?</h2><span className="tiny muted">all {Object.keys(scan.results).length} assets</span></div>
          <ReportCard results={Object.values(scan.results)} calibration={scan.calibration} />
        </section>
      )}
      {Object.keys(scan.errors).length > 0 && (
        <p className="tiny muted">Couldn't load: {Object.entries(scan.errors).map(([s, e]) => `${s} (${e})`).join(', ')}</p>
      )}
      <div className="card small text-2">
        <strong>★ Top picks</strong> must pass every check: a buy signal, a strategy that made money on this asset in older <em>and</em> recent unseen data, a healthy overall market, and no earnings report before the planned exit. Expect only a few at a time, and some days none. <strong>How to read this:</strong> <em>Signal</em> is what the numbers say today. <em>Strength</em> is how strongly the indicators agree. <em>Hold</em> is how long similar trades on that asset usually lasted. <em>Past wins</em> is the share of the app's past trades on that asset that made money, after fees. A "Sell" means sell if you own it, or don't buy. The app never suggests short-selling, which can lose more than you put in.
      </div>
    </div>
  )
}
