// Sends Cadence reminders that have fallen due as Web Push notifications.
// Called every minute by pg_cron (see ../../cron.sql).
//
// Secrets (supabase secrets set ...):
//   CRON_SECRET, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT (mailto:you@example.com)
// SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are provided automatically.

import { createClient } from 'npm:@supabase/supabase-js@2'
import webpush from 'npm:web-push@3.6.7'

const env = (k: string) => {
  const v = Deno.env.get(k)
  if (!v) throw new Error(`Missing secret ${k}`)
  return v
}

webpush.setVapidDetails(Deno.env.get('VAPID_SUBJECT') ?? 'mailto:cadence@example.com', env('VAPID_PUBLIC_KEY'), env('VAPID_PRIVATE_KEY'))

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

type Reminder = { user_id: string; id: string; fire_at: string; title: string; body: string | null; tag: string | null; url: string | null; data: Record<string, unknown> | null }
type Subscription = { user_id: string; endpoint: string; p256dh: string; auth: string }

Deno.serve(async (req) => {
  if (req.headers.get('authorization') !== `Bearer ${env('CRON_SECRET')}`) return json({ error: 'unauthorized' }, 401)

  const db = createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'), { auth: { persistSession: false } })

  const { data: due, error } = await db.rpc('cadence_claim_due_reminders', { max_rows: 500 })
  if (error) return json({ error: error.message }, 500)
  const reminders = (due ?? []) as Reminder[]

  let sent = 0
  const dead = new Set<string>()
  if (reminders.length) {
    const users = [...new Set(reminders.map((r) => r.user_id))]
    const { data: subs } = await db.from('cadence_push_subscriptions').select('user_id, endpoint, p256dh, auth').in('user_id', users)
    const byUser = new Map<string, Subscription[]>()
    for (const s of (subs ?? []) as Subscription[]) byUser.set(s.user_id, [...(byUser.get(s.user_id) ?? []), s])

    await Promise.all(
      reminders.flatMap((r) =>
        (byUser.get(r.user_id) ?? []).map(async (s) => {
          const payload = JSON.stringify({ id: r.id, title: r.title, body: r.body, tag: r.tag, url: r.url, data: r.data, at: r.fire_at })
          try {
            await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload, { TTL: 15 * 60, urgency: 'high' })
            sent++
          } catch (err) {
            const code = (err as { statusCode?: number }).statusCode
            if (code === 404 || code === 410) dead.add(s.endpoint)
            else console.error('push failed', code, (err as Error).message)
          }
        }),
      ),
    )
  }

  if (dead.size) await db.from('cadence_push_subscriptions').delete().in('endpoint', [...dead])
  // Keep the table small.
  await db.from('cadence_reminders').delete().lt('fire_at', new Date(Date.now() - 2 * 86400e3).toISOString())

  return json({ due: reminders.length, sent, removedSubscriptions: dead.size })
})
