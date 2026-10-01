import { addInbox, addItem, setCheck } from '../store/actions.js'
import { getState } from '../store/store.js'
import { parseQuick } from '../lib/parse.js'
import { AREAS } from '../lib/areas.js'
import { localeDayFirst } from '../lib/dates.js'

// Everything that arrives from outside the app comes through here:
//
//   /?capture=Dinner with Sam Friday 7pm      iPhone Shortcuts, bookmarks, links
//   /?capture=...&add=1                        add straight to the plan
//   /?title=..&text=..&url=..                  Android / desktop share sheet
//   cloud webhook (services/cloud.js)          texts, email, Zapier, IFTTT…
//
// By default captured things land in the Inbox, to be sorted with intention.

export const SOURCES = {
  shortcut: 'Shortcut',
  share: 'Shared',
  sms: 'Text message',
  email: 'Email',
  webhook: 'Webhook',
  zapier: 'Zapier',
  ifttt: 'IFTTT',
  calendar: 'Calendar',
  manual: 'Brain dump',
  paste: 'Pasted',
}

export const sourceLabel = (s) => SOURCES[s] ?? (s ? s[0].toUpperCase() + s.slice(1) : 'Captured')

export function captureText(text, { source = 'manual', meta = {}, add = false } = {}) {
  const clean = String(text ?? '').trim().slice(0, 2000)
  if (!clean) return null
  if (add) {
    const settings = getState().settings
    const p = parseQuick(clean, { areas: AREAS, dayFirst: localeDayFirst(), defaultDuration: settings.defaultDuration })
    if (!p.title) return null
    const id = addItem({ title: p.title, date: p.date, start: p.start, end: p.end, repeat: p.repeat, area: p.area, reminder: p.start ? settings.defaultReminder : null, source })
    return { type: 'item', id, parsed: p }
  }
  return { type: 'inbox', id: addInbox({ text: clean, source, meta }) }
}

// Read (and then tidy away) any instructions carried in the launch URL.
export function readLaunchParams() {
  const params = new URLSearchParams(location.search)
  const out = {}

  const capture = params.get('capture')
  const title = params.get('title')
  const text = params.get('text')
  const url = params.get('url')
  if (capture || text || title || url) {
    const parts = []
    if (capture) parts.push(capture)
    if (title && !(text ?? '').includes(title)) parts.push(title)
    if (text) parts.push(text)
    if (url && !parts.join(' ').includes(url)) parts.push(url)
    out.capture = {
      text: parts.join(' — '),
      source: params.get('source') ?? (capture ? 'shortcut' : 'share'),
      add: params.get('add') === '1' || params.get('add') === 'true',
      meta: url ? { url } : {},
    }
  }
  if (params.get('open')) out.open = { itemId: params.get('open'), date: params.get('date') }
  if (params.get('breathe')) out.breathe = true
  if (params.get('checkin')) out.checkin = params.get('checkin')
  if (params.get('new')) out.quickAdd = true

  const consumed = ['capture', 'title', 'text', 'url', 'source', 'add', 'open', 'date', 'breathe', 'checkin', 'new']
  if (consumed.some((k) => params.has(k))) {
    consumed.forEach((k) => params.delete(k))
    const rest = params.toString()
    history.replaceState(null, '', location.pathname + (rest ? `?${rest}` : ''))
  }
  return out
}

// ── Actions tapped on notifications while the app was closed ────────────────
// The service worker queues them in IndexedDB; we apply them on next launch.

function openQueue() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open('cadence-sw', 1)
    req.onupgradeneeded = () => req.result.createObjectStore('actions', { autoIncrement: true })
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

export async function drainNotificationActions() {
  if (typeof indexedDB === 'undefined') return []
  try {
    const db = await openQueue()
    const actions = await new Promise((resolve, reject) => {
      const tx = db.transaction('actions', 'readwrite')
      const store = tx.objectStore('actions')
      const all = store.getAll()
      all.onsuccess = () => {
        store.clear()
        resolve(all.result)
      }
      all.onerror = () => reject(all.error)
    })
    db.close()
    for (const a of actions) applyNotificationAction(a)
    return actions
  } catch {
    return []
  }
}

export function applyNotificationAction(a) {
  if (a?.type === 'done' && a.itemId && a.date && getState().items[a.itemId]) setCheck(a.itemId, a.date, 'done')
}
