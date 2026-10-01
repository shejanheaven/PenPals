import { useEffect, useMemo, useState } from 'react'
import PriceChart, { RsiChart } from '../components/PriceChart.jsx'
import NewsList from '../components/NewsList.jsx'
import TradeSteps from '../components/TradeSteps.jsx'
import { ActionBadge, Change, ConfidenceBadge, ErrorBox, LiveDot, Loading, MarketPill, ScoreMeter, Stat, TopPickBadge, go, useLive } from '../components/ui.jsx'
import { getCalibration, runAnalysis, useAsset, useScan } from '../lib/analysis.js'
import { fetchBriefing, fetchHistory } from '../lib/data.js'
import { addTradingDays, fmtDate, fmtMoney, fmtPct, fmtPrice, fmtUnits, timeAgo } from '../lib/format.js'
import { vwap } from '../lib/indicators.js'
import { whenToAct } from '../lib/marketHours.js'
import { isBuy, isSell, positionSize } from '../lib/signals.js'
import { displaySymbol } from '../lib/universe.js'
import { paperBuy, paperSell, toggleWatch, updateSettings, useStore } from '../lib/store.js'

export default function Asset({ symbol }) {
  const { loading, error, asset } = useAsset(symbol)
  const { quotes, status } = useLive([symbol])
  const { calibration } = useScan({ auto: false }) // re-score when self-tuning updates
  const q = quotes[symbol]
  const live = q?.price
  // Re-run the analysis when the live price moves ~0.3%, not on every tick.
  const bucket = live && asset ? Math.round(Math.log(live / asset.history.candles.at(-1).c) / 0.003) : 0
  const analysis = useMemo(
    () => (asset ? runAnalysis(asset, live && bucket ? live : undefined) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [asset, bucket, calibration],
  )

  if (loading && !asset) return <div className="page-head"><Loading height={420} /></div>
  if (error) return <div className="page-head"><ErrorBox error={error} onRetry={() => location.reload()} /></div>
  if (!analysis) return <div className="page-head"><ErrorBox error="Not enough price history to analyze this asset yet (needs 60+ days)." /></div>

  return <AssetView asset={asset} analysis={analysis} quote={q} streaming={status} />
}

function AssetView({ asset, analysis, quote, streaming }) {
  const { symbol, kind, name } = asset
  const settings = useStore(s => s.settings)
  const watching = useStore(s => s.watchlist.includes(symbol))
  const owned = useStore(s => s.paper.positions[symbol])
  const price = quote?.price ?? analysis.price
  const prev = quote?.previousClose ?? analysis.candles.at(-2)?.c
  const changePct = prev ? price / prev - 1 : null
  const { plan, action, forecast, backtest: bt } = analysis
  const riskPct = settings.riskPct * analysis.riskScale
  const size = positionSize({ account: settings.account, riskPct, entry: plan.entry, stop: plan.stop })
  const setup = analysis.strategy ? analysis.strategies[analysis.strategy] : null
  const sellBy = addTradingDays(new Date(), plan.holdDays, kind)
  const [practice, setPractice] = useState(false)
  const isLive = quote?.live && quote.streamedAt && Date.now() - quote.streamedAt < 60000

  return (
    <div className="stack" style={{ paddingTop: 18 }}>
      {/* Header */}
      <div className="spread" style={{ flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <div>
          <div className="row wrap" style={{ gap: 8 }}>
            <button className="btn small" onClick={() => history.length > 1 ? history.back() : go('/')}>← Back</button>
            <span className="badge neutral">{kind === 'crypto' ? 'Crypto' : 'Stock / ETF'}</span>
            <MarketPill kind={kind} />
          </div>
          <h1 style={{ marginTop: 10 }}>{name} <span className="muted" style={{ fontWeight: 500 }}>{displaySymbol(symbol)}</span></h1>
          {asset.info.note && <p className="small text-2">{asset.info.note}</p>}
        </div>
        <div className="asset-price">
          <div className="hero-price">{fmtPrice(price)}</div>
          <div className="row wrap" style={{ gap: 8 }}>
            <Change value={changePct} /> <span className="small muted">{kind === 'crypto' ? '24h' : 'today'}</span>
            <LiveDot live={isLive} />
            <span className="tiny muted">{isLive ? quote.source : `${asset.history.source}${quote?.time ? ` · ${timeAgo(quote.time)}` : ''}`}</span>
          </div>
          <button className="btn small" style={{ marginTop: 8 }} onClick={() => toggleWatch(symbol)}>{watching ? '★ On watchlist' : '☆ Add to watchlist'}</button>
        </div>
      </div>
      {asset.history.demo && <div className="banner warn">⚠️ <span><strong>Demo data:</strong> these prices are made up. Turn off demo mode in Settings to see real prices.</span></div>}
      {streaming.error && !isLive && <div className="tiny muted">Live stream note: {streaming.error}</div>}

      {/* What to do */}
      <section className={`card ${isBuy(action) ? 'tinted-good' : isSell(action) ? 'tinted-bad' : ''}`} aria-labelledby="todo">
        <div className="spread" style={{ flexWrap: 'wrap', marginBottom: 12 }}>
          <h2 id="todo">What to do now</h2>
          <div className="row wrap"><ActionBadge action={action} large /><ConfidenceBadge level={analysis.confidence} /><TopPickBadge show={analysis.topPick} /></div>
        </div>
        {setup && (
          <p className="small text-2" style={{ marginBottom: 10 }}>
            Setup: <strong>{setup.name}</strong>. {setup.blurb}{' '}
            {setup.proven
              ? <span className="badge good">✓ Proven on {displaySymbol(symbol)}, including on recent data it never saw</span>
              : <span className="badge warn">Not proven on {displaySymbol(symbol)} yet: use a smaller size</span>}
          </p>
        )}
        {analysis.earnings?.beforeExit && (
          <div className="banner warn" style={{ marginTop: 0, marginBottom: 12 }}>📅 <span><strong>Earnings report {analysis.earnings.daysAway <= 0 ? 'today' : `in ${analysis.earnings.daysAway} day${analysis.earnings.daysAway === 1 ? '' : 's'}`}</strong> ({fmtDate(analysis.earnings.date, { weekday: 'short', month: 'short', day: 'numeric' })}). Stocks often jump or drop 5–15% on earnings, and which way is close to a coin flip. {isBuy(action) ? 'The plan below sells before the report. Many traders simply wait until after it.' : 'Expect a big move.'}</span></div>
        )}
        {analysis.riskScale < 1 && (
          <div className="banner warn" style={{ marginTop: 0, marginBottom: 12 }}>🌪️ <span><strong>Stormy market:</strong> the whole market is swinging about {analysis.volRatio?.toFixed(1)}x more than usual. Position sizes below are cut in half automatically.</span></div>
        )}
        <p style={{ fontSize: '1.05rem' }}><Headline action={action} symbol={displaySymbol(symbol)} plan={plan} owned={owned} stretched={plan.stretched} /></p>
        <div style={{ margin: '16px 0 18px', maxWidth: 520 }}><ScoreMeter score={analysis.score} /></div>

        {isBuy(action) && <>
          <div className="plan-grid">
            <Stat label={plan.stretched ? '1. Buy on a dip at (limit)' : '1. Buy at (limit price)'} value={fmtPrice(plan.entry)} sub={plan.stretched ? `${fmtPct(plan.entry / price - 1)} below now` : 'Use a limit order'} />
            <Stat label="2. Stop-loss (exit if wrong)" value={<span className="bad">{fmtPrice(plan.stop)}</span>} sub={`${fmtPct(plan.stop / plan.entry - 1)} from entry`} />
            <Stat label="3. Take profit at" value={<span className="good">{fmtPrice(plan.target)}</span>} sub={`${fmtPct(plan.target / plan.entry - 1)} from entry`} />
            <Stat label="4. Sell by (if neither hits)" value={fmtDate(sellBy, { month: 'short', day: 'numeric' })} sub={`About ${plan.holdDays} ${kind === 'crypto' ? 'days' : 'trading days'}`} />
          </div>
          <SizeLine size={size} settings={settings} riskPct={riskPct} plan={plan} kind={kind} symbol={displaySymbol(symbol)} />
          <p className="small text-2" style={{ marginTop: 10 }}><strong>When to sell:</strong> {plan.exitRule}</p>
        </>}
        {!isBuy(action) && (
          <div className="grid-2">
            <Stat label="If you own it: protective stop" value={<span className="bad">{fmtPrice(plan.stop)}</span>} sub="Sell if the price drops here" />
            <Stat label="Upside level to watch" value={fmtPrice(plan.target)} sub="Re-check the signal if it gets here" />
          </div>
        )}
        <div className="callout" style={{ marginTop: 14 }}><strong>⏰ When:</strong> {whenToAct(kind)}</div>
        <div className="row wrap" style={{ marginTop: 14 }}>
          {isBuy(action) && <button className="btn primary" onClick={() => setPractice(true)}>Practice this trade (fake money)</button>}
          {owned && <button className="btn" onClick={() => paperSell(symbol, price)}>Sell practice position</button>}
          <button className="btn" onClick={() => document.getElementById('how')?.scrollIntoView({ behavior: 'smooth' })}>How to do it in your app ↓</button>
        </div>
      </section>

      {practice && <PracticeModal symbol={symbol} kind={kind} price={price} plan={plan} size={size} onClose={() => setPractice(false)} />}

      {/* Chart */}
      <section className="card">
        <div className="card-head"><h2>Price chart</h2><span className="tiny muted">Daily prices · {asset.history.source}</span></div>
        <PriceChart analysis={analysis} kind={kind} />
        <div className="card-head" style={{ marginTop: 18, marginBottom: 4 }}>
          <h3>RSI: is it overheated or oversold?</h3>
          <span className="tiny muted">Above 70 = hot, below 30 = cold</span>
        </div>
        <RsiChart analysis={analysis} />
      </section>

      <div className="grid-2">
        {/* Why */}
        <section className="card">
          <div className="card-head"><h2>Why the app says this</h2><span className="tiny muted">score {analysis.score.toFixed(2)}</span></div>
          {analysis.factors.map(f => <Factor key={f.key} f={f} />)}
        </section>

        {/* Forecast */}
        <section className="card">
          <div className="card-head"><h2>What could happen next</h2><span className="tiny muted">next {forecast.days} {kind === 'crypto' ? 'days' : 'trading days'}</span></div>
          <div className="grid-2" style={{ gap: 10 }}>
            <Stat label="Chance it's higher" value={fmtPct(forecast.probUp, { sign: false, digits: 0 })} sub="vs. today's price" />
            <Stat label="Most likely price" value={fmtPrice(forecast.expected)} sub={fmtPct(forecast.expected / price - 1)} />
            <Stat label="2-in-3 chance between" value={<span className="small" style={{ fontWeight: 650 }}>{fmtPrice(forecast.low68)} – {fmtPrice(forecast.high68)}</span>} />
            <Stat label="19-in-20 chance between" value={<span className="small" style={{ fontWeight: 650 }}>{fmtPrice(forecast.low95)} – {fmtPrice(forecast.high95)}</span>} />
          </div>
          <p className="small text-2" style={{ marginTop: 12 }}>
            These ranges come from how much {displaySymbol(symbol)} has actually moved day to day (it swings about {fmtPct(analysis.dailyVol, { sign: false })} on a normal day), tilted slightly by how this signal has played out before. Nobody can predict exact prices; plan for the whole range, not the middle.
          </p>
        </section>
      </div>

      {/* Self-check */}
      <section className="card">
        <div className="card-head"><h2>Was the app right lately?</h2><span className="tiny muted">replayed using only the data available each day</span></div>
        <SelfCheck analysis={analysis} kind={kind} symbol={displaySymbol(symbol)} price={price} />
      </section>

      {/* Reliability */}
      <section className="card">
        <div className="card-head"><h2>How reliable is this signal on {displaySymbol(symbol)}?</h2><span className="tiny muted">tested on the last {Math.round(bt.periodDays / 365 * 10) / 10} years</span></div>
        <Strategies analysis={analysis} symbol={displaySymbol(symbol)} />
        <Reliability bt={bt} kind={kind} symbol={displaySymbol(symbol)} fee={analysis.fee} />
      </section>

      {/* How to */}
      <section className="card" id="how">
        <div className="card-head"><h2>Step by step: place this trade</h2></div>
        <TradeSteps symbol={symbol} kind={kind} action={action} plan={plan} size={size} sellBy={sellBy} />
      </section>

      <IntradayPulse symbol={symbol} kind={kind} />

      {/* News */}
      <section className="card">
        <div className="card-head"><h2>News that could move {displaySymbol(symbol)}</h2>
          <span className="tiny muted">{asset.news ? `${asset.news.items.length} headlines · ${asset.news.sources.filter(s => s.ok).map(s => s.source).join(', ')}` : 'unavailable'}</span>
        </div>
        <AiBriefing asset={asset} analysis={analysis} price={price} />
        <NewsList items={asset.news?.items} />
      </section>
    </div>
  )
}

function Headline({ action, symbol, plan, owned, stretched }) {
  if (action === 'strong-buy' || action === 'buy') {
    return stretched
      ? <>Signals favor <strong>buying {symbol}</strong>, but it ran up fast. Set a limit order to buy on a dip at <strong>{fmtPrice(plan.entry)}</strong> rather than chasing.</>
      : <>Signals favor <strong>buying {symbol}</strong> and holding for about <strong>{plan.holdDays} days</strong>, with a stop-loss to limit damage if it goes wrong.</>
  }
  if (action === 'strong-sell' || action === 'sell') {
    return <>Signals point <strong>down</strong>. If you own {symbol}, consider <strong>selling</strong> or tightening your stop to <strong>{fmtPrice(plan.stop)}</strong>. If you don't own it, <strong>don't buy now</strong>.{owned ? ' (You hold a practice position.)' : ''}</>
  }
  return <>No clear edge right now: the signals disagree. <strong>Wait.</strong> If you own {symbol}, keep a stop near {fmtPrice(plan.stop)}. Not trading is often the best trade.</>
}

function SizeLine({ size, settings, riskPct, plan, kind, symbol }) {
  const [edit, setEdit] = useState(false)
  if (!size) return null
  const gain = size.units * (plan.target - plan.entry)
  return (
    <div className="callout" style={{ marginTop: 14 }}>
      <strong>💵 How much:</strong> with a {fmtMoney(settings.account)} account and {fmtPct(riskPct, { sign: false })} risk per trade, put about <strong>{fmtMoney(size.dollars)}</strong> in ({fmtUnits(size.units, kind)} {kind === 'crypto' ? symbol : 'shares'}).
      {' '}If the stop hits you lose about <span className="bad">{fmtMoney(size.riskDollars)}</span>; if the target hits you make about <span className="good">{fmtMoney(gain)}</span>.
      {size.capped && ' (Capped at 25% of your account so one trade can\'t sink you.)'}
      {' '}<button className="btn small" onClick={() => setEdit(e => !e)}>{edit ? 'Done' : 'Change'}</button>
      {edit && (
        <div className="row wrap" style={{ marginTop: 10 }}>
          <div className="field"><label htmlFor="acct">Account size ($)</label><input id="acct" type="number" min="50" step="50" value={settings.account} onChange={e => updateSettings({ account: Math.max(1, +e.target.value || 0) })} /></div>
          <div className="field"><label htmlFor="risk">Risk per trade</label>
            <select id="risk" value={settings.riskPct} onChange={e => updateSettings({ riskPct: +e.target.value })}>
              <option value={0.005}>0.5% (very safe)</option><option value={0.01}>1% (recommended)</option><option value={0.02}>2% (aggressive)</option>
            </select>
          </div>
        </div>
      )}
    </div>
  )
}

function Factor({ f }) {
  const w = Math.abs(f.score) * 50
  return (
    <div className="factor">
      <div>
        <div style={{ fontWeight: 600 }}>{f.label}</div>
        <div className="factor-bar" aria-hidden="true">
          <span style={{ left: f.score >= 0 ? '50%' : `${50 - w}%`, width: `${w}%`, background: f.score >= 0 ? 'var(--good)' : 'var(--critical)' }} />
        </div>
        <div className="tiny muted" style={{ marginTop: 4 }}>{f.score > 0.1 ? '▲ bullish' : f.score < -0.1 ? '▼ bearish' : '■ neutral'} · weight {Math.round(f.weight * 100)}%</div>
      </div>
      <div className="small text-2">{f.text}</div>
    </div>
  )
}

function SelfCheck({ analysis, kind, symbol }) {
  const { recent } = analysis
  const calls = [...recent.calls].reverse().filter(c => [1, 2, 3, 5, 10, 15, 20].includes(c.daysAgo))
  const cal = getCalibration(kind)
  const line = (w, label) => w.buyN
    ? <>{label}: the app's <strong>buy</strong> calls were right {fmtPct(w.buyHit, { sign: false, digits: 0 })} of the time 5 days later ({w.buyN} calls), vs. {fmtPct(w.baseUp, { sign: false, digits: 0 })} for any random day.</>
    : <>{label}: no buy calls.</>
  return (
    <div className="stack">
      {recent.coldStreak && (
        <div className="banner warn" style={{ marginTop: 0 }}>🧊 <span><strong>Cold streak:</strong> lately the app's buy calls on {symbol} have been wrong more often than chance. It has lowered its confidence and won't mark {symbol} as a Top pick until that improves.</span></div>
      )}
      <div className="table-wrap">
        <table className="table small">
          <thead><tr><th>Call made</th><th>What the app said</th><th className="num">Price then</th><th className="num">Since then</th><th>Result</th></tr></thead>
          <tbody>
            {calls.map(c => (
              <tr key={c.daysAgo}>
                <td>{c.daysAgo === 1 ? 'Yesterday' : `${c.daysAgo} ${kind === 'crypto' ? 'days' : 'trading days'} ago`}<div className="tiny muted">{fmtDate(c.t, { month: 'short', day: 'numeric' })}</div></td>
                <td><ActionBadge action={c.action} /></td>
                <td className="num">{fmtPrice(c.priceThen)}</td>
                <td className="num"><Change value={c.ret} /></td>
                <td>{c.right == null ? <span className="muted">— (wait)</span> : c.right ? <span className="good">✓ Right</span> : <span className="bad">✗ Wrong</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <ul className="small text-2">
        <li>{line(recent.w20, 'Last month')}</li>
        <li>{line(recent.w60, 'Last 3 months')}</li>
      </ul>
      {cal && (
        <p className="small text-2">
          <strong>Self-tuning ({kind === 'crypto' ? 'crypto' : 'stocks'}):</strong>{' '}
          {cal.used
            ? <>re-weighted its factors using the past year of {cal.assets} assets. On the last ~2 months, which tuning never saw, that lifted buy-call accuracy from {fmtPct(cal.before.buyHit, { sign: false, digits: 0 })} to {fmtPct(cal.after.buyHit, { sign: false, digits: 0 })}, so the tuned weights are in use.</>
            : <>tried re-weighting its factors using the past year, but the result didn't beat the standard settings on the last ~2 months of unseen data, so it kept the standard settings. (This stops it from "learning" random noise.)</>}
        </p>
      )}
    </div>
  )
}

function Strategies({ analysis, symbol }) {
  const rows = Object.values(analysis.strategies)
  const fmtExp = v => (v == null ? '—' : fmtPct(v, { digits: 2 }))
  return (
    <div style={{ marginBottom: 16 }}>
      <p className="small text-2" style={{ marginBottom: 10 }}>
        The app tests two strategies on {symbol}'s real history. It checks the older part first ("seen"), then the most recent {analysis.strategies.trend.splitT ? `stretch since ${fmtDate(analysis.strategies.trend.splitT, { month: 'short', year: 'numeric' })}` : 'stretch'} ("unseen"). It only calls a strategy <strong>proven</strong> if it made money in both.
      </p>
      <div className="table-wrap">
        <table className="table small">
          <thead><tr><th>Strategy</th><th className="num">Trades</th><th className="num">Win rate</th><th className="num">Avg trade</th><th className="num hide-sm">Seen data</th><th className="num">Unseen data</th><th>Verdict</th></tr></thead>
          <tbody>
            {rows.map(s => (
              <tr key={s.key} style={analysis.strategy === s.key ? { background: 'var(--accent-wash)' } : undefined}>
                <td><strong>{s.name}</strong>{analysis.strategy === s.key && <div className="tiny" style={{ color: 'var(--accent-text)' }}>active today</div>}</td>
                <td className="num">{s.overall.count}</td>
                <td className="num">{s.overall.winRate != null ? fmtPct(s.overall.winRate, { sign: false, digits: 0 }) : '—'}</td>
                <td className="num"><span className={s.overall.expectancy > 0 ? 'good' : s.overall.expectancy < 0 ? 'bad' : ''}>{fmtExp(s.overall.expectancy)}</span></td>
                <td className="num hide-sm">{fmtExp(s.is.expectancy)} <span className="tiny muted">({s.is.count})</span></td>
                <td className="num">{fmtExp(s.oos.expectancy)} <span className="tiny muted">({s.oos.count})</span></td>
                <td>{s.proven ? <span className="badge good">✓ Proven</span> : <span className="badge neutral">Not proven</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="tiny muted" style={{ marginTop: 6 }}>"Avg trade" is the average result per trade after fees. Small positive numbers add up over many trades.</p>
    </div>
  )
}

function Reliability({ bt, kind, symbol, fee }) {
  const acc = bt.accuracy
  const beat = bt.totalReturn > bt.buyHoldReturn
  return (
    <div className="stack">
      <div className="grid-auto">
        <Stat label="Past trades (active setup)" value={bt.tradeCount} sub={`median hold ${bt.medianHold ?? '—'} days`} />
        <Stat label="Win rate" value={bt.winRate != null ? fmtPct(bt.winRate, { sign: false, digits: 0 }) : '—'} sub="trades that made money" />
        <Stat label="Avg win / avg loss" value={<span className="small" style={{ fontWeight: 650 }}><span className="good">{fmtPct(bt.avgWin)}</span> / <span className="bad">{fmtPct(bt.avgLoss)}</span></span>} />
        <Stat label="Strategy return" value={<span className={bt.totalReturn >= 0 ? 'good' : 'bad'}>{fmtPct(bt.totalReturn, { digits: 0 })}</span>} sub="after fees" />
        <Stat label="Just buy & hold" value={<span className={bt.buyHoldReturn >= 0 ? 'good' : 'bad'}>{fmtPct(bt.buyHoldReturn, { digits: 0 })}</span>} sub="same period" />
        <Stat label="Worst drop" value={<span className="bad">{fmtPct(-bt.maxDrawdown, { digits: 0 })}</span>} sub="peak to bottom" />
      </div>
      {acc.buyN > 0 && (
        <p className="small text-2">
          When this app said <strong>buy</strong> {symbol}, the price was higher {acc.horizon} days later <strong>{fmtPct(acc.buy, { sign: false, digits: 0 })}</strong> of the time ({acc.buyN} days).
          Picking a random day, it was higher {fmtPct(acc.baseUp, { sign: false, digits: 0 })} of the time.
          {acc.buy - acc.baseUp >= 0.03 ? ' So the signal has had a real edge here.' : acc.buy - acc.baseUp > 0 ? ' A small edge: treat it as a nudge, not a sure thing.' : ' No real edge here: be extra careful with this one.'}
        </p>
      )}
      <p className="small text-2">
        {beat
          ? `The strategy beat simply buying and holding ${symbol}, and it was in the market only part of the time.`
          : `Simply buying and holding ${symbol} would have done better. Trading signals often lag in strong bull runs; their job is to cut losses in downturns.`}
        {' '}Includes about {fmtPct(fee, { sign: false, digits: 2 })} in fees per buy and per sell. Past results don't guarantee future ones, and news isn't part of this test.
      </p>
    </div>
  )
}

function PracticeModal({ symbol, kind, price, plan, size, onClose }) {
  const cash = useStore(s => s.paper.cash)
  const [dollars, setDollars] = useState(() => Math.round(Math.min(cash, size ? size.dollars * 10 : cash * 0.1)))
  return (
    <div className="modal-back" onClick={onClose}>
      <div className="modal stack" role="dialog" aria-modal="true" aria-labelledby="pt" onClick={e => e.stopPropagation()}>
        <h2 id="pt">Practice buying {displaySymbol(symbol)}</h2>
        <p className="small text-2">Uses fake money ({fmtMoney(cash)} available) at the real live price. The app sells automatically if your stop ({fmtPrice(plan.stop)}) or target ({fmtPrice(plan.target)}) is hit, just like real orders would.</p>
        <div className="field">
          <label htmlFor="pd">Amount to invest ($)</label>
          <input id="pd" type="number" min="1" max={cash} value={dollars} onChange={e => setDollars(Math.max(0, +e.target.value || 0))} />
          <span className="tiny muted">≈ {fmtUnits(dollars / price, kind)} {kind === 'crypto' ? displaySymbol(symbol) : 'shares'} at {fmtPrice(price)}</span>
        </div>
        <div className="row">
          <button className="btn primary" disabled={!(dollars > 0) || dollars > cash} onClick={() => { paperBuy({ symbol, price, dollars, stop: plan.stop, target: plan.target, holdDays: plan.holdDays, kind }); onClose(); go('/practice') }}>Buy with fake money</button>
          <button className="btn" onClick={onClose}>Cancel</button>
        </div>
      </div>
    </div>
  )
}

function IntradayPulse({ symbol, kind }) {
  const [data, setData] = useState(null)
  useEffect(() => {
    let alive = true
    const load = () => fetchHistory(symbol, { range: '1d', interval: '5m' }).then(d => alive && setData(d)).catch(() => {})
    load()
    const t = setInterval(load, 60000)
    return () => { alive = false; clearInterval(t) }
  }, [symbol])
  if (!data?.candles?.length) return null
  const c = data.candles
  const last = c[c.length - 1].c
  const v = c.some(x => x.v > 0) ? vwap(c) : null
  const open = c[0].o
  const hi = Math.max(...c.map(x => x.h)), lo = Math.min(...c.map(x => x.l))
  const pos = hi > lo ? (last - lo) / (hi - lo) : 0.5
  const recent = c.slice(-6)
  const momentum = recent.length > 1 ? recent[recent.length - 1].c / recent[0].c - 1 : 0
  return (
    <section className="card">
      <div className="card-head"><h2>Today's pulse (for day traders)</h2><span className="tiny muted">5-minute bars · {kind === 'crypto' ? 'last 24h' : 'today'}</span></div>
      <div className="grid-auto">
        <Stat label="Since the open" value={<Change value={last / open - 1} />} />
        <Stat label="Day range" value={<span className="small" style={{ fontWeight: 650 }}>{fmtPrice(lo)} – {fmtPrice(hi)}</span>} sub={`Now at ${Math.round(pos * 100)}% of range`} />
        {v && <Stat label="VWAP (fair price today)" value={fmtPrice(v)} sub={last > v ? 'Price above: buyers in control' : 'Price below: sellers in control'} />}
        <Stat label="Last 30 minutes" value={<Change value={momentum} />} />
      </div>
      <p className="small text-2" style={{ marginTop: 12 }}>
        Day trading (buying and selling within the same day) is the hardest way to make money: costs and noise eat most of the edge. Use this only to time your entry. Buying when the price is <em>below</em> VWAP on a buy signal usually gets a better fill than chasing a spike.
      </p>
    </section>
  )
}

function AiBriefing({ asset, analysis, price }) {
  const [state, setState] = useState({ status: 'idle' })
  const [cfg, setCfg] = useState(null)
  const code = useStore(s => s.settings.aiCode)
  useEffect(() => { fetch('/api/analyze').then(r => r.json()).then(setCfg).catch(() => setCfg({ enabled: false })) }, [])
  if (!cfg?.enabled) return null
  const run = async () => {
    setState({ status: 'loading' })
    try {
      const res = await fetchBriefing({
        symbol: asset.symbol, name: asset.name, kind: asset.kind, price: fmtPrice(price),
        action: analysis.action, score: analysis.score.toFixed(2),
        factors: analysis.factors.map(f => ({ label: f.label, text: f.text })),
        headlines: (asset.news?.items || []).slice(0, 15).map(n => ({ title: n.title, source: n.source, date: new Date(n.time).toISOString().slice(0, 16) })),
      }, code)
      setState({ status: 'done', text: res.text })
    } catch (e) {
      if (e.status === 401) {
        const c = prompt('Enter the AI access code for this site:')
        if (c) { updateSettings({ aiCode: c }); setState({ status: 'idle' }); return }
      }
      setState({ status: 'error', error: e.message })
    }
  }
  return (
    <div className="card tinted-accent" style={{ marginBottom: 14, boxShadow: 'none' }}>
      <div className="spread">
        <div><strong>🤖 AI news briefing</strong><div className="tiny muted">Claude reads the headlines and explains them in plain English.</div></div>
        <button className="btn small primary" onClick={run} disabled={state.status === 'loading'}>{state.status === 'loading' ? 'Reading the news…' : state.status === 'done' ? 'Refresh' : 'Explain the news'}</button>
      </div>
      {state.status === 'error' && <p className="small bad" style={{ marginTop: 10 }}>{state.error}</p>}
      {state.status === 'done' && <div className="small prose" style={{ marginTop: 12 }}><MiniMarkdown text={state.text} /></div>}
    </div>
  )
}

// Tiny, safe markdown: **bold**, "- " bullets, "1. " lines, paragraphs.
function MiniMarkdown({ text }) {
  const inline = s => s.split(/(\*\*[^*]+\*\*)/g).map((part, i) => part.startsWith('**') && part.endsWith('**') ? <strong key={i}>{part.slice(2, -2)}</strong> : part)
  const blocks = []
  let list = null
  for (const raw of text.split('\n')) {
    const line = raw.trim()
    if (/^[-*•] /.test(line)) { (list ||= []).push(line.slice(2)); continue }
    if (list) { blocks.push(<ul key={blocks.length}>{list.map((l, i) => <li key={i}>{inline(l)}</li>)}</ul>); list = null }
    if (line) blocks.push(<p key={blocks.length}>{inline(line.replace(/^#+\s*/, ''))}</p>)
  }
  if (list) blocks.push(<ul key={blocks.length}>{list.map((l, i) => <li key={i}>{inline(l)}</li>)}</ul>)
  return blocks
}
