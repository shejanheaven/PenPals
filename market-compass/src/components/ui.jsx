import { useEffect, useMemo, useState } from 'react'
import { ACTIONS } from '../lib/signals.js'
import { fmtPct } from '../lib/format.js'
import { liveHub } from '../lib/data.js'
import { marketStatusFor } from '../lib/marketHours.js'

// ---- Routing (hash based: #/asset/BTC-USD) ----------------------------------

export function useRoute() {
  const [hash, setHash] = useState(() => location.hash || '#/')
  useEffect(() => {
    const on = () => { setHash(location.hash || '#/'); window.scrollTo(0, 0) }
    window.addEventListener('hashchange', on)
    return () => window.removeEventListener('hashchange', on)
  }, [])
  const [path, query = ''] = hash.slice(1).split('?')
  const parts = path.split('/').filter(Boolean).map(decodeURIComponent)
  return { parts, query: new URLSearchParams(query) }
}

export const go = path => { location.hash = path }

// ---- Live prices ------------------------------------------------------------

export function useLive(symbols) {
  const key = [...new Set(symbols)].sort().join(',')
  const [snap, setSnap] = useState({ quotes: liveHub.quotes, status: liveHub.status })
  useEffect(() => {
    if (!key) return
    return liveHub.subscribe(key.split(','), (quotes, status) => setSnap({ quotes, status }))
  }, [key])
  return snap
}

export function useNow(ms = 30000) {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), ms)
    return () => clearInterval(t)
  }, [ms])
  return now
}

// ---- Small display pieces ---------------------------------------------------

const ACTION_ICON = { good: '▲', critical: '▼', neutral: '■' }

export function ActionBadge({ action, large = false }) {
  const a = ACTIONS[action] || ACTIONS.hold
  return (
    <span className={`badge ${a.tone}${large ? ' lg' : ''}`}>
      <span aria-hidden="true">{ACTION_ICON[a.tone]}</span>{a.label}
    </span>
  )
}

export function TopPickBadge({ show = true }) {
  if (!show) return null
  return <span className="badge accent" title="Buy signal + a strategy proven on this asset (including on data it never saw) + a healthy market + no earnings in the way">★ Top pick</span>
}

const CONF = { high: ['good', 'High confidence'], medium: ['accent', 'Medium confidence'], low: ['neutral', 'Low confidence'] }
export function ConfidenceBadge({ level }) {
  const [tone, label] = CONF[level] || CONF.low
  return <span className={`badge ${tone}`}>{label}</span>
}

export function Change({ value, className = '' }) {
  if (value == null) return <span className={`muted ${className}`}>—</span>
  return (
    <span className={`${value > 0 ? 'good' : value < 0 ? 'bad' : 'muted'} tabular ${className}`}>
      <span aria-hidden="true">{value > 0 ? '▲ ' : value < 0 ? '▼ ' : ''}</span>{fmtPct(value, { digits: 2 })}
    </span>
  )
}

export function LiveDot({ live }) {
  return <span className={`dot ${live ? 'live' : 'off'}`} title={live ? 'Streaming live' : 'Updates every 15 seconds'} />
}

export function MarketPill({ kind }) {
  const now = useNow()
  const s = marketStatusFor(kind, now)
  return (
    <span className="pill"><span className={`dot ${s.open ? 'live' : 'off'}`} />
      {kind === 'crypto' ? 'Crypto' : 'US stocks'}: {s.label}
    </span>
  )
}

// Single-series sparkline. The title/row already names the series.
export function Sparkline({ data, width = 96, height = 28, up }) {
  const path = useMemo(() => {
    const pts = (data || []).filter(v => v != null)
    if (pts.length < 2) return null
    const min = Math.min(...pts), max = Math.max(...pts)
    const span = max - min || 1
    return pts.map((v, i) => `${i ? 'L' : 'M'}${(i / (pts.length - 1)) * (width - 4) + 2},${height - 3 - ((v - min) / span) * (height - 6)}`).join('')
  }, [data, width, height])
  if (!path) return <svg width={width} height={height} aria-hidden="true" />
  const rising = up ?? (data[data.length - 1] >= data[0])
  return (
    <svg width={width} height={height} aria-hidden="true">
      <path d={path} fill="none" stroke={rising ? 'var(--good)' : 'var(--critical)'} strokeWidth="1.6" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  )
}

export function Stat({ label, value, sub, className = '' }) {
  return (
    <div className={`stat ${className}`}>
      <div className="stat-label">{label}</div>
      <div className="stat-value">{value}</div>
      {sub && <div className="stat-sub">{sub}</div>}
    </div>
  )
}

export function ScoreMeter({ score }) {
  const pct = ((Math.max(-1, Math.min(1, score)) + 1) / 2) * 100
  return (
    <div>
      <div className="score-meter" role="img" aria-label={`Signal score ${score.toFixed(2)} from -1 to +1`}>
        <span className="needle" style={{ left: `${pct}%` }} />
      </div>
      <div className="spread tiny muted" style={{ marginTop: 6 }}>
        <span>Strong sell</span><span>Wait</span><span>Strong buy</span>
      </div>
    </div>
  )
}

export function Loading({ label = 'Loading real market data…', height = 120 }) {
  return (
    <div className="stack-sm" aria-busy="true">
      <div className="skeleton" style={{ height }} />
      <div className="tiny muted">{label}</div>
    </div>
  )
}

export function ErrorBox({ error, onRetry }) {
  return (
    <div className="banner bad">
      <span aria-hidden="true">⚠️</span>
      <div>
        <div><strong>Couldn't load data.</strong> {error}</div>
        <div className="row wrap" style={{ marginTop: 8 }}>
          {onRetry && <button className="btn small" onClick={onRetry}>Try again</button>}
        </div>
      </div>
    </div>
  )
}

export function Term({ children, tip }) {
  return <span className="glossary-term" title={tip}>{children}</span>
}
