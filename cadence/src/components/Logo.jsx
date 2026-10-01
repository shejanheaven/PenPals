import { useId } from 'react'

// The Cadence mark: an open circle (the cycle of days) holding a single
// point (this moment).
export function Logo({ className = 'brand-mark', title }) {
  const id = `cadence-g${useId().replace(/:/g, '')}`
  return (
    <svg className={className} viewBox="0 0 64 64" role={title ? 'img' : undefined} aria-label={title} aria-hidden={title ? undefined : true}>
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" style={{ stopColor: "color-mix(in srgb, var(--accent) 72%, white)" }} />
          <stop offset="1" style={{ stopColor: "var(--accent-strong)" }} />
        </linearGradient>
      </defs>
      <rect width="64" height="64" rx="18" fill={`url(#${id})`} />
      <path d="M42.6 21.4 A15 15 0 1 0 42.6 42.6" fill="none" stroke="#fff" strokeWidth="5.2" strokeLinecap="round" />
      <circle cx="46.5" cy="32" r="3.6" fill="#fff" />
    </svg>
  )
}
