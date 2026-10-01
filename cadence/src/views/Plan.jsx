import { useLayoutEffect, useMemo, useRef, useState } from 'react'
import { ArrowRight, Plus, Target } from 'lucide-react'
import { device, useStore } from '../store/store.js'
import { newGoal, newItem, openGoal, openItem, openQuickAdd } from '../store/ui.js'
import { Bar, Empty, PeriodNav, Ring, Seg, useNow } from '../components/ui.jsx'
import { ItemRow } from '../components/items.jsx'
import {
  addDays, addMonthKey, daysLeftInYear, fmtDate, fmtMonth, fmtRelative, fmtTime, fmtWeekRange, fromMinutes, monthGrid, monthOf, nowMinutes,
  startOfWeek, toKey, toMinutes, weekDays, weekdayLabels, yearOf, yearProgress,
} from '../lib/dates.js'
import { itemsOn } from '../lib/recurrence.js'
import { areaColor } from '../lib/areas.js'
import { currentPeriod, dayStats, goalProgress, goalsFor, statusOf } from '../lib/stats.js'

const VIEWS = [
  { value: 'day', label: 'Day' },
  { value: 'week', label: 'Week' },
  { value: 'month', label: 'Month' },
  { value: 'year', label: 'Year' },
]

export default function Plan() {
  const state = useStore()
  const now = useNow(60000)
  const today = toKey(now)
  const [view, setViewState] = useState(() => device.get().planView ?? 'week')
  const [cursor, setCursor] = useState(today)
  const ws = state.settings.weekStart

  const setView = (v) => {
    setViewState(v)
    device.set({ planView: v })
  }
  const goTo = (v, key) => {
    setView(v)
    setCursor(key)
    window.scrollTo({ top: 0 })
  }

  const step = (n) => {
    if (view === 'day') setCursor(addDays(cursor, n))
    else if (view === 'week') setCursor(addDays(cursor, 7 * n))
    else if (view === 'month') setCursor(`${addMonthKey(monthOf(cursor), n)}-01`)
    else setCursor(`${+yearOf(cursor) + n}-01-01`)
  }

  const label =
    view === 'day'
      ? fmtRelative(cursor, today) === 'Today' || fmtRelative(cursor, today) === 'Tomorrow' || fmtRelative(cursor, today) === 'Yesterday'
        ? `${fmtRelative(cursor, today)}, ${fmtDate(cursor, { month: 'short', day: 'numeric' })}`
        : fmtDate(cursor, { weekday: 'short', month: 'short', day: 'numeric' })
      : view === 'week'
        ? fmtWeekRange(startOfWeek(cursor, ws))
        : view === 'month'
          ? fmtMonth(monthOf(cursor))
          : yearOf(cursor)

  const isCurrent =
    view === 'day'
      ? cursor === today
      : view === 'week'
        ? startOfWeek(cursor, ws) === startOfWeek(today, ws)
        : view === 'month'
          ? monthOf(cursor) === monthOf(today)
          : yearOf(cursor) === yearOf(today)

  return (
    <div className={`page${view === 'day' ? '' : ' wide'}`}>
      <header className="page-head stack" style={{ gap: 14 }}>
        <Seg value={view} onChange={setView} options={VIEWS} label="Plan view" style={{ maxWidth: 420 }} />
        <PeriodNav
          label={label}
          isCurrent={isCurrent}
          onPrev={() => step(-1)}
          onNext={() => step(1)}
          onToday={() => setCursor(today)}
          todayLabel={view === 'day' ? 'Today' : `This ${view}`}
        />
      </header>
      {view === 'day' && <DayView state={state} date={cursor} now={now} />}
      {view === 'week' && <WeekView state={state} date={cursor} now={now} onOpenDay={(k) => goTo('day', k)} />}
      {view === 'month' && <MonthView state={state} date={cursor} now={now} onSelect={setCursor} />}
      {view === 'year' && <YearView state={state} year={yearOf(cursor)} now={now} onOpenMonth={(m) => goTo('month', `${m}-01`)} />}
    </div>
  )
}

