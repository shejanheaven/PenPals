import { useState } from 'react'
import { ArrowUpRight, Check as CheckIcon, CornerLeftUp, Minus, Mountain, Plus, Target, Trash2, X } from 'lucide-react'
import { useStore } from '../store/store.js'
import { addGoal, bumpGoal, deleteGoal, restoreGoal, toggleMilestone, updateGoal } from '../store/actions.js'
import { newGoal, openGoal } from '../store/ui.js'
import { AreaChips, AreaIcon, Bar, Check, Empty, PeriodNav, Seg, Sheet, Switch, toast, useNow } from '../components/ui.jsx'
import { AREAS, areaColor } from '../lib/areas.js'
import { toKey } from '../lib/dates.js'
import { uid } from '../lib/ids.js'
import {
  HORIZONS, childGoals, currentPeriod, goalProgress, goalsFor, parentCandidates, periodLabel, shiftPeriod,
} from '../lib/stats.js'

const PROMPTS = {
  year: { title: (p) => `What would make ${p} meaningful?`, body: 'Choose a few goals that reflect who you want to become — not everything, just what matters.' },
  month: { title: () => 'What will move you forward this month?', body: 'Break a year goal into something you can feel progress on in a few weeks.' },
  week: { title: () => 'What matters most this week?', body: 'One to three things. Small, clear, and kind to your energy.' },
}

export default function Goals() {
  const state = useStore()
  const now = useNow(60000)
  const today = toKey(now)
  const ws = state.settings.weekStart
  const [horizon, setHorizon] = useState('month')
  const [period, setPeriod] = useState(() => currentPeriod('month', today, ws))
  const goals = goalsFor(state, horizon, period, ws)
  const current = currentPeriod(horizon, today, ws)
  const active = goals.filter((g) => g.status === 'active')
  const achieved = goals.filter((g) => g.status === 'done')

  function changeHorizon(h) {
    setHorizon(h)
    setPeriod(currentPeriod(h, today, ws))
  }

  return (
    <div className="page">
      <header className="page-head">
        <div className="eyebrow">Goals</div>
        <h1 className="display">What matters.</h1>
      </header>

      <div className="stack" style={{ gap: 14 }}>
        <Seg value={horizon} onChange={changeHorizon} options={HORIZONS.map((h) => ({ value: h.id, label: h.label }))} label="Horizon" />
        <PeriodNav
          label={periodLabel(horizon, period, ws)}
          isCurrent={period === current}
          onPrev={() => setPeriod(shiftPeriod(horizon, period, -1, ws))}
          onNext={() => setPeriod(shiftPeriod(horizon, period, 1, ws))}
          onToday={() => setPeriod(current)}
          todayLabel={`This ${horizon}`}
        />
      </div>

      {goals.length > 0 && (
        <div className="row-flex small muted" style={{ marginTop: 14, gap: 14 }}>
          <span>
            <strong className="num" style={{ color: 'var(--text)' }}>{active.length}</strong> in progress
          </span>
          <span>
            <strong className="num" style={{ color: 'var(--text)' }}>{achieved.length}</strong> achieved
          </span>
        </div>
      )}

      <div className="stack" style={{ marginTop: 14 }}>
        {goals.length === 0 ? (
          <div className="card">
            <Empty
              icon={Mountain}
              title={PROMPTS[horizon].title(period)}
              action={
                <button className="btn primary" onClick={() => newGoal({ horizon, period })}>
                  <Plus size={16} /> Add a {horizon} goal
                </button>
              }
            >
              {PROMPTS[horizon].body}
            </Empty>
          </div>
        ) : (
          <>
            {goals.map((g) => (
              <GoalCard key={g.id} goal={g} state={state} />
            ))}
            <button className="btn outline lg block" onClick={() => newGoal({ horizon, period })}>
              <Plus size={18} /> Add a {horizon} goal
            </button>
          </>
        )}
      </div>
    </div>
  )
}

