import test from 'node:test'
import assert from 'node:assert/strict'
import { stockMarketStatus, marketStatusFor } from '../src/lib/marketHours.js'

test('open on a normal weekday afternoon (ET)', () => {
  const s = stockMarketStatus(new Date('2026-09-30T17:00:00Z')) // 1pm EDT Wed
  assert.equal(s.open, true)
  assert.match(s.label, /closes in 3h 0m/)
})

test('closed on weekends and holidays, with next open', () => {
  const sat = stockMarketStatus(new Date('2026-10-03T15:00:00Z'))
  assert.equal(sat.open, false)
  assert.match(sat.label, /opens Mon/)
  const thanksgiving = stockMarketStatus(new Date('2026-11-26T16:00:00Z'))
  assert.equal(thanksgiving.open, false)
})

test('opening and pre-market phases', () => {
  assert.equal(stockMarketStatus(new Date('2026-09-30T13:35:00Z')).phase, 'opening') // 9:35 EDT
  assert.equal(stockMarketStatus(new Date('2026-09-30T12:00:00Z')).phase, 'premarket') // 8:00 EDT
  assert.match(stockMarketStatus(new Date('2026-09-30T12:00:00Z')).label, /opens today/)
})

test('crypto is always open', () => {
  assert.equal(marketStatusFor('crypto').open, true)
})
