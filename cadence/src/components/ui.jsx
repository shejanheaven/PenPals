import { useCallback, useEffect, useId, useRef, useState, useSyncExternalStore } from 'react'
import { createPortal } from 'react-dom'
import {
  BookOpen, Briefcase, Check as CheckIcon, ChevronLeft, ChevronRight, Circle, Flower2, HeartPulse, House, Minus, Sparkles, Sun, Users, Wallet, X,
} from 'lucide-react'
import { AREA_BY_ID, areaColor } from '../lib/areas.js'

const AREA_ICONS = { Briefcase, HeartPulse, Flower2, Users, BookOpen, House, Wallet, Sun }

// ── Sheet: bottom sheet on phones, centred dialog on larger screens ─────────

export function Sheet({ open, onClose, title, children, footer, labelledBy, wide = false, initialFocus = true }) {
  const [closing, setClosing] = useState(false)
  const [mounted, setMounted] = useState(open)
  const panel = useRef(null)
  const titleId = useId()

  useEffect(() => {
    if (open) {
      setMounted(true)
      setClosing(false)
    } else if (mounted) {
      setClosing(true)
      const t = setTimeout(() => {
        setMounted(false)
        setClosing(false)
      }, 180)
      return () => clearTimeout(t)
    }
  }, [open]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!mounted) return
    const prev = document.activeElement
    const onKey = (e) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        onClose?.()
      }
    }
    document.addEventListener('keydown', onKey)
    const html = document.documentElement
    const scrollY = window.scrollY
    html.style.overflow = 'hidden'
    if (initialFocus) {
      requestAnimationFrame(() => {
        const target = panel.current?.querySelector('[data-autofocus]') ?? panel.current
        target?.focus({ preventScroll: true })
      })
    }
    return () => {
      document.removeEventListener('keydown', onKey)
      html.style.overflow = ''
      window.scrollTo(0, scrollY)
      prev?.focus?.({ preventScroll: true })
    }
  }, [mounted]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!mounted) return null
  return createPortal(
    <div
      className={`overlay${closing ? ' closing' : ''}`}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose?.()
      }}
    >
      <div
        ref={panel}
        className="sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy ?? titleId}
        tabIndex={-1}
        style={wide ? { maxWidth: 760 } : undefined}
      >
        <div className="sheet-grip" />
        <div className="sheet-head">
          <h2 id={titleId}>{title}</h2>
          <button className="icon-btn" onClick={onClose} aria-label="Close">
            <X size={20} />
          </button>
        </div>
        <div className="sheet-body">{children}</div>
        {footer && <div className="sheet-foot">{footer}</div>}
      </div>
    </div>,
    document.body,
  )
}

// ── Small controls ──────────────────────────────────────────────────────────

