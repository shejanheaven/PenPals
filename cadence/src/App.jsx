import { useEffect, useRef } from 'react'
import { CalendarDays, Mic, Feather, Inbox as InboxIcon, Plus, Settings as SettingsIcon, Sun, Target, Wind } from 'lucide-react'
import { useStore } from './store/store.js'
import { setCheck } from './store/actions.js'
import { closeLayer, openBreathe, openFocus, openInbox, openItem, openQuickAdd, openVoice, useUI } from './store/ui.js'
import { voiceSupported } from './services/voice.js'
import { navigate, useRoute } from './router.js'
import { applyTheme } from './lib/theme.js'
import { setClock24 } from './lib/dates.js'
import { Toasts, banner, toast } from './components/ui.jsx'
import { Logo } from './components/Logo.jsx'
import { ErrorBoundary } from './components/ErrorBoundary.jsx'
import { ItemSheet, QuickAdd } from './components/items.jsx'
import { InboxSheet } from './components/InboxSheet.jsx'
import { Breathe, Focus, chime } from './components/Moments.jsx'
import Today from './views/Today.jsx'
import Plan from './views/Plan.jsx'
import Goals, { GoalSheet } from './views/Goals.jsx'
import Reflect from './views/Reflect.jsx'
import Settings from './views/Settings.jsx'
import Onboarding from './views/Onboarding.jsx'
import { deliver, onServiceWorkerMessage, setForegroundHandler } from './services/notifications.js'
import { applyNotificationAction, captureText, readLaunchParams } from './integrations/capture.js'

const NAV = [
  { id: 'today', label: 'Today', icon: Sun },
  { id: 'plan', label: 'Plan', icon: CalendarDays },
  { id: 'goals', label: 'Goals', icon: Target },
  { id: 'reflect', label: 'Reflect', icon: Feather },
]

const VIEWS = { today: Today, plan: Plan, goals: Goals, reflect: Reflect, settings: Settings }

// Act on instructions from a launch URL, a notification tap or a share.
function handleLaunch(params) {
  if (params.capture) {
    const result = captureText(params.capture.text, params.capture)
    if (result?.type === 'item') toast(`Added “${result.parsed.title}” to your plan`)
    else if (result) {
      toast('Captured to your Inbox', { action: 'Sort now', onAction: openInbox })
    }
  }
  if (params.open?.itemId) openItem(params.open.itemId, params.open.date)
  if (params.breathe) openBreathe()
  if (params.quickAdd) openQuickAdd()
}

function handleUrl(url) {
  try {
    const u = new URL(url, location.origin)
    const route = u.pathname.replace(/^\/+/, '').split('/')[0] || 'today'
    navigate(route, { search: u.search })
    handleLaunch(readLaunchParams())
  } catch {
    /* ignore malformed */
  }
}

function showForegroundReminder(r) {
  const actions = []
  if (r.kind === 'item') {
    actions.push({ label: 'Focus', onClick: () => openFocus(r.data.itemId, r.data.date) })
    actions.push({ label: 'Done', onClick: () => setCheck(r.data.itemId, r.data.date, 'done') })
    chime()
  } else if (r.kind === 'evening') actions.push({ label: 'Reflect', onClick: () => handleUrl(r.url) })
  else if (r.kind === 'pause') actions.push({ label: 'Breathe', onClick: openBreathe })
  else if (r.kind === 'morning') actions.push({ label: 'Open today', onClick: () => navigate('today') })
  navigator.vibrate?.([30, 40, 30])
  banner({ title: r.title, body: r.body, actions })
}

function LayerHost() {
  const { layer } = useUI()
  const last = useRef({})
  if (layer) last.current[layer.type] = layer
  const props = (type) => ({ ...last.current[type], open: layer?.type === type, onClose: closeLayer })
  const L = last.current
  return (
    <>
      {L.quick && <QuickAdd key={L.quick.key} {...props('quick')} />}
      {L.item && <ItemSheet key={L.item.key} {...props('item')} />}
      {L.goal && <GoalSheet key={L.goal.key} {...props('goal')} />}
      {L.inbox && <InboxSheet key="inbox" {...props('inbox')} />}
      {L.focus && <Focus key={L.focus.key} {...props('focus')} />}
      {L.breathe && <Breathe key="breathe" {...props('breathe')} />}
    </>
  )
}

