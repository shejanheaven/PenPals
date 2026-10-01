import { useSyncExternalStore } from 'react'
import { device, getState, migrate, onLocalChange, setState } from '../store/store.js'
import { addInbox } from '../store/actions.js'
import { mergeStates, pruneTombstones, sameContent } from '../lib/merge.js'
import { upcomingReminders } from '../lib/reminders.js'
import { randomToken } from '../lib/ids.js'
import { getRegistration, onNotificationsEnabled, permission } from './notifications.js'

// Optional cloud (Supabase). With it you get: one planner across phone and
// computer, push reminders that arrive even when the app is closed, and a
// private webhook that turns texts, emails and automations into inbox items.
// Without it, Cadence works fully on this device.

const URL_ = import.meta.env.VITE_SUPABASE_URL
const KEY = import.meta.env.VITE_SUPABASE_ANON_KEY
const VAPID = import.meta.env.VITE_VAPID_PUBLIC_KEY

export const cloudConfigured = () => !!(URL_ && KEY)
export const pushConfigured = () => cloudConfigured() && !!VAPID
export const captureEndpoint = () => (URL_ ? `${URL_.replace(/\/$/, '')}/functions/v1/capture` : null)

// ── Status store for the UI ─────────────────────────────────────────────────

let status = { ready: !cloudConfigured(), user: null, syncing: false, error: null, lastSync: device.get().lastSync || 0, push: false }
const subs = new Set()
const setStatus = (patch) => {
  status = { ...status, ...patch }
  subs.forEach((fn) => fn())
}
export const useCloud = () =>
  useSyncExternalStore(
    (fn) => {
      subs.add(fn)
      return () => subs.delete(fn)
    },
    () => status,
  )

let client = null
async function getClient() {
  if (!cloudConfigured()) return null
  if (!client) {
    const { createClient } = await import('@supabase/supabase-js')
    client = createClient(URL_, KEY, { auth: { persistSession: true, autoRefreshToken: true, storageKey: 'cadence:auth' } })
  }
  return client
}

export async function initCloud() {
  const c = await getClient()
  if (!c) return
  let timer = null
  const scheduleSync = (ms) => {
    clearTimeout(timer)
    timer = setTimeout(() => syncNow(), ms)
  }

  const { data } = await c.auth.getSession()
  setStatus({ ready: true, user: data.session?.user ?? null })
  c.auth.onAuthStateChange((event, session) => {
    setStatus({ user: session?.user ?? null })
    if (session && event === 'SIGNED_IN') {
      scheduleSync(0)
      if (device.get().notifications && permission() === 'granted') subscribePush()
    }
  })
  onLocalChange(() => scheduleSync(2500))
  window.addEventListener('focus', () => scheduleSync(300))
  window.addEventListener('online', () => scheduleSync(300))
  document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && scheduleSync(300))
  setInterval(() => document.visibilityState === 'visible' && syncNow(), 5 * 60e3)

  onNotificationsEnabled(() => status.user && subscribePush())
  if (status.user) {
    scheduleSync(0)
    if (device.get().notifications && permission() === 'granted') subscribePush()
  }
}

// ── Account ─────────────────────────────────────────────────────────────────

export async function signIn(email, password) {
  const c = await getClient()
  const { error } = await c.auth.signInWithPassword({ email, password })
  if (error) throw error
}

export async function signUp(email, password) {
  const c = await getClient()
  const { data, error } = await c.auth.signUp({ email, password })
  if (error) throw error
  return { needsConfirmation: !data.session }
}

export async function signOut() {
  const c = await getClient()
  await unsubscribePush().catch(() => {})
  await c.auth.signOut()
  setStatus({ user: null, push: false })
}

// ── Sync ────────────────────────────────────────────────────────────────────

let inFlight = null
export function syncNow() {
  if (!status.user) return Promise.resolve()
  if (inFlight) return inFlight
  inFlight = doSync().finally(() => {
    inFlight = null
  })
  return inFlight
}

