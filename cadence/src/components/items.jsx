import { useMemo, useRef, useState } from 'react'
import {
  ArrowRight, Bell, CalendarDays, Check as CheckIcon, Clock, Flame, Play, Repeat, SkipForward, Sparkles, Tag, Target, Trash2, Undo2,
} from 'lucide-react'
import { AreaChips, Check, Seg, Sheet, toast } from './ui.jsx'
import { useStore } from '../store/store.js'
import {
  addItem, deleteItem, moveToTomorrow, removeOccurrence, resolveInbox, restoreItem, restoreOccurrence, setCheck, toggleDone, updateItem,
} from '../store/actions.js'
import { newItem, openFocus, openItem } from '../store/ui.js'
import { AREAS, AREA_BY_ID, areaColor } from '../lib/areas.js'
import {
  addDays, fmtDate, fmtRange, fmtRelative, fmtTime, fromMinutes, localeDayFirst, nowMinutes, toMinutes, todayKey, weekday,
} from '../lib/dates.js'
import { describeRepeat, ordinal, shortRepeat } from '../lib/recurrence.js'
import { parseQuick } from '../lib/parse.js'
import { goalsFor, statusOf, streak, currentPeriod } from '../lib/stats.js'
import { REMINDER_OPTIONS } from '../store/defaults.js'

// ── A single item in a list ─────────────────────────────────────────────────

export function ItemRow({ item, date, state, now = new Date(), showTime = true }) {
  const status = statusOf(state, item.id, date)
  const done = status === 'done'
  const today = todayKey(now)
  const mins = nowMinutes(now)
  const isNow = date === today && item.start && item.end && mins >= toMinutes(item.start) && mins < toMinutes(item.end)
  const past = date < today || (date === today && item.start && mins >= toMinutes(item.end ?? item.start))
  const goal = item.goalId ? state.goals[item.goalId] : null
  const count = item.repeat && date === today ? streak(state, item, today) : 0
  const color = areaColor(item.area)

  return (
    <div className={`item-row${done ? ' done' : ''}${isNow ? ' now' : ''}${past ? ' past' : ''}`}>
      {showTime && (
        <div className="time">
          {item.start ? (
            <>
              {fmtTime(item.start, { compact: true })}
              {item.end && <span className="end">{fmtTime(item.end, { compact: true })}</span>}
            </>
          ) : (
            <span className="faint">Any</span>
          )}
        </div>
      )}
      <Check
        checked={done}
        skipped={status === 'skipped'}
        color={color}
        label={done ? `Mark “${item.title}” not done` : `Mark “${item.title}” done`}
        onToggle={() => {
          if (status === 'skipped') setCheck(item.id, date, '')
          else toggleDone(item.id, date)
        }}
      />
      <button className="item-body" onClick={() => openItem(item.id, date)}>
        <span className="item-title">{item.title}</span>
        <span className="item-meta">
          {!showTime && item.start && <span className="num">{fmtRange(item.start, item.end)}</span>}
          {status === 'skipped' && <span>Skipped</span>}
          {item.repeat && (
            <span>
              <Repeat size={12} />
              {shortRepeat(item.repeat, item.date)}
            </span>
          )}
          {goal && !goal.deleted && (
            <span>
              <Target size={12} />
              {goal.title}
            </span>
          )}
          {count >= 2 && (
            <span className="streak" title={`${count} in a row`}>
              <Flame size={12} />
              {count}
            </span>
          )}
          {item.start && item.reminder != null && <Bell size={12} aria-label="Reminder on" />}
        </span>
      </button>
      {item.area && <span className="area-dot" style={{ background: color }} title={AREA_BY_ID[item.area]?.label} />}
    </div>
  )
}

// ── Create / edit sheet ─────────────────────────────────────────────────────

const REPEAT_UNITS = { daily: 'day', weekly: 'week', monthly: 'month', yearly: 'year' }
const DOW = ['S', 'M', 'T', 'W', 'T', 'F', 'S']
const DOW_LONG = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

function repeatMode(repeat, date) {
  if (!repeat) return 'none'
  const n = repeat.interval || 1
  if (n !== 1) return 'custom'
  if (repeat.freq === 'daily') return 'daily'
  if (repeat.freq === 'weekly') {
    const days = repeat.days?.length ? [...repeat.days].sort().join() : String(weekday(date))
    if (days === '1,2,3,4,5') return 'weekdays'
    if (days === String(weekday(date))) return 'weekly'
    return 'custom'
  }
  return repeat.freq
}

