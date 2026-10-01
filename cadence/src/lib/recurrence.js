import { diffDays, fromKey, startOfWeek, weekday, toMinutes } from './dates.js'

// An item repeats when it has a `repeat` rule:
//   { freq: 'daily' | 'weekly' | 'monthly' | 'yearly', interval?: n, days?: [0-6], until?: key }
// `item.skip` holds the keys of single occurrences the person removed.

export function occursOn(item, key) {
  if (!item || item.deleted || key < item.date) return false
  const r = item.repeat
  if (!r) return key === item.date
  if (r.until && key > r.until) return false
  if (item.skip?.[key]) return false
  const interval = Math.max(1, r.interval || 1)

  switch (r.freq) {
    case 'daily':
      return diffDays(item.date, key) % interval === 0
    case 'weekly': {
      const days = r.days?.length ? r.days : [weekday(item.date)]
      if (!days.includes(weekday(key))) return false
      if (interval === 1) return true
      const weeks = diffDays(startOfWeek(item.date, 1), startOfWeek(key, 1)) / 7
      return weeks % interval === 0
    }
    case 'monthly': {
      const s = fromKey(item.date)
      const d = fromKey(key)
      if (d.getDate() !== s.getDate()) return false
      const months = (d.getFullYear() - s.getFullYear()) * 12 + d.getMonth() - s.getMonth()
      return months % interval === 0
    }
    case 'yearly': {
      const s = fromKey(item.date)
      const d = fromKey(key)
      if (d.getDate() !== s.getDate() || d.getMonth() !== s.getMonth()) return false
      return (d.getFullYear() - s.getFullYear()) % interval === 0
    }
    default:
      return false
  }
}

export function itemsOn(items, key) {
  const out = []
  for (const item of Object.values(items)) if (occursOn(item, key)) out.push(item)
  return out.sort(compareItems)
}

// Timed items first, by start time; anytime items after, oldest first.
export function compareItems(a, b) {
  if (a.start && b.start) return toMinutes(a.start) - toMinutes(b.start) || (a.createdAt || 0) - (b.createdAt || 0)
  if (a.start) return -1
  if (b.start) return 1
  return (a.createdAt || 0) - (b.createdAt || 0)
}

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const DAY_LONG = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

export function describeRepeat(repeat, startKey) {
  if (!repeat) return 'Does not repeat'
  const n = Math.max(1, repeat.interval || 1)
  const every = (unit) => (n === 1 ? `Every ${unit}` : `Every ${n} ${unit}s`)
  switch (repeat.freq) {
    case 'daily':
      return n === 1 ? 'Every day' : every('day')
    case 'weekly': {
      const days = [...(repeat.days?.length ? repeat.days : [weekday(startKey)])].sort()
      const label = days.join() === '1,2,3,4,5' ? 'weekday' : days.join() === '0,6' ? 'weekend day' : null
      if (n === 1 && label) return `Every ${label}`
      if (n === 1 && days.length === 7) return 'Every day'
      const names = days.length === 1 ? DAY_LONG[days[0]] : days.map((d) => DAY_NAMES[d]).join(', ')
      return n === 1 ? `Every ${names}` : `${every('week')} on ${names}`
    }
    case 'monthly':
      return `${every('month')} on the ${ordinal(fromKey(startKey).getDate())}`
    case 'yearly':
      return n === 1 ? 'Every year' : every('year')
    default:
      return 'Repeats'
  }
}

// Compact form for list rows: "Daily", "Weekdays", "Mon, Wed", "Monthly".
export function shortRepeat(repeat, startKey) {
  if (!repeat) return ''
  const n = Math.max(1, repeat.interval || 1)
  if (n > 1) return describeRepeat(repeat, startKey)
  if (repeat.freq === 'daily') return 'Daily'
  if (repeat.freq === 'monthly') return 'Monthly'
  if (repeat.freq === 'yearly') return 'Yearly'
  const days = [...(repeat.days?.length ? repeat.days : [weekday(startKey)])].sort()
  if (days.join() === '1,2,3,4,5') return 'Weekdays'
  if (days.join() === '0,6') return 'Weekends'
  if (days.length === 7) return 'Daily'
  return days.length === 1 ? `${DAY_LONG[days[0]]}s` : days.map((d) => DAY_NAMES[d]).join(', ')
}

export function ordinal(n) {
  const s = ['th', 'st', 'nd', 'rd']
  const v = n % 100
  return n + (s[(v - 20) % 10] || s[v] || s[0])
}