// ── Day ─────────────────────────────────────────────────────────────────────

const HOUR = 56

function layoutEvents(items) {
  const evs = items
    .map((item) => {
      const s = toMinutes(item.start)
      const e = Math.max(s + 20, toMinutes(item.end ?? item.start) || s + 30)
      return { item, s, e }
    })
    .sort((a, b) => a.s - b.s || b.e - a.e)
  const out = []
  let cluster = []
  let clusterEnd = -1
  const flush = () => {
    const cols = []
    for (const ev of cluster) {
      let c = cols.findIndex((end) => end <= ev.s)
      if (c < 0) {
        c = cols.length
        cols.push(ev.e)
      } else cols[c] = ev.e
      ev.col = c
    }
    for (const ev of cluster) ev.cols = cols.length
    out.push(...cluster)
    cluster = []
  }
  for (const ev of evs) {
    if (cluster.length && ev.s >= clusterEnd) {
      flush()
      clusterEnd = -1
    }
    cluster.push(ev)
    clusterEnd = Math.max(clusterEnd, ev.e)
  }
  if (cluster.length) flush()
  return out
}

function DayView({ state, date, now }) {
  const items = itemsOn(state.items, date)
  const timed = items.filter((i) => i.start)
  const anytime = items.filter((i) => !i.start)
  const events = useMemo(() => layoutEvents(timed), [timed])
  const today = toKey(now)
  const mins = nowMinutes(now)
  const wrap = useRef(null)
  const wake = toMinutes(state.profile.wake ?? '07:00')
  const sleep = toMinutes(state.profile.sleep ?? '22:30')
  const dayGoals = goalsFor(state, 'week', currentPeriod('week', date, state.settings.weekStart), state.settings.weekStart).filter((g) => g.status === 'active')

  useLayoutEffect(() => {
    if (!wrap.current) return
    const focusMin = date === today ? Math.max(0, mins - 90) : Math.max(0, wake - 30)
    const top = wrap.current.getBoundingClientRect().top + window.scrollY + (focusMin / 60) * HOUR - 120
    window.scrollTo({ top: Math.max(0, top) })
  }, [date]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="stack" style={{ gap: 18 }}>
      <div>
        <div className="section-head">
          <span className="eyebrow">Anytime</span>
          <button className="btn ghost sm" onClick={() => openQuickAdd({ date })}>
            <Plus size={14} /> Add
          </button>
        </div>
        {anytime.length ? (
          <div className="list">
            {anytime.map((item) => (
              <ItemRow key={item.id} item={item} date={date} state={state} now={now} showTime={false} />
            ))}
          </div>
        ) : (
          <p className="small faint">Nothing unscheduled. Tap an hour below to plan a block.</p>
        )}
        {dayGoals.length > 0 && (
          <div className="chips" style={{ marginTop: 10 }}>
            {dayGoals.map((g) => (
              <button key={g.id} className="chip sm" onClick={() => openGoal(g.id)} style={{ '--chip-color': areaColor(g.area) }}>
                <Target size={12} /> {g.title}
              </button>
            ))}
          </div>
        )}
      </div>

      <div ref={wrap} className="timeline" style={{ height: 24 * HOUR }}>
        {wake > 0 && <div className="awake-shade" style={{ top: 0, height: (wake / 60) * HOUR }} />}
        {sleep < 24 * 60 && <div className="awake-shade" style={{ top: (sleep / 60) * HOUR, height: ((24 * 60 - sleep) / 60) * HOUR }} />}
        {Array.from({ length: 24 }, (_, h) => (
          <div
            key={h}
            className="timeline-hour"
            style={{ height: HOUR }}
            onClick={() => newItem({ date, start: fromMinutes(h * 60), end: fromMinutes(h * 60 + state.settings.defaultDuration), reminder: state.settings.defaultReminder })}
            role="button"
            tabIndex={-1}
            aria-label={`Add at ${fmtTime(fromMinutes(h * 60))}`}
          >
            {h > 0 && <span className="hour-label">{fmtTime(fromMinutes(h * 60), { compact: true })}</span>}
          </div>
        ))}
        {events.map(({ item, s, e, col, cols }) => {
          const done = statusOf(state, item.id, date) === 'done'
          const height = Math.max(26, ((e - s) / 60) * HOUR - 3)
          return (
            <button
              key={item.id}
              className={`timeline-event${done ? ' done' : ''}`}
              style={{
                '--ev': areaColor(item.area),
                top: (s / 60) * HOUR + 1,
                height,
                left: `calc(${(col / cols) * 100}% + 4px)`,
                width: `calc(${100 / cols}% - 8px)`,
              }}
              onClick={() => openItem(item.id, date)}
            >
              <div className="ev-title">{item.title}</div>
              {height > 38 && (
                <div className="ev-time">
                  {fmtTime(item.start, { compact: true })} – {fmtTime(item.end ?? item.start, { compact: true })}
                </div>
              )}
            </button>
          )
        })}
        {date === today && <div className="now-line" style={{ top: (mins / 60) * HOUR }} aria-hidden />}
      </div>
    </div>
  )
}