async function doSync() {
  const c = await getClient()
  const user = status.user
  setStatus({ syncing: true, error: null })
  try {
    const { data, error } = await c.from('cadence_state').select('data').eq('user_id', user.id).maybeSingle()
    if (error) throw error
    const remote = data?.data ? migrate(data.data) : null
    const local = getState()
    const merged = pruneTombstones(mergeStates(local, remote))
    if (!sameContent(merged, local)) setState(merged, { remote: true })
    if (!remote || !sameContent(merged, remote)) {
      const { error: upErr } = await c.from('cadence_state').upsert({ user_id: user.id, data: merged, updated_at: new Date().toISOString() })
      if (upErr) throw upErr
    }
    await pullInbox(c, user)
    await pushReminders(c, user)
    const lastSync = Date.now()
    device.set({ lastSync })
    setStatus({ syncing: false, lastSync })
  } catch (err) {
    console.warn('Cadence sync failed', err)
    setStatus({ syncing: false, error: err.message ?? String(err) })
  }
}

async function pullInbox(c, user) {
  const { data, error } = await c.from('cadence_inbox').select('*').eq('user_id', user.id).order('created_at').limit(100)
  if (error || !data?.length) return
  for (const row of data) addInbox({ id: `srv_${row.id}`, text: row.text, source: row.source ?? 'webhook', meta: row.meta ?? {}, receivedAt: Date.parse(row.created_at) })
  await c.from('cadence_inbox').delete().in('id', data.map((r) => r.id))
}

// The push server sends whatever is in this table when it falls due.
async function pushReminders(c, user) {
  const rows = upcomingReminders(getState(), { hours: 72 }).map((r) => ({
    user_id: user.id,
    id: r.id,
    fire_at: r.at.toISOString(),
    title: r.title,
    body: r.body,
    tag: r.tag,
    url: r.url,
    data: { kind: r.kind, ...r.data },
  }))
  const { error: delErr } = await c.from('cadence_reminders').delete().eq('user_id', user.id).is('sent_at', null)
  if (delErr) throw delErr
  if (rows.length) {
    const { error } = await c.from('cadence_reminders').upsert(rows, { onConflict: 'user_id,id', ignoreDuplicates: true })
    if (error) throw error
  }
}

// ── Web Push ────────────────────────────────────────────────────────────────

function urlBase64ToUint8Array(base64) {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4)
  const raw = atob((base64 + padding).replace(/-/g, '+').replace(/_/g, '/'))
  return Uint8Array.from(raw, (ch) => ch.charCodeAt(0))
}

export async function subscribePush() {
  if (!pushConfigured() || !status.user || !('PushManager' in window)) return false
  const reg = await getRegistration()
  if (!reg) return false
  try {
    let sub = await reg.pushManager.getSubscription()
    if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(VAPID) })
    const json = sub.toJSON()
    const c = await getClient()
    const { error } = await c.from('cadence_push_subscriptions').upsert(
      { user_id: status.user.id, endpoint: json.endpoint, p256dh: json.keys.p256dh, auth: json.keys.auth, user_agent: navigator.userAgent.slice(0, 200) },
      { onConflict: 'endpoint' },
    )
    if (error) throw error
    device.set({ pushEndpoint: json.endpoint })
    setStatus({ push: true })
    return true
  } catch (err) {
    console.warn('Cadence: push subscription failed', err)
    setStatus({ push: false, error: err.message ?? String(err) })
    return false
  }
}

export async function unsubscribePush() {
  const reg = await getRegistration()
  const sub = await reg?.pushManager?.getSubscription()
  const endpoint = sub?.endpoint ?? device.get().pushEndpoint
  if (sub) await sub.unsubscribe().catch(() => {})
  const c = await getClient()
  if (c && endpoint) await c.from('cadence_push_subscriptions').delete().eq('endpoint', endpoint)
  device.set({ pushEndpoint: null })
  setStatus({ push: false })
}

// ── Capture webhook token ───────────────────────────────────────────────────

export async function getCaptureToken({ rotate = false } = {}) {
  const c = await getClient()
  if (!c || !status.user) return null
  if (!rotate) {
    const { data } = await c.from('cadence_capture_tokens').select('token').eq('user_id', status.user.id).maybeSingle()
    if (data?.token) return data.token
  }
  const token = randomToken(24)
  const { error } = await c.from('cadence_capture_tokens').upsert({ user_id: status.user.id, token }, { onConflict: 'user_id' })
  if (error) throw error
  return token
}
