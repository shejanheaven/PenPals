// Calendar helpers. Every schedule date is a local calendar day stored as a
// "YYYY-MM-DD" key, and every time of day is "HH:MM" (24h). Keys sort
// lexicographically, which keeps comparisons cheap and timezone-proof.

const pad = (n) => String(n).padStart(2, '0')

export function toKey(d) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

export function fromKey(key) {
  const [y, m, d] = key.split('-').map(Number)
  return new Date(y, m - 1, d)
}

export const todayKey = (now = new Date()) => toKey(now)

export function addDays(key, n) {
  const d = fromKey(key)
  d.setDate(d.getDate() + n)
  return toKey(d)
}

export const daysInMonth = (year, month0) => new Date(year, month0 + 1, 0).getDate()

export function addMonths(key, n) {
  const d = fromKey(key)
  const day = d.getDate()
  d.setDate(1)
  d.setMonth(d.getMonth() + n)
  d.setDate(Math.min(day, daysInMonth(d.getFullYear(), d.getMonth())))
  return toKey(d)
}

// Whole days since the epoch, computed in UTC so DST never skews a difference.
export function dayIndex(key) {
  const [y, m, d] = key.split('-').map(Number)
  return Math.round(Date.UTC(y, m - 1, d) / 86400000)
}

export const diffDays = (a, b) => dayIndex(b) - dayIndex(a)

export const weekday = (key) => fromKey(key).getDay() // 0 = Sunday

export function startOfWeek(key, weekStart = 1) {
  return addDays(key, -((weekday(key) - weekStart + 7) % 7))
}

export function weekDays(key, weekStart = 1) {
  const start = startOfWeek(key, weekStart)
  return Array.from({ length: 7 }, (_, i) => addDays(start, i))
}

export const monthOf = (key) => key.slice(0, 7) // "2026-10"
export const yearOf = (key) => key.slice(0, 4) // "2026"

export function monthDays(month) {
  const [y, m] = month.split('-').map(Number)
  return Array.from({ length: daysInMonth(y, m - 1) }, (_, i) => `${month}-${pad(i + 1)}`)
}

// Six full weeks covering the month, as rows of seven day keys.
export function monthGrid(month, weekStart = 1) {
  const first = startOfWeek(`${month}-01`, weekStart)
  return Array.from({ length: 6 }, (_, w) =>
    Array.from({ length: 7 }, (_, d) => addDays(first, w * 7 + d)),
  )
}

export function addMonthKey(month, n) {
  return addMonths(`${month}-01`, n).slice(0, 7)
}

export function rangeKeys(from, to) {
  const out = []
  for (let k = from; k <= to; k = addDays(k, 1)) out.push(k)
  return out
}

// ── Time of day ─────────────────────────────────────────────────────────────

export function toMinutes(hhmm) {
  if (!hhmm) return null
  const [h, m] = hhmm.split(':').map(Number)
  return h * 60 + m
}

export function fromMinutes(mins) {
  const m = Math.max(0, Math.min(24 * 60 - 1, Math.round(mins)))
  return `${pad(Math.floor(m / 60))}:${pad(m % 60)}`
}

export const nowMinutes = (now = new Date()) => now.getHours() * 60 + now.getMinutes()

export function atTime(key, hhmm) {
  const d = fromKey(key)
  const mins = toMinutes(hhmm) ?? 0
  d.setHours(Math.floor(mins / 60), mins % 60, 0, 0)
  return d
}

// ── Formatting ──────────────────────────────────────────────────────────────

let clock24 = false
export function setClock24(v) {
  clock24 = !!v
}

export function fmtTime(hhmm, { compact = false } = {}) {
  if (!hhmm) return ''
  const mins = toMinutes(hhmm)
  const h = Math.floor(mins / 60)
  const m = mins % 60
  if (clock24) return `${pad(h)}:${pad(m)}`
  const suffix = h < 12 ? 'AM' : 'PM'
  const h12 = h % 12 === 0 ? 12 : h % 12
  if (compact) return m === 0 ? `${h12}${suffix.toLowerCase()}` : `${h12}:${pad(m)}${suffix.toLowerCase()}`
  return `${h12}:${pad(m)} ${suffix}`
}

export function fmtRange(start, end) {
  if (!start) return 'Anytime'
  if (!end) return fmtTime(start)
  return `${fmtTime(start)} – ${fmtTime(end)}`
}

export function fmtDuration(mins) {
  if (mins == null || mins <= 0) return ''
  const h = Math.floor(mins / 60)
  const m = mins % 60
  if (!h) return `${m} min`
  if (!m) return `${h} hr`
  return `${h} hr ${m} min`
}

const fmtCache = new Map()
function formatter(opts) {
  const id = JSON.stringify(opts)
  if (!fmtCache.has(id)) fmtCache.set(id, new Intl.DateTimeFormat(undefined, opts))
  return fmtCache.get(id)
}

export const fmtDate = (key, opts = { weekday: 'long', month: 'long', day: 'numeric' }) =>
  formatter(opts).format(fromKey(key))

export function fmtMonth(month, opts = { month: 'long', year: 'numeric' }) {
  return formatter(opts).format(fromKey(`${month}-01`))
}

export function weekdayLabels(weekStart = 1, style = 'short') {
  // 2023-01-01 was a Sunday.
  return Array.from({ length: 7 }, (_, i) =>
    formatter({ weekday: style }).format(new Date(2023, 0, 1 + ((i + weekStart) % 7))),
  )
}

export function fmtRelative(key, today = todayKey()) {
  const diff = diffDays(today, key)
  if (diff === 0) return 'Today'
  if (diff === 1) return 'Tomorrow'
  if (diff === -1) return 'Yesterday'
  if (diff > 1 && diff < 7) return fmtDate(key, { weekday: 'long' })
  const sameYear = yearOf(key) === yearOf(today)
  return fmtDate(key, sameYear ? { weekday: 'short', month: 'short', day: 'numeric' } : { month: 'short', day: 'numeric', year: 'numeric' })
}

export function fmtWeekRange(weekStartKey) {
  const end = addDays(weekStartKey, 6)
  const a = fromKey(weekStartKey)
  const b = fromKey(end)
  if (a.getMonth() === b.getMonth()) {
    return `${formatter({ month: 'short' }).format(a)} ${a.getDate()} – ${b.getDate()}`
  }
  return `${formatter({ month: 'short', day: 'numeric' }).format(a)} – ${formatter({ month: 'short', day: 'numeric' }).format(b)}`
}

export function greeting(now = new Date()) {
  const h = now.getHours()
  if (h < 5) return 'Still up'
  if (h < 12) return 'Good morning'
  if (h < 17) return 'Good afternoon'
  if (h < 22) return 'Good evening'
  return 'Good night'
}

// Fraction of the year (or month) that has passed, for gentle "time is moving" cues.
export function yearProgress(now = new Date()) {
  const y = now.getFullYear()
  const start = new Date(y, 0, 1)
  const end = new Date(y + 1, 0, 1)
  return (now - start) / (end - start)
}

export function daysLeftInYear(key) {
  return diffDays(key, `${yearOf(key)}-12-31`)
}

// Locales that write day before month (e.g. en-GB "5/10" = 5 October).
export function localeDayFirst() {
  try {
    const parts = new Intl.DateTimeFormat(undefined).formatToParts(new Date(2026, 9, 5))
    const order = parts.filter((p) => p.type === 'day' || p.type === 'month').map((p) => p.type)
    return order[0] === 'day'
  } catch {
    return false
  }
}
