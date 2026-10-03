import { useSyncExternalStore } from 'react'

// Which sheet or full-screen moment is open. One at a time keeps things calm.
let ui = { layer: null }
const subs = new Set()

function set(next) {
  ui = { ...ui, ...next }
  subs.forEach((fn) => fn())
}

export const useUI = () =>
  useSyncExternalStore(
    (fn) => {
      subs.add(fn)
      return () => subs.delete(fn)
    },
    () => ui,
  )

export const openLayer = (type, props = {}) => set({ layer: { type, ...props, key: Date.now() } })
export const closeLayer = () => set({ layer: null })

export const openQuickAdd = (props) => openLayer('quick', props)
export const openVoice = () => openLayer('quick', { voice: true })
export const openItem = (itemId, date) => openLayer('item', { itemId, date })
export const newItem = (draft = {}, extra = {}) => openLayer('item', { draft, ...extra })
export const openGoal = (goalId) => openLayer('goal', { goalId })
export const newGoal = (draft) => openLayer('goal', { draft })
export const openFocus = (itemId, date) => openLayer('focus', { itemId, date })
export const openBreathe = () => openLayer('breathe')
export const openInbox = () => openLayer('inbox')
export const openNote = (noteId) => openLayer('note', { noteId })
export const openMusic = () => openLayer('music')
