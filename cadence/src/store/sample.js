import { addDays, todayKey, weekday, startOfWeek, monthOf, yearOf } from '../lib/dates.js'
import { initialState } from './store.js'

// Example plans for exploring the preview: two months of routines, a few
// goals, moods and inbox items, all dated relative to today.
export function sampleState(today = todayKey()) {
  let seed = 7
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647
  const t = Date.now()
  const start = addDays(today, -62)
  const it = (id, f) => ({ id, title: '', notes: '', date: start, start: null, end: null, area: null, goalId: null, repeat: null, reminder: null, skip: {}, createdAt: t, updatedAt: t, ...f })
  const items = {
    a: it('a', { title: 'Morning intention', start: '07:20', end: '07:30', area: 'mind', repeat: { freq: 'daily' }, reminder: 0 }),
    b: it('b', { title: 'Deep work: proposal', start: '09:00', end: '11:00', area: 'work', repeat: { freq: 'weekly', days: [1, 2, 3, 4, 5] }, reminder: 5, goalId: 'gm2' }),
    c: it('c', { title: 'Team standup', start: '10:00', end: '10:20', area: 'work', repeat: { freq: 'weekly', days: [1, 2, 3, 4, 5] }, reminder: 5 }),
    d: it('d', { title: 'Morning run', area: 'health', repeat: { freq: 'weekly', days: [1, 3, 5, 6] }, goalId: 'gm1' }),
    e: it('e', { title: 'Read 20 pages', area: 'growth', repeat: { freq: 'daily' } }),
    f: it('f', { title: 'Lunch walk outside', start: '12:30', end: '13:00', area: 'health', repeat: { freq: 'weekly', days: [1, 2, 3, 4, 5] }, reminder: 0 }),
    g: it('g', { title: '1:1 with Alex', start: '14:00', end: '14:30', area: 'people', repeat: { freq: 'weekly', days: [4] }, reminder: 10 }),
    h: it('h', { title: 'Wind down, screens away', start: '21:30', end: '22:00', area: 'mind', repeat: { freq: 'daily' }, reminder: 0 }),
    i: it('i', { title: 'Dentist', date: addDays(today, 13), start: '15:00', end: '15:45', area: 'home', reminder: 60 }),
    j: it('j', { title: 'Call mom', date: addDays(today, 1), start: '17:00', end: '17:30', area: 'people', reminder: 10 }),
    k: it('k', { title: 'Pay rent', date: `${monthOf(start)}-01`, area: 'money', repeat: { freq: 'monthly' } }),
    l: it('l', { title: 'Buy groceries', date: today, area: 'home' }),
    m: it('m', { title: 'Renew passport', date: addDays(today, -2), area: 'home' }),
    n: it('n', { title: 'Yoga class', start: '09:00', end: '10:15', area: 'health', repeat: { freq: 'weekly', days: [6] }, reminder: 30 }),
    o: it('o', { title: 'Plan the week', start: '18:00', end: '18:30', area: 'mind', repeat: { freq: 'weekly', days: [0] }, reminder: 0 }),
  }
  const occurs = (item, k) => {
    if (k < item.date) return false
    if (!item.repeat) return k === item.date
    if (item.repeat.freq === 'daily') return true
    if (item.repeat.freq === 'monthly') return k.slice(8) === item.date.slice(8)
    return item.repeat.days.includes(weekday(k))
  }
  const checks = {}
  const days = {}
  const notes = ['Felt scattered in the morning, but the walk reset me.', 'Deep work went well. Protecting mornings is working.', 'Tired. Went to bed early and that was the right call.', 'Lovely dinner with friends.', 'Hard meeting, handled it calmly.']
  for (let i = 60; i >= 1; i--) {
    const k = addDays(today, -i)
    for (const item of Object.values(items)) {
      if (!occurs(item, k)) continue
      const r = rnd()
      checks[`${item.id}|${k}`] = { status: r < 0.74 + (60 - i) / 600 ? 'done' : r < 0.82 ? 'skipped' : '', updatedAt: t }
    }
    if (i <= 40 && rnd() < 0.8) {
      days[k] = { mood: 2 + Math.floor(rnd() * 3.6), energy: 2 + Math.floor(rnd() * 3), reflection: rnd() < 0.5 ? notes[i % notes.length] : '', gratitude: ['Coffee in the sun', rnd() < 0.5 ? 'A call with my sister' : '', ''], updatedAt: t }
    }
  }
  days[today] = { intention: 'Be fully present in each conversation.', updatedAt: t }
  const week = startOfWeek(today, 1)
  const g = (id, f) => ({ id, title: '', why: '', parentId: null, area: null, measure: 'simple', target: 1, unit: '', progress: 0, autoCount: false, milestones: [], status: 'active', createdAt: t, updatedAt: t, ...f })
  const goals = {
    gy1: g('gy1', { title: 'Run a half marathon', why: 'To prove to myself I can do hard, patient things.', horizon: 'year', period: yearOf(today), area: 'health', measure: 'milestones', milestones: [{ id: 'm1', title: 'Run 5k without stopping', done: true }, { id: 'm2', title: 'Run 10k', done: true }, { id: 'm3', title: 'Sign up for the race', done: true }, { id: 'm4', title: 'Run 16k', done: false }, { id: 'm5', title: 'Race day', done: false }] }),
    gy2: g('gy2', { title: 'Read 24 books', why: 'Less scrolling, more depth.', horizon: 'year', period: yearOf(today), area: 'growth', measure: 'count', target: 24, unit: 'books', progress: 17 }),
    gm1: g('gm1', { title: 'Run 12 times', why: 'Building toward the half marathon.', horizon: 'month', period: monthOf(today), area: 'health', measure: 'count', target: 12, unit: 'runs', autoCount: true, parentId: 'gy1' }),
    gm2: g('gm2', { title: 'Finish the client proposal', horizon: 'month', period: monthOf(today), area: 'work', measure: 'milestones', milestones: [{ id: 'p1', title: 'Outline', done: true }, { id: 'p2', title: 'First draft', done: false }, { id: 'p3', title: 'Review with Alex', done: false }] }),
    gw1: g('gw1', { title: 'Draft the proposal', horizon: 'week', period: week, area: 'work', parentId: 'gm2' }),
    gw2: g('gw2', { title: 'Call grandma', horizon: 'week', period: week, area: 'people', status: 'done' }),
  }
  const inbox = {
    in1: { id: 'in1', text: 'Dinner with Priya Friday 7:30pm at Nopa', source: 'sms', meta: { from: 'Priya' }, receivedAt: t - 3600e3, updatedAt: t },
    in2: { id: 'in2', text: 'Your car is due for service next week. Book at the dealership.', source: 'email', meta: {}, receivedAt: t - 86400e3, updatedAt: t },
  }
  const base = initialState()
  return { ...base, items, goals, checks, days, inbox, profile: { ...base.profile, onboarded: true, updatedAt: t } }
}