function useShortcuts(enabled) {
  useEffect(() => {
    if (!enabled) return
    const onKey = (e) => {
      if (e.metaKey || e.ctrlKey || e.altKey || e.defaultPrevented) return
      const t = e.target
      if (t.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(t.tagName)) return
      if (document.querySelector('.overlay, .immersive')) return
      const k = e.key.toLowerCase()
      const map = {
        n: () => openQuickAdd(),
        v: openVoice,
        t: () => navigate('today'),
        b: openBreathe,
        i: openInbox,
        ',': () => navigate('settings'),
        1: () => navigate('today'),
        2: () => navigate('plan'),
        3: () => navigate('goals'),
        4: () => navigate('reflect'),
      }
      if (map[k]) {
        e.preventDefault()
        map[k]()
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [enabled])
}

export default function App({ launch }) {
  const state = useStore()
  const route = useRoute()
  const { theme, accent, clock24 } = state.settings
  const onboarded = state.profile.onboarded
  setClock24(clock24)

  useEffect(() => {
    applyTheme({ theme, accent })
    if (theme !== 'system') return
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const onChange = () => applyTheme({ theme, accent })
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [theme, accent])

  useEffect(() => {
    setForegroundHandler(showForegroundReminder)
    onServiceWorkerMessage((msg) => {
      if (msg?.type === 'open' && msg.url) handleUrl(msg.url)
      else if (msg?.type === 'reminder' && msg.reminder) deliver({ ...msg.reminder, at: new Date(msg.reminder.at) }, { system: false })
      else if (msg?.type === 'action') applyNotificationAction(msg.action)
    })
  }, [])

  const handled = useRef(false)
  useEffect(() => {
    if (!onboarded || handled.current) return
    handled.current = true
    handleLaunch(launch ?? {})
  }, [onboarded, launch])

  useShortcuts(onboarded)

  if (!onboarded) {
    return (
      <>
        <Onboarding />
        <Toasts />
      </>
    )
  }

  const View = VIEWS[route] ?? Today
  const inboxCount = Object.values(state.inbox).filter((i) => !i.deleted).length

  return (
    <div className="shell">
      <nav className="sidebar" aria-label="Main">
        <div className="brand">
          <Logo /> Cadence
        </div>
        <button className="btn primary side-new" onClick={() => openQuickAdd()}>
          <Plus size={17} /> New <span className="kbd" style={{ marginLeft: 'auto', color: 'inherit', borderColor: 'currentColor', opacity: 0.6 }}>N</span>
        </button>
        {NAV.map(({ id, label, icon: Icon }) => (
          <button key={id} className="side-link" aria-current={route === id ? 'page' : undefined} onClick={() => navigate(id)}>
            <Icon size={18} /> {label}
          </button>
        ))}
        <button className="side-link" onClick={openInbox}>
          <InboxIcon size={18} /> Inbox {inboxCount > 0 && <span className="badge">{inboxCount}</span>}
        </button>
        <div className="side-foot">
          {voiceSupported() && (
            <button className="side-link" onClick={openVoice}>
              <Mic size={18} /> Speak <span className="kbd" style={{ marginLeft: 'auto' }}>V</span>
            </button>
          )}
          <button className="side-link" onClick={openBreathe}>
            <Wind size={18} /> Breathe
          </button>
          <button className="side-link" aria-current={route === 'settings' ? 'page' : undefined} onClick={() => navigate('settings')}>
            <SettingsIcon size={18} /> Settings
          </button>
        </div>
      </nav>

      <main className="main">
        <div className="topbar mobile-only">
          <div className="page topbar-inner">
            <div className="brand" style={{ fontSize: 19 }}>
              <Logo className="brand-mark" /> Cadence
            </div>
            <span className="spacer" />
            <button className="icon-btn" onClick={openBreathe} aria-label="Breathe">
              <Wind size={20} />
            </button>
            <button className="icon-btn" onClick={openInbox} aria-label={`Inbox${inboxCount ? `, ${inboxCount} items` : ''}`}>
              <InboxIcon size={20} />
              {inboxCount > 0 && <span className="badge">{inboxCount}</span>}
            </button>
            <button className="icon-btn" onClick={() => navigate('settings')} aria-label="Settings" aria-current={route === 'settings' ? 'page' : undefined}>
              <SettingsIcon size={20} />
            </button>
          </div>
        </div>
        <ErrorBoundary key={route}>
          <View />
        </ErrorBoundary>
      </main>

      <nav className="tabbar" aria-label="Main">
        {NAV.map(({ id, label, icon: Icon }) => (
          <button key={id} className="tab" aria-current={route === id ? 'page' : undefined} onClick={() => navigate(id)}>
            <Icon size={22} strokeWidth={route === id ? 2.2 : 1.8} />
            {label}
          </button>
        ))}
      </nav>

      {voiceSupported() && (
        <button className="fab-voice" onClick={openVoice} aria-label="Speak to add to your plan">
          <Mic size={20} />
        </button>
      )}
      <button className="fab" onClick={() => openQuickAdd()} aria-label="Add to your plan">
        <Plus size={26} />
      </button>

      <ErrorBoundary>
        <LayerHost />
      </ErrorBoundary>
      <Toasts />
    </div>
  )
}
