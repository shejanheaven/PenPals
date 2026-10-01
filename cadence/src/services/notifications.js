import { upcomingReminders } from '../lib/reminders.js'
import { device, getState, subscribe } from '../store/store.js'

// Reminders reach you three ways, all fed by lib/reminders.js:
//   1. In-app banners while Cadence is open in front of you.
//   2. System notifications scheduled on this device while the app is running
//      (or recently backgrounded).
//   3. Web Push from the cloud (services/cloud.js), which works even when the
//      app is fully closed. Shared `tag`s mean duplicates replace each other.

export const notificationsSupported = () => typeof window !== 'undefined' && 'Notification' in window
export const permission = () => (notificationsSupported() ? Notification.permission : 'unsupported')

export const isIOS = () =>
  /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)

export const isStandalone = () =>
  window.matchMedia?.('(display-mode: standalone)').matches || navigator.standalone === true

// iPhone only allows notifications for web apps added to the Home Screen.
export const needsInstallForNotifications = () => isIOS() && !isStandalone()

let registration = null

export async function registerServiceWorker() {
  if (!('serviceWorker' in navigator) || !import.meta.env.PROD) return null
  try {
    registration = await navigator.serviceWorker.register('/sw.js')
    navigator.serviceWorker.addEventListener('message', (e) => messageHandler?.(e.data))
    return registration
  } catch (err) {
    console.warn('Cadence: service worker unavailable', err)
    return null
  }
}

export async function getRegistration() {
  if (registration) return registration
  if (!('serviceWorker' in navigator)) return null
  try {
    return (await navigator.serviceWorker.getRegistration()) ?? null
  } catch {
    return null
  }
}

let messageHandler = null
export const onServiceWorkerMessage = (fn) => {
  messageHandler = fn
}

const enabledHooks = new Set()
export const onNotificationsEnabled = (fn) => enabledHooks.add(fn)

export async function enableNotifications() {
  if (!notificationsSupported()) return 'unsupported'
  let result = Notification.permission
  if (result === 'default') {
    try {
      result = await Notification.requestPermission()
    } catch {
      result = Notification.permission
    }
  }
  device.set({ notifications: result === 'granted' })
  if (result === 'granted') {
    enabledHooks.forEach((fn) => fn())
    tick()
  }
  return result
}

export function disableNotifications() {
  device.set({ notifications: false })
}

export async function showSystemNotification(r) {
  const options = {
    body: r.body,
    tag: r.tag,
    icon: '/icons/icon-192.png',
    badge: '/icons/badge-96.png',
    data: { url: r.url, kind: r.kind, id: r.id, ...r.data },
    timestamp: +r.at,
  }
  const reg = await getRegistration()
  if (reg) {
    return reg.showNotification(r.title, {
      ...options,
      actions: r.kind === 'item' ? [{ action: 'done', title: 'Mark done' }] : [],
    })
  }
  try {
    const n = new Notification(r.title, options)
    n.onclick = () => {
      window.focus()
      messageHandler?.({ type: 'open', url: r.url })
    }
  } catch {
    /* some browsers only allow notifications from a service worker */
  }
}

// ── Scheduler ───────────────────────────────────────────────────────────────

let foreground = null
export const setForegroundHandler = (fn) => {
  foreground = fn
}

let timer = null
const CATCH_UP = 10 * 60e3

function markFired(id) {
  const cutoff = Date.now() - 3 * 86400e3
  device.set(({ fired }) => ({
    fired: Object.fromEntries([...Object.entries(fired).filter(([, t]) => t > cutoff), [id, Date.now()]]),
  }))
}

export function alreadyFired(id) {
  return !!device.get().fired[id]
}

// Show a reminder exactly once, wherever it came from (local timer or push).
export function deliver(r, { system = true } = {}) {
  if (alreadyFired(r.id)) return false
  markFired(r.id)
  const inFront = document.visibilityState === 'visible' && document.hasFocus()
  if (inFront && foreground) foreground(r)
  else if (system && device.get().notifications && permission() === 'granted') showSystemNotification(r)
  return true
}

function fireDue(now) {
  const due = upcomingReminders(getState(), { now: new Date(+now - CATCH_UP), hours: CATCH_UP / 3600e3 + 0.01 })
  for (const r of due) if (r.at <= now) deliver(r)
}

export function tick() {
  clearTimeout(timer)
  const now = new Date()
  fireDue(now)
  const next = upcomingReminders(getState(), { now, hours: 48 })[0]
  // Wake at the next reminder, but never sleep longer than 15 minutes so
  // laptop sleep or clock changes can't make us miss one.
  const delay = next ? Math.min(next.at - now, 15 * 60e3) : 15 * 60e3
  timer = setTimeout(tick, Math.max(1000, delay + 300))
}

let started = false
export function startScheduler() {
  if (started) return
  started = true
  let debounce = null
  subscribe(() => {
    clearTimeout(debounce)
    debounce = setTimeout(tick, 600)
  })
  document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && tick())
  window.addEventListener('focus', tick)
  tick()
}

export async function sendTest() {
  const r = {
    id: `test:${Date.now()}`,
    tag: 'test',
    kind: 'test',
    at: new Date(),
    title: 'Cadence is with you',
    body: 'This is how reminders will look. Breathe — you’re on track.',
    url: '/',
  }
  if (permission() !== 'granted') return false
  await showSystemNotification(r)
  return true
}
