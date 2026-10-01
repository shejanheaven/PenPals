import { addDays, addMonths, daysInMonth, fromMinutes, startOfWeek, toKey, toMinutes, todayKey, weekday } from './dates.js'

// Turns free text like "Run tomorrow 7am for 45 min every weekday #health"
// into a schedule item. Recognised phrases are removed; what is left becomes
// the title. Used by Quick Add and by everything captured from integrations.

const WEEKDAYS = {
  sunday: 0, sun: 0,
  monday: 1, mon: 1,
  tuesday: 2, tues: 2, tue: 2,
  wednesday: 3, wed: 3,
  thursday: 4, thurs: 4, thur: 4, thu: 4,
  friday: 5, fri: 5,
  saturday: 6, sat: 6,
}
const WD = '(sunday|monday|tuesday|wednesday|thursday|friday|saturday|sun|mon|tues|tue|wed|thurs|thur|thu|fri|sat)'
const WD_FULL = new Set(['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'])

const MONTHS = {
  january: 0, jan: 0, february: 1, feb: 1, march: 2, mar: 2, april: 3, apr: 3, may: 4,
  june: 5, jun: 5, july: 6, jul: 6, august: 7, aug: 7, september: 8, sept: 8, sep: 8,
  october: 9, oct: 9, november: 10, nov: 10, december: 11, dec: 11,
}
const MON = '(january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|jun|jul|aug|sept|sep|oct|nov|dec)'

const NUMBER_WORDS = { a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, other: 2 }
const PART_OF_DAY = { morning: '09:00', afternoon: '14:00', evening: '19:00', night: '20:00' }
const POD = '(?:\\s+(morning|afternoon|evening|night))?'

const num = (v) => (v == null ? null : NUMBER_WORDS[v.toLowerCase()] ?? Number(v))

// Hour without am/pm: 1–6 reads as afternoon ("at 5" = 5pm), 7–11 as morning.
function guessHour(h) {
  if (h >= 13 || h === 0) return h
  if (h === 12) return 12
  return h <= 6 ? h + 12 : h
}

function applyMeridiem(h, mer) {
  if (!mer) return null
  const pm = mer[0].toLowerCase() === 'p'
  if (h === 12) return pm ? 12 : 0
  return pm ? h + 12 : h
}

const validTime = (h, m) => h >= 0 && h <= 23 && m >= 0 && m <= 59

function makeDate(y, m0, d) {
  if (m0 < 0 || m0 > 11 || d < 1 || d > daysInMonth(y, m0)) return null
  return toKey(new Date(y, m0, d))
}

// A date without a year means the next time that date comes around.
function upcoming(m0, d, today, year) {
  if (year != null) return makeDate(year < 100 ? 2000 + year : year, m0, d)
  const y = Number(today.slice(0, 4))
  const key = makeDate(y, m0, d)
  if (key && key >= today) return key
  return makeDate(y + 1, m0, d)
}

function nextWeekday(today, wd, { strictlyAfter = false } = {}) {
  let delta = (wd - weekday(today) + 7) % 7
  if (strictlyAfter && delta === 0) delta = 7
  return addDays(today, delta)
}

