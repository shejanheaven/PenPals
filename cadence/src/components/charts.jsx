import { useEffect, useRef, useState } from 'react'

// Single-series column chart: thin bars rounded at the data end, 2px gaps,
// a recessive baseline, selective tick labels and a hover/tap tooltip.
// Missing values draw a small tick on the baseline so gaps read as "no data".

function useWidth() {
  const ref = useRef(null)
  const [width, setWidth] = useState(0)
  useEffect(() => {
    if (!ref.current) return
    const ro = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width))
    ro.observe(ref.current)
    return () => ro.disconnect()
  }, [])
  return [ref, width]
}

export function ColumnChart({ data, max = 1, height = 120, color = 'var(--accent)', ariaLabel, everyNth = 1, emptyLabel = 'No data yet' }) {
  const [ref, width] = useWidth()
  const [hover, setHover] = useState(null)
  const n = data.length
  const labelH = 18
  const plotH = height - labelH
  const slot = n ? width / n : 0
  const gap = Math.min(6, Math.max(2, slot * 0.28))
  const barW = Math.max(2, Math.min(28, slot - gap))
  const hasAny = data.some((d) => d.value != null)

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      {width > 0 && (
        <svg className="chart" width={width} height={height} role="img" aria-label={ariaLabel} onMouseLeave={() => setHover(null)}>
          <line x1={0} x2={width} y1={plotH + 0.5} y2={plotH + 0.5} stroke="var(--border-strong)" strokeWidth={1} />
          {data.map((d, i) => {
            const cx = i * slot + slot / 2
            const x = cx - barW / 2
            const h = d.value == null ? 0 : Math.max(3, (Math.min(d.value, max) / max) * (plotH - 6))
            const r = Math.min(4, barW / 2, h)
            const active = hover === i
            return (
              <g key={d.key}>
                {d.value == null ? (
                  <rect x={cx - 1.5} y={plotH - 3} width={3} height={3} rx={1.5} fill="var(--surface-3)" />
                ) : (
                  <path
                    d={`M${x},${plotH} V${plotH - h + r} Q${x},${plotH - h} ${x + r},${plotH - h} H${x + barW - r} Q${x + barW},${plotH - h} ${x + barW},${plotH - h + r} V${plotH} Z`}
                    fill={d.color ?? color}
                    opacity={hover == null || active ? 1 : 0.45}
                    style={{ transition: 'opacity .15s' }}
                  />
                )}
                {(i % everyNth === 0 || n <= 12) && (
                  <text x={cx} y={height - 4} textAnchor="middle" fontSize={10.5} fill="var(--text-3)" style={{ fontVariantNumeric: 'tabular-nums' }}>
                    {d.label}
                  </text>
                )}
                <rect
                  x={i * slot}
                  y={0}
                  width={slot}
                  height={height}
                  fill="transparent"
                  onMouseEnter={() => setHover(i)}
                  onClick={() => setHover(hover === i ? null : i)}
                />
              </g>
            )
          })}
        </svg>
      )}
      {!hasAny && width > 0 && (
        <div className="small faint" style={{ position: 'absolute', inset: `0 0 ${labelH}px`, display: 'grid', placeItems: 'center', pointerEvents: 'none' }}>
          {emptyLabel}
        </div>
      )}
      {hover != null && data[hover] && (
        <div
          role="tooltip"
          style={{
            position: 'absolute',
            left: Math.min(Math.max(hover * slot + slot / 2, 70), width - 70),
            top: -8,
            transform: 'translate(-50%, -100%)',
            background: 'var(--text)',
            color: 'var(--bg)',
            padding: '5px 9px',
            borderRadius: 8,
            fontSize: 12,
            fontWeight: 550,
            whiteSpace: 'nowrap',
            pointerEvents: 'none',
            boxShadow: 'var(--shadow)',
          }}
        >
          {data[hover].tip}
        </div>
      )}
    </div>
  )
}

// Horizontal bars with the label always visible beside each bar.
export function LabeledBars({ rows, ariaLabel }) {
  const max = Math.max(1, ...rows.map((r) => r.value))
  return (
    <div className="stack" style={{ gap: 9 }} role="list" aria-label={ariaLabel}>
      {rows.map((r) => (
        <div key={r.key} role="listitem" className="row-flex" style={{ gap: 10 }}>
          <span className="small" style={{ width: 64, flex: 'none', color: 'var(--text-2)', fontWeight: 550 }}>
            {r.label}
          </span>
          <span className="grow" style={{ height: 10, display: 'flex', alignItems: 'center' }}>
            <span style={{ display: 'block', height: 10, width: `${Math.max(2, (r.value / max) * 100)}%`, background: r.color, borderRadius: '2px 4px 4px 2px', transition: 'width .5s var(--ease)' }} />
          </span>
          <span className="small num" style={{ width: 54, textAlign: 'right', color: 'var(--text-2)' }}>
            {r.display ?? r.value}
          </span>
        </div>
      ))}
    </div>
  )
}
