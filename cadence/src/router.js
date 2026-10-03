import { useSyncExternalStore } from 'react'

// Tiny path router: one tab per top-level path, so the phone's back button
// and deep links from notifications both work. Builds for hosts that can't
// serve app paths (the single-file preview) use "#plan"-style hashes instead.

const HASH = import.meta.env.VITE_ROUTER === 'hash'

export const ROUTES = ['today', 'plan', 'goals', 'reflect', 'notes', 'settings']

const subs = new Set()
const emit = () => subs.forEach((fn) => fn())

function read() {
  const seg = (HASH ? location.hash.slice(1) : location.pathname.replace(/^\/+/, '')).split('/')[0]
  return ROUTES.includes(seg) ? seg : 'today'
}

let current = typeof location !== 'undefined' ? read() : 'today'

if (typeof window !== 'undefined') {
  const sync = () => {
    current = read()
    emit()
  }
  window.addEventListener('popstate', sync)
  if (HASH) window.addEventListener('hashchange', sync)
}

export function navigate(route, { replace = false, search = '' } = {}) {
  if (HASH) {
    if (read() !== route) {
      const url = route === 'today' ? location.pathname + location.search : `#${route}`
      history[replace ? 'replaceState' : 'pushState'](null, '', url)
    }
    current = route
    emit()
    window.scrollTo({ top: 0 })
    return
  }
  const path = route === 'today' ? '/' : `/${route}`
  const url = `${path}${search}`
  if (url !== location.pathname + location.search) history[replace ? 'replaceState' : 'pushState'](null, '', url)
  current = route
  emit()
  window.scrollTo({ top: 0 })
}

export const useRoute = () =>
  useSyncExternalStore(
    (fn) => {
      subs.add(fn)
      return () => subs.delete(fn)
    },
    () => current,
  )
