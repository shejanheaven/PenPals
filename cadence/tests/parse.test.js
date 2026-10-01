import { describe, expect, it } from 'vitest'
import { parseQuick } from '../src/lib/parse.js'
import { AREAS } from '../src/lib/areas.js'

const today = '2026-10-01' // a Thursday
const p = (text, opts) => parseQuick(text, { today, areas: AREAS, ...opts })

describe('parseQuick', () => {
  it.each([
    ['Run tomorrow 7am for 45 min every weekday #health', { title: 'Run', date: '2026-10-02', start: '07:00', end: '07:45', area: 'health', repeat: { freq: 'weekly', days: [1, 2, 3, 4, 5] } }],
    ['Team sync every Mon and Wed 10-11am #work', { title: 'Team sync', start: '10:00', end: '11:00', area: 'work', repeat: { freq: 'weekly', days: [1, 3] } }],
    ['Call mom Sunday at 5', { title: 'Call mom', date: '2026-10-04', start: '17:00', end: '18:00' }],
    ['Dentist oct 14 at 2:30pm', { title: 'Dentist', date: '2026-10-14', start: '14:30' }],
    ['Lunch with Sam at noon', { title: 'Lunch with Sam', date: today, start: '12:00' }],
    ['Sun salutation yoga tomorrow morning', { title: 'Sun salutation yoga', date: '2026-10-02', start: '09:00' }],
    ['Pay rent on the 1st every month', { title: 'Pay rent', date: '2026-10-01', repeat: { freq: 'monthly' } }],
    ['Write proposal from 9 to 11', { title: 'Write proposal', start: '09:00', end: '11:00' }],
    ['dinner tonight', { title: 'Dinner', date: today, start: '20:00' }],
    ['Meeting 11-1pm next friday', { title: 'Meeting', date: '2026-10-09', start: '11:00', end: '13:00' }],
    ['Groceries sat', { title: 'Groceries', date: '2026-10-03', start: null }],
    ['Flight 2026-12-20 6:15am', { title: 'Flight', date: '2026-12-20', start: '06:15' }],
    ['Doctor 10/14 at 9', { title: 'Doctor', date: '2026-10-14', start: '09:00' }],
    ['remind me to water plants every other day', { title: 'Water plants', repeat: { freq: 'daily', interval: 2 } }],
    ['Review 2pm-4', { title: 'Review', start: '14:00', end: '16:00' }],
    ['Party on December 31st at 9pm', { title: 'Party', date: '2026-12-31', start: '21:00' }],
    ['Workout for 1h30m at 6pm', { title: 'Workout', start: '18:00', end: '19:30' }],
    ['Gym @ 6am', { title: 'Gym', start: '06:00' }],
    ['Trip in 2 weeks', { title: 'Trip', date: '2026-10-15' }],
    ['Birthday march 3', { title: 'Birthday', date: '2027-03-03' }],
  ])('%s', (text, expected) => {
    expect(p(text)).toMatchObject(expected)
  })

  it('leaves plain text alone', () => {
    expect(p('Read 2-3 pages')).toMatchObject({ title: 'Read 2-3 pages', start: null, recognized: false })
    expect(p('Call 555-1234 about car')).toMatchObject({ title: 'Call 555-1234 about car', start: null })
    expect(p('Ask Sat about the wedding plans')).toMatchObject({ title: 'Ask Sat about the wedding plans' })
  })

  it('reads day-first dates when the locale does', () => {
    expect(p('Dinner 5/11', { dayFirst: true }).date).toBe('2026-11-05')
    expect(p('Dinner 5/11').date).toBe('2027-05-11')
  })

  it('keeps unknown hashtags in the title', () => {
    expect(p('Plan #offsite').title).toBe('Plan #offsite')
  })
})
