import { useMemo, useState } from 'react'
import { BookHeart, Check as CheckIcon, Leaf } from 'lucide-react'
import { useStore } from '../store/store.js'
import { updateDay, updateReview } from '../store/actions.js'
import { openGoal } from '../store/ui.js'
import { Empty, PeriodNav, Ring, Seg, useNow } from '../components/ui.jsx'
import { ColumnChart, LabeledBars } from '../components/charts.jsx'
import { addDays, fmtDate, fmtMonth, fmtRelative, monthOf, rangeKeys, toKey, weekdayLabels } from '../lib/dates.js'
import { AREAS, areaColor } from '../lib/areas.js'
import {
  currentPeriod, dayStats, goalProgress, goalsFor, periodLabel, periodRange, rangeStats, reviewKey, shiftPeriod,
} from '../lib/stats.js'
import { ENERGY, MOODS } from '../store/defaults.js'

const HORIZONS = [
  { value: 'day', label: 'Day' },
  { value: 'week', label: 'Week' },
  { value: 'month', label: 'Month' },
  { value: 'year', label: 'Year' },
]

export default function Reflect() {
  const state = useStore()
  const now = useNow(60000)
  const today = toKey(now)
  const ws = state.settings.weekStart
  const [horizon, setHorizon] = useState(() => {
    const p = new URLSearchParams(location.search).get('period')
    return HORIZONS.some((h) => h.value === p) ? p : 'day'
  })
  const [period, setPeriod] = useState(() => (horizon === 'day' ? today : currentPeriod(horizon, today, ws)))
  const current = horizon === 'day' ? today : currentPeriod(horizon, today, ws)

  function changeHorizon(h) {
    setHorizon(h)
    setPeriod(h === 'day' ? today : currentPeriod(h, today, ws))
  }

  const rel = horizon === 'day' ? fmtRelative(period, today) : ''
  const label =
    horizon !== 'day'
      ? periodLabel(horizon, period, ws)
      : ['Today', 'Yesterday', 'Tomorrow'].includes(rel)
        ? `${rel}, ${fmtDate(period, { month: 'short', day: 'numeric' })}`
        : fmtDate(period, { weekday: 'short', month: 'short', day: 'numeric' })

  return (
    <div className="page">
      <header className="page-head">
        <div className="eyebrow">Reflect</div>
        <h1 className="display">Look back, gently.</h1>
      </header>
      <div className="stack" style={{ gap: 14 }}>
        <Seg value={horizon} onChange={changeHorizon} options={HORIZONS} label="Reflection period" />
        <PeriodNav
          label={label}
          isCurrent={period === current}
          onPrev={() => setPeriod(horizon === 'day' ? addDays(period, -1) : shiftPeriod(horizon, period, -1, ws))}
          onNext={() => setPeriod(horizon === 'day' ? addDays(period, 1) : shiftPeriod(horizon, period, 1, ws))}
          onToday={() => setPeriod(current)}
          todayLabel={horizon === 'day' ? 'Today' : `This ${horizon}`}
        />
      </div>
      {horizon === 'day' ? (
        <DayReflection state={state} date={period} today={today} onPick={setPeriod} />
      ) : (
        <PeriodReview state={state} horizon={horizon} period={period} today={today} />
      )}
    </div>
  )
}

function Scale({ options, value, onChange, label }) {
  return (
    <div className="mood-row" role="radiogroup" aria-label={label}>
      {options.map((o) => (
        <button key={o.value} type="button" className="mood" role="radio" aria-checked={value === o.value} aria-pressed={value === o.value} style={{ '--m': `var(--mood-${o.value})` }} onClick={() => onChange(value === o.value ? null : o.value)}>
          <span className="orb" />
          {o.label}
        </button>
      ))}
    </div>
  )
}

