import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Check as CheckIcon, Pause, Play, RotateCcw, Wind, X } from 'lucide-react'
import { useStore } from '../store/store.js'
import { setCheck } from '../store/actions.js'
import { openBreathe } from '../store/ui.js'
import { Seg, toast } from './ui.jsx'
import { atTime, fmtRange, todayKey } from '../lib/dates.js'
import { statusOf } from '../lib/stats.js'

// A soft two-note chime, made in the browser so it works offline.
export function chime() {
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext
    const ctx = new Ctx()
    ;[523.25, 783.99].forEach((freq, i) => {
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.type = 'sine'
      osc.frequency.value = freq
      const t = ctx.currentTime + i * 0.28
      gain.gain.setValueAtTime(0, t)
      gain.gain.linearRampToValueAtTime(0.18, t + 0.04)
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 2.2)
      osc.connect(gain).connect(ctx.destination)
      osc.start(t)
      osc.stop(t + 2.3)
    })
    setTimeout(() => ctx.close(), 3000)
  } catch {
    /* audio unavailable */
  }
}

function useWakeLock(active) {
  useEffect(() => {
    if (!active || !('wakeLock' in navigator)) return
    let lock = null
    let cancelled = false
    const request = () =>
      navigator.wakeLock
        .request('screen')
        .then((l) => {
          if (cancelled) l.release()
          else lock = l
        })
        .catch(() => {})
    request()
    const onVis = () => document.visibilityState === 'visible' && request()
    document.addEventListener('visibilitychange', onVis)
    return () => {
      cancelled = true
      document.removeEventListener('visibilitychange', onVis)
      lock?.release().catch(() => {})
    }
  }, [active])
}

function Immersive({ open, onClose, children, label }) {
  useEffect(() => {
    if (!open) return
    const onKey = (e) => e.key === 'Escape' && onClose()
    document.addEventListener('keydown', onKey)
    document.documentElement.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.documentElement.style.overflow = ''
    }
  }, [open, onClose])
  if (!open) return null
  return createPortal(
    <div className="immersive" role="dialog" aria-modal="true" aria-label={label}>
      <button className="icon-btn close" onClick={onClose} aria-label="Close">
        <X size={22} />
      </button>
      {children}
    </div>,
    document.body,
  )
}

const pad = (n) => String(n).padStart(2, '0')
const clock = (ms) => {
  const s = Math.max(0, Math.ceil(ms / 1000))
  return s >= 3600 ? `${Math.floor(s / 3600)}:${pad(Math.floor((s % 3600) / 60))}:${pad(s % 60)}` : `${Math.floor(s / 60)}:${pad(s % 60)}`
}

// ── Focus ───────────────────────────────────────────────────────────────────

export function Focus({ open, onClose, itemId, date = todayKey() }) {
  const state = useStore()
  const item = itemId ? state.items[itemId] : null
  const scheduledEnd = item?.start && item?.end && date === todayKey() ? atTime(date, item.end).getTime() : null
  const inBlock = scheduledEnd && Date.now() < scheduledEnd && Date.now() >= atTime(date, item.start).getTime()

  const [minutes, setMinutes] = useState(25)
  const [timer, setTimer] = useState(() => (inBlock ? { endsAt: scheduledEnd, total: scheduledEnd - atTime(date, item.start).getTime(), paused: null } : null))
  const [now, setNow] = useState(Date.now())
  const finishedRef = useRef(false)
  const running = timer && timer.paused == null
  const left = timer ? (timer.paused ?? timer.endsAt - now) : minutes * 60e3
  const total = timer?.total ?? minutes * 60e3
  const finished = timer && left <= 0
  useWakeLock(open && !!running)

  useEffect(() => {
    if (!open || !running) return
    const id = setInterval(() => setNow(Date.now()), 250)
    return () => clearInterval(id)
  }, [open, running])

  useEffect(() => {
    if (finished && !finishedRef.current) {
      finishedRef.current = true
      chime()
      navigator.vibrate?.([120, 80, 120])
    }
  }, [finished])

  const start = () => {
    finishedRef.current = false
    setNow(Date.now())
    setTimer({ endsAt: Date.now() + minutes * 60e3, total: minutes * 60e3, paused: null })
  }
  const togglePause = () => setTimer((t) => (t.paused == null ? { ...t, paused: t.endsAt - Date.now() } : { ...t, endsAt: Date.now() + t.paused, paused: null }))
  const complete = () => {
    if (item && statusOf(state, item.id, date) !== 'done') setCheck(item.id, date, 'done')
    toast(item ? `“${item.title}” — done with full attention.` : 'Focus session complete.')
    onClose()
  }

  const size = 280
  const r = 130
  const c = 2 * Math.PI * r
  const progress = timer ? 1 - Math.max(0, left) / total : 0

  return (
    <Immersive open={open} onClose={onClose} label="Focus">
      <div className="eyebrow">{finished ? 'Time' : 'Focus'}</div>
      <div className="focus-title">{item?.title ?? 'One thing, fully.'}</div>
      <div className="focus-ring-wrap">
        <svg viewBox={`0 0 ${size} ${size}`} style={{ transform: 'rotate(-90deg)' }} aria-hidden>
          <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="color-mix(in srgb, var(--accent) 14%, transparent)" strokeWidth={6} />
          <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--accent)" strokeWidth={6} strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - progress)} style={{ transition: 'stroke-dashoffset .3s linear' }} />
        </svg>
        <div>
          <div className="focus-time" role="timer" aria-live="off">
            {finished ? 'Done' : clock(left)}
          </div>
          {item?.start && <div className="small muted num">{fmtRange(item.start, item.end)}</div>}
        </div>
      </div>

      {!timer && (
        <div style={{ marginTop: 28 }}>
          <Seg
            label="Length"
            value={minutes}
            onChange={setMinutes}
            options={[15, 25, 45, 60].map((m) => ({ value: m, label: `${m} min` }))}
          />
        </div>
      )}

      <div className="focus-actions">
        {!timer && (
          <button className="btn primary lg" onClick={start}>
            <Play size={18} /> Begin
          </button>
        )}
        {timer && !finished && (
          <button className="btn secondary lg" onClick={togglePause}>
            {running ? <Pause size={18} /> : <Play size={18} />} {running ? 'Pause' : 'Resume'}
          </button>
        )}
        {finished && (
          <button
            className="btn secondary lg"
            onClick={() => {
              finishedRef.current = false
              setTimer({ endsAt: Date.now() + 5 * 60e3, total: 5 * 60e3, paused: null })
            }}
          >
            <RotateCcw size={18} /> 5 more min
          </button>
        )}
        {item && (
          <button className={`btn lg ${finished ? 'primary' : 'outline'}`} onClick={complete}>
            <CheckIcon size={18} /> Complete
          </button>
        )}
        {!timer && (
          <button className="btn ghost lg" onClick={openBreathe}>
            <Wind size={18} /> Breathe first
          </button>
        )}
      </div>
      <p className="small faint" style={{ marginTop: 22, maxWidth: 320 }}>
        {running ? 'If your mind wanders, notice it, and gently come back.' : 'Silence what you can. Then begin.'}
      </p>
    </Immersive>
  )
}

