import test from 'node:test'
import assert from 'node:assert/strict'
import { sma, ema, rsi, macd, bollinger, atr, roc, upDownVolume, vwap, rollingMax } from '../src/lib/indicators.js'

const close = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) < eps, `${a} != ${b}`)

test('sma', () => {
  assert.deepEqual(sma([1, 2, 3, 4, 5], 3), [null, null, 2, 3, 4])
})

test('ema seeds with the SMA and follows the price', () => {
  const e = ema([1, 2, 3, 4, 5, 6], 3)
  assert.equal(e[1], null)
  close(e[2], 2)
  close(e[3], 3)
  close(e[5], 5)
})

test('rsi is 100 on straight gains and 0 on straight losses', () => {
  const up = Array.from({ length: 30 }, (_, i) => 100 + i)
  const down = up.slice().reverse()
  assert.equal(rsi(up)[29], 100)
  close(rsi(down)[29], 0)
  assert.equal(rsi(up)[13], null)
})

test('rsi matches Wilder on a known series', () => {
  // Classic example from Wilder's book (via StockCharts): first RSI ~70.53
  const p = [44.34, 44.09, 44.15, 43.61, 44.33, 44.83, 45.10, 45.42, 45.84, 46.08, 45.89, 46.03, 45.61, 46.28, 46.28, 46.00, 46.03, 46.41, 46.22, 45.64]
  const r = rsi(p, 14)
  assert.ok(Math.abs(r[14] - 70.53) < 0.1, `got ${r[14]}`)
  assert.ok(Math.abs(r[15] - 66.32) < 0.1, `got ${r[15]}`)
})

test('macd histogram is positive in an accelerating uptrend', () => {
  const p = Array.from({ length: 80 }, (_, i) => 100 * 1.01 ** (i * i / 40))
  const m = macd(p)
  assert.ok(m.hist[79] > 0)
  assert.equal(m.hist[20], null)
})

test('bollinger %B is 0.5 for a flat series and >1 after a spike', () => {
  const flat = Array(25).fill(10)
  assert.equal(bollinger(flat).pctB[24], 0.5)
  const spike = [...Array(24).fill(10).map((v, i) => v + (i % 2) * 0.1), 12]
  assert.ok(bollinger(spike).pctB[24] > 1)
})

test('atr of constant-range bars equals the range', () => {
  const c = Array.from({ length: 30 }, () => ({ o: 10, h: 11, l: 9, c: 10, v: 1 }))
  close(atr(c)[29], 2)
})

test('roc and up/down volume', () => {
  close(roc([100, 110, 121], 2)[2], 0.21)
  const bars = Array.from({ length: 25 }, (_, i) => ({ c: 100 + i, v: 10 }))
  assert.ok(upDownVolume(bars)[24] > 10)
})

test('vwap', () => {
  close(vwap([{ h: 11, l: 9, c: 10, v: 1 }, { h: 21, l: 19, c: 20, v: 3 }]), 17.5)
})

test('rollingMax', () => {
  assert.deepEqual(rollingMax([1, 3, 2, 5, 4, 1, 0], 3), [null, null, 3, 5, 5, 5, 4])
})