export function Seg({ value, options, onChange, label, style }) {
  return (
    <div className="seg" role="group" aria-label={label} style={style}>
      {options.map((o) => (
        <button key={o.value} type="button" aria-pressed={value === o.value} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  )
}

export function Switch({ checked, onChange, label }) {
  return (
    <button type="button" role="switch" aria-checked={!!checked} aria-label={label} className="switch" onClick={() => onChange(!checked)} />
  )
}

export function Check({ checked, skipped, color, onToggle, label, size }) {
  return (
    <button
      type="button"
      className={`check${skipped ? ' skipped' : ''}`}
      role="checkbox"
      aria-checked={!!checked}
      aria-label={label}
      style={{ '--c': color ?? 'var(--accent)', ...(size ? { width: size, height: size } : null) }}
      onClick={(e) => {
        e.stopPropagation()
        if (!checked && navigator.vibrate) navigator.vibrate(8)
        onToggle?.()
      }}
    >
      {skipped ? <Minus size={14} strokeWidth={3} /> : <CheckIcon size={15} strokeWidth={3} />}
    </button>
  )
}

export function Ring({ value = 0, size = 44, stroke = 4, color = 'var(--accent)', track, children, label }) {
  const r = (size - stroke) / 2
  const c = 2 * Math.PI * r
  const v = Math.max(0, Math.min(1, value || 0))
  return (
    <div style={{ position: 'relative', width: size, height: size, flex: 'none' }} role={label ? 'img' : undefined} aria-label={label}>
      <svg className="ring" width={size} height={size}>
        <circle cx={size / 2} cy={size / 2} r={r} strokeWidth={stroke} stroke={track ?? `color-mix(in srgb, ${color} 16%, var(--surface-2))`} />
        <circle cx={size / 2} cy={size / 2} r={r} strokeWidth={stroke} stroke={color} strokeDasharray={c} strokeDashoffset={c * (1 - v)} />
      </svg>
      {children && (
        <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', fontSize: Math.max(10, size * 0.24), fontWeight: 650 }} className="num">
          {children}
        </div>
      )}
    </div>
  )
}

export function Bar({ value = 0, color, thin, label }) {
  return (
    <div className={`bar${thin ? ' thin' : ''}`} style={color ? { '--bar-color': color } : undefined} role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round((value || 0) * 100)} aria-label={label}>
      <span style={{ width: `${Math.max(0, Math.min(1, value || 0)) * 100}%` }} />
    </div>
  )
}

export function Empty({ icon: Icon = Sparkles, title, children, action, compact }) {
  return (
    <div className={`empty${compact ? ' compact' : ''}`}>
      {!compact && (
        <div className="empty-icon">
          <Icon size={24} />
        </div>
      )}
      {title && <h3>{title}</h3>}
      {children && <p>{children}</p>}
      {action}
    </div>
  )
}

export function AreaIcon({ id, size = 18 }) {
  const Icon = AREA_ICONS[AREA_BY_ID[id]?.icon] ?? Circle
  return <Icon size={size} />
}

export function AreaChips({ value, onChange, areas }) {
  return (
    <div className="chips">
      {areas.map((a) => (
        <button
          key={a.id}
          type="button"
          className="chip"
          aria-pressed={value === a.id}
          style={{ '--chip-color': areaColor(a.id) }}
          onClick={() => onChange(value === a.id ? null : a.id)}
        >
          <span className="dot" />
          {a.label}
        </button>
      ))}
    </div>
  )
}

export function PeriodNav({ label, onPrev, onNext, onToday, isCurrent, todayLabel = 'Today' }) {
  return (
    <div className="period-nav">
      <div className="period-label">{label}</div>
      {!isCurrent && (
        <button className="btn ghost sm" onClick={onToday}>
          {todayLabel}
        </button>
      )}
      <button className="icon-btn" onClick={onPrev} aria-label="Previous">
        <ChevronLeft size={20} />
      </button>
      <button className="icon-btn" onClick={onNext} aria-label="Next">
        <ChevronRight size={20} />
      </button>
    </div>
  )
}

// ── Toasts ──────────────────────────────────────────────────────────────────

let toasts = []
const toastSubs = new Set()
const emitToasts = () => toastSubs.forEach((fn) => fn())
let toastSeq = 0

export function toast(message, { action, onAction, duration = 4200 } = {}) {
  const id = ++toastSeq
  toasts = [...toasts.slice(-2), { id, message, action, onAction }]
  emitToasts()
  setTimeout(() => dismissToast(id), duration)
  return id
}

// A richer, longer-lived card used for in-app reminders.
export function banner({ title, body, actions = [], duration = 12000 }) {
  const id = ++toastSeq
  toasts = [...toasts.slice(-2), { id, title, body, actions, banner: true }]
  emitToasts()
  setTimeout(() => dismissToast(id), duration)
  return id
}

export function dismissToast(id) {
  toasts = toasts.filter((t) => t.id !== id)
  emitToasts()
}

export function Toasts() {
  const list = useSyncExternalStore(
    (fn) => {
      toastSubs.add(fn)
      return () => toastSubs.delete(fn)
    },
    () => toasts,
  )
  return createPortal(
    <div className="toasts" aria-live="polite">
      {list.map((t) =>
        t.banner ? (
          <div key={t.id} className="toast banner" role="status">
            <div className="toast-title">{t.title}</div>
            {t.body && <div className="toast-body">{t.body}</div>}
            <div className="toast-actions">
              {t.actions.map((a) => (
                <button
                  key={a.label}
                  className="btn sm ghost"
                  onClick={() => {
                    a.onClick?.()
                    dismissToast(t.id)
                  }}
                >
                  {a.label}
                </button>
              ))}
              <button className="btn sm ghost" onClick={() => dismissToast(t.id)}>
                Dismiss
              </button>
            </div>
          </div>
        ) : (
          <div key={t.id} className="toast" role="status">
            <span>{t.message}</span>
            {t.action ? (
              <button
                className="btn sm ghost"
                onClick={() => {
                  t.onAction?.()
                  dismissToast(t.id)
                }}
              >
                {t.action}
              </button>
            ) : (
              <span style={{ width: 8 }} />
            )}
          </div>
        ),
      )}
    </div>,
    document.body,
  )
}

// ── Hooks ───────────────────────────────────────────────────────────────────

// Re-render on a clock tick, and right away when the app comes back into view.
export function useNow(intervalMs = 30000) {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const tick = () => setNow(new Date())
    const id = setInterval(tick, intervalMs)
    const onVis = () => document.visibilityState === 'visible' && tick()
    document.addEventListener('visibilitychange', onVis)
    return () => {
      clearInterval(id)
      document.removeEventListener('visibilitychange', onVis)
    }
  }, [intervalMs])
  return now
}

export function useMediaQuery(query) {
  const get = useCallback(() => typeof window !== 'undefined' && window.matchMedia(query).matches, [query])
  return useSyncExternalStore(
    (fn) => {
      const mq = window.matchMedia(query)
      mq.addEventListener('change', fn)
      return () => mq.removeEventListener('change', fn)
    },
    get,
  )
}

export function copyText(text, message = 'Copied') {
  navigator.clipboard?.writeText(text).then(
    () => toast(message),
    () => toast('Could not copy — select and copy manually'),
  )
}