// ── Week ────────────────────────────────────────────────────────────────────

function GoalStrip({ state, horizon, period, title, emptyText }) {
  const ws = state.settings.weekStart
  const goals = goalsFor(state, horizon, period, ws).filter((g) => g.status !== 'released')
  return (
    <div className="card pad" style={{ marginBottom: 14 }}>
      <div className="section-head" style={{ marginBottom: goals.length ? 10 : 0 }}>
        <span className="eyebrow">
          <Target size={13} /> {title}
        </span>
        <button className="btn ghost sm" onClick={() => newGoal({ horizon, period })}>
          <Plus size={14} /> Goal
        </button>
      </div>
      {goals.length ? (
        <div className="stack" style={{ gap: 10 }}>
          {goals.map((g) => {
            const p = goalProgress(state, g, ws)
            return (
              <button key={g.id} className="row-flex" style={{ textAlign: 'left', width: '100%' }} onClick={() => openGoal(g.id)}>
                <span className="area-dot" style={{ background: areaColor(g.area) }} />
                <span className="grow" style={{ fontWeight: 550, textDecoration: g.status === 'done' ? 'line-through' : 'none', color: g.status === 'done' ? 'var(--text-3)' : undefined }}>
                  {g.title}
                </span>
                <span style={{ width: 90 }}>
                  <Bar value={p.fraction} thin color={areaColor(g.area)} />
                </span>
                <span className="tiny muted num" style={{ width: 92, textAlign: 'right', whiteSpace: 'nowrap' }}>
                  {p.label}
                </span>
              </button>
            )
          })}
        </div>
      ) : (
        <p className="small faint" style={{ marginTop: 4 }}>
          {emptyText}
        </p>
      )}
    </div>
  )
}

