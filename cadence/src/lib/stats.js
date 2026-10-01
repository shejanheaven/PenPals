import { addDays, addMonthKey, fmtMonth, fmtWeekRange, monthDays, monthOf, startOfWeek, yearOf } from './dates.js'
import { itemsOn, occursOn } from './recurrence.js'

export const checkKey = (itemId, key) => `${itemId}|${key}`
export const statusOf = (state, itemId, key) => state.checks?.[checkKey(itemId, key)]?.status || ''

export function dayStats(state, key) {
  const items = itemsOn(state.items, key)
  let done = 0
  let skipped = 0
  for (const item of items) {
    const st = statusOf(state, item.id, key)
    if (st === 'done') done++
    else if (st === 'skipped') skipped++
  }
  const total = items.length - skipped
  return { items, done, total, rate: total ? done / total : null }
}

export function rangeStats(state, keys) {
  let done = 0
  let total = 0
  let ritualsDone = 0
  let ritualsTotal = 0
  const moods = []
  const byArea = {}
  for (const key of keys) {
    const s = dayStats(state, key)
    done += s.done
    total += s.total
    for (const item of s.items) {
      const st = statusOf(state, item.id, key)
      if (st === 'skipped') continue
      const a = (byArea[item.area || 'none'] ??= { done: 0, total: 0 })
      a.total++
      if (st === 'done') a.done++
      if (item.repeat) {
        ritualsTotal++
        if (st === 'done') ritualsDone++
      }
    }
    const mood = state.days?.[key]?.mood
    if (mood) moods.push(mood)
  }
  return {
    done,
    total,
    rate: total ? done / total : null,
    ritualsDone,
    ritualsTotal,
    moodAvg: moods.length ? moods.reduce((a, b) => a + b, 0) / moods.length : null,
    moodDays: moods.length,
    byArea,
  }
}

// Consecutive kept occurrences of a repeating item. Skipped days and a
// not-yet-done today never break a streak.
export function streak(state, item, today) {
  if (!item.repeat) return 0
  let count = 0
  for (let i = 0, key = today; i < 400 && key >= item.date; i++, key = addDays(key, -1)) {
    if (!occursOn(item, key)) continue
    const st = statusOf(state, item.id, key)
    if (st === 'done') count++
    else if (st === 'skipped' || key === today) continue
    else break
  }
  return count
}

// ── Goal periods ────────────────────────────────────────────────────────────

export const HORIZONS = [
  { id: 'year', label: 'Year' },
  { id: 'month', label: 'Month' },
  { id: 'week', label: 'Week' },
]

export function currentPeriod(horizon, today, weekStart = 1) {
  if (horizon === 'year') return yearOf(today)
  if (horizon === 'month') return monthOf(today)
  return startOfWeek(today, weekStart)
}

export function shiftPeriod(horizon, period, n, weekStart = 1) {
  if (horizon === 'year') return String(+period + n)
  if (horizon === 'month') return addMonthKey(period, n)
  return addDays(startOfWeek(period, weekStart), 7 * n)
}

export function periodRange(horizon, period, weekStart = 1) {
  if (horizon === 'year') return [`${period}-01-01`, `${period}-12-31`]
  if (horizon === 'month') {
    const days = monthDays(period)
    return [days[0], days[days.length - 1]]
  }
  const start = startOfWeek(period, weekStart)
  return [start, addDays(start, 6)]
}

export function periodLabel(horizon, period, weekStart = 1) {
  if (horizon === 'year') return period
  if (horizon === 'month') return fmtMonth(period)
  return fmtWeekRange(startOfWeek(period, weekStart))
}

export function inPeriod(goal, horizon, period, weekStart = 1) {
  if (goal.deleted || goal.horizon !== horizon) return false
  if (horizon !== 'week') return goal.period === period
  const [from, to] = periodRange('week', period, weekStart)
  return goal.period >= from && goal.period <= to
}

export function goalsFor(state, horizon, period, weekStart = 1) {
  return Object.values(state.goals)
    .filter((g) => inPeriod(g, horizon, period, weekStart))
    .sort((a, b) => (a.status === 'released') - (b.status === 'released') || (a.createdAt || 0) - (b.createdAt || 0))
}

// Parent goals one horizon up that a goal can support.
export function parentCandidates(state, horizon, period, weekStart = 1) {
  if (horizon === 'year') return []
  if (horizon === 'month') return goalsFor(state, 'year', period.slice(0, 4)).filter((g) => g.status !== 'released')
  const [from, to] = periodRange('week', period, weekStart)
  const months = [...new Set([monthOf(from), monthOf(to)])]
  return months.flatMap((m) => goalsFor(state, 'month', m)).filter((g) => g.status !== 'released')
}

export function linkedDoneCount(state, goal, weekStart = 1) {
  const [from, to] = periodRange(goal.horizon, goal.period, weekStart)
  let n = 0
  for (const [key, check] of Object.entries(state.checks ?? {})) {
    if (check.status !== 'done') continue
    const [itemId, date] = key.split('|')
    if (date < from || date > to) continue
    const item = state.items[itemId]
    if (item && !item.deleted && item.goalId === goal.id) n++
  }
  return n
}

export function goalProgress(state, goal, weekStart = 1) {
  const done = goal.status === 'done'
  if (goal.measure === 'milestones') {
    const total = goal.milestones?.length ?? 0
    const n = goal.milestones?.filter((m) => m.done).length ?? 0
    return { fraction: done ? 1 : total ? n / total : 0, label: total ? `${n} of ${total} steps` : done ? 'Done' : 'No steps yet', value: n, target: total }
  }
  if (goal.measure === 'count') {
    const value = goal.autoCount ? linkedDoneCount(state, goal, weekStart) : goal.progress || 0
    const target = Math.max(1, goal.target || 1)
    return { fraction: done ? 1 : Math.min(1, value / target), label: `${value} of ${target}${goal.unit ? ` ${goal.unit}` : ''}`, value, target }
  }
  return { fraction: done ? 1 : 0, label: done ? 'Done' : 'In progress', value: done ? 1 : 0, target: 1 }
}

export function childGoals(state, goal) {
  return Object.values(state.goals).filter((g) => !g.deleted && g.parentId === goal.id)
}

export const reviewKey = (horizon, period, weekStart = 1) =>
  horizon === 'week' ? `week:${startOfWeek(period, weekStart)}` : `${horizon}:${period}`

export function lastNDays(today, n) {
  return Array.from({ length: n }, (_, i) => addDays(today, i - n + 1))
}
