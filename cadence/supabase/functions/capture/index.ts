// Cadence capture webhook: anything that can make a web request can drop
// a thought into your Cadence inbox — iPhone Shortcuts automations for texts
// and email, Zapier, IFTTT, Make, Gmail Apps Script, curl.
//
//   POST /functions/v1/capture?token=<your token>
//   { "text": "Dinner with Sam Friday 7pm", "source": "sms", "from": "Sam" }
//
// Also accepts form posts, text/plain bodies and GET ?text=...
// Deploy with --no-verify-jwt: callers authenticate with their token instead.

import { createClient } from 'npm:@supabase/supabase-js@2'

const cors = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET, POST, OPTIONS',
  'access-control-allow-headers': 'content-type, x-cadence-token, authorization',
}
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, 'content-type': 'application/json' } })

async function readInput(req: Request, url: URL) {
  const fromQuery = { text: url.searchParams.get('text'), source: url.searchParams.get('source'), from: url.searchParams.get('from') }
  if (req.method === 'GET') return fromQuery
  const type = req.headers.get('content-type') ?? ''
  if (type.includes('application/json')) {
    const b = await req.json().catch(() => ({}))
    const text = b.text ?? [b.subject, b.body ?? b.message].filter(Boolean).join('\n')
    return { text, source: b.source ?? fromQuery.source, from: b.from ?? b.sender ?? null }
  }
  if (type.includes('form')) {
    const f = await req.formData()
    return { text: String(f.get('text') ?? f.get('Body') ?? ''), source: String(f.get('source') ?? fromQuery.source ?? ''), from: String(f.get('from') ?? f.get('From') ?? '') }
  }
  return { ...fromQuery, text: (await req.text()) || fromQuery.text }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: cors })
  if (!['GET', 'POST'].includes(req.method)) return json({ error: 'method not allowed' }, 405)

  const url = new URL(req.url)
  const token = url.searchParams.get('token') ?? req.headers.get('x-cadence-token') ?? req.headers.get('authorization')?.replace(/^Bearer\s+/i, '')
  if (!token || token.length < 32) return json({ error: 'missing or invalid token' }, 401)

  const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } })
  const { data: owner } = await db.from('cadence_capture_tokens').select('user_id').eq('token', token).maybeSingle()
  if (!owner) return json({ error: 'unknown token' }, 401)

  const input = await readInput(req, url)
  const text = String(input.text ?? '').trim().slice(0, 4000)
  if (!text) return json({ error: 'nothing to capture — send { "text": "..." }' }, 400)

  // Gentle flood protection: at most 60 captures a minute per person.
  const { count } = await db.from('cadence_inbox').select('id', { count: 'exact', head: true }).eq('user_id', owner.user_id).gte('created_at', new Date(Date.now() - 60e3).toISOString())
  if ((count ?? 0) >= 60) return json({ error: 'slow down' }, 429)

  const source = String(input.source || 'webhook').slice(0, 40).toLowerCase()
  const meta = input.from ? { from: String(input.from).slice(0, 200) } : {}
  const { error } = await db.from('cadence_inbox').insert({ user_id: owner.user_id, text, source, meta })
  if (error) return json({ error: error.message }, 500)
  return json({ ok: true, captured: text.slice(0, 120) }, 201)
})