// ── Breathe ─────────────────────────────────────────────────────────────────

const PATTERNS = {
  box: { label: 'Box', phases: [['in', 4], ['hold', 4], ['out', 4], ['hold', 4]] },
  calm: { label: '4·7·8', phases: [['in', 4], ['hold', 7], ['out', 8]] },
  even: { label: 'Even', phases: [['in', 5], ['out', 5]] },
}
const WORDS = { in: 'Breathe in', hold: 'Hold', out: 'Breathe out' }

export function Breathe({ open, onClose }) {
  const [pattern, setPattern] = useState('box')
  const [minutes, setMinutes] = useState(1)
  const [run, setRun] = useState(null) // { phase, scale, secs, endAt, cycleEnds }
  const [count, setCount] = useState(0)
  const [done, setDone] = useState(false)
  const timeout = useRef(null)
  useWakeLock(open && !!run)

  useEffect(() => () => clearTimeout(timeout.current), [])
  useEffect(() => {
    if (!open) {
      clearTimeout(timeout.current)
      setRun(null)
      setDone(false)
    }
  }, [open])

  useEffect(() => {
    if (!run) return
    const id = setInterval(() => setCount(Math.max(1, Math.ceil((run.phaseEnd - Date.now()) / 1000))), 200)
    return () => clearInterval(id)
  }, [run])

  function begin() {
    setDone(false)
    const phases = PATTERNS[pattern].phases
    const stopAt = Date.now() + minutes * 60e3
    let scale = 0.45
    const step = (i) => {
      const [kind, secs] = phases[i % phases.length]
      if (i % phases.length === 0 && i > 0 && Date.now() >= stopAt) {
        setRun(null)
        setDone(true)
        chime()
        return
      }
      if (kind === 'in') scale = 0.9
      if (kind === 'out') scale = 0.45
      navigator.vibrate?.(15)
      setRun({ kind, scale, secs, phaseEnd: Date.now() + secs * 1000 })
      setCount(secs)
      timeout.current = setTimeout(() => step(i + 1), secs * 1000)
    }
    step(0)
  }

  return (
    <Immersive
      open={open}
      onClose={() => {
        clearTimeout(timeout.current)
        onClose()
      }}
      label="Breathe"
    >
      <div className="eyebrow">Breathe</div>
      <div className="breath-stage">
        <div className="breath-halo" />
        <div className="breath-orb" style={{ transform: `scale(${run?.scale ?? (done ? 0.7 : 0.55)})`, transitionDuration: `${run?.secs ?? 1}s` }} />
        <div style={{ position: 'relative', zIndex: 2 }}>
          <div className="breath-word" aria-live="polite">
            {run ? WORDS[run.kind] : done ? 'Well done' : 'Ready'}
          </div>
          {run && <div className="breath-count">{count}</div>}
        </div>
      </div>

      {done && <p className="muted" style={{ marginBottom: 18, maxWidth: 320 }}>Carry this calm into whatever comes next.</p>}

      {!run && (
        <div className="stack" style={{ gap: 10, width: 'min(360px, 100%)' }}>
          <Seg label="Pattern" value={pattern} onChange={setPattern} options={Object.entries(PATTERNS).map(([value, p]) => ({ value, label: p.label }))} />
          <Seg label="Length" value={minutes} onChange={setMinutes} options={[1, 3, 5].map((m) => ({ value: m, label: `${m} min` }))} />
          <button className="btn primary lg block" style={{ marginTop: 8 }} onClick={begin}>
            {done ? 'Again' : 'Begin'}
          </button>
        </div>
      )}
      {run && (
        <button
          className="btn ghost"
          onClick={() => {
            clearTimeout(timeout.current)
            setRun(null)
          }}
        >
          Stop
        </button>
      )}
    </Immersive>
  )
}