function defaultStart(date) {
  if (date !== todayKey()) return '09:00'
  const next = Math.ceil((nowMinutes() + 5) / 30) * 30
  return fromMinutes(Math.min(next, 22 * 60))
}

export function ItemSheet({ open, onClose, itemId, draft, date: occurrence, inboxId }) {
  const state = useStore()
  const existing = itemId ? state.items[itemId] : null
  const settings = state.settings
  const titleRef = useRef(null)
  const [confirmDelete, setConfirmDelete] = useState(false)

  const [form, setForm] = useState(() => {
    const src = existing ?? { title: '', notes: '', date: todayKey(), start: null, end: null, area: null, goalId: null, repeat: null, reminder: null, ...draft }
    return {
      title: src.title ?? '',
      notes: src.notes ?? '',
      date: src.date ?? todayKey(),
      start: src.start ?? null,
      end: src.end ?? null,
      area: src.area ?? null,
      goalId: src.goalId ?? null,
      repeat: src.repeat ?? null,
      reminder: src.reminder ?? (src.start && !existing ? settings.defaultReminder : null),
      until: src.repeat?.until ?? '',
    }
  })
  const set = (patch) => setForm((f) => ({ ...f, ...patch }))
  const occ = occurrence ?? existing?.date ?? form.date
  const status = existing ? statusOf(state, existing.id, occ) : ''
  const mode = repeatMode(form.repeat, form.date)

  const goals = useMemo(() => {
    const ws = settings.weekStart
    const list = [
      ...goalsFor(state, 'week', currentPeriod('week', form.date, ws), ws),
      ...goalsFor(state, 'month', currentPeriod('month', form.date, ws), ws),
      ...goalsFor(state, 'year', currentPeriod('year', form.date, ws), ws),
    ].filter((g) => g.status === 'active')
    const selected = form.goalId && state.goals[form.goalId]
    if (selected && !list.includes(selected)) list.push(selected)
    return list
  }, [state, form.date, form.goalId, settings.weekStart])

  function setMode(next) {
    const wd = weekday(form.date)
    const repeats = {
      none: null,
      daily: { freq: 'daily' },
      weekdays: { freq: 'weekly', days: [1, 2, 3, 4, 5] },
      weekly: { freq: 'weekly', days: [wd] },
      monthly: { freq: 'monthly' },
      yearly: { freq: 'yearly' },
      custom: { freq: 'weekly', interval: 1, days: [wd] },
    }
    set({ repeat: repeats[next] })
  }

  function setTimed(timed) {
    if (timed) {
      const start = form.start ?? defaultStart(form.date)
      set({ start, end: form.end ?? fromMinutes(toMinutes(start) + settings.defaultDuration), reminder: form.reminder ?? settings.defaultReminder })
    } else set({ start: null, end: null })
  }

  function setStart(start) {
    if (!start) return
    const length = form.start && form.end ? toMinutes(form.end) - toMinutes(form.start) : settings.defaultDuration
    set({ start, end: fromMinutes(toMinutes(start) + Math.max(5, length)) })
  }

  function save() {
    const title = form.title.trim()
    if (!title) {
      titleRef.current?.focus()
      toast('Give it a name first')
      return
    }
    let end = form.end
    if (form.start && (!end || toMinutes(end) <= toMinutes(form.start))) end = fromMinutes(toMinutes(form.start) + 30)
    const repeat = form.repeat ? { ...form.repeat, ...(form.until ? { until: form.until } : {}) } : null
    if (repeat && !form.until) delete repeat.until
    const fields = {
      title,
      notes: form.notes.trim(),
      date: form.date,
      start: form.start,
      end: form.start ? end : null,
      area: form.area,
      goalId: form.goalId,
      repeat,
      reminder: form.start ? form.reminder : null,
    }
    if (existing) {
      updateItem(existing.id, fields)
      toast('Saved')
    } else {
      const id = addItem({ ...fields, source: draft?.source ?? 'manual' })
      if (inboxId) resolveInbox(inboxId)
      toast(`Added to ${fmtRelative(form.date).toLowerCase() === 'today' ? 'today' : fmtRelative(form.date)}`, { action: 'Undo', onAction: () => deleteItem(id) })
    }
    onClose()
  }

  function remove(scope) {
    if (!existing) return
    if (scope === 'one') {
      removeOccurrence(existing, occ)
      toast(`Removed ${fmtRelative(occ).toLowerCase()}’s “${existing.title}”`, { action: 'Undo', onAction: () => restoreOccurrence(existing, occ) })
    } else {
      deleteItem(existing.id)
      toast(`Deleted “${existing.title}”`, { action: 'Undo', onAction: () => restoreItem(existing.id) })
    }
    onClose()
  }

  const footer = confirmDelete ? (
    <>
      <span className="small muted grow">Delete which?</span>
      <button className="btn ghost" onClick={() => setConfirmDelete(false)}>
        Cancel
      </button>
      <button className="btn secondary" onClick={() => remove('one')}>
        Only {fmtRelative(occ).toLowerCase() === 'today' ? 'today' : fmtDate(occ, { month: 'short', day: 'numeric' })}
      </button>
      <button className="btn danger" onClick={() => remove('all')}>
        All
      </button>
    </>
  ) : (
    <>
      {existing && (
        <button className="btn danger" onClick={() => (existing.repeat ? setConfirmDelete(true) : remove('all'))}>
          <Trash2 size={16} />
          <span className="hide-mobile">Delete</span>
        </button>
      )}
      <span className="spacer" />
      <button className="btn ghost" onClick={onClose}>
        Cancel
      </button>
      <button className="btn primary" onClick={save}>
        {existing ? 'Save' : 'Add to plan'}
      </button>
    </>
  )

  return (
    <Sheet open={open} onClose={onClose} title={existing ? (existing.repeat ? fmtRelative(occ) : 'Edit') : 'New'} footer={footer}>
      <form
        className="stack"
        style={{ gap: 18 }}
        onSubmit={(e) => {
          e.preventDefault()
          save()
        }}
      >
        <input
          ref={titleRef}
          className="input title-input"
          placeholder="What will you do?"
          value={form.title}
          onChange={(e) => set({ title: e.target.value })}
          {...(!existing ? { 'data-autofocus': true } : {})}
          aria-label="Title"
          enterKeyHint="done"
        />

        {existing && (
          <div className="row-flex wrap" style={{ gap: 8 }}>
            <button type="button" className={`btn sm ${status === 'done' ? 'soft' : 'secondary'}`} onClick={() => toggleDone(existing.id, occ)}>
              {status === 'done' ? <Undo2 size={15} /> : <CheckIcon size={15} />}
              {status === 'done' ? 'Mark not done' : 'Done'}
            </button>
            <button
              type="button"
              className="btn sm secondary"
              onClick={() => openFocus(existing.id, occ)}
            >
              <Play size={15} />
              Focus
            </button>
            <button
              type="button"
              className="btn sm secondary"
              onClick={() => {
                const id = moveToTomorrow(existing, occ)
                toast(`Moved to ${fmtRelative(addDays(occ, 1)).toLowerCase()}`, { action: 'Open', onAction: () => openItem(id, addDays(occ, 1)) })
                onClose()
              }}
            >
              <ArrowRight size={15} />
              {occ === todayKey() ? 'Tomorrow' : 'Next day'}
            </button>
            {existing.repeat && status !== 'skipped' && (
              <button
                type="button"
                className="btn sm secondary"
                onClick={() => {
                  setCheck(existing.id, occ, 'skipped')
                  toast('Skipped — your streak is safe', { action: 'Undo', onAction: () => setCheck(existing.id, occ, '') })
                  onClose()
                }}
              >
                <SkipForward size={15} />
                Skip
              </button>
            )}
          </div>
        )}

        <div className="list">
          <label className="setting">
            <span className="setting-icon">
              <CalendarDays size={17} />
            </span>
            <span className="setting-text">
              <span className="setting-title">{form.repeat ? 'Starts' : 'Date'}</span>
            </span>
            <input type="date" className="input" value={form.date} onChange={(e) => e.target.value && set({ date: e.target.value })} required />
          </label>

          <div className="setting" style={{ flexWrap: 'wrap' }}>
            <span className="setting-icon">
              <Clock size={17} />
            </span>
            <span className="setting-text">
              <span className="setting-title">Time</span>
            </span>
            <Seg
              label="Time"
              value={form.start ? 'timed' : 'any'}
              onChange={(v) => setTimed(v === 'timed')}
              options={[
                { value: 'any', label: 'Anytime' },
                { value: 'timed', label: 'Set time' },
              ]}
            />
            {form.start && (
              <div className="row-flex sub-row" style={{ width: '100%', gap: 8 }}>
                <input type="time" className="input" value={form.start} onChange={(e) => setStart(e.target.value)} aria-label="Start time" style={{ flex: 1 }} />
                <span className="faint">to</span>
                <input type="time" className="input" value={form.end ?? ''} onChange={(e) => set({ end: e.target.value })} aria-label="End time" style={{ flex: 1 }} />
              </div>
            )}
            {form.start && (
              <div className="chips sub-row" style={{ width: '100%' }}>
                {[15, 30, 45, 60, 90, 120].map((m) => {
                  const active = form.end && toMinutes(form.end) - toMinutes(form.start) === m
                  return (
                    <button key={m} type="button" className="chip sm" aria-pressed={!!active} onClick={() => set({ end: fromMinutes(toMinutes(form.start) + m) })}>
                      {m < 60 ? `${m}m` : `${m / 60}h`}
                    </button>
                  )
                })}
              </div>
            )}
          </div>

          <div className="setting" style={{ flexWrap: 'wrap' }}>
            <span className="setting-icon">
              <Repeat size={17} />
            </span>
            <span className="setting-text">
              <span className="setting-title">Repeat</span>
            </span>
            <select className="select" value={mode} onChange={(e) => setMode(e.target.value)} aria-label="Repeat">
              <option value="none">Never</option>
              <option value="daily">Every day</option>
              <option value="weekdays">Every weekday</option>
              <option value="weekly">Every {DOW_LONG[weekday(form.date)]}</option>
              <option value="monthly">Monthly on the {ordinal(+form.date.slice(8))}</option>
              <option value="yearly">Every year on {fmtDate(form.date, { month: 'short', day: 'numeric' })}</option>
              <option value="custom">Custom…</option>
            </select>
            {mode === 'custom' && form.repeat && (
              <div className="stack sub-row" style={{ width: '100%', gap: 10 }}>
                <div className="row-flex">
                  <span className="small muted">Every</span>
                  <input
                    type="number"
                    min={1}
                    max={99}
                    className="input"
                    style={{ width: 72 }}
                    value={form.repeat.interval || 1}
                    onChange={(e) => set({ repeat: { ...form.repeat, interval: Math.max(1, Math.min(99, +e.target.value || 1)) } })}
                    aria-label="Interval"
                  />
                  <select
                    className="select"
                    style={{ width: 'auto' }}
                    value={form.repeat.freq}
                    onChange={(e) => set({ repeat: { ...form.repeat, freq: e.target.value, days: e.target.value === 'weekly' ? [weekday(form.date)] : undefined } })}
                    aria-label="Unit"
                  >
                    {Object.entries(REPEAT_UNITS).map(([freq, unit]) => (
                      <option key={freq} value={freq}>
                        {unit}
                        {(form.repeat.interval || 1) > 1 ? 's' : ''}
                      </option>
                    ))}
                  </select>
                </div>
                {form.repeat.freq === 'weekly' && (
                  <div className="chips" role="group" aria-label="Days of the week">
                    {DOW.map((d, i) => {
                      const days = form.repeat.days ?? [weekday(form.date)]
                      const on = days.includes(i)
                      return (
                        <button
                          key={i}
                          type="button"
                          className="chip"
                          style={{ width: 38, justifyContent: 'center', padding: 0 }}
                          aria-pressed={on}
                          aria-label={DOW_LONG[i]}
                          onClick={() => {
                            const next = on ? days.filter((x) => x !== i) : [...days, i].sort()
                            if (next.length) set({ repeat: { ...form.repeat, days: next } })
                          }}
                        >
                          {d}
                        </button>
                      )
                    })}
                  </div>
                )}
              </div>
            )}
            {form.repeat && (
              <div className="row-flex sub-row" style={{ width: '100%' }}>
                <span className="small muted">Ends</span>
                <input type="date" className="input" style={{ flex: 1 }} value={form.until} min={form.date} onChange={(e) => set({ until: e.target.value })} aria-label="End date" />
                {form.until && (
                  <button type="button" className="btn ghost sm" onClick={() => set({ until: '' })}>
                    Never
                  </button>
                )}
              </div>
            )}
          </div>

          {form.start && (
            <label className="setting">
              <span className="setting-icon">
                <Bell size={17} />
              </span>
              <span className="setting-text">
                <span className="setting-title">Remind me</span>
              </span>
              <select className="select" value={form.reminder == null ? '' : String(form.reminder)} onChange={(e) => set({ reminder: e.target.value === '' ? null : +e.target.value })}>
                {REMINDER_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>

        <div className="field">
          <span className="label">Area of life</span>
          <AreaChips value={form.area} onChange={(area) => set({ area })} areas={AREAS} />
        </div>

        {goals.length > 0 && (
          <label className="field">
            <span className="label">Supports a goal</span>
            <select className="select" value={form.goalId ?? ''} onChange={(e) => set({ goalId: e.target.value || null })}>
              <option value="">No goal</option>
              {['week', 'month', 'year'].map((h) => {
                const list = goals.filter((g) => g.horizon === h)
                if (!list.length) return null
                return (
                  <optgroup key={h} label={`This ${h}`}>
                    {list.map((g) => (
                      <option key={g.id} value={g.id}>
                        {g.title}
                      </option>
                    ))}
                  </optgroup>
                )
              })}
            </select>
          </label>
        )}

        <label className="field">
          <span className="label">Notes</span>
          <textarea className="textarea" rows={3} placeholder="Details, links, a reason why…" value={form.notes} onChange={(e) => set({ notes: e.target.value })} />
        </label>
        <button type="submit" hidden />
      </form>
    </Sheet>
  )
}

// ── Quick add: type naturally ───────────────────────────────────────────────

const EXAMPLES = ['Morning run tomorrow 7am #health', 'Team sync every Mon 10-11am #work', 'Call mom Sunday at 5', 'Read 20 pages daily #growth']

export function parsedChips(parsed) {
  const chips = []
  chips.push({ icon: CalendarDays, text: fmtRelative(parsed.date) })
  if (parsed.start) chips.push({ icon: Clock, text: fmtRange(parsed.start, parsed.end) })
  if (parsed.repeat) chips.push({ icon: Repeat, text: describeRepeat(parsed.repeat, parsed.date) })
  if (parsed.area) chips.push({ icon: Tag, text: AREA_BY_ID[parsed.area].label, color: areaColor(parsed.area) })
  return chips
}

export function ParsedPreview({ parsed }) {
  return (
    <div className="parsed">
      {parsedChips(parsed).map((c, i) => (
        <span key={i} className="tag accent" style={c.color ? { background: `color-mix(in srgb, ${c.color} 15%, transparent)`, color: c.color } : undefined}>
          <c.icon size={12} />
          {c.text}
        </span>
      ))}
    </div>
  )
}

export function parsedToFields(parsed, settings) {
  return {
    title: parsed.title,
    date: parsed.date,
    start: parsed.start,
    end: parsed.end,
    repeat: parsed.repeat,
    area: parsed.area,
    reminder: parsed.start ? settings.defaultReminder : null,
  }
}

export function useParser(text, { date } = {}) {
  const { settings } = useStore()
  return useMemo(() => {
    const parsed = parseQuick(text, { areas: AREAS, dayFirst: localeDayFirst(), defaultDuration: settings.defaultDuration })
    if (date && !parsed.hasDate) parsed.date = date
    return parsed
  }, [text, date, settings.defaultDuration])
}

export function QuickAdd({ open, onClose, date, text: initialText = '' }) {
  const { settings } = useStore()
  const [text, setText] = useState(initialText)
  const parsed = useParser(text, { date })

  function add() {
    if (!parsed.title) return
    const fields = parsedToFields(parsed, settings)
    const id = addItem({ ...fields, source: 'quick' })
    toast(`Added “${parsed.title}” · ${fmtRelative(parsed.date)}${parsed.start ? ` ${fmtTime(parsed.start)}` : ''}`, { action: 'Undo', onAction: () => deleteItem(id) })
    onClose()
  }

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Add to your plan"
      footer={
        <>
          <button className="btn ghost" onClick={() => newItem({ ...parsedToFields(parsed, settings), title: parsed.title || text.trim() })}>
            More options
          </button>
          <span className="spacer" />
          <button className="btn primary" onClick={add} disabled={!parsed.title}>
            Add
          </button>
        </>
      }
    >
      <form
        className="stack"
        style={{ gap: 12 }}
        onSubmit={(e) => {
          e.preventDefault()
          add()
        }}
      >
        <input
          className="input quick-input"
          placeholder="e.g. Yoga tomorrow 7am"
          value={text}
          onChange={(e) => setText(e.target.value)}
          data-autofocus
          aria-label="Describe what to add"
          enterKeyHint="done"
          autoComplete="off"
        />
        {text.trim() ? (
          <ParsedPreview parsed={parsed} />
        ) : (
          <div className="stack" style={{ gap: 8 }}>
            <div className="small muted row-flex" style={{ gap: 6 }}>
              <Sparkles size={14} /> Type naturally — dates, times, repeats and #areas are understood.
            </div>
            <div className="chips">
              {EXAMPLES.map((ex) => (
                <button key={ex} type="button" className="chip sm" onClick={() => setText(ex)}>
                  {ex}
                </button>
              ))}
            </div>
          </div>
        )}
      </form>
    </Sheet>
  )
}
