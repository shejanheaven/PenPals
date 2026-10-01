/* Cadence service worker: offline app shell, push reminders, notification taps. */

const CACHE = 'cadence-v1'
const SHELL = ['/', '/manifest.webmanifest', '/icons/icon-192.png', '/icons/icon.svg']

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).catch(() => {}))
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys()
      await Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
      await self.clients.claim()
    })(),
  )
})

self.addEventListener('fetch', (event) => {
  const req = event.request
  if (req.method !== 'GET') return
  const url = new URL(req.url)
  if (url.origin !== self.location.origin) return

  // Pages: network first so updates arrive, cached shell when offline.
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone()
          caches.open(CACHE).then((c) => c.put('/', copy))
          return res
        })
        .catch(() => caches.match('/').then((r) => r || Response.error())),
    )
    return
  }

  // Hashed build assets never change: cache first.
  if (url.pathname.startsWith('/assets/')) {
    event.respondWith(
      caches.match(req).then(
        (hit) =>
          hit ||
          fetch(req).then((res) => {
            if (res.ok) {
              const copy = res.clone()
              caches.open(CACHE).then((c) => c.put(req, copy))
            }
            return res
          }),
      ),
    )
    return
  }

  // Everything else (icons, manifest): stale-while-revalidate.
  event.respondWith(
    caches.match(req).then((hit) => {
      const network = fetch(req)
        .then((res) => {
          if (res.ok) {
            const copy = res.clone()
            caches.open(CACHE).then((c) => c.put(req, copy))
          }
          return res
        })
        .catch(() => hit)
      return hit || network
    }),
  )
})

// ── Push reminders from the cloud ─────────────────────────────────────────

self.addEventListener('push', (event) => {
  let r = {}
  try {
    r = event.data ? event.data.json() : {}
  } catch {
    r = { title: 'Cadence', body: event.data && event.data.text() }
  }
  event.waitUntil(
    (async () => {
      // If Cadence is open in front of the person, show it inside the app instead.
      const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
      const front = windows.find((w) => w.focused && w.visibilityState === 'visible')
      if (front) {
        front.postMessage({ type: 'reminder', reminder: r })
        return
      }
      const kind = r.data && r.data.kind
      await self.registration.showNotification(r.title || 'Cadence', {
        body: r.body || '',
        tag: r.tag,
        icon: '/icons/icon-192.png',
        badge: '/icons/badge-96.png',
        timestamp: r.at ? Date.parse(r.at) : Date.now(),
        data: Object.assign({ url: r.url || '/', id: r.id }, r.data || {}),
        actions: kind === 'item' ? [{ action: 'done', title: 'Mark done' }] : [],
      })
    })(),
  )
})

// ── Taps on notifications ─────────────────────────────────────────────────

function queueAction(action) {
  return new Promise((resolve) => {
    const req = indexedDB.open('cadence-sw', 1)
    req.onupgradeneeded = () => req.result.createObjectStore('actions', { autoIncrement: true })
    req.onsuccess = () => {
      const db = req.result
      const tx = db.transaction('actions', 'readwrite')
      tx.objectStore('actions').add(action)
      tx.oncomplete = () => {
        db.close()
        resolve()
      }
      tx.onerror = () => resolve()
    }
    req.onerror = () => resolve()
  })
}

self.addEventListener('notificationclick', (event) => {
  const n = event.notification
  const data = n.data || {}
  n.close()
  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
      if (event.action === 'done' && data.itemId) {
        const action = { type: 'done', itemId: data.itemId, date: data.date }
        if (windows.length) windows.forEach((w) => w.postMessage({ type: 'action', action }))
        else await queueAction(action)
        return
      }
      const url = data.url || '/'
      const existing = windows[0]
      if (existing) {
        await existing.focus()
        existing.postMessage({ type: 'open', url })
      } else {
        await self.clients.openWindow(url)
      }
    })(),
  )
})
