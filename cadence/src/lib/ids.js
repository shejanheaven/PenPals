export function uid(prefix = '') {
  const bytes = new Uint8Array(9)
  crypto.getRandomValues(bytes)
  const id = Array.from(bytes, (b) => b.toString(36).padStart(2, '0')).join('').slice(0, 14)
  return prefix ? `${prefix}_${id}` : id
}

export function randomToken(length = 32) {
  const bytes = new Uint8Array(length)
  crypto.getRandomValues(bytes)
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
}

// Small stable hash, used to pick a calm phrase deterministically.
export function hash(str) {
  let h = 2166136261
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}