export function parseQuick(input, opts = {}) {
  const today = opts.today ?? todayKey()
  const dayFirst = !!opts.dayFirst
  const areas = opts.areas ?? []
  const defaultDuration = opts.defaultDuration ?? 60

  let s = ` ${input ?? ''} `
  const out = { date: null, start: null, end: null, repeat: null, area: null }
  let duration = null
  let impliedTime = null

  // Find the first match the handler accepts, remove it from the text.
  function take(source, handler) {
    const re = new RegExp(source, 'gi')
    for (const m of s.matchAll(re)) {
      if (handler(m) === false) continue
      s = `${s.slice(0, m.index)} ${s.slice(m.index + m[0].length)}`
      return true
    }
    return false
  }

  take('^\\s*(?:remind me to|remind me|todo:|to do:|task:)\\s+', () => {})

  // ── Area tag ──────────────────────────────────────────────────────────────
  take('(^|\\s)#([\\p{L}\\w-]+)', (m) => {
    const tag = m[2].toLowerCase()
    const area = areas.find((a) => a.id === tag || a.label.toLowerCase() === tag || a.aliases?.includes(tag))
    if (!area) return false
    out.area = area.id
  })

  // ── Repetition ────────────────────────────────────────────────────────────
  const setRepeat = (r) => {
    if (!out.repeat) out.repeat = r
  }
  take('\\b(?:every|each)\\s+(other|\\d+)\\s+(day|week|month|year)s?\\b', (m) => {
    const freq = { day: 'daily', week: 'weekly', month: 'monthly', year: 'yearly' }[m[2].toLowerCase()]
    setRepeat({ freq, interval: num(m[1]) })
  })
  take('\\b(?:every\\s*day|everyday|daily|each\\s+day)\\b', () => setRepeat({ freq: 'daily' }))
  take('\\b(?:(?:every|each)\\s+weekday|(?:on\\s+)?weekdays)\\b', () => setRepeat({ freq: 'weekly', days: [1, 2, 3, 4, 5] }))
  take('\\b(?:(?:every|each)\\s+weekend|(?:on\\s+)?weekends)\\b', () => setRepeat({ freq: 'weekly', days: [0, 6] }))
  take(`\\b(?:every|each)\\s+(${WD}(?:\\s*(?:,|and|&|/)\\s*(?:and\\s+)?${WD})*)\\b${POD}`, (m) => {
    const days = [...m[1].toLowerCase().matchAll(new RegExp(WD, 'g'))].map((d) => WEEKDAYS[d[1]])
    setRepeat({ freq: 'weekly', days: [...new Set(days)].sort() })
    if (m[m.length - 1]) impliedTime = PART_OF_DAY[m[m.length - 1].toLowerCase()]
  })
  // A run of two or more days, "Mon Wed Fri" or "tue & thu", means every week on those days.
  const SEP = '(?:\\s*(?:,|&|/)\\s*(?:and\\s+)?|\\s+and\\s+|\\s+)'
  take(`\\b(?:on\\s+)?(${WD}(?:${SEP}${WD})+)\\b`, (m) => {
    const days = [...m[1].toLowerCase().matchAll(new RegExp(`\\b${WD}\\b`, 'g'))].map((d) => WEEKDAYS[d[1]])
    if (days.length < 2) return false
    setRepeat({ freq: 'weekly', days: [...new Set(days)].sort() })
  })
  take('\\b(?:on\\s+)?(sundays|mondays|tuesdays|wednesdays|thursdays|fridays|saturdays)\\b', (m) => {
    setRepeat({ freq: 'weekly', days: [WEEKDAYS[m[1].toLowerCase().slice(0, -1)]] })
  })
  take('\\b(?:(?:every|each)\\s+week|weekly)\\b', () => setRepeat({ freq: 'weekly' }))
  take('\\b(?:(?:every|each)\\s+month|monthly)\\b', () => setRepeat({ freq: 'monthly' }))
  take('\\b(?:(?:every|each)\\s+year|yearly|annually)\\b', () => setRepeat({ freq: 'yearly' }))

  // ── Dates ─────────────────────────────────────────────────────────────────
  const setDate = (key) => {
    if (!key) return false
    out.date = key
  }
  const dateFound = () => out.date != null

  take('\\b(\\d{4})-(\\d{1,2})-(\\d{1,2})\\b', (m) => setDate(makeDate(+m[1], +m[2] - 1, +m[3])))
  if (!dateFound())
    take(`\\b(?:on\\s+)?${MON}\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)?(?:,?\\s+(\\d{4}))?\\b`, (m) =>
      setDate(upcoming(MONTHS[m[1].toLowerCase()], +m[2], today, m[3] ? +m[3] : null)),
    )
  if (!dateFound())
    take(`\\b(?:on\\s+)?(?:the\\s+)?(\\d{1,2})(?:st|nd|rd|th)?\\s+(?:of\\s+)?${MON}\\b\\.?(?:,?\\s+(\\d{4}))?`, (m) =>
      setDate(upcoming(MONTHS[m[2].toLowerCase()], +m[1], today, m[3] ? +m[3] : null)),
    )
  if (!dateFound())
    take('\\b(?:on\\s+)?(\\d{1,2})/(\\d{1,2})(?:/(\\d{4}|\\d{2}))?\\b', (m) => {
      const [a, b] = [+m[1], +m[2]]
      const [month, day] = dayFirst ? [b, a] : [a, b]
      return setDate(upcoming(month - 1, day, today, m[3] ? +m[3] : null))
    })
  if (!dateFound())
    take(`\\bday\\s+after\\s+tomorrow\\b${POD}`, (m) => {
      setDate(addDays(today, 2))
      if (m[1]) impliedTime = PART_OF_DAY[m[1].toLowerCase()]
    })
  if (!dateFound())
    take(`\\b(?:tomorrow|tmrw|tmr|tmw|tomorow)\\b${POD}`, (m) => {
      setDate(addDays(today, 1))
      if (m[1]) impliedTime = PART_OF_DAY[m[1].toLowerCase()]
    })
  if (!dateFound())
    take(`\\btoday\\b${POD}`, (m) => {
      setDate(today)
      if (m[1]) impliedTime = PART_OF_DAY[m[1].toLowerCase()]
    })
  if (!dateFound())
    take('\\btonight\\b', () => {
      setDate(today)
      impliedTime = PART_OF_DAY.night
    })
  if (!dateFound())
    take('\\bin\\s+(\\d+|a|an|one|two|three|four|five|six|seven|eight|nine|ten)\\s+(day|week|month)s?\\b', (m) => {
      const n = num(m[1])
      const unit = m[2].toLowerCase()
      setDate(unit === 'day' ? addDays(today, n) : unit === 'week' ? addDays(today, n * 7) : addMonths(today, n))
    })
  if (!dateFound()) take('\\bnext\\s+week\\b', () => setDate(addDays(startOfWeek(today, 1), 7)))
  if (!dateFound())
    take('\\bnext\\s+month\\b', () => {
      const d = addMonths(today, 1)
      setDate(`${d.slice(0, 7)}-01`)
    })
  if (!dateFound())
    take('\\b(?:this\\s+)?weekend\\b', () => setDate(weekday(today) === 0 ? today : nextWeekday(today, 6)))
  if (!dateFound())
    take(`\\b(?:(next|this|on|by)\\s+)?${WD}\\b${POD}`, (m) => {
      const prefix = m[1]?.toLowerCase()
      const word = m[2].toLowerCase()
      // Short forms ("sun", "sat", "wed") are common words, so only trust them
      // with a prefix or at the very end of the text.
      const atEnd = s.slice(m.index + m[0].length).trim() === ''
      if (!WD_FULL.has(word) && !prefix && !atEnd) return false
      const wd = WEEKDAYS[word]
      if (opts.recurring && !out.repeat && prefix !== 'next') out.repeat = { freq: 'weekly', days: [wd] }
      if (prefix === 'next') setDate(addDays(startOfWeek(today, 1), 7 + ((wd + 6) % 7)))
      else setDate(nextWeekday(today, wd))
      if (m[3]) impliedTime = PART_OF_DAY[m[3].toLowerCase()]
    })
  if (!dateFound())
    take('\\b(?:on\\s+)?the\\s+(\\d{1,2})(?:st|nd|rd|th)\\b', (m) => {
      const d = +m[1]
      const y = +today.slice(0, 4)
      const m0 = +today.slice(5, 7) - 1
      let key = makeDate(y, m0, d)
      if (!key || key < today) key = makeDate(m0 === 11 ? y + 1 : y, (m0 + 1) % 12, d)
      return setDate(key)
    })

  // ── Duration ──────────────────────────────────────────────────────────────
  take('\\bfor\\s+(\\d+)\\s*h(?:ours?|rs?)?\\s*(?:and\\s+)?(\\d+)\\s*m(?:in(?:ute)?s?)?\\b', (m) => {
    duration = +m[1] * 60 + +m[2]
  })
  if (duration == null)
    take('\\bfor\\s+half\\s+an?\\s+hour\\b', () => {
      duration = 30
    })
  if (duration == null)
    take('\\bfor\\s+(\\d+(?:\\.\\d+)?|an?|one|two|three|four|five|six)\\s*(h|hr|hrs|hour|hours|m|min|mins|minute|minutes)\\b', (m) => {
      const n = num(m[1])
      duration = Math.round(m[2].toLowerCase().startsWith('h') ? n * 60 : n)
    })

  // ── Times ─────────────────────────────────────────────────────────────────
  const MER = "(?:\\s*(am|pm|a\\.m\\.|p\\.m\\.)|(a|p))"
  take(
    `(?:(?<![\\w@])(from|at|@)\\s*)?(?<![\\w:/.-])(\\d{1,2})(?::(\\d{2}))?${MER}?\\s*(?:-|–|—|to|until|till)\\s*(\\d{1,2})(?::(\\d{2}))?${MER}?(?![\\w:])`,
    (m) => {
      const [, prefix, h1s, m1s, mer1a, mer1b, h2s, m2s, mer2a, mer2b] = m
      const mer1 = mer1a || mer1b
      const mer2 = mer2a || mer2b
      if (!prefix && !mer1 && !mer2 && !m1s && !m2s) return false
      const [h1, h2] = [+h1s, +h2s]
      const [min1, min2] = [+(m1s ?? 0), +(m2s ?? 0)]
      if (h1 > 23 || h2 > 24 || min1 > 59 || min2 > 59) return false
      if ((mer1 && h1 > 12) || (mer2 && h2 > 12)) return false
      let a = applyMeridiem(h1, mer1)
      let b = applyMeridiem(h2, mer2)
      if (a == null && b != null) {
        // "2-4pm" → 14:00–16:00, "11-1pm" → 11:00–13:00, "9-5pm" → 9:00–17:00
        const same = applyMeridiem(h1, mer2)
        a = same * 60 + min1 < b * 60 + min2 ? same : (same + 12) % 24
      } else if (a != null && b == null) {
        // "2pm-4" → 14:00–16:00, "11am-1" → 11:00–13:00
        const same = applyMeridiem(h2, mer1)
        b = same * 60 + min2 > a * 60 + min1 ? same : same + 12
      } else if (a == null) {
        a = guessHour(h1)
        b = guessHour(h2)
        if (b * 60 + min2 <= a * 60 + min1) b += 12
      }
      const startMins = a * 60 + min1
      const endMins = b * 60 + min2
      if (endMins <= startMins) return false
      out.start = fromMinutes(startMins)
      out.end = fromMinutes(Math.min(endMins, 24 * 60 - 1))
    },
  )
  if (!out.start)
    take(`(?:(?<![\\w@])(?:at|@)\\s*)?(?<![\\w:/.-])(\\d{1,2})(?::(\\d{2}))?${MER}(?![\\w])`, (m) => {
      const hour = +m[1]
      const min = +(m[2] ?? 0)
      const h = applyMeridiem(hour, m[3] || m[4])
      if (hour > 12 || hour === 0 || !validTime(h, min)) return false
      out.start = fromMinutes(h * 60 + min)
    })
  if (!out.start)
    take('(?<![\\w@])(?:at|@)\\s*(\\d{1,2})(?::(\\d{2}))?(?![\\w:])', (m) => {
      const h = guessHour(+m[1])
      const min = +(m[2] ?? 0)
      if (+m[1] > 23 || !validTime(h, min)) return false
      out.start = fromMinutes(h * 60 + min)
    })
  if (!out.start)
    take('(?<![\\w:/.-])([01]?\\d|2[0-3]):([0-5]\\d)(?![\\w:])', (m) => {
      out.start = fromMinutes(guessHour(+m[1]) * 60 + +m[2])
    })
  if (!out.start) take('\\b(?:at\\s+)?(?:noon|midday)\\b', () => void (out.start = '12:00'))
  if (!out.start) take('\\b(?:at\\s+)?midnight\\b', () => void (out.start = '00:00'))
  if (!out.start)
    take('\\b(?:in\\s+the|this)\\s+(morning|afternoon|evening)\\b', (m) => {
      impliedTime = PART_OF_DAY[m[1].toLowerCase()]
    })

  if (!out.start && impliedTime) out.start = impliedTime
  if (out.start && !out.end) {
    const end = toMinutes(out.start) + (duration ?? defaultDuration)
    out.end = fromMinutes(Math.min(end, 24 * 60 - 1))
  }

  const recognized = !!(out.date || out.start || out.repeat || out.area)
  out.hasDate = out.date != null
  if (!out.date) out.date = today

  out.title = cleanTitle(s)
  out.recognized = recognized
  return out
}

function cleanTitle(s) {
  let t = s.replace(/\s+/g, ' ').trim()
  // Drop connector words stranded by removed phrases ("Lunch with Sam at" → "Lunch with Sam").
  const dangling = /(?:^|\s)(?:at|on|from|for|by|to|in|starting|every|each|this|next|the|,|-|–)$/i
  for (let i = 0; i < 3 && dangling.test(t); i++) t = t.replace(dangling, '').trim()
  t = t.replace(/^(?:on|at|from|for|by|,|-|–)\s+/i, '').trim()
  t = t.replace(/[\s,;:–-]+$/, '').trim()
  if (t) t = t[0].toUpperCase() + t.slice(1)
  return t
}
