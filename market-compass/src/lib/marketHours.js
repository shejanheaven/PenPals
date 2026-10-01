// US stock market hours (NYSE/Nasdaq): 9:30am-4:00pm Eastern, Mon-Fri,
// minus exchange holidays. Crypto trades 24/7.

const HOLIDAYS = new Set([
  '2026-01-01', '2026-01-19', '2026-02-16', '2026-04-03', '2026-05-25', '2026-06-19',
  '2026-07-03', '2026-09-07', '2026-11-26', '2026-12-25',
  '2027-01-01', '2027-01-18', '2027-02-15', '2027-03-26', '2027-05-31', '2027-06-18',
  '2027-07-05', '2027-09-06', '2027-11-25', '2027-12-24',
])
const EARLY_CLOSE = new Set(['2026-11-27', '2026-12-24', '2027-11-26'])

function easternParts(date) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false, weekday: 'short',
  }).formatToParts(date).map(p => [p.type, p.value]))
  return {
    ymd: `${parts.year}-${parts.month}-${parts.day}`,
    minutes: (parseInt(parts.hour, 10) % 24) * 60 + parseInt(parts.minute, 10),
    weekday: parts.weekday,
  }
}

const isTradingDay = p => !['Sat', 'Sun'].includes(p.weekday) && !HOLIDAYS.has(p.ymd)
const OPEN = 9 * 60 + 30

function fmtDuration(mins) {
  const h = Math.floor(mins / 60), m = Math.round(mins % 60)
  return h ? `${h}h ${m}m` : `${m}m`
}

export function stockMarketStatus(now = new Date()) {
  const p = easternParts(now)
  const close = EARLY_CLOSE.has(p.ymd) ? 13 * 60 : 16 * 60
  if (isTradingDay(p) && p.minutes >= OPEN && p.minutes < close) {
    let phase = 'open'
    if (p.minutes < OPEN + 15) phase = 'opening'
    else if (p.minutes >= close - 15) phase = 'closing'
    return { open: true, phase, label: `Open · closes in ${fmtDuration(close - p.minutes)}` }
  }
  // Find the next open.
  for (let d = 0; d < 7; d++) {
    const probe = new Date(now.getTime() + d * 86400000)
    const pp = easternParts(probe)
    if (!isTradingDay(pp)) continue
    if (d === 0 && p.minutes >= OPEN) continue
    const when = d === 0 ? 'today' : d === 1 ? 'tomorrow' : pp.weekday
    const pre = isTradingDay(p) && p.minutes >= 4 * 60 && p.minutes < OPEN
    return { open: false, phase: pre ? 'premarket' : 'closed', label: `Closed · opens ${when} 9:30am ET` }
  }
  return { open: false, phase: 'closed', label: 'Closed' }
}

export function marketStatusFor(kind, now) {
  return kind === 'crypto' ? { open: true, phase: 'open', label: 'Open 24/7' } : stockMarketStatus(now)
}

// When should a beginner place today's order?
export function whenToAct(kind, now = new Date()) {
  if (kind === 'crypto') {
    return 'Crypto trades 24/7. Place the order whenever you check the app, using a limit order at the entry price.'
  }
  const s = stockMarketStatus(now)
  if (s.phase === 'opening') return 'The market just opened, and the first 15 minutes are the wildest. Wait until 9:45am ET, then place a limit order.'
  if (s.phase === 'closing') return 'The market closes in a few minutes. Place a "good till canceled" limit order now, or wait for tomorrow after 9:45am ET.'
  if (s.open) return 'The market is open. Place a limit order at the entry price now. It only fills if the price comes to you.'
  if (s.phase === 'premarket') return 'Pre-market (thin trading, big price jumps). Wait for the open, then place your order after 9:45am ET.'
  return `The market is closed (${s.label.replace('Closed · ', '')}). You can queue a "good till canceled" limit order tonight, or place it after 9:45am ET on the next trading day.`
}
