import { getState, initialState, migrate, setState } from './store.js'
import { uid } from '../lib/ids.js'
import { checkKey } from '../lib/stats.js'
import { addDays, fromMinutes, todayKey, toMinutes } from '../lib/dates.js'

const now = () => Date.now()
const put = (collection, id, value) => (s) => ({ ...s, [collection]: { ...s[collection], [id]: value } })

function patchEntity(collection, id, patch) {
  setState((s) => {
    const current = s[collection][id]
    if (!current) return s
    const next = typeof patch === 'function' ? patch(current) : patch
    return put(collection, id, { ...current, ...next, updatedAt: now() })(s)
  })
}

// ── Schedule items ──────────────────────────────────────────────────────────

const ITEM_FIELDS = ['title', 'notes', 'date', 'start', 'end', 'area', 'goalId', 'repeat', 'reminder', 'source']

export function addItem(fields) {
  const id = uid('it')
  const t = now()
  setState(
    put('items', id, {
      id,
      title: '',
      notes: '',
      date: todayKey(),
      start: null,
      end: null,
      area: null,
      goalId: null,
      repeat: null,
      reminder: null,
      skip: {},
      ...fields,
      createdAt: t,
      updatedAt: t,
    }),
  )
  return id
}

export const updateItem = (id, patch) => patchEntity('items', id, patch)
export const deleteItem = (id) => patchEntity('items', id, { deleted: true })
export const restoreItem = (id) => patchEntity('items', id, { deleted: false })

export function duplicateItem(item, overrides = {}) {
  const fields = Object.fromEntries(ITEM_FIELDS.map((f) => [f, item[f]]))
  return addItem({ ...fields, ...overrides })
}

export function setCheck(itemId, key, status) {
  setState(put('checks', checkKey(itemId, key), { status, updatedAt: now() }))
}

export function toggleDone(itemId, key) {
  const current = getState().checks[checkKey(itemId, key)]?.status
  setCheck(itemId, key, current === 'done' ? '' : 'done')
  return current !== 'done'
}

// Remove a single day from a repeating item, or the whole one-off item.
export function removeOccurrence(item, key) {
  if (!item.repeat) return deleteItem(item.id)
  patchEntity('items', item.id, (it) => ({ skip: { ...it.skip, [key]: true } }))
}

export function restoreOccurrence(item, key) {
  if (!item.repeat) return restoreItem(item.id)
  patchEntity('items', item.id, (it) => {
    const skip = { ...it.skip }
    delete skip[key]
    return { skip }
  })
}

// Move one occurrence to another day (and optionally time). A repeating
// item keeps its rhythm; the moved day becomes its own one-off item.
export function moveOccurrence(item, fromKey, toKey, time) {
  const timing = time ? { start: time, end: item.start && item.end ? fromMinutes(toMinutes(time) + toMinutes(item.end) - toMinutes(item.start)) : item.end } : {}
  if (!item.repeat) {
    updateItem(item.id, { date: toKey, ...timing })
    return item.id
  }
  patchEntity('items', item.id, (it) => ({ skip: { ...it.skip, [fromKey]: true } }))
  return duplicateItem(item, { date: toKey, repeat: null, ...timing, originId: item.id })
}

export const moveToTomorrow = (item, fromKey) => moveOccurrence(item, fromKey, addDays(fromKey, 1))

// ── Goals ───────────────────────────────────────────────────────────────────

export function addGoal(fields) {
  const id = uid('g')
  const t = now()
  setState(
    put('goals', id, {
      id,
      title: '',
      why: '',
      horizon: 'month',
      period: '',
      parentId: null,
      area: null,
      measure: 'simple',
      target: 1,
      unit: '',
      progress: 0,
      autoCount: false,
      milestones: [],
      status: 'active',
      ...fields,
      createdAt: t,
      updatedAt: t,
    }),
  )
  return id
}

export const updateGoal = (id, patch) => patchEntity('goals', id, patch)
export const deleteGoal = (id) => patchEntity('goals', id, { deleted: true })
export const restoreGoal = (id) => patchEntity('goals', id, { deleted: false })

export function bumpGoal(id, delta) {
  patchEntity('goals', id, (g) => ({ progress: Math.max(0, (g.progress || 0) + delta) }))
}

export function toggleMilestone(goalId, milestoneId) {
  patchEntity('goals', goalId, (g) => ({ milestones: g.milestones.map((m) => (m.id === milestoneId ? { ...m, done: !m.done } : m)) }))
}

// ── Journal ─────────────────────────────────────────────────────────────────

export function updateDay(key, patch) {
  setState((s) => put('days', key, { ...s.days[key], ...patch, updatedAt: now() })(s))
}

export function updateReview(key, patch) {
  setState((s) => put('reviews', key, { ...s.reviews[key], ...patch, updatedAt: now() })(s))
}

// ── Inbox (things captured from texts, email, share sheet, webhooks) ────────

export function addInbox({ text, source = 'manual', meta = {}, id = uid('in'), receivedAt = now() }) {
  if (!text?.trim()) return null
  if (getState().inbox[id]) return id
  setState(put('inbox', id, { id, text: text.trim(), source, meta, receivedAt, updatedAt: now() }))
  return id
}

export const resolveInbox = (id) => patchEntity('inbox', id, { deleted: true })
export const restoreInbox = (id) => patchEntity('inbox', id, { deleted: false })

// ── Profile & settings ──────────────────────────────────────────────────────

export function updateProfile(patch) {
  setState((s) => ({ ...s, profile: { ...s.profile, ...patch, updatedAt: now() } }))
}

export function updateSettings(patch) {
  setState((s) => ({
    ...s,
    settings: { ...s.settings, ...patch, notify: { ...s.settings.notify, ...patch.notify }, updatedAt: now() },
  }))
}

// ── Whole-planner operations ────────────────────────────────────────────────

export function replaceState(raw) {
  setState(migrate(raw))
}

export function resetAll() {
  setState(initialState())
}

export function addItems(list) {
  const t = now()
  setState((s) => {
    const items = { ...s.items }
    for (const item of list) {
      const id = item.id ?? uid('it')
      items[id] = { skip: {}, ...item, id, createdAt: item.createdAt ?? t, updatedAt: t }
    }
    return { ...s, items }
  })
}