function GoalCard({ goal, state }) {
  const ws = state.settings.weekStart
  const p = goalProgress(state, goal, ws)
  const color = areaColor(goal.area)
  const parent = goal.parentId ? state.goals[goal.parentId] : null
  const children = childGoals(state, goal)
  const linked = Object.values(state.items).filter((i) => !i.deleted && i.goalId === goal.id)

  return (
    <div className={`card goal-card${goal.status === 'done' ? ' done' : ''}${goal.status === 'released' ? ' released' : ''}`} style={{ '--ev': color }}>
      <button className="goal-top" style={{ textAlign: 'left', width: '100%' }} onClick={() => openGoal(goal.id)}>
        <span className="goal-icon">{goal.status === 'done' ? <CheckIcon size={18} /> : goal.area ? <AreaIcon id={goal.area} /> : <Target size={18} />}</span>
        <span className="grow">
          <span className="goal-title" style={{ display: 'block' }}>
            {goal.title}
          </span>
          {goal.why && <span className="goal-why" style={{ display: 'block' }}>{goal.why}</span>}
        </span>
      </button>

      {goal.measure === 'milestones' && goal.milestones.length > 0 && (
        <div className="milestones">
          {goal.milestones.map((m) => (
            <div key={m.id} className={`milestone${m.done ? ' done' : ''}`}>
              <Check checked={m.done} color={color} onToggle={() => toggleMilestone(goal.id, m.id)} label={m.title} />
              <span>{m.title}</span>
            </div>
          ))}
        </div>
      )}

      <div style={{ paddingLeft: 48 }}>
        <Bar value={p.fraction} color={color} label={p.label} />
      </div>
      <div className="goal-foot" style={{ paddingLeft: 48 }}>
        <span className="num">{goal.status === 'released' ? 'Released' : p.label}</span>
        {goal.measure === 'count' && !goal.autoCount && goal.status === 'active' && (
          <span className="row-flex" style={{ gap: 4 }}>
            <button className="icon-btn sm" onClick={() => bumpGoal(goal.id, -1)} aria-label="Decrease">
              <Minus size={15} />
            </button>
            <button className="icon-btn sm" style={{ background: 'var(--accent-soft)', color: 'var(--accent)' }} onClick={() => bumpGoal(goal.id, 1)} aria-label="Increase">
              <Plus size={15} />
            </button>
          </span>
        )}
        <span className="spacer" />
        {linked.length > 0 && <span className="tiny faint">{linked.length} linked</span>}
        {goal.measure === 'simple' && goal.status === 'active' && (
          <button
            className="btn sm soft"
            onClick={() => {
              updateGoal(goal.id, { status: 'done' })
              toast('Achieved. Take a moment to feel it.')
            }}
          >
            <CheckIcon size={14} /> Achieved
          </button>
        )}
        {goal.measure !== 'simple' && goal.status === 'active' && p.fraction >= 1 && (
          <button className="btn sm soft" onClick={() => updateGoal(goal.id, { status: 'done' })}>
            <CheckIcon size={14} /> Mark achieved
          </button>
        )}
      </div>

      {(parent || children.length > 0) && (
        <div className="row-flex wrap" style={{ paddingLeft: 48, gap: 6 }}>
          {parent && !parent.deleted && (
            <button className="parent-link" onClick={() => openGoal(parent.id)}>
              <CornerLeftUp size={12} /> Supports “{parent.title}”
            </button>
          )}
          {children.length > 0 && (
            <span className="parent-link">
              <ArrowUpRight size={12} /> {children.length} supporting {children.length === 1 ? 'goal' : 'goals'}
            </span>
          )}
        </div>
      )}
    </div>
  )
}

// ── Goal editor ─────────────────────────────────────────────────────────────