function DayReflection({ state, date, today, onPick }) {
  const day = state.days[date] ?? {}
  const { done, total, rate } = dayStats(state, date)
  const gratitude = day.gratitude ?? ['', '', '']
  const future = date > today
  const recent = useMemo(
    () =>
      Object.entries(state.days)
        .filter(([k, d]) => k <= today && (d.reflection || d.mood || d.gratitude?.some(Boolean)))
        .sort(([a], [b]) => (a < b ? 1 : -1))
        .slice(0, 14),
    [state.days, today],
  )

  if (future) {
    return (
      <div className="card" style={{ marginTop: 16 }}>
        <Empty icon={Leaf} title="This day hasn’t happened yet">
          Reflection is for days you’ve lived. Come back {fmtRelative(date, today).toLowerCase()} evening.
        </Empty>
      </div>
    )
  }

  return (
    <div className="stack" style={{ gap: 12, marginTop: 16 }}>
      {total > 0 && (
        <div className="card pad row-flex" style={{ gap: 14 }}>
          <Ring value={rate} size={48} stroke={5}>
            <span style={{ fontSize: 12 }}>{Math.round((rate ?? 0) * 100)}%</span>
          </Ring>
          <div className="grow">
            <div style={{ fontWeight: 600 }}>
              {date === today ? `So far: ${done} of ${total} planned ${total === 1 ? 'moment' : 'moments'}` : `You kept ${done} of ${total} planned ${total === 1 ? 'moment' : 'moments'}`}
            </div>
            <div className="small muted">
              {rate >= 0.8 ? 'A day lived on purpose.' : rate >= 0.5 ? 'Good, steady progress.' : date === today ? 'The day isn’t over. One thing at a time.' : 'Some days are like this. Be kind to yourself.'}
            </div>
          </div>
        </div>
      )}

      {day.intention && (
        <div className="card prompt-card">
          <span className="eyebrow">Your intention</span>
          <p className="intention-text" style={{ margin: '6px 0 12px' }}>
            “{day.intention}”
          </p>
          <Seg
            label="Did you live it?"
            value={day.intentionKept ?? ''}
            onChange={(v) => updateDay(date, { intentionKept: day.intentionKept === v ? '' : v })}
            options={[
              { value: 'yes', label: 'Lived it' },
              { value: 'partly', label: 'Partly' },
              { value: 'no', label: 'Not today' },
            ]}
          />
        </div>
      )}

      <div className="card prompt-card">
        <span className="label">How did today feel?</span>
        <Scale options={MOODS} value={day.mood} onChange={(mood) => updateDay(date, { mood })} label="Mood" />
      </div>

      <div className="card prompt-card">
        <span className="label">Energy</span>
        <Scale options={ENERGY} value={day.energy} onChange={(energy) => updateDay(date, { energy })} label="Energy" />
      </div>

      <div className="card prompt-card">
        <span className="label">Three good things</span>
        {[0, 1, 2].map((i) => (
          <div key={i} className="gratitude-line">
            <span className="n">{i + 1}</span>
            <input
              className="input bare"
              placeholder={['Something that went well…', 'Someone you’re grateful for…', 'A small moment you enjoyed…'][i]}
              value={gratitude[i] ?? ''}
              onChange={(e) => {
                const next = [...gratitude]
                next[i] = e.target.value
                updateDay(date, { gratitude: next })
              }}
              aria-label={`Good thing ${i + 1}`}
            />
          </div>
        ))}
      </div>

      <div className="card prompt-card">
        <label className="label" htmlFor="reflection">
          What’s on your mind?
        </label>
        <textarea
          id="reflection"
          className="textarea bare"
          rows={5}
          placeholder="What happened, what you noticed, what you’d like to let go of…"
          value={day.reflection ?? ''}
          onChange={(e) => updateDay(date, { reflection: e.target.value })}
        />
      </div>

      {recent.length > 0 && (
        <section className="section">
          <div className="section-head">
            <span className="eyebrow">
              <BookHeart size={13} /> Journal
            </span>
          </div>
          <div className="list">
            {recent.map(([key, d]) => (
              <button key={key} className="journal-entry" onClick={() => onPick(key)} aria-current={key === date}>
                <span className="orb" style={{ '--m': d.mood ? `var(--mood-${d.mood})` : undefined }} />
                <span className="grow" style={{ minWidth: 0 }}>
                  <span className="row-flex" style={{ gap: 8 }}>
                    <strong style={{ fontWeight: 600, fontSize: 14 }}>{fmtRelative(key, today)}</strong>
                    {d.mood && <span className="tiny faint">{MOODS[d.mood - 1].label}</span>}
                  </span>
                  <span className="small muted" style={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                    {d.reflection || d.gratitude?.filter(Boolean).join(' · ') || d.intention || 'Mood noted'}
                  </span>
                </span>
              </button>
            ))}
          </div>
        </section>
      )}
    </div>
  )
}

const REVIEW_PROMPTS = [
  ['wins', 'What went well?', 'Moments you’re proud of, big or small'],
  ['hard', 'What was hard?', 'Name it without judgement'],
  ['learned', 'What did you learn?', 'About your work, your energy, yourself'],
  ['next', 'What matters most next?', 'The one or two things to carry forward'],
]

function PeriodReview({ state, horizon, period, today }) {
  const ws = state.settings.weekStart
  const [from, to] = periodRange(horizon, period, ws)
  const keys = rangeKeys(from, to < today ? to : today)
  const started = from <= today
  const stats = useMemo(() => (started ? rangeStats(state, keys) : null), [state, horizon, period]) // eslint-disable-line react-hooks/exhaustive-deps
  const key = reviewKey(horizon, period, ws)
  const review = state.reviews[key] ?? {}
  const goals = goalsFor(state, horizon, period, ws)
  const achieved = goals.filter((g) => g.status === 'done').length

  const series = useMemo(() => {
    if (!started) return { kept: [], mood: [] }
    if (horizon === 'year') {
      const months = Array.from({ length: 12 }, (_, i) => `${period}-${String(i + 1).padStart(2, '0')}`)
      return {
        kept: months.map((m) => {
          const days = keys.filter((k) => monthOf(k) === m)
          const s = days.length ? rangeStats(state, days) : null
          return { key: m, label: fmtMonth(m, { month: 'narrow' }), value: s?.rate ?? null, tip: `${fmtMonth(m, { month: 'long' })}: ${s?.rate != null ? `${Math.round(s.rate * 100)}% kept` : 'nothing planned'}` }
        }),
        mood: months.map((m) => {
          const moods = keys.filter((k) => monthOf(k) === m).map((k) => state.days[k]?.mood).filter(Boolean)
          const avg = moods.length ? moods.reduce((a, b) => a + b, 0) / moods.length : null
          return { key: m, label: fmtMonth(m, { month: 'narrow' }), value: avg, tip: `${fmtMonth(m, { month: 'long' })}: ${avg ? `${MOODS[Math.round(avg) - 1].label} on average` : 'no mood noted'}` }
        }),
      }
    }
    const all = rangeKeys(from, to)
    const dow = weekdayLabels(ws, 'narrow')
    const lbl = (k, i) => (horizon === 'week' ? dow[i] : String(+k.slice(8)))
    return {
      kept: all.map((k, i) => {
        const s = k <= today ? dayStats(state, k) : null
        return { key: k, label: lbl(k, i), value: s?.rate ?? null, tip: `${fmtDate(k, { weekday: 'short', month: 'short', day: 'numeric' })}: ${s?.rate != null ? `${s.done} of ${s.total} kept` : k > today ? 'ahead' : 'nothing planned'}` }
      }),
      mood: all.map((k, i) => {
        const m = state.days[k]?.mood ?? null
        return { key: k, label: lbl(k, i), value: m, tip: `${fmtDate(k, { weekday: 'short', month: 'short', day: 'numeric' })}: ${m ? MOODS[m - 1].label : 'no mood noted'}` }
      }),
    }
  }, [state, horizon, period, today]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!started) {
    return (
      <div className="card" style={{ marginTop: 16 }}>
        <Empty icon={Leaf} title={`This ${horizon} is still ahead`}>
          When it’s underway, you’ll find your patterns and prompts here.
        </Empty>
      </div>
    )
  }

  const areaRows = AREAS.filter((a) => stats.byArea[a.id]?.total)
    .sort((a, b) => a.slot - b.slot)
    .map((a) => ({ key: a.id, label: a.label, value: stats.byArea[a.id].done, display: `${stats.byArea[a.id].done}/${stats.byArea[a.id].total}`, color: areaColor(a.id) }))
  const everyNth = horizon === 'month' ? 7 : 1
  const moodLabel = stats.moodAvg ? MOODS[Math.round(stats.moodAvg) - 1].label : '—'

  return (
    <div className="stack" style={{ gap: 12, marginTop: 16 }}>
      <div className="stat-grid">
        <div className="card stat">
          <div className="stat-label">Kept</div>
          <div className="stat-value">{stats.rate != null ? `${Math.round(stats.rate * 100)}%` : '—'}</div>
          <div className="stat-sub">
            {stats.done} of {stats.total} planned
          </div>
        </div>
        <div className="card stat">
          <div className="stat-label">Rituals</div>
          <div className="stat-value">{stats.ritualsTotal ? `${stats.ritualsDone}` : '—'}</div>
          <div className="stat-sub">{stats.ritualsTotal ? `of ${stats.ritualsTotal} repeats done` : 'No repeating habits yet'}</div>
        </div>
        <div className="card stat">
          <div className="stat-label">Mood</div>
          <div className="stat-value">{moodLabel}</div>
          <div className="stat-sub">{stats.moodDays ? `Across ${stats.moodDays} noted ${stats.moodDays === 1 ? 'day' : 'days'}` : 'Note your mood each evening'}</div>
        </div>
        <div className="card stat">
          <div className="stat-label">Goals</div>
          <div className="stat-value">{goals.length ? `${achieved}/${goals.length}` : '—'}</div>
          <div className="stat-sub">{goals.length ? 'achieved' : `No ${horizon} goals set`}</div>
        </div>
      </div>

      <div className="card pad">
        <div className="eyebrow" style={{ marginBottom: 12 }}>
          Plans kept, {horizon === 'year' ? 'by month' : 'by day'}
        </div>
        <ColumnChart data={series.kept} max={1} ariaLabel={`Share of plans kept each ${horizon === 'year' ? 'month' : 'day'}`} everyNth={everyNth} emptyLabel="Nothing planned yet" />
      </div>

      <div className="card pad">
        <div className="eyebrow" style={{ marginBottom: 12 }}>
          Mood, {horizon === 'year' ? 'monthly average' : 'by day'}
        </div>
        <ColumnChart data={series.mood} max={5} color="var(--mood-4)" ariaLabel="Mood over the period, from Heavy (1) to Bright (5)" everyNth={everyNth} emptyLabel="No moods noted yet" />
      </div>

      {areaRows.length > 0 && (
        <div className="card pad">
          <div className="eyebrow" style={{ marginBottom: 12 }}>
            Where your energy went
          </div>
          <LabeledBars rows={areaRows} ariaLabel="Completed plans by area of life" />
        </div>
      )}

      {goals.length > 0 && (
        <div className="list">
          {goals.map((g) => {
            const p = goalProgress(state, g, ws)
            return (
              <button key={g.id} className="item-row" style={{ width: '100%', textAlign: 'left' }} onClick={() => openGoal(g.id)}>
                <span className="goal-icon" style={{ '--ev': areaColor(g.area), width: 30, height: 30, borderRadius: 9 }}>
                  {g.status === 'done' ? <CheckIcon size={16} /> : <Leaf size={16} />}
                </span>
                <span className="item-body">
                  <span className="item-title">{g.title}</span>
                  <span className="item-meta">{g.status === 'released' ? 'Released' : g.status === 'done' ? 'Achieved' : p.label}</span>
                </span>
              </button>
            )
          })}
        </div>
      )}

      <div className="section-head" style={{ marginTop: 12 }}>
        <span className="eyebrow">Your {horizon}ly review</span>
        {review.updatedAt && <span className="tiny faint">Saved</span>}
      </div>
      {REVIEW_PROMPTS.map(([field, title, hint]) => (
        <div key={field} className="card prompt-card">
          <label className="label" htmlFor={`rv-${field}`}>
            {title}
          </label>
          <textarea id={`rv-${field}`} className="textarea bare" rows={3} placeholder={hint} value={review[field] ?? ''} onChange={(e) => updateReview(key, { [field]: e.target.value })} />
        </div>
      ))}
    </div>
  )
}
