import { useEffect, useState } from 'react'
import { BROKERS } from '../components/TradeSteps.jsx'
import { fetchConfig, isDemo, setDemo } from '../lib/data.js'
import { paperReset, setState, updateSettings, useStore } from '../lib/store.js'
import { DEFAULT_WATCHLIST } from '../lib/universe.js'

export default function Settings() {
  const settings = useStore(s => s.settings)
  const [cfg, setCfg] = useState(null)
  useEffect(() => { fetchConfig().then(setCfg) }, [])
  const demo = isDemo()

  return (
    <div className="stack">
      <div className="page-head"><h1>Settings</h1><p>Saved only in this browser.</p></div>

      <section className="card stack">
        <h2>Your trading account</h2>
        <div className="grid-3">
          <div className="field">
            <label htmlFor="s-acct">Money you trade with ($)</label>
            <input id="s-acct" type="number" min="50" step="50" value={settings.account} onChange={e => updateSettings({ account: Math.max(1, +e.target.value || 0) })} />
            <span className="tiny muted">Used to size each trade. Start small.</span>
          </div>
          <div className="field">
            <label htmlFor="s-risk">Risk per trade</label>
            <select id="s-risk" value={settings.riskPct} onChange={e => updateSettings({ riskPct: +e.target.value })}>
              <option value={0.005}>0.5%: very safe</option>
              <option value={0.01}>1%: recommended</option>
              <option value={0.02}>2%: aggressive</option>
            </select>
            <span className="tiny muted">How much you lose if a stop-loss hits.</span>
          </div>
          <div className="field">
            <label htmlFor="s-broker">Your main app</label>
            <select id="s-broker" value={settings.broker} onChange={e => updateSettings({ broker: e.target.value })}>
              {Object.entries(BROKERS).map(([id, b]) => <option key={id} value={id}>{b.name}</option>)}
            </select>
            <span className="tiny muted">Step-by-step guides open on this app.</span>
          </div>
        </div>
      </section>

      <section className="card stack">
        <h2>Appearance</h2>
        <div className="seg">
          {[['system', 'Match device'], ['light', 'Light'], ['dark', 'Dark']].map(([k, l]) => (
            <button key={k} className={settings.theme === k ? 'active' : ''} onClick={() => updateSettings({ theme: k })}>{l}</button>
          ))}
        </div>
      </section>

      <section className="card stack">
        <h2>Data sources</h2>
        <ul className="small text-2">
          <li><strong>Prices & history:</strong> Yahoo Finance, with automatic fallback to Coinbase and Kraken (crypto) and Stooq (stocks).</li>
          <li><strong>Live crypto ticks:</strong> Coinbase WebSocket (fallback: Kraken).</li>
          <li><strong>Live stock ticks:</strong> {cfg?.finnhubKey ? <span className="good">Finnhub WebSocket is on ✓</span> : <>refreshed every 15 seconds. Add a free <code>FINNHUB_KEY</code> on your server for tick-by-tick prices and extra news.</>}</li>
          <li><strong>News:</strong> Yahoo Finance, Google News, CNBC, MarketWatch, CoinDesk, Cointelegraph{cfg?.finnhubKey ? ', Finnhub' : ''}.</li>
          <li><strong>AI briefing:</strong> {cfg?.ai ? <span className="good">On ✓ (Claude)</span> : <>off. Add <code>ANTHROPIC_API_KEY</code> on your server to turn it on.</>}</li>
        </ul>
        {cfg?.ai && (
          <div className="field" style={{ maxWidth: 320 }}>
            <label htmlFor="s-code">AI access code (if your site uses one)</label>
            <input id="s-code" type="password" value={settings.aiCode} onChange={e => updateSettings({ aiCode: e.target.value })} />
          </div>
        )}
        <label className="check">
          <input type="checkbox" checked={demo} onChange={e => setDemo(e.target.checked)} />
          <span><strong>Demo mode:</strong> use made-up prices and news so you can explore offline. Leave this <strong>off</strong> for real data.</span>
        </label>
      </section>

      <section className="card stack">
        <h2>Reset</h2>
        <div className="row wrap">
          <button className="btn" onClick={() => { if (confirm('Reset practice account to $10,000?')) paperReset() }}>Reset practice account</button>
          <button className="btn" onClick={() => setState(s => ({ ...s, watchlist: DEFAULT_WATCHLIST }))}>Reset watchlist</button>
          <button className="btn" onClick={() => setState(s => ({ ...s, onboarded: false }))}>Show the intro again</button>
        </div>
      </section>
    </div>
  )
}
