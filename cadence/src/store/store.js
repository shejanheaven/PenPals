import { useSyncExternalStore } from 'react'

// The whole planner is one plain object, kept in memory, mirrored to
// localStorage, and (optionally) synced to the cloud. Components read it with
// useStore() and change it only through ./actions.js.

const KEY = 'cadence:v1'

export function initialState() {
  const now = Date.now()
  return {
    version: 1,
    items: {},
    goals: {},
    checks: {},
    days: {},
    reviews: {},
    inbox: {},
    profile: { name: '', wake: '07:00', sleep: '22:30', areas: [], onboarded: false, updatedAt: now },
    settings: {
      theme: 'system',
      accent: 'sage',
      clock24: false,
      weekStart: 1,
      defaultReminder: 10,
      defaultDuration: 60,
      notify: {
        morningOn: true,
        morning: '08:00',
        eveningOn: true,
        evening: '21:00',
        weeklyReview: true,
        pauses: false,
        pauseTimes: ['11:00', '15:30'],
      },
      updatedAt: now,
    },
  }
}

export function migrate(raw) {
  const base = initialState()
  if (!raw || typeof raw !== 'object') return base
  const out = { ...base, ...raw }
  out.profile = { ...base.profile, ...raw.profile }
  out.settings = { ...base.settings, ...raw.settings, notify: { ...base.settings.notify, ...raw.settings?.notify } }
  for (const c of ['items', 'goals', 'checks', 'days', 'reviews', 'inbox']) out[c] = raw[c] && typeof raw[c] === 'object' ? raw[c] : {}
  return out
}

function load() {
  try {
    const raw = localStorage.getItem(KEY)
    return raw ? migrate(JSON.parse(raw)) : null
  } catch {
    return null
  }
}

let state = (typeof localStorage !== 'undefined' && load()) || initialState()
const listeners = new Set()
const localChangeHooks = new Set()
let persistTimer = null

export const getState = () => state

export function subscribe(fn) {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

// `remote: true` marks changes that came from sync, so they are not echoed back.
export function setState(next, { remote = false } = {}) {
  const value = typeof next === 'function' ? next(state) : next
  if (value === state) return
  state = value
  for (const fn of listeners) fn()
  clearTimeout(persistTimer)
  persistTimer = setTimeout(persistNow, 200)
  if (!remote) for (const fn of localChangeHooks) fn(state)
}

export function onLocalChange(fn) {
  localChangeHooks.add(fn)
  return () => localChangeHooks.delete(fn)
}

export function persistNow() {
  clearTimeout(persistTimer)
  try {
    localStorage.setItem(KEY, JSON.stringify(state))
  } catch (err) {
    console.warn('Cadence: could not save', err)
  }
}

export function useStore() {
  return useSyncExternalStore(subscribe, getState)
}

if (typeof window !== 'undefined') {
  window.addEventListener('pagehide', persistNow)
  document.addEventListener('visibilitychange', () => document.visibilityState === 'hidden' && persistNow())
  // Another tab changed the planner: follow it.
  window.addEventListener('storage', (e) => {
    if (e.key !== KEY || !e.newValue) return
    try {
      state = migrate(JSON.parse(e.newValue))
      for (const fn of listeners) fn()
    } catch {
      /* ignore malformed writes */
    }
  })
}

// ── Per-device preferences (never synced) ───────────────────────────────────

export function createLocalStore(key, defaults) {
  let value = { ...defaults }
  try {
    value = { ...defaults, ...JSON.parse(localStorage.getItem(key) || '{}') }
  } catch {
    /* use defaults */
  }
  const subs = new Set()
  const api = {
    get: () => value,
    set(patch) {
      value = { ...value, ...(typeof patch === 'function' ? patch(value) : patch) }
      try {
        localStorage.setItem(key, JSON.stringify(value))
      } catch {
        /* storage full or blocked */
      }
      for (const fn of subs) fn()
    },
    subscribe(fn) {
      subs.add(fn)
      return () => subs.delete(fn)
    },
    use: () => useSyncExternalStore(api.subscribe, api.get),
  }
  return api
}

export const device = createLocalStore('cadence:device', {
  notifications: false, // the person turned reminders on for this device
  fired: {}, // reminder id → time shown, to avoid repeats
  pushEndpoint: null,
  lastSync: 0,
  installHintDismissed: false,
})
