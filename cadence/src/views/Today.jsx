import { useMemo, useState } from 'react'
import { ArrowRight, Check as CheckIcon, Feather, Inbox as InboxIcon, Moon, Pencil, Play, Plus, Sunrise, Target, Wind } from 'lucide-react'
import { useStore } from '../store/store.js'
import { moveOccurrence, setCheck, toggleDone, updateDay } from '../store/actions.js'
import { newGoal, openBreathe, openFocus, openGoal, openInbox, openItem, openQuickAdd } from '../store/ui.js'
import { navigate } from '../router.js'
import { Bar, Check, Empty, Ring, toast, useMediaQuery, useNow } from '../components/ui.jsx'
import { ItemRow } from '../components/items.jsx'
import { SpotifyPlayer } from '../components/Music.jsx'
import { addDays, fmtDate, fmtDuration, fmtRange, fmtRelative, fmtTime, greeting, nowMinutes, toKey, toMinutes } from '../lib/dates.js'
import { itemsOn } from '../lib/recurrence.js'
import { checkinTimes } from '../lib/rhythm.js'
import { areaColor } from '../lib/areas.js'
import { currentPeriod, dayStats, goalProgress, goalsFor, statusOf } from '../lib/stats.js'
import { hash } from '../lib/ids.js'
import { QUOTES } from '../store/defaults.js'

// Unfinished one-off tasks from the last two weeks, offered back gently.
function carriedOver(state, today) {
  const out = []
  for (let i = 1; i <= 14; i++) {
    const key = addDays(today, -i)
    for (const item of itemsOn(state.items, key)) {
      if (item.repeat || item.start) continue
      if (!statusOf(state, item.id, key)) out.push({ item, date: key })
    }
  }
  return out
}

