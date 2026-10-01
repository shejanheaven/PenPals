import { fmtTime, fromMinutes, toMinutes } from '../lib/dates.js'

// Gentle starting routines offered during onboarding.
export function routineTemplates({ wake = '07:00', sleep = '22:30' } = {}) {
  const at = (base, delta) => fromMinutes(toMinutes(base) + delta)
  return [
    { key: 'intention', title: 'Morning intention', hint: `Daily · ${fmtTime(at(wake, 20))}`, area: 'mind', start: at(wake, 20), end: at(wake, 30), repeat: { freq: 'daily' }, reminder: 0 },
    { key: 'deep', title: 'Deep work', hint: `Weekdays · ${fmtTime('09:00')} – ${fmtTime('11:00')}`, area: 'work', start: '09:00', end: '11:00', repeat: { freq: 'weekly', days: [1, 2, 3, 4, 5] }, reminder: 5 },
    { key: 'move', title: 'Move your body', hint: 'Daily · anytime', area: 'health', start: null, end: null, repeat: { freq: 'daily' }, reminder: null },
    { key: 'read', title: 'Read for 20 minutes', hint: 'Daily · anytime', area: 'growth', start: null, end: null, repeat: { freq: 'daily' }, reminder: null },
    { key: 'connect', title: 'Reach out to someone you love', hint: 'Every Sunday', area: 'people', start: null, end: null, repeat: { freq: 'weekly', days: [0] }, reminder: null },
    { key: 'winddown', title: 'Wind down — screens away', hint: `Daily · ${fmtTime(at(sleep, -60))}`, area: 'mind', start: at(sleep, -60), end: at(sleep, -30), repeat: { freq: 'daily' }, reminder: 0 },
  ]
}

// Short public-domain lines for a quiet moment on the Today screen.
export const QUOTES = [
  ['Begin at once to live, and count each separate day as a separate life.', 'Seneca'],
  ['Confine yourself to the present.', 'Marcus Aurelius'],
  ['Nature does not hurry, yet everything is accomplished.', 'Lao Tzu'],
  ['Our life is frittered away by detail. Simplify, simplify.', 'Henry David Thoreau'],
  ['Finish each day and be done with it.', 'Ralph Waldo Emerson'],
  ['Very little is needed to make a happy life.', 'Marcus Aurelius'],
  ['While we are postponing, life speeds by.', 'Seneca'],
  ['The journey of a thousand miles begins with a single step.', 'Lao Tzu'],
  ['Do every act of your life as though it were the very last act of your life.', 'Marcus Aurelius'],
  ['Write it on your heart that every day is the best day in the year.', 'Ralph Waldo Emerson'],
  ['As if you could kill time without injuring eternity.', 'Henry David Thoreau'],
  ['Waste no more time arguing what a good person should be. Be one.', 'Marcus Aurelius'],
]

export const MOODS = [
  { value: 1, label: 'Heavy' },
  { value: 2, label: 'Low' },
  { value: 3, label: 'Okay' },
  { value: 4, label: 'Good' },
  { value: 5, label: 'Bright' },
]

export const ENERGY = [
  { value: 1, label: 'Drained' },
  { value: 2, label: 'Tired' },
  { value: 3, label: 'Steady' },
  { value: 4, label: 'Energised' },
  { value: 5, label: 'Buzzing' },
]

export const REMINDER_OPTIONS = [
  { value: '', label: 'No reminder' },
  { value: '0', label: 'At start time' },
  { value: '5', label: '5 minutes before' },
  { value: '10', label: '10 minutes before' },
  { value: '15', label: '15 minutes before' },
  { value: '30', label: '30 minutes before' },
  { value: '60', label: '1 hour before' },
  { value: '1440', label: '1 day before' },
]
