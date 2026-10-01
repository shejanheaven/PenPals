import { describe, expect, it } from 'vitest'
import { upcomingReminders } from '../src/lib/reminders.js'
import { fromICS, toICS } from '../src/lib/ics.js'
import { dayStats, goalProgress, streak, goalsFor } from '../src/lib/stats.js'
import { mergeStates, pruneTombstones, sameContent } from '../src/lib/merge.js'

const base = (over = {}) => ({
  items: {},
  goals: {},
  checks: {},
  days: {},
  reviews: {},
  inbox: {},
  profile: { updatedAt: 1 },
  settings: { weekStart: 1, notify: { morningOn: true, morning: '08:00', eveningOn: true, evening: '21:00', weeklyReview: true, pauses: false }, updatedAt: 1 },
  ...over,
})

describe('reminders', () => {
  it('schedules item, morning and evening reminders in order', () => {
    const state = base({
      items: { a: { id: 'a', title: 'Deep work', date: '2026-10-01', start: '09:00', end: '11:00', reminder: 10 } },
    })
    const now = new Date(2026, 9, 1, 7, 0)
    const list = upcomingReminders(state, { now, hours: 26 })
    expect(list.map((r) => r.kind)).toEqual(['morning', 'item', 'evening', 'morning'])
    expect(list[1].at.getHours()).toBe(8)
    expect(list[1].at.getMinutes()).toBe(50)
    expect(list[0].body).toContain('Deep work')
  })

  it('skips finished occurrences and past times', () => {
    const state = base({
      items: { a: { id: 'a', title: 'Walk', date: '2026-10-01', start: '12:00', reminder: 0, repeat: { freq: 'daily' } } },
      checks: { 'a|2026-10-01': { status: 'done', updatedAt: 1 } },
    })
    const list = upcomingReminders(state, { now: new Date(2026, 9, 1, 10, 0), hours: 30 }).filter((r) => r.kind === 'item')
    expect(list).toHaveLength(1)
    expect(list[0].data.date).toBe('2026-10-02')
  })

  it('turns the last evening of the week into a weekly review', () => {
    const list = upcomingReminders(base(), { now: new Date(2026, 9, 4, 12, 0), hours: 12 }) // Sunday
    expect(list.find((r) => r.kind === 'evening').title).toBe('Your weekly review')
  })
})

describe('ics', () => {
  it('round-trips events, repeats, skips and alarms', () => {
    const items = [
      { id: 'a', title: 'Standup, daily; quick', notes: 'Line 1\nLine 2', date: '2026-10-01', start: '09:00', end: '09:15', reminder: 5, repeat: { freq: 'weekly', days: [1, 3, 5] }, skip: { '2026-10-05': true } },
      { id: 'b', title: 'Call mom', date: '2026-10-04', start: null, end: null, reminder: null, repeat: null },
    ]
    const text = toICS(items)
    expect(text).toContain('RRULE:FREQ=WEEKLY;BYDAY=MO,WE,FR')
    expect(text).toContain('TRIGGER:-PT5M')
    const back = fromICS(text, { today: '2026-10-01' })
    expect(back).toHaveLength(2)
    expect(back[0]).toMatchObject({ title: 'Standup, daily; quick', notes: 'Line 1\nLine 2', start: '09:00', end: '09:15', reminder: 5, repeat: { freq: 'weekly', days: [1, 3, 5] }, skip: { '2026-10-05': true } })
    expect(back[1]).toMatchObject({ title: 'Call mom', date: '2026-10-04', start: null })
  })

  it('folds long lines and skips old events', () => {
    const long = 'x'.repeat(200)
    const text = toICS([{ id: 'a', title: long, date: '2020-01-01', start: '09:00', end: '10:00' }])
    expect(text.split('\r\n').every((l) => new TextEncoder().encode(l).length <= 75)).toBe(true)
    expect(fromICS(text, { today: '2026-10-01' })).toHaveLength(0)
    expect(fromICS(text, { today: '2020-01-02' })[0].title).toBe(long)
  })
})

