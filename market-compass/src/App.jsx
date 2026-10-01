import { useEffect, useMemo, useState } from 'react'
import Today from './pages/Today.jsx'
import Ideas from './pages/Ideas.jsx'
import Asset from './pages/Asset.jsx'
import News from './pages/News.jsx'
import Practice from './pages/Practice.jsx'
import Learn from './pages/Learn.jsx'
import Settings from './pages/Settings.jsx'
import { go, useLive, useRoute } from './components/ui.jsx'
import { isDemo, setDemo } from './lib/data.js'
import { checkPaperExits, setState, useStore } from './lib/store.js'
import { UNIVERSE, displaySymbol } from './lib/universe.js'

const TABS = [
  ['', 'Today', '🏠'],
  ['ideas', 'Ideas', '💡'],
  ['news', 'News', '📰'],
  ['practice', 'Practice', '🎯'],
  ['learn', 'Learn', '📘'],
]

export default function App() {
  const { parts, query } = useRoute()
  const theme = useStore(s => s.settings.theme)
  const onboarded = useStore(s => s.onboarded)
  useEffect(() => {
    if (theme === 'system') document.documentElement.removeAttribute('data-theme')
    else document.documentElement.setAttribute('data-theme', theme)
  }, [theme])

  const page = parts[0] || ''
  let body
  if (page === 'asset' && parts[1]) body = <Asset key={parts[1]} symbol={parts[1].toUpperCase()} />
  else if (page === 'ideas') body = <Ideas query={query} />
  else if (page === 'news') body = <News />
  else if (page === 'practice') body = <Practice />
  else if (page === 'learn') body = <Learn section={parts[1]} />
  else if (page === 'settings') body = <Settings />
  else body = <Today />

  return (
    <>
      <header className="topbar">
        <div className="topbar-inner">
          <a className="brand" href="#/"><span className="brand-mark" aria-hidden="true">◎</span>Market Compass</a>
          <nav className="nav" aria-label="Main">
            {TABS.map(([p, label]) => <a key={label} href={`#/${p}`} className={page === p ? 'active' : ''}>{label}</a>)}
          </nav>
          <div className="topbar-right">
            <Search />
            <a className="icon-btn" href="#/settings" aria-label="Settings" title="Settings">⚙︎</a>
          </div>
        </div>
      </header>
      <main className="shell">
        {isDemo() && (
          <div className="banner warn">⚠️ <span><strong>Demo mode is on.</strong> All prices and news are made up. <button className="btn small" onClick={() => setDemo(false)}>Switch to real data</button></span></div>
        )}
        {body}
        <p className="footer-note">
          Market Compass is an educational tool, not financial advice. Signals come from historical patterns and can be wrong. Trading can lose money, including money you didn't plan to lose. Only trade what you can afford to lose.
        </p>
      </main>
      <nav className="tabbar" aria-label="Main">
        {TABS.map(([p, label, icon]) => <a key={label} href={`#/${p}`} className={page === p ? 'active' : ''}><span className="ti" aria-hidden="true">{icon}</span>{label}</a>)}
      </nav>
      <PaperWatcher />
      {!onboarded && <Onboarding />}
    </>
  )
}

// Keeps practice stop-losses / targets working on every page.
function PaperWatcher() {
  const symbols = useStore(s => Object.keys(s.paper.positions).join(','))
  const { quotes } = useLive(symbols ? symbols.split(',') : [])
  useEffect(() => { checkPaperExits(quotes) }, [quotes])
  return null
}