function WeekView({ state, date, now, onOpenDay }) {
  const ws = state.settings.weekStart
  const today = toKey(now)
  const days = weekDays(date, ws)
  const labels = weekdayLabels(ws, 'short')
  const stats = days.map((k) => dayStats(state, k))
  const done = stats.reduce((a, s) => a + s.done, 0)
  const total = stats.reduce((a, s) => a + s.total, 0)

  return (
    <>
      <GoalStrip state={state} horizon="week" period={days[0]} title="Week focus" emptyText="Choose one to three things that would make this week feel well spent." />
      {total > 0 && (
        <div className="row-flex" style={{ marginBottom: 12, gap: 12 }}>
          <Ring value={done / total} size={36} stroke={4} />
          <span className="small muted">
            <strong className="num" style={{ color: 'var(--text)' }}>
              {done} of {total}
            </strong>{' '}
            planned moments kept this week
          </span>
        </div>
      )}
      <div className="week-grid">
        {days.map((key, i) => {
          const { items, done: d, total: t } = stats[i]
          return (
            <div key={key} className={`day-col${key === today ? ' today' : ''}${key < today ? ' past' : ''}${items.length ? '' : ' empty'}`}>
              <button className="day-col-head" onClick={() => onOpenDay(key)}>
                <span className="dnum num">{+key.slice(8)}</span>
                <span className="dow">{labels[i]}</span>
                <span className="spacer" />
                {t > 0 && (
                  <span className="tiny faint num">
                    {d}/{t}
                  </span>
                )}
              </button>
              {items.length === 0 && <span className="day-empty">Open day</span>}
              <div className="day-col-items">
                {items.map((item) => {
                  const st = statusOf(state, item.id, key)
                  return (
                    <button key={item.id} className={`mini-item${st === 'done' ? ' done' : ''}`} style={{ '--ev': areaColor(item.area) }} onClick={() => openItem(item.id, key)}>
                      {item.start && <span className="mi-time">{fmtTime(item.start, { compact: true })}</span>}
                      <span className="mi-title">{item.title}</span>
                    </button>
                  )
                })}
              </div>
              <button className="day-add" onClick={() => openQuickAdd({ date: key })} aria-label={`Add to ${fmtDate(key)}`}>
                <Plus size={14} /> Add
              </button>
            </div>
          )
        })}
      </div>
    </>
  )
}

// ── Month ───────────────────────────────────────────────────────────────────

function MonthView({ state, date, now, onSelect }) {
  const ws = state.settings.weekStart
  const today = toKey(now)
  const month = monthOf(date)
  const grid = monthGrid(month, ws)
  const labels = weekdayLabels(ws, 'narrow')
  const selected = date
  const dayItems = itemsOn(state.items, selected)
  const rows = grid[5].every((k) => monthOf(k) !== month) ? grid.slice(0, 5) : grid

  return (
    <>
      <GoalStrip state={state} horizon="month" period={month} title="Month goals" emptyText="What would make this month a good one? Name it here." />
      <div className="month-layout">
        <div className="month">
          <div className="month-dow">
            {labels.map((l, i) => (
              <div key={i}>{l}</div>
            ))}
          </div>
          {rows.map((week, w) => (
            <div key={w} className="month-week">
              {week.map((key) => {
                const items = itemsOn(state.items, key)
                const other = monthOf(key) !== month
                return (
                  <button
                    key={key}
                    className={`month-cell${other ? ' other' : ''}${key === today ? ' today' : ''}${key === selected ? ' selected' : ''}`}
                    onClick={() => onSelect(key)}
                    aria-label={`${fmtDate(key)}, ${items.length} planned`}
                    aria-pressed={key === selected}
                  >
                    <span className="mnum num">{+key.slice(8)}</span>
                    <span className="month-dots">
                      {items.slice(0, 4).map((item) => (
                        <i key={item.id} style={{ '--ev': areaColor(item.area) }} />
                      ))}
                    </span>
                    <span className="month-chips">
                      {items.slice(0, 3).map((item) => (
                        <span key={item.id} className={statusOf(state, item.id, key) === 'done' ? 'done' : ''} style={{ '--ev': areaColor(item.area) }}>
                          {item.title}
                        </span>
                      ))}
                      {items.length > 3 && <span className="more">+{items.length - 3} more</span>}
                    </span>
                  </button>
                )
              })}
            </div>
          ))}
        </div>

        <div>
          <div className="section-head">
            <span className="eyebrow">{fmtRelative(selected, today)}</span>
            <button className="btn ghost sm" onClick={() => openQuickAdd({ date: selected })}>
              <Plus size={14} /> Add
            </button>
          </div>
          {dayItems.length ? (
            <div className="list">
              {dayItems.map((item) => (
                <ItemRow key={item.id} item={item} date={selected} state={state} now={now} />
              ))}
            </div>
          ) : (
            <div className="card">
              <Empty compact>Nothing planned on {fmtDate(selected, { weekday: 'long' })}.</Empty>
            </div>
          )}
        </div>
      </div>
    </>
  )
}

// ── Year ────────────────────────────────────────────────────────────────────

