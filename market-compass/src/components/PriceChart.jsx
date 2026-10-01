import { useEffect, useMemo, useRef, useState } from 'react'
import { fmtDate, fmtPrice } from '../lib/format.js'

const RANGES = [['1M', 22], ['3M', 66], ['6M', 130], ['1Y', 252], ['2Y', 504], ['5Y', 1260]]

function useWidth(ref, fallback = 720) {
  const [w, setW] = useState(fallback)
  useEffect(() => {
    if (!ref.current) return
    const ro = new ResizeObserver(([e]) => setW(Math.max(280, Math.floor(e.contentRect.width))))
    ro.observe(ref.current)
    return () => ro.disconnect()
  }, [ref])
  return w
}

export function niceTicks(min, max, count = 5) {
  const span = max - min || Math.abs(max) || 1
  const raw = span / count
  const mag = 10 ** Math.floor(Math.log10(raw))
  const step = [1, 2, 2.5, 5, 10].map(m => m * mag).find(s => s >= raw) || mag * 10
  const out = []
  for (let v = Math.ceil(min / step) * step; v <= max + 1e-9; v += step) out.push(+v.toPrecision(12))
  return out
}

const axisLabel = v => {
  const a = Math.abs(v)
  if (a >= 10000) return '$' + (v / 1000).toLocaleString('en-US', { maximumFractionDigits: 1 }) + 'k'
  return fmtPrice(v).replace(/\.00$/, '')
}

