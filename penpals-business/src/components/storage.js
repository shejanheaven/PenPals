// Storage abstraction — uses Supabase when logged in, localStorage when not
import { supabase } from "../supabase.js"

const LS_CONTACTS = "pp-contacts-v3"
const LS_CONVOS   = "pp-convos-v3"

// ── LocalStorage (guest mode) ─────────────────────────────────
export function lsGetContacts() {
  try { const s = localStorage.getItem(LS_CONTACTS); return s ? JSON.parse(s) : null } catch(e) { return null }
}
export function lsGetConvos() {
  try { const s = localStorage.getItem(LS_CONVOS); return s ? JSON.parse(s) : null } catch(e) { return null }
}
export function lsSaveContacts(c) {
  try { localStorage.setItem(LS_CONTACTS, JSON.stringify(c)) } catch(e) {}
}
export function lsSaveConvos(v) {
  try { localStorage.setItem(LS_CONVOS, JSON.stringify(v)) } catch(e) {}
}

// ── Supabase (account mode) ───────────────────────────────────
export async function dbLoadCustomPals(userId) {
  if (!supabase) return []
  const { data } = await supabase.from("custom_pals").select("*").eq("user_id", userId).order("created_at")
  return data || []
}

export async function dbSaveCustomPal(userId, pal) {
  if (!supabase) return
  await supabase.from("custom_pals").upsert({
    user_id: userId, pal_id: pal.id, name: pal.name,
    emoji: pal.emoji, persona: pal.persona, color_index: pal.colorIndex || 0
  }, { onConflict: "user_id,pal_id" })
}

export async function dbLoadMessages(userId, palId) {
  if (!supabase) return []
  const { data } = await supabase.from("messages").select("*")
    .eq("user_id", userId).eq("pal_id", palId).order("created_at")
  return (data || []).map(m => ({
    role: m.role, content: m.content, type: m.type || undefined,
    caption: m.caption, svgData: m.svg_data, time: m.msg_time,
    isErr: false
  }))
}

export async function dbSaveMessage(userId, palId, msg) {
  if (!supabase) return
  await supabase.from("messages").insert({
    user_id: userId, pal_id: palId, role: msg.role,
    content: msg.content || null, type: msg.type || "text",
    caption: msg.caption || null, svg_data: msg.svgData || null, msg_time: msg.time
  })
}

export async function dbUpdateSvg(userId, palId, msgIndex, svgData) {
  // Find the Nth message for this pal and update its svg_data
  if (!supabase) return
  const { data } = await supabase.from("messages").select("id").eq("user_id", userId).eq("pal_id", palId).order("created_at")
  if (data && data[msgIndex]) {
    await supabase.from("messages").update({ svg_data: svgData }).eq("id", data[msgIndex].id)
  }
}

export async function dbClearMessages(userId) {
  if (!supabase) return
  await supabase.from("messages").delete().eq("user_id", userId)
}

export async function dbClearCustomPals(userId) {
  if (!supabase) return
  await supabase.from("custom_pals").delete().eq("user_id", userId)
}
