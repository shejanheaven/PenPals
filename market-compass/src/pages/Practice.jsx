import { Change, LiveDot, Stat, go, useLive } from '../components/ui.jsx'
import { fmtDate, fmtMoney, fmtPct, fmtPrice, fmtUnits } from '../lib/format.js'
import { displaySymbol } from '../lib/universe.js'
import { paperReset, paperSell, useStore } from '../lib/store.js'

const REASON = { stop: 'Stop-loss hit', target: 'Target hit', manual: 'You sold' }

export default function Practice() {
  const paper = useStore(s => s.paper)
  const positions = Object.values(paper.positions)
  const { quotes } = useLive(positions.map(p => p.symbol))

  const invested = positions.reduce((s, p) => s + p.units * (quotes[p.symbol]?.price ?? p.cost / p.units), 0)
  const value = paper.cash + invested
  const closed = paper.history.filter(h => h.side === 'sell')
  const wins = closed.filter(h => h.pnl > 0)
  const realized = closed.reduce((s, h) => s + h.pnl, 0)

  return (
    <div className="stack">
      <div className="page-head">
        <h1>Practice account</h1>
        <p>Trade with <strong>fake money at real, live prices</strong>. Follow the app's plans here first. If you can't make money in practice, real money won't go better. Stops and targets trigger automatically while the app is open.</p>
      </div>

      <div className="grid-auto">
        <Stat label="Account value" value={fmtMoney(value)} sub={<Change value={value / paper.start - 1} />} />
        <Stat label="Cash" value={fmtMoney(paper.cash)} />
        <Stat label="Realized profit" value={<span className={realized >= 0 ? 'good' : 'bad'}>{fmtMoney(realized, { sign: true })}</span>} sub={`${closed.length} closed trades`} />
        <Stat label="Win rate" value={closed.length ? fmtPct(wins.length / closed.length, { sign: false, digits: 0 }) : '—'} sub="40–55% is normal for a good system" />
      </div>

      <section className="card flush">
        <div className="card-head" style={{ padding: '16px 18px 0' }}><h2>Open positions</h2></div>
        {!positions.length ? (
          <p className="small text-2" style={{ padding: '0 18px 18px' }}>No open practice trades. Go to <a href="#/ideas">Ideas</a>, open a buy signal, and tap “Practice this trade”.</p>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>Asset</th><th className="num">Amount</th><th className="num">Bought at</th><th className="num">Now</th><th className="num">Profit</th><th className="num hide-sm">Stop / Target</th><th className="hide-sm">Sell by</th><th /></tr></thead>
              <tbody>
                {positions.map(p => {
                  const q = quotes[p.symbol]
                  const now = q?.price
                  const avg = p.cost / p.units
                  const pnl = now ? p.units * now - p.cost : null
                  const late = Date.now() > p.sellBy
                  return (
                    <tr key={p.symbol}>
                      <td><a className="sym" href={`#/asset/${p.symbol}`}>{displaySymbol(p.symbol)}</a></td>
                      <td className="num">{fmtUnits(p.units, p.kind)}</td>
                      <td className="num">{fmtPrice(avg)}</td>
                      <td className="num"><span className="row" style={{ justifyContent: 'flex-end', gap: 6 }}><LiveDot live={q?.live} />{fmtPrice(now)}</span></td>
                      <td className="num">{pnl == null ? '—' : <span className={pnl >= 0 ? 'good' : 'bad'}>{fmtMoney(pnl, { sign: true })}<div className="tiny">{fmtPct(pnl / p.cost)}</div></span>}</td>
                      <td className="num hide-sm"><span className="bad">{fmtPrice(p.stop)}</span> / <span className="good">{fmtPrice(p.target)}</span></td>
                      <td className="hide-sm">{late ? <span className="badge warn">Past due: sell</span> : fmtDate(p.sellBy, { month: 'short', day: 'numeric' })}</td>
                      <td><button className="btn small" disabled={!now} onClick={() => paperSell(p.symbol, now)}>Sell</button></td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="card flush">
        <div className="card-head" style={{ padding: '16px 18px 0' }}><h2>Trade history</h2></div>
        {!paper.history.length ? <p className="small text-2" style={{ padding: '0 18px 18px' }}>Your trades will show up here.</p> : (
          <div className="table-wrap">
            <table className="table small">
              <thead><tr><th>Date</th><th>Asset</th><th>Action</th><th className="num">Price</th><th className="num">Result</th><th className="hide-sm">Why</th></tr></thead>
              <tbody>
                {paper.history.map((h, i) => (
                  <tr key={i} className="click" onClick={() => go(`/asset/${h.symbol}`)}>
                    <td>{fmtDate(h.time, { month: 'short', day: 'numeric' })}</td>
                    <td className="sym">{displaySymbol(h.symbol)}</td>
                    <td>{h.side === 'buy' ? <span className="badge good">▲ Buy</span> : <span className="badge neutral">▼ Sell</span>}</td>
                    <td className="num">{fmtPrice(h.price)}</td>
                    <td className="num">{h.pnl != null ? <span className={h.pnl >= 0 ? 'good' : 'bad'}>{fmtMoney(h.pnl, { sign: true })} ({fmtPct(h.ret)})</span> : '—'}</td>
                    <td className="hide-sm">{h.reason ? REASON[h.reason] : ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <div className="row">
        <button className="btn" onClick={() => { if (confirm('Reset the practice account to $10,000 and clear history?')) paperReset() }}>Reset practice account</button>
      </div>
    </div>
  )
}