function Search() {
  const [q, setQ] = useState('')
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(0)
  const watchlist = useStore(s => s.watchlist)
  const results = useMemo(() => {
    const t = q.trim().toUpperCase()
    if (!t) return []
    const hits = UNIVERSE.filter(a => a.symbol.startsWith(t) || displaySymbol(a.symbol).startsWith(t) || a.name.toUpperCase().includes(t)).slice(0, 6)
    const clean = t.replace(/[^A-Z0-9.^=-]/g, '')
    if (clean && !hits.some(h => h.symbol === clean)) {
      if (!clean.endsWith('-USD')) hits.push({ symbol: clean, name: 'Look up this stock', kind: 'stock' })
      if (!hits.some(h => h.symbol === `${clean.replace(/-USD$/, '')}-USD`)) hits.push({ symbol: `${clean.replace(/-USD$/, '')}-USD`, name: 'Look up this crypto', kind: 'crypto' })
    }
    return hits
  }, [q])
  const pick = r => {
    if (!watchlist.includes(r.symbol) && !UNIVERSE.some(u => u.symbol === r.symbol)) setState(s => ({ ...s, watchlist: [...s.watchlist, r.symbol] }))
    setQ(''); setOpen(false); go(`/asset/${r.symbol}`)
  }
  return (
    <div className="search">
      <input
        type="search" placeholder="🔍 Search" aria-label="Search stocks and crypto" value={q}
        onChange={e => { setQ(e.target.value); setOpen(true); setActive(0) }}
        onFocus={() => setOpen(true)} onBlur={() => setTimeout(() => setOpen(false), 150)}
        onKeyDown={e => {
          if (e.key === 'ArrowDown') { setActive(a => Math.min(a + 1, results.length - 1)); e.preventDefault() }
          if (e.key === 'ArrowUp') { setActive(a => Math.max(a - 1, 0)); e.preventDefault() }
          if (e.key === 'Enter' && results[active]) pick(results[active])
        }}
      />
      {open && results.length > 0 && (
        <div className="search-results" role="listbox">
          {results.map((r, i) => (
            <button key={r.symbol} className={i === active ? 'active' : ''} onMouseDown={e => e.preventDefault()} onClick={() => pick(r)} role="option" aria-selected={i === active}>
              <span className="sym" style={{ minWidth: 56 }}>{displaySymbol(r.symbol)}</span>
              <span className="small text-2">{r.name}{r.kind === 'crypto' ? ' · crypto' : ''}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

function Onboarding() {
  const [step, setStep] = useState(0)
  const [ok, setOk] = useState(false)
  const pages = [
    <>
      <h2>Welcome to Market Compass 🧭</h2>
      <p className="text-2">Every day it scans the biggest stocks and cryptocurrencies using <strong>real live prices and news</strong>, and tells you in plain English:</p>
      <ul className="text-2">
        <li>what looks good to <strong>buy</strong>, and what to <strong>sell or avoid</strong></li>
        <li>exactly <strong>what price</strong> to buy at, where to put your <strong>safety stop</strong>, where to <strong>take profit</strong>, and <strong>how long to hold</strong></li>
        <li><strong>how much</strong> to put in, based on your account size</li>
        <li>step-by-step instructions for <strong>Robinhood, Coinbase, Kraken, Fidelity and Schwab</strong></li>
      </ul>
    </>,
    <>
      <h2>The honest part</h2>
      <p className="text-2"><strong>No app can guarantee profits.</strong> Most people who day-trade lose money. Markets react to news nobody can see coming.</p>
      <p className="text-2">This app stacks the odds in your favor and, more importantly, <strong>keeps your losses small</strong> when it's wrong (it will be wrong often). It also shows how well each signal has actually worked in the past, so you can judge it yourself.</p>
      <label className="check" style={{ marginTop: 14 }}>
        <input type="checkbox" checked={ok} onChange={e => setOk(e.target.checked)} />
        <span>I understand this is a tool, not a guarantee, and I'll only trade money I can afford to lose.</span>
      </label>
    </>,
    <>
      <h2>Start with practice 🎯</h2>
      <p className="text-2">Use the <strong>Practice</strong> tab first: fake money, real prices. Follow the app's plans for a few weeks. If it works for you there, move to real money with small amounts.</p>
      <p className="text-2">New to all of this? The <strong>Learn</strong> tab has a 5-step starter guide, plus help choosing an app.</p>
    </>,
  ]
  const finish = () => { setState(s => ({ ...s, onboarded: true })); go('/learn/start') }
  return (
    <div className="modal-back">
      <div className="modal stack" role="dialog" aria-modal="true">
        {pages[step]}
        <div className="spread">
          <span className="tiny muted">{step + 1} / {pages.length}</span>
          <div className="row">
            {step > 0 && <button className="btn" onClick={() => setStep(s => s - 1)}>Back</button>}
            {step < pages.length - 1
              ? <button className="btn primary" disabled={step === 1 && !ok} onClick={() => setStep(s => s + 1)}>Next</button>
              : <button className="btn primary" onClick={finish}>Let's go</button>}
          </div>
        </div>
        {step === 2 && <button className="btn small" style={{ alignSelf: 'flex-start' }} onClick={() => { setState(s => ({ ...s, onboarded: true })); go('/') }}>Skip to today's ideas</button>}
      </div>
    </div>
  )
}
