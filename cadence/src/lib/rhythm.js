import { fromMinutes, toMinutes, weekday } from './dates.js'

// Each person's week: per weekday (0 = Sunday) when they wake, when they go
// to bed, and whether/when they work. Nothing is assumed beyond what they set.

export function defaultDay({ wake = '07:00', sleep = '22:30' } = {}) {
  return { wake, sleep, work: false, workStart: '09:00', workEnd: '17:00' }
}

export function defaultWeek(profile = {}) {
  return Object.fromEntries(Array.from({ length: 7 }, (_, d) => [d, defaultDay(profile)]))
}

export function dayRhythm(profile, key) {
  const d = weekday(key)
  return { ...defaultDay(profile ?? {}), ...(profile?.week?.[d] ?? {}) }
}

// When the morning check-in and evening reflection happen on a given day.
export function checkinTimes(state, key) {
  const n = state.settings?.notify ?? {}
  const r = dayRhythm(state.profile, key)
  return {
    morning: n.morningAuto ? fromMinutes(toMinutes(r.wake) + 15) : n.morning,
    evening: n.eveningAuto ? fromMinutes(Math.max(toMinutes(r.wake) + 60, toMinutes(r.sleep) - 60)) : n.evening,
  }
}

// Turn the work days of a week into as few repeating "Work" blocks as
// possible: days with the same hours share one item.
export function workBlocks(week) {
  const groups = new Map()
  for (let d = 0; d < 7; d++) {
    const day = week?.[d]
    if (!day?.work || !day.workStart || !day.workEnd || day.workEnd <= day.workStart) continue
    const k = `${day.workStart}-${day.workEnd}`
    groups.set(k, [...(groups.get(k) ?? []), d])
  }
  return [...groups].map(([k, days]) => {
    const [start, end] = k.split('-')
    return { title: 'Work', start, end, area: 'work', repeat: { freq: 'weekly', days } }
  })
}