export default function Today() {
  const state = useStore()
  const now = useNow(30000)
  const today = toKey(now)
  const mins = nowMinutes(now)
  const { items, done, total, rate } = dayStats(state, today)
  const timed = items.filter((i) => i.start)
  const anytime = items.filter((i) => !i.start)
  const carried = useMemo(() => carriedOver(state, today), [state, today])
  const day = state.days[today] ?? {}
  const inboxCount = Object.values(state.inbox).filter((i) => !i.deleted).length
  const weekGoals = goalsFor(state, 'week', currentPeriod('week', today, state.settings.weekStart), state.settings.weekStart).filter(
    (g) => g.status !== 'released',
  )
  const name = state.profile.name?.trim()
  const evening = mins >= Math.min(toMinutes(checkinTimes(state, today).evening ?? '21:00') - 120, 18 * 60)
  const [quote, author] = QUOTES[hash(today) % QUOTES.length]
  const wide = useMediaQuery('(min-width: 1200px)')
  const desktop = useMediaQuery('(min-width: 900px)') // computers have the player in the sidebar

  const blocks = {
    header: (
      <>
        <header className="page-head">
          <div className="row-flex" style={{ alignItems: 'flex-end' }}>
            <div className="grow">
              <div className="eyebrow">{fmtDate(today)}</div>
              <h1 className="display">
                {greeting(now)}
                {name ? `, ${name}` : ''}.
              </h1>
            </div>
            {total > 0 && (
              <Ring value={rate} size={54} stroke={5} label={`${done} of ${total} done today`}>
                <span style={{ fontSize: 13 }}>
                  {done}/{total}
                </span>
              </Ring>
            )}
          </div>
        </header>
      </>
    ),
    now: (
      <>
        <NowCard state={state} now={now} today={today} timed={timed} anytime={anytime} evening={evening} />
      </>
    ),
    intention: (
      <>
        <Intention value={day.intention} onSave={(intention) => updateDay(today, { intention })} />
      </>
    ),
    inbox: (
      <>
        {inboxCount > 0 && (
          <button className="card pad row-flex fade-in" style={{ width: '100%', marginTop: 12, textAlign: 'left' }} onClick={openInbox}>
            <span className="setting-icon" style={{ background: 'var(--accent-soft)', color: 'var(--accent)' }}>
              <InboxIcon size={17} />
            </span>
            <span className="grow">
              <span className="setting-title" style={{ display: 'block' }}>
                {inboxCount} captured {inboxCount === 1 ? 'thing' : 'things'} to sort
              </span>
              <span className="small muted">From your messages, email and shares</span>
            </span>
            <ArrowRight size={18} className="faint" />
          </button>
        )}
      </>
    ),
    schedule: (
      <>
        <section className="section">
          <div className="section-head">
            <span className="eyebrow">Schedule</span>
            <button className="btn ghost sm" onClick={() => navigate('plan')}>
              Full day <ArrowRight size={14} />
            </button>
          </div>
          {timed.length ? (
            <div className="list">
              {timed.map((item) => (
                <ItemRow key={item.id} item={item} date={today} state={state} now={now} />
              ))}
            </div>
          ) : (
            <div className="card">
              <Empty
                compact
                action={
                  <button className="btn soft sm" onClick={() => openQuickAdd()}>
                    <Plus size={14} /> Add a time block
                  </button>
                }
              >
                Nothing with a set time today.
              </Empty>
            </div>
          )}
        </section>
      </>
    ),
    anytime: (
      <>
        <section className="section">
          <div className="section-head">
            <span className="eyebrow">Anytime today</span>
            <button className="btn ghost sm" onClick={() => openQuickAdd({ text: '' })}>
              <Plus size={14} /> Add
            </button>
          </div>
          {anytime.length ? (
            <div className="list">
              {anytime.map((item) => (
                <ItemRow key={item.id} item={item} date={today} state={state} now={now} showTime={false} />
              ))}
            </div>
          ) : (
            <div className="card">
              <Empty compact>Habits and to-dos without a time land here.</Empty>
            </div>
          )}
        </section>
      </>
    ),
    carried: (
      <>
        {carried.length > 0 && (
          <section className="section">
            <div className="section-head">
              <span className="eyebrow">Still with you</span>
              <span className="tiny faint">Do it today, or let it go</span>
            </div>
            <div className="list">
              {carried.slice(0, 8).map(({ item, date }) => (
                <div key={`${item.id}${date}`} className="item-row">
                  <Check color={areaColor(item.area)} label={`Mark “${item.title}” done`} onToggle={() => toggleDone(item.id, date)} />
                  <button className="item-body" onClick={() => openItem(item.id, date)}>
                    <span className="item-title">{item.title}</span>
                    <span className="item-meta">From {fmtRelative(date, today).toLowerCase() === 'yesterday' ? 'yesterday' : fmtRelative(date, today)}</span>
                  </button>
                  <button
                    className="btn sm soft"
                    onClick={() => {
                      moveOccurrence(item, date, today)
                      toast(`“${item.title}” moved to today`)
                    }}
                  >
                    Today
                  </button>
                  <button
                    className="btn sm ghost"
                    onClick={() => {
                      setCheck(item.id, date, 'skipped')
                      toast('Let go. That’s allowed.', { action: 'Undo', onAction: () => setCheck(item.id, date, '') })
                    }}
                  >
                    Let go
                  </button>
                </div>
              ))}
            </div>
          </section>
        )}
      </>
    ),
    week: (
      <>
        <section className="section">
          <div className="section-head">
            <span className="eyebrow">This week’s focus</span>
            <button className="btn ghost sm" onClick={() => navigate('goals')}>
              Goals <ArrowRight size={14} />
            </button>
          </div>
          {weekGoals.length ? (
            <div className="list">
              {weekGoals.map((g) => {
                const p = goalProgress(state, g, state.settings.weekStart)
                return (
                  <button key={g.id} className="item-row" style={{ width: '100%', textAlign: 'left' }} onClick={() => openGoal(g.id)}>
                    <span className="goal-icon" style={{ '--ev': areaColor(g.area), width: 30, height: 30, borderRadius: 9 }}>
                      {g.status === 'done' ? <CheckIcon size={16} /> : <Target size={16} />}
                    </span>
                    <span className="item-body">
                      <span className="item-title">{g.title}</span>
                      <Bar value={p.fraction} thin color={areaColor(g.area)} label={p.label} />
                    </span>
                    <span className="tiny muted num" style={{ whiteSpace: 'nowrap' }}>
                      {p.label}
                    </span>
                  </button>
                )
              })}
            </div>
          ) : (
            <div className="card">
              <Empty
                compact
                action={
                  <button className="btn soft sm" onClick={() => newGoal({ horizon: 'week', period: currentPeriod('week', today, state.settings.weekStart) })}>
                    <Plus size={14} /> Set a weekly focus
                  </button>
                }
              >
                What are the one to three things that matter this week?
              </Empty>
            </div>
          )}
        </section>
      </>
    ),
    evening: (
      <>
        {evening && (
          <section className="section">
            <button className="card pad tint row-flex" style={{ width: '100%', textAlign: 'left', gap: 14 }} onClick={() => navigate('reflect')}>
              <span className="setting-icon" style={{ background: 'var(--accent-soft)', color: 'var(--accent)' }}>
                <Moon size={18} />
              </span>
              <span className="grow">
                <span className="setting-title" style={{ display: 'block' }}>
                  {day.mood || day.reflection ? 'You reflected today' : 'Close the day gently'}
                </span>
                <span className="small muted">
                  {day.mood || day.reflection ? 'Revisit or add to it anytime.' : 'Two minutes: how did today feel? What are you grateful for?'}
                </span>
              </span>
              <ArrowRight size={18} className="faint" />
            </button>
          </section>
        )}
      </>
    ),
    music: (
      <>
        {!desktop && state.settings.spotify.links.length > 0 && (
          <section className="section">
            <SpotifyPlayer showEmpty={false} />
          </section>
        )}
      </>
    ),
    quote: (
      <>
        <figure className="section" style={{ margin: '34px 4px 8px', textAlign: 'center' }}>
          <blockquote className="serif" style={{ margin: 0, fontStyle: 'italic', fontSize: 16, color: 'var(--text-2)', lineHeight: 1.5 }}>
            “{quote}”
          </blockquote>
          <figcaption className="tiny faint" style={{ marginTop: 6 }}>
            — {author}
          </figcaption>
        </figure>
      </>
    ),
  }

  if (wide) {
    return (
      <div className="page wide" style={{ maxWidth: 1120 }}>
        {blocks.header}
        <div className="today-cols">
          <div>
            {blocks.now}
            {blocks.schedule}
            {blocks.anytime}
            {blocks.carried}
          </div>
          <aside>
            {blocks.intention}
            {blocks.inbox}
            {blocks.week}
            {blocks.evening}
            {blocks.quote}
          </aside>
        </div>
      </div>
    )
  }

  return (
    <div className="page">
      {blocks.header}
      {blocks.now}
      {blocks.intention}
      {blocks.inbox}
      {blocks.schedule}
      {blocks.anytime}
      {blocks.carried}
      {blocks.week}
      {blocks.evening}
      {blocks.music}
      {blocks.quote}
    </div>
  )
}

