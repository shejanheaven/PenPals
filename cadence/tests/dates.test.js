import { describe, expect, it } from 'vitest'
import {
  addDays, addMonths, diffDays, fmtTime, monthGrid, rangeKeys, setClock24, startOfWeek, toMinutes, fromMinutes, weekDays,
} from '../src/lib/dates.js'

describe('dates', () => {
  it('adds days across month and year boundaries', () => {
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01')
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28')
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29')
  })

  it('counts days without DST drift', () => {
    expect(diffDays('2026-03-07', '2026-03-09')).toBe(2) // US DST starts Mar 8
    expect(diffDays('2026-11-01', '2026-10-31')).toBe(-1)
  })

  it('clamps month arithmetic to the month length', () => {
    expect(addMonths('2026-01-31', 1)).toBe('2026-02-28')
    expect(addMonths('2026-12-15', 1)).toBe('2027-01-15')
  })

  it('finds the start of the week for either week start', () => {
    expect(startOfWeek('2026-10-01', 1)).toBe('2026-09-28') // Thursday → Monday
    expect(startOfWeek('2026-10-01', 0)).toBe('2026-09-27') // → Sunday
    expect(startOfWeek('2026-09-27', 1)).toBe('2026-09-21')
    expect(weekDays('2026-10-01', 1)).toHaveLength(7)
  })

  it('builds a 6×7 month grid that contains the whole month', () => {
    const grid = monthGrid('2026-10', 1)
    const flat = grid.flat()
    expect(grid).toHaveLength(6)
    expect(flat).toContain('2026-10-01')
    expect(flat).toContain('2026-10-31')
    expect(flat[0]).toBe('2026-09-28')
  })

  it('converts times', () => {
    expect(toMinutes('09:30')).toBe(570)
    expect(fromMinutes(570)).toBe('09:30')
    expect(fromMinutes(24 * 60 + 5)).toBe('23:59')
    expect(rangeKeys('2026-10-30', '2026-11-02')).toEqual(['2026-10-30', '2026-10-31', '2026-11-01', '2026-11-02'])
  })

  it('formats times for both clocks', () => {
    setClock24(false)
    expect(fmtTime('00:15')).toBe('12:15 AM')
    expect(fmtTime('12:00')).toBe('12:00 PM')
    expect(fmtTime('17:05', { compact: true })).toBe('5:05pm')
    setClock24(true)
    expect(fmtTime('17:05')).toBe('17:05')
    setClock24(false)
  })
})