describe('stats', () => {
  const state = base({
    items: {
      r: { id: 'r', title: 'Read', date: '2026-09-25', start: null, repeat: { freq: 'daily' }, goalId: 'g' },
      t: { id: 't', title: 'Task', date: '2026-10-01', start: null },
    },
    checks: {
      'r|2026-09-28': { status: 'done' },
      'r|2026-09-29': { status: 'skipped' },
      'r|2026-09-30': { status: 'done' },
      'r|2026-10-01': { status: 'done' },
    },
    goals: {
      g: { id: 'g', title: 'Read more', horizon: 'month', period: '2026-10', measure: 'count', target: 20, autoCount: true },
      w: { id: 'w', title: 'Week goal', horizon: 'week', period: '2026-09-28' },
    },
  })

  it('computes day completion', () => {
    expect(dayStats(state, '2026-10-01')).toMatchObject({ done: 1, total: 2, rate: 0.5 })
  })

  it('counts streaks without punishing skips or today', () => {
    expect(streak(state, state.items.r, '2026-10-01')).toBe(3)
    expect(streak(state, state.items.r, '2026-10-02')).toBe(3)
  })

  it('auto-counts linked activity within the goal period', () => {
    expect(goalProgress(state, state.goals.g)).toMatchObject({ value: 1, target: 20 })
  })

  it('finds week goals for any week start', () => {
    expect(goalsFor(state, 'week', '2026-10-01', 1).map((g) => g.id)).toEqual(['w'])
    expect(goalsFor(state, 'week', '2026-10-01', 0).map((g) => g.id)).toEqual(['w'])
  })
})

describe('merge', () => {
  it('keeps the newest version of each entity from both sides', () => {
    const a = base({ items: { x: { id: 'x', title: 'A', updatedAt: 5 }, y: { id: 'y', title: 'only local', updatedAt: 1 } } })
    const b = base({ items: { x: { id: 'x', title: 'B', updatedAt: 9 }, z: { id: 'z', title: 'only remote', updatedAt: 1 } }, profile: { name: 'R', updatedAt: 7 } })
    const m = mergeStates(a, b)
    expect(m.items.x.title).toBe('B')
    expect(Object.keys(m.items).sort()).toEqual(['x', 'y', 'z'])
    expect(m.profile.name).toBe('R')
    expect(sameContent(m, mergeStates(b, a))).toBe(true)
    expect(sameContent(m, a)).toBe(false)
  })

  it('lets deletions win when newer and prunes old tombstones', () => {
    const a = base({ items: { x: { id: 'x', title: 'A', updatedAt: 5 } } })
    const b = base({ items: { x: { id: 'x', deleted: true, updatedAt: 6 } } })
    const m = mergeStates(a, b)
    expect(m.items.x.deleted).toBe(true)
    expect(pruneTombstones(m, 6 + 61 * 86400e3).items).toEqual({})
  })
})

import { checkinTimes, dayRhythm, workBlocks } from '../src/lib/rhythm.js'

describe('rhythm', () => {
  const week = {
    0: { wake: '09:30', sleep: '23:30', work: false },
    3: { wake: '06:00', sleep: '22:00', work: true, workStart: '07:00', workEnd: '15:00' },
    4: { wake: '06:00', sleep: '22:00', work: true, workStart: '07:00', workEnd: '15:00' },
    5: { wake: '08:00', sleep: '23:00', work: true, workStart: '10:00', workEnd: '18:00' },
    6: { wake: '06:00', sleep: '22:00', work: true, workStart: '07:00', workEnd: '15:00' },
  }

  it('groups work days with the same hours into one block', () => {
    expect(workBlocks(week)).toEqual([
      { title: 'Work', start: '07:00', end: '15:00', area: 'work', repeat: { freq: 'weekly', days: [3, 4, 6] } },
      { title: 'Work', start: '10:00', end: '18:00', area: 'work', repeat: { freq: 'weekly', days: [5] } },
    ])
  })

  it('times check-ins from each day’s own wake and bed time', () => {
    const state = { profile: { week }, settings: { notify: { morningAuto: true, eveningAuto: true, morning: '08:00', evening: '21:00' } } }
    expect(checkinTimes(state, '2026-09-30')).toEqual({ morning: '06:15', evening: '21:00' }) // Wednesday
    expect(checkinTimes(state, '2026-10-04')).toEqual({ morning: '09:45', evening: '22:30' }) // Sunday
    expect(dayRhythm({ week }, '2026-10-05').wake).toBe('07:00') // Monday not set → default
  })
})