function NowCard({ state, now, today, timed, anytime, evening }) {
  const mins = nowMinutes(now)
  const pending = (i) => statusOf(state, i.id, today) === ''
  const current = timed.find((i) => pending(i) && toMinutes(i.start) <= mins && mins < toMinutes(i.end ?? i.start) + (i.end ? 0 : 30))
  const next = timed.find((i) => pending(i) && toMinutes(i.start) > mins)
  const anytimeLeft = anytime.filter(pending).length

  if (current) {
    const start = toMinutes(current.start)
    const end = toMinutes(current.end ?? current.start) || start + 30
    const left = Math.max(0, end - mins)
    const progress = (mins - start) / Math.max(1, end - start)
    return (
      <div className="now-card fade-in">
        <div className="label-row">
          <span className="pulse" /> Now
        </div>
        <div className="now-title">{current.title}</div>
        <div className="now-sub num">
          {fmtRange(current.start, current.end)} · {fmtDuration(left) || 'ending'} left
        </div>
        <div style={{ marginTop: 14 }}>
          <Bar value={progress} color={areaColor(current.area)} label="Time elapsed" />
        </div>
        <div className="now-actions">
          <button className="btn primary" onClick={() => openFocus(current.id, today)}>
            <Play size={16} /> Focus
          </button>
          <button
            className="btn secondary"
            onClick={() => {
              toggleDone(current.id, today)
              toast(`“${current.title}” done. Well spent.`)
            }}
          >
            <CheckIcon size={16} /> Done
          </button>
          <button className="btn ghost" onClick={openBreathe} aria-label="Breathe">
            <Wind size={16} />
          </button>
        </div>
        {next && (
          <div className="next-up">
            <ArrowRight size={14} /> Next: <strong style={{ fontWeight: 600, color: 'var(--text)' }}>{next.title}</strong> at{' '}
            <span className="num">{fmtTime(next.start)}</span>
          </div>
        )}
      </div>
    )
  }

  if (next) {
    const until = toMinutes(next.start) - mins
    return (
      <div className="now-card fade-in">
        <div className="label-row">
          <Sunrise size={14} /> Up next
        </div>
        <div className="now-title">{next.title}</div>
        <div className="now-sub num">
          {fmtRange(next.start, next.end)} · in {fmtDuration(until)}
        </div>
        <div className="now-actions">
          <button className="btn secondary" onClick={openBreathe}>
            <Wind size={16} /> Take a breath
          </button>
          <button className="btn ghost" onClick={() => openItem(next.id, today)}>
            Details
          </button>
        </div>
        <div className="next-up">
          <Feather size={14} />
          {anytimeLeft
            ? `Open time until then — ${anytimeLeft} anytime ${anytimeLeft === 1 ? 'thing' : 'things'} could fit.`
            : 'Open time until then. Use it on purpose — or rest.'}
        </div>
      </div>
    )
  }

  const nothing = timed.length + anytime.length === 0
  const allDone = !nothing && anytimeLeft === 0 && timed.every((i) => !pending(i) || toMinutes(i.end ?? i.start) <= mins)
  return (
    <div className="now-card fade-in">
      <div className="label-row">
        {evening ? <Moon size={14} /> : <Feather size={14} />} {evening ? 'Evening' : 'Open time'}
      </div>
      <div className="now-title">
        {nothing
          ? 'A blank page. What matters today?'
          : allDone
            ? 'That’s a wrap. Nicely done.'
            : `${anytimeLeft} ${anytimeLeft === 1 ? 'thing' : 'things'} left, no rush.`}
      </div>
      <div className="now-sub">
        {nothing
          ? 'Add a few intentional blocks, or simply be present.'
          : allDone
            ? evening
              ? 'Let the day settle. Reflect, then rest.'
              : 'Everything planned is done. The rest of the day is yours.'
            : 'Pick one. Give it your whole attention.'}
      </div>
      <div className="now-actions">
        {nothing ? (
          <button className="btn primary" onClick={() => openQuickAdd()}>
            <Plus size={16} /> Plan something
          </button>
        ) : evening ? (
          <button className="btn primary" onClick={() => navigate('reflect')}>
            <Moon size={16} /> Reflect
          </button>
        ) : null}
        <button className="btn secondary" onClick={openBreathe}>
          <Wind size={16} /> Breathe
        </button>
        {evening && (
          <button className="btn ghost" onClick={() => openQuickAdd({ date: addDays(today, 1) })}>
            Plan tomorrow
          </button>
        )}
      </div>
    </div>
  )
}

