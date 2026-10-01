import { useState } from 'react'
import { ArrowLeft, Bell, Check as CheckIcon, Share, SquarePlus } from 'lucide-react'
import { useStore } from '../store/store.js'
import { addGoal, addItems, replaceState, updateProfile } from '../store/actions.js'
import { IS_PREVIEW } from '../preview.js'
import { AreaChips, Check, toast } from '../components/ui.jsx'
import { Logo } from '../components/Logo.jsx'
import { AREAS, areaColor } from '../lib/areas.js'
import { todayKey, yearOf } from '../lib/dates.js'
import { uid } from '../lib/ids.js'
import { routineTemplates } from '../store/defaults.js'
import { enableNotifications, needsInstallForNotifications, notificationsSupported } from '../services/notifications.js'

const STEPS = ['welcome', 'name', 'rhythm', 'year', 'routine', 'notify']

export default function Onboarding() {
  const { profile } = useStore()
  const [step, setStep] = useState(0)
  const [name, setName] = useState(profile.name ?? '')
  const [wake, setWake] = useState(profile.wake ?? '07:00')
  const [sleep, setSleep] = useState(profile.sleep ?? '22:30')
  const [goal, setGoal] = useState('')
  const [goalArea, setGoalArea] = useState(null)
  const [picked, setPicked] = useState(() => new Set(['intention', 'move', 'winddown']))
  const [notify, setNotify] = useState(null)
  const templates = routineTemplates({ wake, sleep })
  const id = STEPS[step]

  const next = () => setStep((s) => Math.min(STEPS.length - 1, s + 1))
  const back = () => setStep((s) => Math.max(0, s - 1))

  function finish() {
    const today = todayKey()
    addItems(
      templates
        .filter((t) => picked.has(t.key))
        .map((t) => ({ id: uid('it'), title: t.title, notes: '', date: today, start: t.start, end: t.end, area: t.area, goalId: null, repeat: t.repeat, reminder: t.reminder, source: 'template' })),
    )
    if (goal.trim()) addGoal({ title: goal.trim(), horizon: 'year', period: yearOf(today), area: goalArea })
    updateProfile({ name: name.trim(), wake, sleep, onboarded: true })
  }

  return (
    <div className="onboard">
      {step > 0 && (
        <div className="onboard-progress" aria-hidden>
          {STEPS.slice(1).map((s, i) => (
            <i key={s} className={i < step ? 'on' : ''} />
          ))}
        </div>
      )}

      <div className="onboard-body" key={id}>
        {id === 'welcome' && (
          <>
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 16, paddingTop: 40 }}>
              <Logo className="hero-mark" />
              <h1 className="display" style={{ fontSize: 44 }}>
                Cadence
              </h1>
              <p className="serif" style={{ fontSize: 22, lineHeight: 1.35, color: 'var(--text-2)', fontStyle: 'italic' }}>
                Plan with intention.
                <br />
                Live with rhythm.
              </p>
              <p className="muted" style={{ maxWidth: 380 }}>
                Your days, weeks, months and year in one calm place — with gentle reminders, goals that connect to your time, and space to reflect.
              </p>
            </div>
          </>
        )}

        {id === 'name' && (
          <>
            <h1 className="display">What should we call you?</h1>
            <p className="muted">Just for greetings. It stays on your device.</p>
            <input className="input" style={{ fontSize: 20, minHeight: 56 }} placeholder="Your first name" value={name} onChange={(e) => setName(e.target.value)} autoFocus onKeyDown={(e) => e.key === 'Enter' && next()} enterKeyHint="next" />
          </>
        )}

        {id === 'rhythm' && (
          <>
            <h1 className="display">Your natural rhythm</h1>
            <p className="muted">Cadence shapes your day around when you wake and when you wind down — and won’t nudge you outside of it.</p>
            <div className="list">
              <label className="setting">
                <span className="setting-text">
                  <span className="setting-title">I usually wake up at</span>
                </span>
                <input type="time" className="input" value={wake} onChange={(e) => e.target.value && setWake(e.target.value)} />
              </label>
              <label className="setting">
                <span className="setting-text">
                  <span className="setting-title">I like to be in bed by</span>
                </span>
                <input type="time" className="input" value={sleep} onChange={(e) => e.target.value && setSleep(e.target.value)} />
              </label>
            </div>
          </>
        )}

        {id === 'year' && (
          <>
            <h1 className="display">What would make {yearOf(todayKey())} meaningful?</h1>
            <p className="muted">One goal is plenty to start. You can break it into monthly and weekly steps later.</p>
            <input className="input" style={{ fontSize: 18, minHeight: 54 }} placeholder="e.g. Run a half marathon, finish my degree…" value={goal} onChange={(e) => setGoal(e.target.value)} autoFocus />
            <div className="field">
              <span className="label">Which part of life is it about?</span>
              <AreaChips value={goalArea} onChange={setGoalArea} areas={AREAS} />
            </div>
          </>
        )}

        {id === 'routine' && (
          <>
            <h1 className="display">Start with a gentle routine?</h1>
            <p className="muted">Pick any that feel right. Edit or remove them anytime.</p>
            <div className="list">
              {templates.map((t) => {
                const on = picked.has(t.key)
                const toggle = () =>
                  setPicked((p) => {
                    const n = new Set(p)
                    if (on) n.delete(t.key)
                    else n.add(t.key)
                    return n
                  })
                return (
                  <div key={t.key} className="template" onClick={toggle} role="presentation" style={{ cursor: 'pointer' }}>
                    <Check checked={on} color={areaColor(t.area)} onToggle={toggle} label={t.title} />
                    <span className="grow">
                      <span style={{ fontWeight: 550, display: 'block' }}>{t.title}</span>
                      <span className="small muted">{t.hint}</span>
                    </span>
                    <span className="area-dot" style={{ background: areaColor(t.area) }} />
                  </div>
                )
              })}
            </div>
          </>
        )}

        {id === 'notify' && (
          <>
            <h1 className="display">Stay on rhythm</h1>
            <p className="muted">A nudge before each block, a morning check-in and an evening wind-down. Calm, never naggy.</p>
            {IS_PREVIEW ? (
              <p className="small muted">Reminders turn on once Cadence is installed from your own web address. This preview can’t send notifications.</p>
            ) : needsInstallForNotifications() ? (
              <div className="card pad stack" style={{ gap: 10 }}>
                <strong style={{ fontWeight: 600 }}>On iPhone, add Cadence to your Home Screen first</strong>
                <ol className="steps">
                  <li>
                    Tap <Share size={14} style={{ verticalAlign: '-2px' }} /> <strong>Share</strong> in Safari
                  </li>
                  <li>
                    Choose <SquarePlus size={14} style={{ verticalAlign: '-2px' }} /> <strong>Add to Home Screen</strong>
                  </li>
                  <li>Open Cadence from your Home Screen and turn on reminders in Settings</li>
                </ol>
              </div>
            ) : notificationsSupported() ? (
              <button className={`btn lg ${notify === 'granted' ? 'soft' : 'primary'}`} onClick={async () => setNotify(await enableNotifications())} disabled={notify === 'granted'}>
                {notify === 'granted' ? <CheckIcon size={18} /> : <Bell size={18} />}
                {notify === 'granted' ? 'Reminders are on' : 'Turn on reminders'}
              </button>
            ) : (
              <p className="small muted">This browser can’t show notifications. Cadence will remind you inside the app while it’s open.</p>
            )}
            {notify === 'denied' && <p className="small muted">Notifications are blocked for this site. You can allow them later in your browser’s site settings.</p>}
          </>
        )}
      </div>

      <div className="onboard-foot">
        {step > 0 && (
          <button className="btn ghost lg" onClick={back} aria-label="Back">
            <ArrowLeft size={18} />
          </button>
        )}
        <span className="spacer" />
        {id === 'welcome' && IS_PREVIEW && (
          <button
            className="btn ghost lg"
            onClick={async () => {
              const { sampleState } = await import('../store/sample.js')
              replaceState(sampleState())
              toast('Example plans loaded. Settings → Start fresh clears them.')
            }}
          >
            Explore with examples
          </button>
        )}
        {id === 'year' && !goal.trim() && (
          <button className="btn ghost lg" onClick={next}>
            Skip
          </button>
        )}
        {id === 'notify' ? (
          <button className="btn primary lg" onClick={finish}>
            Begin
          </button>
        ) : (
          <button className="btn primary lg" onClick={next} style={{ minWidth: 140 }}>
            {id === 'welcome' ? 'Get started' : 'Continue'}
          </button>
        )}
      </div>
    </div>
  )
}
