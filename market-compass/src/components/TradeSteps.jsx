// Step-by-step instructions for placing *this* trade in a specific app, with
// the plan's real numbers filled in. App screens change often; the order
// types and ideas stay the same even when a button moves.

import { fmtDate, fmtMoney, fmtPrice, fmtUnits } from '../lib/format.js'
import { isBuy, isSell } from '../lib/signals.js'
import { displaySymbol } from '../lib/universe.js'
import { updateSettings, useStore } from '../lib/store.js'

export const BROKERS = {
  robinhood: { name: 'Robinhood', kinds: ['stock', 'crypto'] },
  coinbase: { name: 'Coinbase', kinds: ['crypto'] },
  kraken: { name: 'Kraken', kinds: ['crypto'] },
  fidelity: { name: 'Fidelity', kinds: ['stock'] },
  schwab: { name: 'Schwab', kinds: ['stock'] },
}

const B = ({ children }) => <span className="kbd">{children}</span>

export default function TradeSteps({ symbol, kind, action, plan, size, sellBy }) {
  const broker = useStore(s => s.settings.broker)
  const usable = Object.entries(BROKERS).filter(([, b]) => b.kinds.includes(kind))
  const current = BROKERS[broker]?.kinds.includes(kind) ? broker : usable[0][0]
  const ctx = {
    sym: kind === 'crypto' ? displaySymbol(symbol) : symbol,
    pair: symbol,
    kind,
    entry: fmtPrice(plan.entry),
    stop: fmtPrice(plan.stop),
    stopLimit: fmtPrice(plan.stop * 0.995),
    target: fmtPrice(plan.target),
    units: size ? fmtUnits(size.units, kind) : '—',
    wholeShares: size ? Math.floor(size.units) : 0,
    dollars: size ? fmtMoney(size.dollars) : '—',
    sellBy: sellBy ? fmtDate(sellBy, { weekday: 'short', month: 'short', day: 'numeric' }) : '',
  }
  const mode = isBuy(action) ? 'buy' : isSell(action) ? 'sell' : 'hold'
  const steps = (GUIDES[current]?.[mode] || (() => []))(ctx)

  return (
    <div>
      <div className="seg" role="tablist" aria-label="Choose your app" style={{ marginBottom: 14 }}>
        {usable.map(([id, b]) => (
          <button key={id} role="tab" aria-selected={id === current} className={id === current ? 'active' : ''} onClick={() => updateSettings({ broker: id })}>{b.name}</button>
        ))}
      </div>
      {kind === 'stock' && <p className="tiny muted" style={{ marginBottom: 10 }}>Coinbase and Kraken are mainly crypto apps. For stocks, use Robinhood, Fidelity or Schwab.</p>}
      <ol className="steps">{steps.map((s, i) => <li key={i}>{s}</li>)}</ol>
      <p className="tiny muted">App buttons move around between updates. If a label is different, look for the same idea: a <strong>limit</strong> order to buy, and a <strong>stop</strong> order to protect it.</p>
    </div>
  )
}

const holdNote = c => <>Put a reminder in your calendar for <strong>{c.sellBy}</strong>. If neither the stop nor the target has been hit by then, sell anyway and free up the money. Old trades that go nowhere tie up cash.</>

