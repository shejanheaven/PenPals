// Accent palettes: [accent, stronger] for light and dark surfaces.
export const ACCENTS = {
  sage: { label: 'Sage', light: ['#4d7c6c', '#3a6556'], dark: ['#86bba8', '#a6d3c2'] },
  ocean: { label: 'Ocean', light: ['#3c6d9c', '#2e5883'], dark: ['#8cb7e0', '#abcdee'] },
  plum: { label: 'Plum', light: ['#7556a5', '#61448f'], dark: ['#b99ee4', '#cfb9f1'] },
  clay: { label: 'Clay', light: ['#ad5f3d', '#934d2f'], dark: ['#e69d79', '#f1b597'] },
  rose: { label: 'Rose', light: ['#ab4a67', '#913a55'], dark: ['#e897b0', '#f2b2c5'] },
  ink: { label: 'Ink', light: ['#3e4552', '#2b313b'], dark: ['#bec6d2', '#d5dbe4'] },
}

// When embedded by a host that sets its own theme (the preview), follow it.
const hostTheme = typeof document !== 'undefined' ? document.documentElement.getAttribute('data-theme') : null

export function resolveTheme(theme) {
  if (theme === 'light' || theme === 'dark') return theme
  if (import.meta.env.VITE_PREVIEW === '1' && (hostTheme === 'light' || hostTheme === 'dark')) return hostTheme
  return typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

export function applyTheme({ theme, accent }) {
  const mode = resolveTheme(theme)
  const root = document.documentElement
  root.dataset.theme = mode
  const palette = ACCENTS[accent] ?? ACCENTS.sage
  const [main, strong] = palette[mode]
  root.style.setProperty('--accent', main)
  root.style.setProperty('--accent-strong', strong)
  root.style.setProperty('--accent-soft', `color-mix(in srgb, ${main} ${mode === 'dark' ? 16 : 12}%, transparent)`)
  root.style.setProperty('--accent-contrast', mode === 'dark' ? '#10171a' : '#ffffff')
  const meta = document.querySelector('meta[name="theme-color"]')
  if (meta) meta.setAttribute('content', mode === 'dark' ? '#0f1112' : '#f5f3ee')
}
