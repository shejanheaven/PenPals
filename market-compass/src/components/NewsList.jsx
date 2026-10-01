import { useState } from 'react'
import { CATEGORIES, whyItMatters } from '../lib/sentiment.js'
import { timeAgo } from '../lib/format.js'

const IMPACT = { high: ['critical', 'High impact'], medium: ['warn', 'Medium impact'], low: ['neutral', 'Low impact'] }

export function SentimentChip({ value }) {
  const cls = value > 0.15 ? 'pos' : value < -0.15 ? 'neg' : 'neu'
  const label = value > 0.15 ? 'Positive' : value < -0.15 ? 'Negative' : 'Neutral'
  return <span className={`senti ${cls}`} title={`${label} headline`} aria-label={label}>{cls === 'pos' ? '+' : cls === 'neg' ? '−' : '•'}</span>
}

export default function NewsList({ items, limit = 12, filter = true }) {
  const [impact, setImpact] = useState('all')
  const [more, setMore] = useState(false)
  if (!items?.length) return <p className="muted small">No recent headlines found.</p>
  const shown = items.filter(i => impact === 'all' || (impact === 'high' ? i.impact === 'high' : i.impact !== 'low'))
  const list = more ? shown : shown.slice(0, limit)
  return (
    <div>
      {filter && (
        <div className="seg" style={{ marginBottom: 6 }}>
          {[['all', 'All'], ['important', 'Medium + high'], ['high', 'High impact']].map(([k, l]) => (
            <button key={k} className={impact === k ? 'active' : ''} onClick={() => setImpact(k)}>{l}</button>
          ))}
        </div>
      )}
      <div>
        {list.map((n, i) => (
          <article className="news-item" key={n.link + i}>
            <SentimentChip value={n.sentiment} />
            <div style={{ minWidth: 0 }}>
              <a href={n.link} target="_blank" rel="noreferrer noopener">{n.title}</a>
              <div className="news-meta">
                <span>{n.source}</span>
                <span>·</span>
                <span>{timeAgo(n.time)}</span>
                <span className={`badge ${IMPACT[n.impact][0]}`}>{IMPACT[n.impact][1]}</span>
                <span className="badge neutral">{CATEGORIES[n.category]?.label || 'General'}</span>
              </div>
              <details className="why">
                <summary>Why this matters ›</summary>
                <p>{whyItMatters(n.category)}</p>
              </details>
            </div>
          </article>
        ))}
      </div>
      {shown.length > limit && (
        <button className="btn small" style={{ marginTop: 10 }} onClick={() => setMore(m => !m)}>{more ? 'Show fewer' : `Show all ${shown.length}`}</button>
      )}
    </div>
  )
}