const GUIDES = {
  robinhood: {
    buy: c => [
      <>Open <strong>Robinhood</strong>, tap the search 🔍, type <B>{c.sym}</B> and open its page.</>,
      <>Tap <B>Trade</B> → <B>Buy</B>. Then tap the order-type menu (top of the screen) and pick <B>Limit order</B>.</>,
      <>Set the <strong>limit price</strong> to <strong>{c.entry}</strong>. You'll never pay more than this.</>,
      c.kind === 'crypto'
        ? <>Enter the amount: about <strong>{c.dollars}</strong> (≈ {c.units} {c.sym}).</>
        : <>Enter <strong>{c.wholeShares > 0 ? `${c.wholeShares} shares` : `${c.units} shares`}</strong> (≈ {c.dollars}). If it won't take a fraction with a limit order, round down to whole shares.</>,
      c.kind === 'crypto'
        ? <>Review and swipe up to submit. Crypto trades 24/7, so it can fill at any time.</>
        : <>Set <strong>Time in force</strong> to <B>Good for day</B> (or <B>Good till canceled</B> if the market is closed). Review, then swipe up to submit.</>,
      <>As soon as it fills, <strong>protect it</strong>: on the same page tap <B>Trade</B> → <B>Sell</B> → order types → <B>Stop loss order</B>. Stop price: <strong>{c.stop}</strong>. Quantity: everything you bought. Time in force: <B>Good till canceled</B>.</>,
      <>Create a price alert at <strong>{c.target}</strong> (bell icon 🔔 on the asset page). When it rings, cancel the stop order (Account → pending orders), then sell with a limit order near the current price. Robinhood usually won't hold a stop and a profit order on the same shares at once.</>,
      holdNote(c),
    ],
    sell: c => [
      <>Open <strong>Robinhood</strong> → <B>{c.sym}</B>. Only act if you own it. If you don't, the advice is simply <strong>don't buy now</strong>.</>,
      <>If you have a stop-loss order waiting, cancel it first (Account → pending orders → tap it → <B>Cancel order</B>). Shares stuck in an order can't be sold.</>,
      <>Tap <B>Trade</B> → <B>Sell</B> → <B>Limit order</B>. Set the price at or just below the current price, sell <strong>all</strong> (or half if you want to keep a small position), then swipe up.</>,
      <>Want to keep holding anyway? Then at least move your stop-loss up to <strong>{c.stop}</strong> so a further drop can't hurt much.</>,
    ],
    hold: c => [
      <>No clear edge right now, so <strong>don't open a new trade</strong>. Waiting is a position too.</>,
      <>If you already own {c.sym}: keep your stop-loss at about <strong>{c.stop}</strong> (Trade → Sell → Stop loss order, Good till canceled).</>,
      <>Set a price alert 🔔 near <strong>{c.target}</strong> and check back tomorrow. Signals update every day.</>,
    ],
  },
  coinbase: {
    buy: c => [
      <>Open <strong>Coinbase</strong> and switch to <B>Advanced</B> trading (the toggle at the top of the Trade screen, or coinbase.com/advanced-trade on the web). The simple Buy button can cost 1–4% in fees and spread; Advanced costs around 0.6% or less.</>,
      <>Choose the pair <B>{c.pair}</B>.</>,
      <>Select <B>Buy</B> → <B>Limit</B>. Limit price: <strong>{c.entry}</strong>. Amount: <strong>{c.units} {c.sym}</strong> (≈ {c.dollars}).</>,
      <>Tap <B>Review</B> → <B>Place order</B>. It shows under <B>Open orders</B> until it fills.</>,
      <>Once filled, add protection. If you see a <B>Bracket</B> / <B>TP/SL</B> option, set take-profit <strong>{c.target}</strong> and stop-loss <strong>{c.stop}</strong> in one go. Otherwise choose <B>Sell</B> → <B>Stop limit</B>: stop price <strong>{c.stop}</strong>, limit price <strong>{c.stopLimit}</strong> (a bit lower, so it fills in a fast drop), amount: all.</>,
      <>No bracket? Set a price alert at <strong>{c.target}</strong> (asset page → 🔔). When it hits, cancel the stop and sell with a limit order.</>,
      holdNote(c),
    ],
    sell: c => [
      <>Only act if you own {c.sym}. If you don't, <strong>don't buy now</strong>.</>,
      <>Coinbase → <B>Advanced</B> → <B>{c.pair}</B>. Cancel any open stop order first (<B>Open orders</B> → cancel).</>,
      <>Choose <B>Sell</B> → <B>Limit</B> at (or just below) the current price, amount: all (or half), then place the order. A limit order costs less in fees than a market order.</>,
      <>Keeping some? Set a stop limit at <strong>{c.stop}</strong> to cap the downside.</>,
    ],
    hold: c => [
      <>No clear edge, so <strong>don't start a new trade</strong> in {c.sym} today.</>,
      <>Already own it? Keep a stop limit near <strong>{c.stop}</strong> (Advanced → Sell → Stop limit).</>,
      <>Set a price alert, and check back tomorrow.</>,
    ],
  },
  kraken: {
    buy: c => [
      <>Use <strong>Kraken Pro</strong> (the Pro app, or pro.kraken.com), not the simple Kraken app. Pro fees are much lower (around 0.25–0.4%).</>,
      <>Search <B>{c.pair.replace('-', '/')}</B> and open the trade form. Pick <B>Buy</B> → <B>Limit</B>.</>,
      <>Limit price: <strong>{c.entry}</strong>. Quantity: <strong>{c.units} {c.sym}</strong> (≈ {c.dollars}).</>,
      <>Turn on <B>Take profit / Stop loss</B> (Kraken calls this a <em>conditional close</em>). Take profit: <strong>{c.target}</strong>. Stop loss: <strong>{c.stop}</strong>. Kraken places both automatically once your buy fills.</>,
      <>Submit, then check the <B>Orders</B> tab to see it waiting or filled.</>,
      holdNote(c),
    ],
    sell: c => [
      <>Only act if you own {c.sym}. If you don't, <strong>don't buy now</strong>.</>,
      <>Kraken Pro → <B>Orders</B>: cancel any open stop or take-profit orders for {c.sym}.</>,
      <>Trade form → <B>Sell</B> → <B>Limit</B> at the current price, quantity: all (or half), then submit.</>,
      <>Keeping some? Add a <B>Stop loss</B> order at <strong>{c.stop}</strong>.</>,
    ],
    hold: c => [
      <>No clear edge, so <strong>no new trade</strong> in {c.sym} today.</>,
      <>Already own it? Make sure a stop loss sits near <strong>{c.stop}</strong>.</>,
      <>Check back tomorrow; the signal updates daily.</>,
    ],
  },
  fidelity: {
    buy: c => [
      <>Open <strong>Fidelity</strong> → search <B>{c.sym}</B> → <B>Trade</B> → <B>Buy</B>.</>,
      <>Order type <B>Limit</B>, limit price <strong>{c.entry}</strong>, quantity <strong>{c.wholeShares > 0 ? c.wholeShares : c.units} shares</strong> (≈ {c.dollars}). Time in force <B>Day</B> (or <B>GTC</B> when the market is closed). Then <B>Preview</B> → <B>Place order</B>.</>,
      <>After it fills, set <strong>both</strong> exits at once on fidelity.com: <B>Trade</B> → <B>Conditional</B> → <B>One-Cancels-the-Other (OCO)</B>. Order 1: Sell <B>Limit</B> at <strong>{c.target}</strong>. Order 2: Sell <B>Stop loss</B> at <strong>{c.stop}</strong>. Both GTC. When one fills, the other cancels itself.</>,
      holdNote(c),
    ],
    sell: c => [
      <>Only act if you own {c.sym}. If you don't, <strong>don't buy now</strong>.</>,
      <>Cancel any open conditional orders for {c.sym} (<B>Orders</B> → cancel).</>,
      <><B>Trade</B> → <B>Sell</B> → <B>Limit</B> at about the current price, all shares → Preview → Place.</>,
    ],
    hold: c => [
      <>No clear edge, so <strong>no new trade</strong> today.</>,
      <>Already own it? Keep an OCO (target <strong>{c.target}</strong> / stop <strong>{c.stop}</strong>) in place.</>,
    ],
  },
  schwab: {
    buy: c => [
      <>Open the <strong>thinkorswim</strong> app (Schwab's free trading app, with the best free charts and practice mode).</>,
      <>Search <B>{c.sym}</B> → <B>Trade</B> → <B>Buy</B> → order type <B>Limit</B>, price <strong>{c.entry}</strong>, quantity <strong>{c.wholeShares > 0 ? c.wholeShares : c.units}</strong> shares.</>,
      <>Change the order to <B>with OCO bracket</B> (also called <em>1st triggers OCO</em>). Profit target: <strong>{c.target}</strong>. Stop: <strong>{c.stop}</strong>. Set both to GTC.</>,
      <>Confirm and send. Your target and stop go live automatically once the buy fills.</>,
      holdNote(c),
    ],
    sell: c => [
      <>Only act if you own {c.sym}. If you don't, <strong>don't buy now</strong>.</>,
      <>Cancel working orders for {c.sym}, then <B>Trade</B> → <B>Sell</B> → <B>Limit</B> at about the current price.</>,
    ],
    hold: c => [
      <>No clear edge, so <strong>no new trade</strong> today. If you own it, keep a stop near <strong>{c.stop}</strong>.</>,
    ],
  },
}
