import { ActionBadge, Change, Sparkline, TopPickBadge, go } from './ui.jsx'
import { fmtPct, fmtPrice } from '../lib/format.js'
import { displaySymbol } from '../lib/universe.js'

export default function IdeaTable({ rows, quotes = {}, empty = 'Nothing here right now.', showReason = true }) {
  if (!rows.length) return <p className="muted small" style={{ padding: 16 }}>{empty}</p>
  return (
    <div className="table-wrap">
      <table className="table">
        <thead>
          <tr>
            <th>Asset</th>
            <th className="num">Price</th>
            <th className="num hide-sm">Today</th>
            <th>Signal</th>
            <th className="num hide-sm" title="How long the plan expects to hold">Hold</th>
            <th className="num hide-sm" title="Share of past trades on this asset that made money">Past wins</th>
            {showReason && <th className="hide-sm">Main reason</th>}
            <th className="hide-sm" aria-label="Last 60 days" />
          </tr>
        </thead>
        <tbody>
          {rows.map(r => {
            const q = quotes[r.symbol]
            const price = q?.price ?? r.price
            return (
              <tr key={r.symbol} className="click" onClick={() => go(`/asset/${r.symbol}`)} tabIndex={0} onKeyDown={e => e.key === 'Enter' && go(`/asset/${r.symbol}`)}>
                <td>
                  <div className="sym">{displaySymbol(r.symbol)}</div>
                  <div className="sym-name">{r.name}</div>
                </td>
                <td className="num">{fmtPrice(price)}</td>
                <td className="num hide-sm"><Change value={q?.changePct ?? r.changePct} /></td>
                <td>
                  <div className="row wrap" style={{ gap: 4 }}><ActionBadge action={r.action} /><TopPickBadge show={r.topPick} /></div>
                  <div className="tiny muted" style={{ marginTop: 3 }}>
                    strength {r.strength}%{r.strategy === 'pullback' ? ' · dip-buy' : ''}{r.proven ? ' · proven ✓' : ''}{r.earnings?.beforeExit ? ' · earnings soon' : ''}
                  </div>
                </td>
                <td className="num hide-sm">{r.action === 'hold' ? '—' : `~${r.holdDays}d`}</td>
                <td className="num hide-sm">{r.winRate != null ? `${fmtPct(r.winRate, { sign: false, digits: 0 })}` : '—'}<div className="tiny muted">{r.trades} trades</div></td>
                {showReason && <td className="hide-sm small text-2" style={{ maxWidth: 340 }}>{r.reason}</td>}
                <td className="hide-sm"><Sparkline data={r.spark} /></td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

export function rankTop(results) {
  return rankBuys(results).filter(r => r.topPick)
}

// Ranking: strongest signals first, nudged by whether the signal has a real
// track record (edge) on that asset.
export function rankBuys(results) {
  return results
    .filter(r => r.action === 'buy' || r.action === 'strong-buy')
    .sort((a, b) => (b.topPick - a.topPick) || (b.proven - a.proven) || ((b.score + 0.5 * (b.edge ?? 0)) - (a.score + 0.5 * (a.edge ?? 0))))
}

export function rankSells(results) {
  return results
    .filter(r => r.action === 'sell' || r.action === 'strong-sell')
    .sort((a, b) => a.score - b.score)
}
