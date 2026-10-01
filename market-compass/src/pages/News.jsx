import { useEffect, useState } from 'react'
import NewsList from '../components/NewsList.jsx'
import { ErrorBox, Loading } from '../components/ui.jsx'
import { fetchNews } from '../lib/data.js'
import { newsScore } from '../lib/sentiment.js'
import { timeAgo } from '../lib/format.js'

export default function News() {
  const [scope, setScope] = useState('market')
  const [state, setState] = useState({ loading: true })
  const [nonce, setNonce] = useState(0)
  useEffect(() => {
    let alive = true
    setState({ loading: true })
    fetchNews({ scope }).then(d => alive && setState({ data: d })).catch(e => alive && setState({ error: e.message }))
    return () => { alive = false }
  }, [scope, nonce])
  const agg = state.data ? newsScore(state.data.items) : null
  const tone = agg == null ? null : agg.score > 0.08 ? ['good', 'Upbeat'] : agg.score < -0.08 ? ['critical', 'Worried'] : ['neutral', 'Mixed']

  return (
    <div className="stack">
      <div className="page-head">
        <h1>News that moves prices</h1>
        <p>Live headlines from Yahoo Finance, Google News, CNBC, MarketWatch, CoinDesk and Cointelegraph. Each one is scored positive or negative and tagged with why it matters. For a specific stock or coin, open it: its page has its own news.</p>
      </div>
      <div className="spread" style={{ flexWrap: 'wrap' }}>
        <div className="seg">
          {[['market', 'Stock market & economy'], ['crypto', 'Crypto']].map(([k, l]) => <button key={k} className={scope === k ? 'active' : ''} onClick={() => setScope(k)}>{l}</button>)}
        </div>
        {tone && <span className="small">Overall tone: <span className={`badge ${tone[0]}`}>{tone[1]}</span></span>}
      </div>
      <section className="card">
        {state.loading && <Loading label="Fetching live headlines…" />}
        {state.error && <ErrorBox error={state.error} onRetry={() => setNonce(n => n + 1)} />}
        {state.data && <>
          <NewsList items={state.data.items} limit={25} />
          <p className="tiny muted" style={{ marginTop: 12 }}>
            Fetched {timeAgo(state.data.fetchedAt)} · Sources: {state.data.sources.map(s => `${s.source}${s.ok ? '' : ' (unavailable)'}`).join(', ')}
          </p>
        </>}
      </section>
      <div className="card small text-2">
        <strong>The news that moves markets most:</strong> Federal Reserve interest-rate decisions (8 per year), the monthly inflation (CPI) and jobs reports, company earnings (every 3 months), and for crypto: ETF fund flows, regulation and hacks. When one of these is due, prices can jump either way. Many traders wait until after the news before opening new positions.
      </div>
    </div>
  )
}
