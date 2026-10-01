import { addDays, diffDays, fromMinutes, toKey, toMinutes, todayKey } from './dates.js'
import { uid } from './ids.js'

// iCalendar (RFC 5545) export and import. Exporting lets any phone calendar
// show Cadence events with native alerts; importing brings existing
// calendars in.

const BYDAY = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA']

const escape = (s = '') => String(s).replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/([,;])/g, '\\$1')
const unescape = (s = '') => s.replace(/\\n/gi, '\n').replace(/\\([,;\\])/g, '$1')

const stamp = (d) => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')
const dateValue = (key) => key.replace(/-/g, '')
const localDateTime = (key, hhmm) => `${dateValue(key)}T${hhmm.replace(':', '')}00`

// Lines longer than 75 octets are folded with CRLF + space.
function fold(line) {
  const bytes = new TextEncoder().encode(line)
  if (bytes.length <= 75) return line
  const parts = []
  let current = ''
  let size = 0
  for (const ch of line) {
    const n = new TextEncoder().encode(ch).length
    if (size + n > (parts.length ? 74 : 75)) {
      parts.push(current)
      current = ''
      size = 0
    }
    current += ch
    size += n
  }
  parts.push(current)
  return parts.join('\r\n ')
}

export function toICS(items, { now = new Date(), name = 'Cadence' } = {}) {
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Cadence//Mindful Planner//EN', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH', `X-WR-CALNAME:${escape(name)}`]
  for (const item of items) {
    if (item.deleted) continue
    lines.push('BEGIN:VEVENT', `UID:${item.id}@cadence.app`, `DTSTAMP:${stamp(now)}`)
    if (item.start) {
      const end = item.end && item.end > item.start ? item.end : fromMinutes(toMinutes(item.start) + 30)
      lines.push(`DTSTART:${localDateTime(item.date, item.start)}`, `DTEND:${localDateTime(item.date, end)}`)
    } else {
      lines.push(`DTSTART;VALUE=DATE:${dateValue(item.date)}`, `DTEND;VALUE=DATE:${dateValue(addDays(item.date, 1))}`)
    }
    lines.push(`SUMMARY:${escape(item.title)}`)
    if (item.notes) lines.push(`DESCRIPTION:${escape(item.notes)}`)
    if (item.repeat) {
      const r = item.repeat
      let rule = `RRULE:FREQ=${r.freq.toUpperCase()}`
      if (r.interval > 1) rule += `;INTERVAL=${r.interval}`
      if (r.freq === 'weekly' && r.days?.length) rule += `;BYDAY=${r.days.map((d) => BYDAY[d]).join(',')}`
      if (r.until) rule += item.start ? `;UNTIL=${dateValue(r.until)}T235959` : `;UNTIL=${dateValue(r.until)}`
      lines.push(rule)
      for (const key of Object.keys(item.skip ?? {})) {
        lines.push(item.start ? `EXDATE:${localDateTime(key, item.start)}` : `EXDATE;VALUE=DATE:${dateValue(key)}`)
      }
    }
    if (item.start && item.reminder != null) {
      lines.push('BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${escape(item.title)}`, `TRIGGER:-PT${item.reminder}M`, 'END:VALARM')
    }
    lines.push('END:VEVENT')
  }
  lines.push('END:VCALENDAR')
  return lines.map(fold).join('\r\n') + '\r\n'
}

// ── Import ──────────────────────────────────────────────────────────────────

function parseDateValue(value, params) {
  // 20261005 | 20261005T090000 | 20261005T090000Z
  const m = value.match(/^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})?(Z)?)?$/)
  if (!m) return null
  const [, y, mo, d, h, mi, , z] = m
  if (h == null || params.VALUE === 'DATE') return { date: `${y}-${mo}-${d}`, time: null }
  if (z) {
    const local = new Date(Date.UTC(+y, +mo - 1, +d, +h, +mi))
    return { date: toKey(local), time: fromMinutes(local.getHours() * 60 + local.getMinutes()) }
  }
  // Floating or TZID times are read as local wall-clock time.
  return { date: `${y}-${mo}-${d}`, time: `${h}:${mi}` }
}

