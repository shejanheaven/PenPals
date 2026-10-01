import { describe, expect, it } from 'vitest'
import { describeRepeat, itemsOn, occursOn } from '../src/lib/recurrence.js'

const item = (over) => ({ id: 'x', title: 'T', date: '2026-10-01', start: null, ...over })

describe('occursOn', () => {
  it('handles one-off items', () => {
    expect(occursOn(item(), '2026-10-01')).toBe(true)
    expect(occursOn(item(), '2026-10-02')).toBe(false)
    expect(occursOn(item({ deleted: true }), '2026-10-01')).toBe(false)
  })

  it('handles daily with interval and until', () => {
    const it2 = item({ repeat: { freq: 'daily', interval: 2, until: '2026-10-07' } })
    expect(occursOn(it2, '2026-09-30')).toBe(false)
    expect(occursOn(it2, '2026-10-03')).toBe(true)
    expect(occursOn(it2, '2026-10-04')).toBe(false)
    expect(occursOn(it2, '2026-10-09')).toBe(false)
  })

  it('handles weekly days and every-other-week', () => {
    const weekdays = item({ repeat: { freq: 'weekly', days: [1, 2, 3, 4, 5] } })
    expect(occursOn(weekdays, '2026-10-03')).toBe(false) // Saturday
    expect(occursOn(weekdays, '2026-10-05')).toBe(true) // Monday
    const biweekly = item({ repeat: { freq: 'weekly', interval: 2 } }) // Thursdays
    expect(occursOn(biweekly, '2026-10-08')).toBe(false)
    expect(occursOn(biweekly, '2026-10-15')).toBe(true)
  })

  it('handles monthly and yearly, skipping missing dates', () => {
    const monthly = item({ date: '2026-01-31', repeat: { freq: 'monthly' } })
    expect(occursOn(monthly, '2026-02-28')).toBe(false)
    expect(occursOn(monthly, '2026-03-31')).toBe(true)
    const yearly = item({ date: '2024-02-29', repeat: { freq: 'yearly' } })
    expect(occursOn(yearly, '2025-02-28')).toBe(false)
    expect(occursOn(yearly, '2028-02-29')).toBe(true)
  })

  it('honours skipped occurrences', () => {
    const daily = item({ repeat: { freq: 'daily' }, skip: { '2026-10-02': true } })
    expect(occursOn(daily, '2026-10-02')).toBe(false)
    expect(occursOn(daily, '2026-10-03')).toBe(true)
  })

  it('sorts timed items before anytime ones', () => {
    const items = {
      a: item({ id: 'a', start: null, createdAt: 1 }),
      b: item({ id: 'b', start: '14:00' }),
      c: item({ id: 'c', start: '09:00' }),
    }
    expect(itemsOn(items, '2026-10-01').map((i) => i.id)).toEqual(['c', 'b', 'a'])
  })

  it('describes rules in plain words', () => {
    expect(describeRepeat({ freq: 'weekly', days: [1, 2, 3, 4, 5] }, '2026-10-01')).toBe('Every weekday')
    expect(describeRepeat({ freq: 'weekly' }, '2026-10-01')).toBe('Every Thursday')
    expect(describeRepeat({ freq: 'monthly' }, '2026-10-01')).toBe('Every month on the 1st')
    expect(describeRepeat({ freq: 'daily', interval: 2 }, '2026-10-01')).toBe('Every 2 days')
  })
})
