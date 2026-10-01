import { useSyncExternalStore } from 'react'

// Chrome/Edge/Android offer an install prompt we can trigger from a button.
let deferred = null
const subs = new Set()

export function listenForInstallPrompt() {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault()
    deferred = e
    subs.forEach((fn) => fn())
  })
  window.addEventListener('appinstalled', () => {
    deferred = null
    subs.forEach((fn) => fn())
  })
}

export const useInstallPrompt = () =>
  useSyncExternalStore(
    (fn) => {
      subs.add(fn)
      return () => subs.delete(fn)
    },
    () => deferred,
  )

export async function promptInstall() {
  if (!deferred) return false
  deferred.prompt()
  const { outcome } = await deferred.userChoice
  deferred = null
  subs.forEach((fn) => fn())
  return outcome === 'accepted'
}
