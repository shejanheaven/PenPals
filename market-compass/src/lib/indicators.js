// Technical indicators. Every function is causal: the value at index i only
// uses data up to and including i, so the same arrays are safe to backtest on.
// Arrays keep the input length; positions without enough history are null.

export function sma(values, period) {
  const out = new Array(values.length).fill(null)
  let sum = 0
  for (let i = 0; i < values.length; i++) {
    sum += values[i]
    if (i >= period) sum -= values[i - period]
    if (i >= period - 1) out[i] = sum / period
  }
  return out
}

export function ema(values, period) {
  const out = new Array(values.length).fill(null)
  if (values.length < period) return out
  const k = 2 / (period + 1)
  let prev = 0
  for (let i = 0; i < period; i++) prev += values[i]
  prev /= period
  out[period - 1] = prev
  for (let i = period; i < values.length; i++) {
    prev = values[i] * k + prev * (1 - k)
    out[i] = prev
  }
  return out
}

// Wilder's RSI (0-100). Above 70 = "overbought", below 30 = "oversold".
export function rsi(closes, period = 14) {
  const out = new Array(closes.length).fill(null)
  if (closes.length <= period) return out
  let gain = 0, loss = 0
  for (let i = 1; i <= period; i++) {
    const d = closes[i] - closes[i - 1]
    if (d > 0) gain += d; else loss -= d
  }
  gain /= period; loss /= period
  out[period] = loss === 0 ? 100 : 100 - 100 / (1 + gain / loss)
  for (let i = period + 1; i < closes.length; i++) {
    const d = closes[i] - closes[i - 1]
    gain = (gain * (period - 1) + Math.max(d, 0)) / period
    loss = (loss * (period - 1) + Math.max(-d, 0)) / period
    out[i] = loss === 0 ? 100 : 100 - 100 / (1 + gain / loss)
  }
  return out
}

export function macd(closes, fast = 12, slow = 26, signalPeriod = 9) {
  const fastE = ema(closes, fast)
  const slowE = ema(closes, slow)
  const line = closes.map((_, i) => (fastE[i] == null || slowE[i] == null ? null : fastE[i] - slowE[i]))
  const start = line.findIndex(v => v != null)
  const signal = new Array(closes.length).fill(null)
  if (start >= 0) {
    const sig = ema(line.slice(start), signalPeriod)
    sig.forEach((v, j) => { signal[start + j] = v })
  }
  const hist = line.map((v, i) => (v == null || signal[i] == null ? null : v - signal[i]))
  return { line, signal, hist }
}

export function bollinger(closes, period = 20, mult = 2) {
  const mid = sma(closes, period)
  const upper = new Array(closes.length).fill(null)
  const lower = new Array(closes.length).fill(null)
  const pctB = new Array(closes.length).fill(null)
  for (let i = period - 1; i < closes.length; i++) {
    let v = 0
    for (let j = i - period + 1; j <= i; j++) v += (closes[j] - mid[i]) ** 2
    const sd = Math.sqrt(v / period)
    upper[i] = mid[i] + mult * sd
    lower[i] = mid[i] - mult * sd
    pctB[i] = sd === 0 ? 0.5 : (closes[i] - lower[i]) / (upper[i] - lower[i])
  }
  return { mid, upper, lower, pctB }
}

// Average True Range: the typical daily move in price units (Wilder smoothing).
export function atr(candles, period = 14) {
  const out = new Array(candles.length).fill(null)
  if (candles.length <= period) return out
  const tr = candles.map((c, i) => i === 0
    ? c.h - c.l
    : Math.max(c.h - c.l, Math.abs(c.h - candles[i - 1].c), Math.abs(c.l - candles[i - 1].c)))
  let prev = 0
  for (let i = 1; i <= period; i++) prev += tr[i]
  prev /= period
  out[period] = prev
  for (let i = period + 1; i < candles.length; i++) {
    prev = (prev * (period - 1) + tr[i]) / period
    out[i] = prev
  }
  return out
}

// Percent change over n bars, as a fraction (0.05 = +5%).
export function roc(closes, n) {
  return closes.map((c, i) => (i < n || !closes[i - n] ? null : c / closes[i - n] - 1))
}

// Rolling standard deviation of daily log returns.
export function volatility(closes, n = 20) {
  const out = new Array(closes.length).fill(null)
  const r = closes.map((c, i) => (i === 0 ? 0 : Math.log(c / closes[i - 1])))
  for (let i = n; i < closes.length; i++) {
    let m = 0
    for (let j = i - n + 1; j <= i; j++) m += r[j]
    m /= n
    let v = 0
    for (let j = i - n + 1; j <= i; j++) v += (r[j] - m) ** 2
    out[i] = Math.sqrt(v / (n - 1))
  }
  return out
}

// Ratio of volume on up days to volume on down days over the last n bars.
// Above 1 means buyers are more active than sellers.
export function upDownVolume(candles, n = 20) {
  const out = new Array(candles.length).fill(null)
  for (let i = n; i < candles.length; i++) {
    let up = 0, down = 0
    for (let j = i - n + 1; j <= i; j++) {
      if (candles[j].c > candles[j - 1].c) up += candles[j].v
      else if (candles[j].c < candles[j - 1].c) down += candles[j].v
    }
    out[i] = up + down === 0 ? null : (up + 1) / (down + 1)
  }
  return out
}

// Volume-weighted average price of a set of intraday bars.
export function vwap(candles) {
  let pv = 0, vol = 0
  for (const c of candles) {
    const typical = (c.h + c.l + c.c) / 3
    pv += typical * c.v
    vol += c.v
  }
  return vol ? pv / vol : null
}

// Highest value over the last n bars (including today).
export function rollingMax(values, n) {
  const out = new Array(values.length).fill(null)
  const dq = [] // indices with decreasing values
  for (let i = 0; i < values.length; i++) {
    while (dq.length && values[dq[dq.length - 1]] <= values[i]) dq.pop()
    dq.push(i)
    if (dq[0] <= i - n) dq.shift()
    if (i >= n - 1) out[i] = values[dq[0]]
  }
  return out
}
