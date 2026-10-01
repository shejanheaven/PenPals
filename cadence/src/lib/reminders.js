import { addDays, atTime, fmtRange, fmtTime, startOfWeek, toKey } from './dates.js'
import { itemsOn } from './recurrence.js'
import { hash } from './ids.js'

// Every notification Cadence will send in the coming hours, computed from
// state alone. The phone's service worker (local) and the push server both
// use this list, and share `tag`s so a reminder never shows twice.

const NUDGES = [
  'Take a breath, then begin.',
  'Arrive fully. One thing at a time.',
  'Notice how you feel, then begin.',
  'Gently, and on purpose.',
  'Here and now.',
  'Soft shoulders. Slow breath. Begin.',
]

const PAUSES = [
  'Pause. Three slow breaths.',
  'Unclench your jaw. Drop your shoulders.',
  'Where is your attention right now?',
  'Look up. Notice five things around you.',
  'Is this what matters most right now?',
]

export function leadLabel(min) {
  if (min === 0) return 'At start'
  if (min < 60) return `${min} min before`
  if (min === 60) return '1 hr before'
  if (min % 1440 === 0) return `${min / 1440} day${min === 1440 ? '' : 's'} before`
  return `${min / 60} hr before`
}

export function upcomingReminders(state, { now = new Date(), hours = 48 } = {}) {
  const notify = state.settings?.notify ?? {}
  const until = new Date(now.getTime() + hours * 3600e3)
  const out = []
  const push = (r) => {
    if (r.at > now && r.at <= until) out.push(r)
  }
  const weekStart = state.settings?.weekStart ?? 1

  for (let key = toKey(now); key <= toKey(until); key = addDays(key, 1)) {
    const dayItems = itemsOn(state.items, key)

    for (const item of dayItems) {
      if (!item.start || item.reminder == null) continue
      if (state.checks?.[`${item.id}|${key}`]?.status) continue
      const at = new Date(atTime(key, item.start).getTime() - item.reminder * 60e3)
      const lead =
        item.reminder === 0
          ? `Starting now · ${fmtRange(item.start, item.end)}`
          : `Starts ${fmtTime(item.start)}, in ${leadLabel(item.reminder).replace(' before', '')}`
      push({
        id: `item:${item.id}:${key}:${at.getTime()}`,
        tag: `item:${item.id}:${key}`,
        kind: 'item',
        at,
        title: item.title,
        body: `${lead}\n${NUDGES[hash(item.id + key) % NUDGES.length]}`,
        url: `/?open=${item.id}&date=${key}`,
        data: { itemId: item.id, date: key },
      })
    }

    if (notify.morningOn && notify.morning) {
      const timed = dayItems.filter((i) => i.start)
      const count = dayItems.length
      const first = timed.find((i) => i.start >= notify.morning) ?? timed[0]
      let body = 'Set an intention for today.'
      if (count) {
        body = `${count} ${count === 1 ? 'thing' : 'things'} on your day.`
        if (first) body += ` First up: ${first.title} at ${fmtTime(first.start)}.`
        body += ' Set your intention.'
      }
      push({ id: `morning:${key}`, tag: `morning:${key}`, kind: 'morning', at: atTime(key, notify.morning), title: 'Good morning', body, url: '/?checkin=morning' })
    }

    if (notify.pauses) {
      for (const [i, time] of (notify.pauseTimes ?? []).entries()) {
        push({ id: `pause:${key}:${time}`, tag: `pause:${key}:${i}`, kind: 'pause', at: atTime(key, time), title: 'A mindful moment', body: PAUSES[hash(key + time) % PAUSES.length], url: '/?breathe=1' })
      }
    }

    if (notify.eveningOn && notify.evening) {
      const endOfWeek = addDays(startOfWeek(key, weekStart), 6) === key
      const weekly = endOfWeek && notify.weeklyReview
      push({
        id: `evening:${key}`,
        tag: `evening:${key}`,
        kind: 'evening',
        at: atTime(key, notify.evening),
        title: weekly ? 'Your weekly review' : 'How was today?',
        body: weekly ? 'Look back on your week, and choose what matters next.' : 'Take a quiet minute to reflect, and let the day go.',
        url: weekly ? '/reflect?period=week' : '/reflect',
      })
    }
  }

  return out.sort((a, b) => a.at - b.at)
}