export function GoalSheet({ open, onClose, goalId, draft }) {
  const state = useStore()
  const ws = state.settings.weekStart
  const existing = goalId ? state.goals[goalId] : null
  const [form, setForm] = useState(() => {
    const src = existing ?? { title: '', why: '', horizon: 'month', period: currentPeriod(draft?.horizon ?? 'month', toKey(new Date()), ws), parentId: null, area: null, measure: 'simple', target: 5, unit: '', autoCount: false, milestones: [], ...draft }
    return { ...src, target: src.target || 5, milestones: src.milestones ?? [] }
  })
  const [step, setStep] = useState('')
  const set = (patch) => setForm((f) => ({ ...f, ...patch }))
  const parents = parentCandidates(state, form.horizon, form.period, ws)
  const linked = existing ? Object.values(state.items).filter((i) => !i.deleted && i.goalId === existing.id) : []

  function save() {
    const title = form.title.trim()
    if (!title) {
      toast('Name your goal first')
      return
    }
    const fields = {
      title,
      why: form.why.trim(),
      horizon: form.horizon,
      period: form.period,
      parentId: form.parentId || null,
      area: form.area,
      measure: form.measure,
      target: Math.max(1, +form.target || 1),
      unit: form.unit.trim(),
      autoCount: !!form.autoCount,
      milestones: form.milestones,
    }
    if (existing) updateGoal(existing.id, fields)
    else addGoal(fields)
    toast(existing ? 'Goal saved' : 'Goal set. Now give it time on your calendar.')
    onClose()
  }

  function addStep() {
    const title = step.trim()
    if (!title) return
    set({ milestones: [...form.milestones, { id: uid('m'), title, done: false }] })
    setStep('')
  }

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={existing ? 'Goal' : `New ${form.horizon} goal`}
      footer={
        <>
          {existing && (
            <button
              className="btn danger"
              onClick={() => {
                deleteGoal(existing.id)
                toast('Goal deleted', { action: 'Undo', onAction: () => restoreGoal(existing.id) })
                onClose()
              }}
            >
              <Trash2 size={16} />
            </button>
          )}
          {existing && existing.status !== 'active' && (
            <button className="btn ghost" onClick={() => updateGoal(existing.id, { status: 'active' })}>
              Reopen
            </button>
          )}
          {existing && existing.status === 'active' && (
            <button
              className="btn ghost"
              title="Let this goal go without guilt"
              onClick={() => {
                updateGoal(existing.id, { status: 'released' })
                toast('Released. Priorities change — that’s wisdom, not failure.')
                onClose()
              }}
            >
              Let go
            </button>
          )}
          <span className="spacer" />
          <button className="btn ghost" onClick={onClose}>
            Cancel
          </button>
          <button className="btn primary" onClick={save}>
            {existing ? 'Save' : 'Set goal'}
          </button>
        </>
      }
    >
      <form
        className="stack"
        style={{ gap: 18 }}
        onSubmit={(e) => {
          e.preventDefault()
          save()
        }}
      >
        <input className="input title-input" placeholder="Name the goal" value={form.title} onChange={(e) => set({ title: e.target.value })} {...(!existing ? { 'data-autofocus': true } : {})} aria-label="Goal" />

        <label className="field">
          <span className="label">Why does this matter to you?</span>
          <textarea className="textarea" rows={2} style={{ minHeight: 64 }} placeholder="The reason you’ll come back to when it gets hard" value={form.why} onChange={(e) => set({ why: e.target.value })} />
        </label>

        {!existing && (
          <div className="field">
            <span className="label">Horizon</span>
            <Seg
              value={form.horizon}
              onChange={(h) => set({ horizon: h, period: currentPeriod(h, toKey(new Date()), ws), parentId: null })}
              options={HORIZONS.map((h) => ({ value: h.id, label: `This ${h.label.toLowerCase()}` }))}
            />
            <span className="tiny faint">For {periodLabel(form.horizon, form.period, ws)}</span>
          </div>
        )}

        {parents.length > 0 && (
          <label className="field">
            <span className="label">Supports</span>
            <select className="select" value={form.parentId ?? ''} onChange={(e) => set({ parentId: e.target.value || null })}>
              <option value="">Stands on its own</option>
              {parents.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.title}
                </option>
              ))}
            </select>
          </label>
        )}

        <div className="field">
          <span className="label">Area of life</span>
          <AreaChips value={form.area} onChange={(area) => set({ area })} areas={AREAS} />
        </div>

        <div className="field">
          <span className="label">How will you know it’s done?</span>
          <Seg
            value={form.measure}
            onChange={(measure) => set({ measure })}
            options={[
              { value: 'simple', label: 'Done / not yet' },
              { value: 'milestones', label: 'Steps' },
              { value: 'count', label: 'A number' },
            ]}
          />
        </div>

        {form.measure === 'milestones' && (
          <div className="stack" style={{ gap: 6 }}>
            {form.milestones.map((m, i) => (
              <div key={m.id} className="row-flex">
                <span className="num faint small" style={{ width: 18 }}>
                  {i + 1}.
                </span>
                <input
                  className="input"
                  value={m.title}
                  onChange={(e) => set({ milestones: form.milestones.map((x) => (x.id === m.id ? { ...x, title: e.target.value } : x)) })}
                  aria-label={`Step ${i + 1}`}
                />
                <button type="button" className="icon-btn sm" onClick={() => set({ milestones: form.milestones.filter((x) => x.id !== m.id) })} aria-label="Remove step">
                  <X size={16} />
                </button>
              </div>
            ))}
            <div className="row-flex">
              <span style={{ width: 18 }} />
              <input
                className="input"
                placeholder="Add a step"
                value={step}
                onChange={(e) => setStep(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    addStep()
                  }
                }}
              />
              <button type="button" className="btn secondary" onClick={addStep}>
                Add
              </button>
            </div>
          </div>
        )}

        {form.measure === 'count' && (
          <div className="stack" style={{ gap: 12 }}>
            <div className="row-flex">
              <input type="number" min={1} className="input" style={{ width: 96 }} value={form.target} onChange={(e) => set({ target: e.target.value })} aria-label="Target" />
              <input className="input" placeholder="e.g. workouts, pages, calls" value={form.unit} onChange={(e) => set({ unit: e.target.value })} aria-label="Unit" />
            </div>
            <div className="row-flex">
              <span className="grow small">
                <strong style={{ fontWeight: 600 }}>Count automatically</strong>
                <span className="muted" style={{ display: 'block' }}>
                  Each time you complete something linked to this goal, it counts.
                </span>
              </span>
              <Switch checked={form.autoCount} onChange={(autoCount) => set({ autoCount })} label="Count automatically" />
            </div>
          </div>
        )}

        {linked.length > 0 && (
          <div className="field">
            <span className="label">On your calendar</span>
            <div className="chips">
              {linked.map((i) => (
                <span key={i.id} className="tag">
                  <span className="area-dot" style={{ background: areaColor(i.area) }} /> {i.title}
                </span>
              ))}
            </div>
          </div>
        )}
        {existing && linked.length === 0 && <p className="small faint">Tip: link schedule items to this goal from their edit screen, so your time reflects what matters.</p>}
        <button type="submit" hidden />
      </form>
    </Sheet>
  )
}