function heatColor(rate) {
  if (rate == null) return undefined
  return `color-mix(in srgb, var(--accent) ${Math.round(14 + rate * 76)}%, var(--surface-2))`
}

function YearView({ state, year, now, onOpenMonth }) {
  const ws = state.settings.weekStart
  const today = toKey(now)
  const months = Array.from({ length: 12 }, (_, i) => `${year}-${String(i + 1).padStart(2, '0')}`)
  const labels = weekdayLabels(ws, 'narrow')
  const isThisYear = yearOf(today) === year
  const progress = isThisYear ? yearProgress(now) : year < yearOf(today) ? 1 : 0

  const heat = useMemo(() => {
    const map = {}
    for (const m of months) {
      for (const key of monthGrid(m, ws).flat()) {
        if (monthOf(key) !== m) continue
        const s = dayStats(state, key)
        map[key] = { rate: key <= today ? s.rate : null, planned: s.items.length > 0 }
      }
    }
    return map
  }, [state, year, ws, today]) // eslint-disable-line react-hooks/exhaustive-deps

  const kept = Object.entries(heat).filter(([k, v]) => k <= today && v.rate != null)
  const avg = kept.length ? kept.reduce((a, [, v]) => a + v.rate, 0) / kept.length : null

  return (
    <>
      <div className="card pad tint" style={{ marginBottom: 14 }}>
        <div className="row-flex" style={{ gap: 16 }}>
          <Ring value={progress} size={64} stroke={6}>
            <span style={{ fontSize: 14 }}>{Math.round(progress * 100)}%</span>
          </Ring>
          <div className="grow">
            <div className="h2">{isThisYear ? `${daysLeftInYear(today)} days left in ${year}` : year < yearOf(today) ? `${year}, complete` : `${year} is ahead`}</div>
            <div className="small muted" style={{ marginTop: 2 }}>
              {isThisYear ? 'Each one is a chance to live on purpose.' : 'Plan the shape of the year with a few meaningful goals.'}
              {avg != null && ` You’ve kept ${Math.round(avg * 100)}% of what you planned.`}
            </div>
          </div>
        </div>
      </div>

      <GoalStrip state={state} horizon="year" period={year} title={`${year} goals`} emptyText="What would make this year meaningful? Start with one." />

      <div className="row-flex" style={{ justifyContent: 'space-between', margin: '4px 2px 10px' }}>
        <span className="eyebrow">Your year, day by day</span>
        <span className="legend">
          Less
          {[0.05, 0.35, 0.65, 1].map((r) => (
            <i key={r} style={{ background: heatColor(r) }} />
          ))}
          More
        </span>
      </div>

      <div className="year-grid">
        {months.map((m) => {
          const grid = monthGrid(m, ws)
          const cells = grid.flat()
          const lastRow = grid.findLastIndex((row) => row.some((k) => monthOf(k) === m))
          return (
            <button key={m} className={`card mini-month${monthOf(today) === m ? ' current' : ''}`} onClick={() => onOpenMonth(m)}>
              <div className="mini-month-title">
                <span>{fmtMonth(m, { month: 'long' })}</span>
                <ArrowRight size={13} className="faint" />
              </div>
              <div className="mini-grid" style={{ marginBottom: 3 }}>
                {labels.map((l, i) => (
                  <span key={i} className="tiny faint" style={{ textAlign: 'center', fontSize: 9.5 }}>
                    {l}
                  </span>
                ))}
              </div>
              <div className="mini-grid">
                {cells.slice(0, (lastRow + 1) * 7).map((key) => {
                  if (monthOf(key) !== m) return <i key={key} className="blank" />
                  const h = heat[key]
                  const cls = key === today ? 'today' : h?.rate == null && h?.planned ? 'planned' : ''
                  return <i key={key} className={cls} style={{ background: heatColor(h?.rate) }} title={`${fmtDate(key)}${h?.rate != null ? ` · ${Math.round(h.rate * 100)}% kept` : ''}`} />
                })}
              </div>
            </button>
          )
        })}
      </div>
    </>
  )
}