export default function PriceChart({ analysis, kind, showForecast = true }) {
  const wrapRef = useRef(null)
  const width = useWidth(wrapRef)
  const [range, setRange] = useState(kind === 'crypto' ? '6M' : '6M')
  const [showSignals, setShowSignals] = useState(true)
  const [showTable, setShowTable] = useState(false)
  const [hover, setHover] = useState(null)

  const { candles, indicators: ind, forecast, plan, backtest } = analysis
  const barsPerYear = kind === 'crypto' ? 365 : 252
  const visibleBars = Math.min(candles.length, Math.round((RANGES.find(r => r[0] === range)[1] / 252) * barsPerYear))
  const start = candles.length - visibleBars
  const fDays = showForecast ? forecast.days : 0

  const height = width < 520 ? 260 : 340
  const pad = { l: 8, r: 64, t: 12, b: 28 }
  const plotW = width - pad.l - pad.r
  const plotH = height - pad.t - pad.b
  const slots = visibleBars - 1 + fDays

  const model = useMemo(() => {
    const vis = candles.slice(start)
    const price = vis.map(c => c.c)
    const s50 = ind.sma50.slice(start)
    const s200 = ind.sma200.slice(start)
    let lo = Math.min(...vis.map(c => c.c)), hi = Math.max(...vis.map(c => c.c))
    for (const v of [...s50, ...s200]) if (v != null) { lo = Math.min(lo, v); hi = Math.max(hi, v) }
    const last = price[price.length - 1]
    if (fDays) {
      lo = Math.min(lo, forecast.low95, plan.stop)
      hi = Math.max(hi, forecast.high95, plan.target)
    }
    const padY = (hi - lo) * 0.06
    lo -= padY; hi += padY
    const x = i => pad.l + (slots ? (i / slots) * plotW : 0)
    const y = v => pad.t + (1 - (v - lo) / (hi - lo)) * plotH
    const line = arr => {
      let d = '', pen = false
      arr.forEach((v, i) => {
        if (v == null) { pen = false; return }
        d += `${pen ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`
        pen = true
      })
      return d
    }
    // Forecast cone: interpolate the hold-period range back to today.
    let cone95 = '', cone68 = '', mid = ''
    if (fDays) {
      const mu = Math.log(forecast.expected / last)
      const sd = Math.log(forecast.high68 / forecast.expected)
      const pts = k => {
        const f = k / fDays
        return { m: last * Math.exp(mu * f), s: sd * Math.sqrt(f) }
      }
      const up95 = [], dn95 = [], up68 = [], dn68 = [], mids = []
      for (let k = 0; k <= fDays; k++) {
        const { m, s } = pts(k)
        const xi = x(visibleBars - 1 + k)
        up95.push(`${xi},${y(m * Math.exp(1.96 * s))}`); dn95.push(`${xi},${y(m * Math.exp(-1.96 * s))}`)
        up68.push(`${xi},${y(m * Math.exp(s))}`); dn68.push(`${xi},${y(m * Math.exp(-s))}`)
        mids.push(`${xi},${y(m)}`)
      }
      cone95 = `M${up95.join('L')}L${dn95.reverse().join('L')}Z`
      cone68 = `M${up68.join('L')}L${dn68.reverse().join('L')}Z`
      mid = `M${mids.join('L')}`
    }
    const areaD = line(price) + `L${x(price.length - 1)},${pad.t + plotH}L${x(0)},${pad.t + plotH}Z`
    const markers = showSignals ? backtest.trades.flatMap(t => {
      const out = []
      const ei = vis.findIndex(c => c.t === t.entryT)
      const xi = vis.findIndex(c => c.t === t.exitT)
      if (ei >= 0) out.push({ type: 'buy', i: ei, price: t.entry, trade: t })
      if (xi >= 0) out.push({ type: 'sell', i: xi, price: t.exit, trade: t })
      return out
    }) : []
    // Date ticks
    const xticks = []
    const nT = width < 520 ? 3 : 5
    for (let k = 0; k < nT; k++) {
      const i = Math.round((k / (nT - 1)) * (visibleBars - 1))
      xticks.push({ i, label: fmtDate(vis[i].t, visibleBars > 300 ? { month: 'short', year: '2-digit' } : { month: 'short', day: 'numeric' }) })
    }
    return { vis, price, s50, s200, lo, hi, x, y, priceD: line(price), areaD, s50D: line(s50), s200D: line(s200), cone95, cone68, mid, markers, yticks: niceTicks(lo, hi, height < 300 ? 4 : 5), xticks, last }
  }, [candles, ind, start, visibleBars, fDays, forecast, plan, backtest, showSignals, width, height, plotW, plotH, slots])

  const onMove = e => {
    const rect = e.currentTarget.getBoundingClientRect()
    const px = e.clientX - rect.left
    const i = Math.round(((px - pad.l) / plotW) * slots)
    setHover(Math.max(0, Math.min(slots, i)))
  }
  const onKey = e => {
    if (e.key === 'ArrowLeft') setHover(h => Math.max(0, (h ?? visibleBars - 1) - 1))
    else if (e.key === 'ArrowRight') setHover(h => Math.min(slots, (h ?? visibleBars - 1) + 1))
    else if (e.key === 'Escape') setHover(null)
    else return
    e.preventDefault()
  }

  const hv = hover != null && hover < visibleBars ? hover : null
  const hf = hover != null && hover >= visibleBars ? hover - (visibleBars - 1) : null
  const ttLeft = hover != null ? model.x(hover) : 0

  return (
    <div ref={wrapRef}>
      <div className="spread" style={{ flexWrap: 'wrap', marginBottom: 10 }}>
        <div className="seg" role="group" aria-label="Time range">
          {RANGES.map(([r]) => <button key={r} className={r === range ? 'active' : ''} onClick={() => setRange(r)}>{r}</button>)}
        </div>
        <div className="row small">
          <label className="row" style={{ gap: 6 }}><input type="checkbox" checked={showSignals} onChange={e => setShowSignals(e.target.checked)} /> Past signals</label>
          <button className="btn small" onClick={() => setShowTable(t => !t)}>{showTable ? 'Show chart' : 'Show table'}</button>
        </div>
      </div>

      <div className="chart-legend">
        <span className="key"><span className="line" style={{ background: 'var(--series-1)' }} />Price</span>
        <span className="key"><span className="line" style={{ background: 'var(--series-2)' }} />50-day average</span>
        <span className="key"><span className="line" style={{ background: 'var(--series-3)' }} />200-day average</span>
        {fDays > 0 && <span className="key"><span className="band" style={{ background: 'color-mix(in srgb, var(--series-1) 22%, transparent)' }} />Likely range next {fDays} days</span>}
        {showSignals && <span className="key"><span className="good">▲</span>past buy / <span className="text-2">▼</span>past sell</span>}
      </div>

      {showTable ? <ChartTable analysis={analysis} /> : (
        <div className="chart-wrap">
          <svg width={width} height={height} role="img" tabIndex={0} onKeyDown={onKey}
            aria-label={`Price chart, ${range}. Last price ${fmtPrice(model.last)}. Use arrow keys to inspect.`}
            onPointerMove={onMove} onPointerLeave={() => setHover(null)}>
            {model.yticks.map(v => (
              <g key={v}>
                <line x1={pad.l} x2={pad.l + plotW} y1={model.y(v)} y2={model.y(v)} stroke="var(--grid)" strokeWidth="1" />
                <text x={pad.l + plotW + 8} y={model.y(v) + 4} fontSize="11" fill="var(--muted)" className="tabular">{axisLabel(v)}</text>
              </g>
            ))}
            <line x1={pad.l} x2={pad.l + plotW} y1={pad.t + plotH} y2={pad.t + plotH} stroke="var(--axis)" strokeWidth="1" />
            {model.xticks.map(t => (
              <text key={t.i} x={Math.min(Math.max(model.x(t.i), pad.l + 20), pad.l + plotW - 20)} y={height - 8} fontSize="11" fill="var(--muted)" textAnchor="middle">{t.label}</text>
            ))}

            {fDays > 0 && <>
              <rect x={model.x(visibleBars - 1)} y={pad.t} width={model.x(slots) - model.x(visibleBars - 1)} height={plotH} fill="var(--surface-2)" opacity="0.6" />
              <path d={model.cone95} fill="var(--series-1)" opacity="0.08" />
              <path d={model.cone68} fill="var(--series-1)" opacity="0.14" />
              <path d={model.mid} fill="none" stroke="var(--series-1)" strokeWidth="1.5" strokeDasharray="3 4" opacity="0.8" />
              <PlanLine y={model.y(plan.target)} x1={model.x(visibleBars - 1)} x2={pad.l + plotW} color="var(--good)" label={`Target ${axisLabel(plan.target)}`} textColor="var(--good-text)" />
              <PlanLine y={model.y(plan.stop)} x1={model.x(visibleBars - 1)} x2={pad.l + plotW} color="var(--critical)" label={`Stop ${axisLabel(plan.stop)}`} textColor="var(--critical-text)" />
            </>}

            <path d={model.areaD} fill="var(--series-1)" opacity="0.07" />
            <path d={model.s200D} fill="none" stroke="var(--series-3)" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
            <path d={model.s50D} fill="none" stroke="var(--series-2)" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
            <path d={model.priceD} fill="none" stroke="var(--series-1)" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />

            {model.markers.map((m, k) => {
              const cx = model.x(m.i), cy = model.y(m.price)
              const buy = m.type === 'buy'
              const d = buy ? `M${cx},${cy + 3}l-6,10h12z` : `M${cx},${cy - 3}l-6,-10h12z`
              return <path key={k} d={d} fill={buy ? 'var(--good)' : 'var(--text-2)'} stroke="var(--surface)" strokeWidth="2" strokeLinejoin="round" />
            })}

            <circle cx={model.x(visibleBars - 1)} cy={model.y(model.last)} r="5" fill="var(--series-1)" stroke="var(--surface)" strokeWidth="2" />

            {hover != null && (
              <line x1={ttLeft} x2={ttLeft} y1={pad.t} y2={pad.t + plotH} stroke="var(--axis)" strokeWidth="1" />
            )}
            {hv != null && <circle cx={model.x(hv)} cy={model.y(model.price[hv])} r="4.5" fill="var(--series-1)" stroke="var(--surface)" strokeWidth="2" />}
          </svg>

          {hover != null && (
            <div className="tooltip" style={{ left: Math.min(Math.max(ttLeft - 80, 0), width - 190), top: 8 }}>
              {hv != null ? <>
                <div className="tiny muted" style={{ marginBottom: 4 }}>{fmtDate(model.vis[hv].t, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })}</div>
                <TT color="var(--series-1)" label="Price" value={fmtPrice(model.price[hv])} />
                {model.s50[hv] != null && <TT color="var(--series-2)" label="50-day avg" value={fmtPrice(model.s50[hv])} />}
                {model.s200[hv] != null && <TT color="var(--series-3)" label="200-day avg" value={fmtPrice(model.s200[hv])} />}
              </> : <>
                <div className="tiny muted" style={{ marginBottom: 4 }}>{hf} {kind === 'crypto' ? 'days' : 'trading days'} from now (estimate)</div>
                <TT color="var(--series-1)" label="Most likely" value={fmtPrice(forecastAt(model.last, forecast, hf, fDays).m)} />
                <TT color="var(--series-1)" label="2-in-3 chance" value={`${axisLabel(forecastAt(model.last, forecast, hf, fDays).lo68)}–${axisLabel(forecastAt(model.last, forecast, hf, fDays).hi68)}`} />
              </>}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function forecastAt(last, forecast, k, days) {
  const mu = Math.log(forecast.expected / last)
  const sd = Math.log(forecast.high68 / forecast.expected)
  const f = k / days
  const m = last * Math.exp(mu * f)
  const s = sd * Math.sqrt(f)
  return { m, lo68: m * Math.exp(-s), hi68: m * Math.exp(s) }
}

function PlanLine({ y, x1, x2, color, label, textColor }) {
  return (
    <g>
      <line x1={x1} x2={x2} y1={y} y2={y} stroke={color} strokeWidth="1.5" strokeDasharray="5 4" />
      <text x={x2 - 4} y={y - 5} fontSize="11" fontWeight="600" fill={textColor} textAnchor="end" paintOrder="stroke" stroke="var(--surface)" strokeWidth="3">{label}</text>
    </g>
  )
}

function TT({ color, label, value }) {
  return (
    <div className="tt-row">
      <span className="tt-key"><span style={{ width: 12, height: 2, background: color, display: 'inline-block' }} />{label}</span>
      <b>{value}</b>
    </div>
  )
}

function ChartTable({ analysis }) {
  const { candles, indicators: ind } = analysis
  const rows = []
  for (let i = candles.length - 1; i >= Math.max(0, candles.length - 30); i--) rows.push(i)
  return (
    <div className="table-wrap" style={{ maxHeight: 360, overflowY: 'auto' }}>
      <table className="table small">
        <thead><tr><th>Date</th><th className="num">Close</th><th className="num">50-day avg</th><th className="num">200-day avg</th><th className="num">RSI</th></tr></thead>
        <tbody>
          {rows.map(i => (
            <tr key={i}>
              <td>{fmtDate(candles[i].t)}</td>
              <td className="num">{fmtPrice(candles[i].c)}</td>
              <td className="num">{fmtPrice(ind.sma50[i])}</td>
              <td className="num">{fmtPrice(ind.sma200[i])}</td>
              <td className="num">{ind.rsi[i]?.toFixed(0) ?? '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// RSI panel: its own chart (never a second axis on the price chart).
export function RsiChart({ analysis }) {
  const wrapRef = useRef(null)
  const width = useWidth(wrapRef)
  const [hover, setHover] = useState(null)
  const n = Math.min(130, analysis.candles.length)
  const vals = analysis.indicators.rsi.slice(-n)
  const dates = analysis.candles.slice(-n)
  const h = 120, pad = { l: 8, r: 64, t: 8, b: 8 }
  const pw = width - pad.l - pad.r, ph = h - pad.t - pad.b
  const x = i => pad.l + (i / (n - 1)) * pw
  const y = v => pad.t + (1 - v / 100) * ph
  let d = '', pen = false
  vals.forEach((v, i) => { if (v == null) { pen = false; return } d += `${pen ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`; pen = true })
  const last = vals[vals.length - 1]
  return (
    <div className="chart-wrap" ref={wrapRef}>
      <svg width={width} height={h} role="img" aria-label={`RSI over the last 6 months; now ${last?.toFixed(0)}`}
        onPointerMove={e => { const r = e.currentTarget.getBoundingClientRect(); setHover(Math.max(0, Math.min(n - 1, Math.round(((e.clientX - r.left - pad.l) / pw) * (n - 1))))) }}
        onPointerLeave={() => setHover(null)}>
        <rect x={pad.l} y={y(100)} width={pw} height={y(70) - y(100)} fill="var(--critical-wash)" />
        <rect x={pad.l} y={y(30)} width={pw} height={y(0) - y(30)} fill="var(--good-wash)" />
        {[30, 50, 70].map(v => (
          <g key={v}>
            <line x1={pad.l} x2={pad.l + pw} y1={y(v)} y2={y(v)} stroke="var(--grid)" />
            <text x={pad.l + pw + 8} y={y(v) + 4} fontSize="11" fill="var(--muted)">{v}{v === 70 ? ' hot' : v === 30 ? ' cold' : ''}</text>
          </g>
        ))}
        <path d={d} fill="none" stroke="var(--series-1)" strokeWidth="2" strokeLinejoin="round" />
        {hover != null && vals[hover] != null && <>
          <line x1={x(hover)} x2={x(hover)} y1={pad.t} y2={pad.t + ph} stroke="var(--axis)" />
          <circle cx={x(hover)} cy={y(vals[hover])} r="4" fill="var(--series-1)" stroke="var(--surface)" strokeWidth="2" />
        </>}
      </svg>
      {hover != null && vals[hover] != null && (
        <div className="tooltip" style={{ left: Math.min(Math.max(x(hover) - 70, 0), width - 160), top: 0 }}>
          <div className="tiny muted">{fmtDate(dates[hover].t)}</div>
          <TT color="var(--series-1)" label="RSI" value={vals[hover].toFixed(0)} />
        </div>
      )}
    </div>
  )
}
