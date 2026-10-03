// Merging two copies of the planner (this device and the cloud). Every entity
// carries `updatedAt`, deletions are kept as tombstones, and the newer
// version of each entity wins, so edits made on different devices combine.

export const COLLECTIONS = ['items', 'goals', 'checks', 'days', 'reviews', 'inbox', 'notes']
const SINGLETONS = ['profile', 'settings']
const TOMBSTONE_TTL = 60 * 86400e3

const newer = (a, b) => ((b?.updatedAt ?? 0) > (a?.updatedAt ?? 0) ? b : a)

function mergeMap(a = {}, b = {}) {
  const out = { ...a }
  for (const [k, v] of Object.entries(b)) out[k] = k in out ? newer(out[k], v) : v
  return out
}

export function mergeStates(local, remote) {
  if (!remote) return local
  if (!local) return remote
  const out = { ...local }
  for (const c of COLLECTIONS) out[c] = mergeMap(local[c], remote[c])
  for (const s of SINGLETONS) out[s] = newer(local[s], remote[s])
  return out
}

export function pruneTombstones(state, now = Date.now()) {
  const out = { ...state }
  for (const c of COLLECTIONS) {
    const map = state[c] ?? {}
    if (!Object.values(map).some((v) => v?.deleted && now - (v.updatedAt ?? 0) > TOMBSTONE_TTL)) continue
    out[c] = Object.fromEntries(Object.entries(map).filter(([, v]) => !(v?.deleted && now - (v.updatedAt ?? 0) > TOMBSTONE_TTL)))
  }
  return out
}

// Stable fingerprint of what would change on the other side.
export function sameContent(a, b) {
  for (const c of COLLECTIONS) {
    const x = a?.[c] ?? {}
    const y = b?.[c] ?? {}
    const keys = Object.keys(x)
    if (keys.length !== Object.keys(y).length) return false
    for (const k of keys) if (x[k]?.updatedAt !== y[k]?.updatedAt) return false
  }
  return SINGLETONS.every((s) => a?.[s]?.updatedAt === b?.[s]?.updatedAt)
}
