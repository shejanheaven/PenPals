import { useRef, useState } from 'react'
import { ArrowLeft, Bell, Check as CheckIcon, Plus, Repeat, Share, SquarePlus, X } from 'lucide-react'
import { useStore } from '../store/store.js'
import { addGoal, addItems, replaceState, updateProfile } from '../store/actions.js'
import { IS_PREVIEW } from '../preview.js'
import { AreaChips, Switch, toast } from '../components/ui.jsx'
import { WeekEditor } from '../components/WeekEditor.jsx'
import { ParsedPreview, parsedToFields, useParser } from '../components/items.jsx'
import { Logo } from '../components/Logo.jsx'
import { AREAS, areaColor } from '../lib/areas.js'
import { defaultWeek, workBlocks } from '../lib/rhythm.js'
import { describeRepeat } from '../lib/recurrence.js'
import { fmtRange, todayKey, yearOf } from '../lib/dates.js'
import { uid } from '../lib/ids.js'
import { enableNotifications, needsInstallForNotifications, notificationsSupported } from '../services/notifications.js'

const STEPS = ['welcome', 'name', 'week', 'regulars', 'year', 'notify']

export default function Onboarding() {
  const { profile, settings } = useStore()
  const [step, setStep] = useState(0)
  const [name, setName] = useState(profile.name ?? '')
  const [week, setWeek] = useState(() => profile.week ?? defaultWeek(profile))
  const [addWork, setAddWork] = useState(true)
  const [regulars, setRegulars] = useState([])
  const [goal, setGoal] = useState('')
  const [goalArea, setGoalArea] = useState(null)
  const [notify, setNotify] = useState(null)
  const blocks = workBlocks(week)
  const id = STEPS[step]

  const next = () => setStep((s) => Math.min(STEPS.length - 1, s + 1))
  const back = () => setStep((s) => Math.max(0, s - 1))

  function finish() {
    const today = todayKey()
    const work = addWork ? blocks.map((b) => ({ ...b, reminder: settings.defaultReminder })) : []
    addItems([...work, ...regulars].map((f) => ({ notes: '', goalId: null, reminder: null, date: today, ...f, id: uid('it'), source: 'setup' })))
    if (goal.trim()) addGoal({ title: goal.trim(), horizon: 'year', period: yearOf(today), area: goalArea })
    const first = week[1] ?? week[0]
    updateProfile({ name: name.trim(), week, wake: first.wake, sleep: first.sleep, onboarded: true })
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

        {id === 'week' && (
          <>
            <h1 className="display">What does your week look like?</h1>
            <p className="muted">Set each day as it really is. Work days, wake-ups and bedtimes can all differ. Reminders and your day view follow these times.</p>
            <WeekEditor value={week} onChange={setWeek} weekStart={settings.weekStart} />
            {blocks.length > 0 && (
              <div className="card pad row-flex" style={{ gap: 12 }}>
                <span className="grow">
                  <strong style={{ fontWeight: 600, display: 'block' }}>Put my work hours on my plan</strong>
                  <span className="small muted">{blocks.map((b) => `${describeRepeat(b.repeat, todayKey())}, ${fmtRange(b.start, b.end)}`).join(' · ')}</span>
                </span>
                <Switch checked={addWork} onChange={setAddWork} label="Add work hours" />
              </div>
            )}
          </>
        )}

        {id === 'regulars' && <Regulars items={regulars} onChange={setRegulars} settings={settings} />}

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
        {((id === 'year' && !goal.trim()) || (id === 'regulars' && regulars.length === 0)) && (
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

const SUGGESTIONS = ['Gym', 'Run', 'Meditate', 'Read 20 pages', 'Call family', 'Meal prep', 'Class', 'Therapy']

// Things that repeat, entered the way you'd say them.
function Regulars({ items, onChange, settings }) {
  const [text, setText] = useState('')
  const input = useRef(null)
  const parsed = useParser(text, { recurring: true })

  function add() {
    if (!parsed.title) return
    onChange([...items, parsedToFields(parsed, settings)])
    setText('')
    input.current?.focus()
  }

  return (
    <>
      <h1 className="display">What else repeats in your week?</h1>
      <p className="muted">Classes, workouts, calls, chores. Type it the way you’d say it, with days and times, like “Gym Mon Wed Fri 6pm” or “Call mom every Sunday”. Add only what’s real; you can skip this.</p>
      <form
        className="row-flex"
        onSubmit={(e) => {
          e.preventDefault()
          add()
        }}
      >
        <input ref={input} className="input" style={{ fontSize: 17, minHeight: 50 }} placeholder="e.g. Yoga Tue Thu 7am" value={text} onChange={(e) => setText(e.target.value)} autoFocus enterKeyHint="done" aria-label="Something that repeats" />
        <button className="btn primary" style={{ height: 50 }} disabled={!parsed.title} aria-label="Add">
          <Plus size={18} />
        </button>
      </form>
      {text.trim() ? (
        <ParsedPreview parsed={parsed} />
      ) : (
        <div className="chips">
          {SUGGESTIONS.map((s) => (
            <button
              key={s}
              type="button"
              className="chip sm"
              onClick={() => {
                setText(`${s} `)
                input.current?.focus()
              }}
            >
              {s}
            </button>
          ))}
        </div>
      )}
      {text.trim() && !parsed.repeat && parsed.title && <p className="tiny faint">Tip: add days like “every Tuesday” or “Mon Wed” to make it repeat.</p>}
      {items.length > 0 && (
        <div className="list repeat-list">
          {items.map((it, i) => (
            <div key={i} className="item-row">
              <span className="area-dot" style={{ background: areaColor(it.area) }} />
              <span className="item-body">
                <span className="item-title">{it.title}</span>
                <span className="item-meta">
                  {it.repeat && (
                    <span>
                      <Repeat size={12} />
                      {describeRepeat(it.repeat, it.date)}
                    </span>
                  )}
                  <span>{fmtRange(it.start, it.end)}</span>
                </span>
              </span>
              <button className="icon-btn sm" onClick={() => onChange(items.filter((_, j) => j !== i))} aria-label={`Remove ${it.title}`}>
                <X size={16} />
              </button>
            </div>
          ))}
        </div>
      )}
    </>
  )
}
