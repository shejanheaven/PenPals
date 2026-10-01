export function fmtPrice(p) {
  if (p == null || !isFinite(p)) return '—'
  if (p === 0) return '$0'
  const abs = Math.abs(p)
  const digits = abs >= 1000 ? 2 : abs >= 1 ? 2 : abs >= 0.01 ? 4 : 6
  return '$' + p.toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits })
}

export function fmtMoney(v, { sign = false } = {}) {
  if (v == null || !isFinite(v)) return '—'
  const s = Math.abs(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  return `${v < 0 ? '−' : sign && v > 0 ? '+' : ''}$${s}`
}

export function fmtPct(v, { sign = true, digits = 1 } = {}) {
  if (v == null || !isFinite(v)) return '—'
  const s = Math.abs(v * 100).toFixed(digits)
  return `${v < 0 ? '−' : sign && v > 0 ? '+' : ''}${s}%`
}

export function fmtCompact(v) {
  if (v == null || !isFinite(v)) return '—'
  return Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 }).format(v)
}

export function fmtUnits(units, kind) {
  if (units == null) return '—'
  if (kind === 'crypto') return units >= 1 ? units.toFixed(4) : units.toPrecision(4)
  return units >= 10 ? units.toFixed(0) : units.toFixed(2)
}

export function fmtDate(t, opts = { month: 'short', day: 'numeric', year: 'numeric' }) {
  return new Date(t).toLocaleDateString('en-US', opts)
}

export function timeAgo(t, now = Date.now()) {
  const s = Math.max(0, (now - t) / 1000)
  if (s < 60) return 'just now'
  if (s < 3600) return `${Math.floor(s / 60)}m ago`
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`
  return `${Math.floor(s / 86400)}d ago`
}

export function addTradingDays(from, days, kind) {
  const d = new Date(from)
  let left = days
  while (left > 0) {
    d.setDate(d.getDate() + 1)
    if (kind === 'crypto' || (d.getDay() !== 0 && d.getDay() !== 6)) left--
  }
  return d
}
