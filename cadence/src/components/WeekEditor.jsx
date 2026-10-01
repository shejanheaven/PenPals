import { Briefcase, Copy } from 'lucide-react'
import { Switch, toast } from './ui.jsx'
import { defaultDay } from '../lib/rhythm.js'

const NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

// Edit a whole week: for each day, wake time, bedtime, and work hours if it's
// a work day. `value` is { 0..6: { wake, sleep, work, workStart, workEnd } }.
export function WeekEditor({ value, onChange, weekStart = 1 }) {
  const order = Array.from({ length: 7 }, (_, i) => (i + weekStart) % 7)
  const day = (d) => ({ ...defaultDay(), ...value?.[d] })
  const set = (d, patch) => onChange({ ...value, [d]: { ...day(d), ...patch } })

  function copyFrom(d) {
    const src = day(d)
    const next = { ...value }
    for (const o of order) {
      if (o === d) continue
      const target = day(o)
      // Work days copy work hours to other work days; sleep times go to days of the same kind.
      if (target.work !== src.work) continue
      next[o] = { ...target, wake: src.wake, sleep: src.sleep, ...(src.work ? { workStart: src.workStart, workEnd: src.workEnd } : {}) }
    }
    onChange(next)
    toast(`Copied ${NAMES[d]}’s times to your other ${src.work ? 'work' : 'off'} days`)
  }

  return (
    <div className="list">
      {order.map((d) => {
        const r = day(d)
        return (
          <div key={d} className="week-row">
            <div className="row-flex">
              <strong className="grow" style={{ fontWeight: 600 }}>
                {NAMES[d]}
              </strong>
              <span className="small muted row-flex" style={{ gap: 6 }}>
                <Briefcase size={14} /> Work
              </span>
              <Switch checked={r.work} onChange={(work) => set(d, { work })} label={`${NAMES[d]} is a work day`} />
            </div>
            <div className="week-times">
              <label>
                <span>Wake</span>
                <input type="time" className="input" value={r.wake} onChange={(e) => e.target.value && set(d, { wake: e.target.value })} />
              </label>
              {r.work && (
                <>
                  <label>
                    <span>Work from</span>
                    <input type="time" className="input" value={r.workStart} onChange={(e) => e.target.value && set(d, { workStart: e.target.value })} />
                  </label>
                  <label>
                    <span>until</span>
                    <input type="time" className="input" value={r.workEnd} onChange={(e) => e.target.value && set(d, { workEnd: e.target.value })} />
                  </label>
                </>
              )}
              <label>
                <span>Bed</span>
                <input type="time" className="input" value={r.sleep} onChange={(e) => e.target.value && set(d, { sleep: e.target.value })} />
              </label>
            </div>
            <button type="button" className="btn ghost sm" style={{ alignSelf: 'flex-start', marginLeft: -8 }} onClick={() => copyFrom(d)}>
              <Copy size={13} /> Use these times for all {r.work ? 'work' : 'off'} days
            </button>
          </div>
        )
      })}
    </div>
  )
}