function Intention({ value, onSave }) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(value ?? '')

  if (editing || !value) {
    return (
      <form
        className="card"
        style={{ marginTop: 12, padding: '14px 16px' }}
        onSubmit={(e) => {
          e.preventDefault()
          onSave(draft.trim())
          setEditing(false)
          if (draft.trim()) toast('Intention set. Return to it when you drift.')
        }}
      >
        <label className="eyebrow" htmlFor="intention" style={{ display: 'block', marginBottom: 6 }}>
          Today’s intention
        </label>
        <div className="row-flex">
          <input
            id="intention"
            className="input bare serif"
            style={{ fontSize: 18, fontStyle: draft ? 'italic' : 'normal' }}
            placeholder="What would make today meaningful?"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={() => {
              if (value && draft.trim() === value) setEditing(false)
            }}
            autoFocus={editing}
            enterKeyHint="done"
          />
          {draft.trim() && draft.trim() !== value && (
            <button type="submit" className="btn sm primary">
              Set
            </button>
          )}
        </div>
      </form>
    )
  }

  return (
    <button
      className="card intention"
      style={{ marginTop: 12 }}
      onClick={() => {
        setDraft(value)
        setEditing(true)
      }}
    >
      <span className="grow">
        <span className="eyebrow" style={{ display: 'block', marginBottom: 4 }}>
          Today’s intention
        </span>
        <span className="intention-text">“{value}”</span>
      </span>
      <Pencil size={15} className="faint" style={{ marginTop: 4 }} />
    </button>
  )
}