function parseRule(value, startKey) {
  const parts = Object.fromEntries(value.split(';').map((p) => p.split('=')))
  const freq = { DAILY: 'daily', WEEKLY: 'weekly', MONTHLY: 'monthly', YEARLY: 'yearly' }[parts.FREQ]
  if (!freq) return null
  const repeat = { freq }
  if (+parts.INTERVAL > 1) repeat.interval = +parts.INTERVAL
  if (freq === 'weekly' && parts.BYDAY) {
    const days = parts.BYDAY.split(',').map((d) => BYDAY.indexOf(d.slice(-2))).filter((d) => d >= 0)
    if (days.length) repeat.days = [...new Set(days)].sort()
  }
  if (parts.UNTIL) {
    const until = parseDateValue(parts.UNTIL, {})
    if (until) repeat.until = until.date
  } else if (parts.COUNT) {
    const n = +parts.COUNT
    const span = { daily: 1, weekly: 7, monthly: 31, yearly: 366 }[freq] * (repeat.interval || 1)
    repeat.until = addDays(startKey, Math.max(0, n - 1) * span)
  }
  return repeat
}

export function fromICS(text, { today = todayKey(), keepDays = 30, defaultReminder = null } = {}) {
  const lines = text.replace(/\r\n/g, '\n').replace(/\n[ \t]/g, '').split('\n')
  const items = []
  let ev = null
  let inAlarm = false
  for (const raw of lines) {
    const line = raw.trimEnd()
    if (line === 'BEGIN:VEVENT') {
      ev = { params: {} }
      continue
    }
    if (!ev) continue
    if (line === 'BEGIN:VALARM') inAlarm = true
    else if (line === 'END:VALARM') inAlarm = false
    else if (line === 'END:VEVENT') {
      const item = toItem(ev, { today, keepDays, defaultReminder })
      if (item) items.push(item)
      ev = null
    } else {
      const idx = line.indexOf(':')
      if (idx < 0) continue
      const [name, ...paramParts] = line.slice(0, idx).split(';')
      const params = Object.fromEntries(paramParts.map((p) => p.split('=')))
      const value = line.slice(idx + 1)
      if (inAlarm) {
        if (name === 'TRIGGER' && ev.alarm == null) {
          const m = value.match(/^-?P(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?/)
          if (m) ev.alarm = (+(m[1] ?? 0)) * 1440 + (+(m[2] ?? 0)) * 60 + +(m[3] ?? 0)
        }
      } else if (name === 'EXDATE') {
        ev.exdates = [...(ev.exdates ?? []), ...value.split(',').map((v) => parseDateValue(v, params)?.date).filter(Boolean)]
      } else {
        ev[name] = value
        ev.params[name] = params
      }
    }
  }
  return items
}

function toItem(ev, { today, keepDays, defaultReminder }) {
  if (!ev.DTSTART || ev.STATUS === 'CANCELLED') return null
  const start = parseDateValue(ev.DTSTART, ev.params.DTSTART)
  if (!start) return null
  const end = ev.DTEND ? parseDateValue(ev.DTEND, ev.params.DTEND) : null
  const repeat = ev.RRULE ? parseRule(ev.RRULE, start.date) : null
  const lastDay = repeat ? repeat.until ?? '9999-12-31' : start.date
  if (diffDays(lastDay, today) > keepDays) return null

  let endTime = null
  if (start.time) {
    if (end?.time && end.date === start.date && end.time > start.time) endTime = end.time
    else if (end?.time && end.date > start.date) endTime = '23:59'
    else endTime = fromMinutes(toMinutes(start.time) + 60)
  }
  const now = Date.now()
  return {
    id: uid('it'),
    title: unescape(ev.SUMMARY ?? 'Untitled').trim() || 'Untitled',
    notes: unescape(ev.DESCRIPTION ?? '').trim(),
    date: start.date,
    start: start.time,
    end: endTime,
    area: null,
    goalId: null,
    repeat,
    reminder: start.time ? ev.alarm ?? defaultReminder : null,
    skip: Object.fromEntries((ev.exdates ?? []).map((k) => [k, true])),
    source: 'calendar',
    createdAt: now,
    updatedAt: now,
  }
}

export function downloadFile(name, content, type = 'text/plain') {
  const blob = new Blob([content], { type })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = name
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
