// Beginner guides. Fees and app screens change, so this text names the ideas
// (limit orders, stop-losses, advanced trading modes) as well as the buttons.

const SECTIONS = [
  ['start', 'Start here'],
  ['truth', 'The honest truth'],
  ['method', 'How the app picks trades'],
  ['rules', 'Golden rules'],
  ['routine', 'Daily routine'],
  ['apps', 'Which app to use'],
  ['setup', 'Setting up your apps'],
  ['orders', 'Order types'],
  ['taxes', 'Taxes (US)'],
  ['scams', 'Scams & red flags'],
  ['glossary', 'Glossary'],
]

export default function Learn({ section = 'start' }) {
  const Body = BODIES[section] || Start
  const idx = SECTIONS.findIndex(s => s[0] === section)
  const next = SECTIONS[idx + 1]
  return (
    <div className="stack">
      <div className="page-head">
        <h1>Learn & guides</h1>
        <p>Everything a beginner needs, in plain English: how to start, which apps to use, and the rules that keep you in the game.</p>
      </div>
      <div className="grid-learn" style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 220px) minmax(0, 1fr)', gap: 20 }}>
        <nav className="toc card" style={{ padding: 8, alignSelf: 'start' }} aria-label="Guide sections">
          {SECTIONS.map(([id, label]) => <a key={id} href={`#/learn/${id}`} className={id === section ? 'active' : ''}>{label}</a>)}
        </nav>
        <article className="card prose">
          <h2>{SECTIONS[Math.max(idx, 0)][1]}</h2>
          <Body />
          {next && <p style={{ marginTop: 24 }}><a className="btn" href={`#/learn/${next[0]}`}>Next: {next[1]} →</a></p>}
        </article>
      </div>
      <style>{`@media (max-width: 760px) { .grid-learn { grid-template-columns: minmax(0, 1fr) !important; } .grid-learn .toc { display: flex; overflow-x: auto; gap: 4px; } .grid-learn .toc a { white-space: nowrap; } }`}</style>
    </div>
  )
}

function Start() {
  return <>
    <p>New to investing? Follow these five steps in order. Don't skip ahead; each one protects your money.</p>
    <ol className="steps" style={{ marginTop: 16 }}>
      <li><strong>Read “The honest truth” and “Golden rules”</strong> (5 minutes). They explain why most beginners lose money and the handful of rules that prevent it.</li>
      <li><strong>Set your account size</strong> in <a href="#/settings">Settings</a>: the amount you'd actually trade with. Start small: money you could lose without it hurting your life.</li>
      <li><strong>Practice for 1–3 months</strong> with fake money in the <a href="#/practice">Practice</a> tab. Each day, open <a href="#/">Today</a>, pick the best 1–2 buy ideas, and tap “Practice this trade”. Track your results.</li>
      <li><strong>Open your real accounts</strong> (see “Which app to use” and “Setting up your apps”): one for stocks, one for crypto if you want it. Turn on two-factor login.</li>
      <li><strong>Go live small.</strong> Only if practice made money: trade real money at 0.5–1% risk per trade, following each asset page's step-by-step instructions. Raise the size slowly as your record proves itself.</li>
    </ol>
    <div className="callout"><strong>How the app decides:</strong> every day it checks 9 research-backed factors on each stock and coin and runs two proven trading strategies on years of that asset's real history. It only marks a trade <strong>★ Top pick</strong> when the strategy also made money on recent data it never saw, the overall market is healthy, and no earnings report is in the way. <a href="#/learn/method">Full details →</a></div>
  </>
}

function Truth() {
  return <>
    <p><strong>No app, person or AI can guarantee profits from trading.</strong> Prices react to news that hasn't happened yet. Anyone who promises guaranteed returns is either mistaken or scamming you. That includes apps that look like this one.</p>
    <h3>What the research says</h3>
    <ul>
      <li>A large study of Brazilian day traders (Chague, De Losso &amp; Giovannetti, 2019) found that <strong>97% of people who kept day-trading for 300+ days lost money</strong>, and only about 1% earned more than minimum wage.</li>
      <li>Studies of Taiwan's market (Barber, Lee, Liu &amp; Odean) found <strong>fewer than 1 in 100 day traders</strong> were reliably profitable year after year.</li>
      <li>Even professionals struggle: S&amp;P's SPIVA reports show <strong>most professional fund managers trail the S&amp;P 500</strong> over 10+ years.</li>
    </ul>
    <h3>So how do people actually make money?</h3>
    <ul>
      <li><strong>Owning the whole market for years.</strong> The S&amp;P 500 has averaged around 10% a year over the long run, with scary drops along the way (−34% in 2020, −25% in 2022). An index fund like SPY, VOO or FXAIX, held for years, beats most traders.</li>
      <li><strong>Trading with an edge and strict risk control.</strong> This is what the app is built for: small, repeatable edges, where you lose small when wrong and win a bit bigger when right.</li>
    </ul>
    <h3>What realistic success looks like</h3>
    <p>Say you have $1,000 and risk 1% ($10) per trade. Each trade either hits its stop (−$10) or its target (about +$15). If you win half the time, you average about <strong>+$2.50 per trade</strong>. After 100 trades that's roughly +$250, or +25%, before taxes. That's a great result, and it comes from consistency, not one lucky bet. Larger accounts scale the same way.</p>
    <p>The flip side: one 50% loss needs a 100% gain just to get back to even. Avoiding big losses matters more than finding big winners. Every rule in this app is built around that.</p>
    <div className="callout"><strong>The smart setup most pros recommend:</strong> keep most of your long-term savings in a broad index fund (retirement accounts like a Roth IRA are great for this), and trade with a small slice, say 5–10%. If trading works for you, grow that slice over time.</div>
  </>
}

function Method() {
  return <>
    <p>The app stacks every well-documented edge it can measure, then filters hard. Here's exactly what it does, and where each idea comes from.</p>
    <h3>1. Nine factors, scored every day</h3>
    <ul>
      <li><strong>Trend</strong> (price vs. 50- and 200-day averages): assets in uptrends tend to keep going up. This is "time-series momentum" (Moskowitz, Ooi &amp; Pedersen, 2012), seen across a century of data and many markets.</li>
      <li><strong>12-month momentum &amp; the 52-week high</strong>: last year's winners tend to beat last year's losers over the next months (Jegadeesh &amp; Titman, 1993). Stocks near their 52-week high tend to keep rising (George &amp; Hwang, 2004).</li>
      <li><strong>Strength vs. the market</strong>: compares each asset to the S&amp;P 500 (or Bitcoin, for crypto). Leaders tend to keep leading.</li>
      <li><strong>Short-term momentum</strong> (MACD, 20-day change), <strong>RSI</strong> and <strong>Bollinger bands</strong>: is the move speeding up, and is it overheated or oversold?</li>
      <li><strong>Volume</strong>: is real money behind the move?</li>
      <li><strong>News sentiment</strong>: positive or negative headlines from the last few days. News tone has measurable short-term effects on prices (Tetlock, 2007).</li>
      <li><strong>Overall market mood</strong>: most stocks fall when the market falls, so buy signals count for less in a downtrend.</li>
    </ul>
    <h3>2. Two strategies, tested on real history</h3>
    <ul>
      <li><strong>Trend-following:</strong> buy when the factors line up, then exit at a target (3× the daily range), a stop-loss (2× the daily range), or when the signal turns.</li>
      <li><strong>Buy the dip in an uptrend:</strong> buy a sharp 1–3 day drop in something still above its 200-day average, then sell on the first bounce. This kind of setup has historically won often, but with small gains per trade (Connors &amp; Alvarez, 2009).</li>
    </ul>
    <h3>3. Tested on data it never saw</h3>
    <p>A strategy can look great on the past just by luck. So the app checks each one on the older 60% of an asset's history, then again on the most recent 40% separately. It's only <strong>proven</strong> if it made money, after fees, in both periods, with enough trades to mean something.</p>
    <h3>4. Safety filters</h3>
    <ul>
      <li><strong>Earnings:</strong> plans for stocks end before the next earnings report. The direction of that jump is close to a coin flip.</li>
      <li><strong>Stormy markets:</strong> when the whole market swings 1.6x more than normal, trade sizes are cut in half. Scaling risk down in volatile periods has improved risk-adjusted returns historically (Moreira &amp; Muir, 2017).</li>
      <li><strong>Position sizing:</strong> every trade risks about 1% of your account, so a string of losses can't wipe you out.</li>
      <li><strong>Bad ticks:</strong> if a live price disagrees wildly with the price history, the app ignores it rather than trading on it.</li>
    </ul>
    <h3>5. It checks itself every day, and self-tunes</h3>
    <ul>
      <li><strong>Was it right?</strong> For every asset, the app replays what it would have said on each recent day, using only the data available that day, and grades it against what actually happened. You see this on every asset page and in the Report card on the Ideas page.</li>
      <li><strong>Self-tuning:</strong> across all stocks (and separately all crypto), it measures which factors actually predicted the next 5 days over the past year, and turns those up and the weak ones down. Then it tests the new weights on the most recent ~2 months, which the tuning never saw. <strong>It only switches if the tuned version wins there.</strong> One week of data is mostly noise, so it never re-tunes on a week alone.</li>
      <li><strong>Cold streaks:</strong> if the app's buy calls on an asset have been wrong more often than chance over the last 3 months, it lowers its confidence and removes that asset from Top picks until it recovers.</li>
    </ul>
    <h3>6. ★ Top pick = all of the above at once</h3>
    <p>A buy signal, from a strategy proven on that asset including on unseen data, in a healthy market, with no earnings in the way and no cold streak. On many days nothing qualifies, and that's the point: <strong>the best way to raise your odds is to trade less, and only the best setups.</strong></p>
    <div className="callout"><strong>What no filter can do:</strong> make the future copy the past. Edges that worked for decades still have losing months, and a surprise (a war, a hack, a fraud) can hit any trade. Expect to lose on 40–50% of trades even when the system works. Profits come from small losses and bigger wins, repeated with discipline.</div>
  </>
}

function Rules() {
  return <>
    <ol className="steps" style={{ marginTop: 8 }}>
      <li><strong>Risk at most 1% of your account per trade.</strong> The app sizes every trade so that if the stop-loss hits, you lose about 1%. Ten losses in a row then cost you only 10%.</li>
      <li><strong>Set a stop-loss the moment you buy.</strong> Every time. Never move it lower to "give it room". Moving it <em>up</em> once you're in profit is fine.</li>
      <li><strong>Only use money you can afford to lose.</strong> Build an emergency fund and pay off credit cards first. A 22% card balance is a guaranteed loss bigger than most traders' gains.</li>
      <li><strong>No leverage, margin, options, futures or short-selling</strong> until you've been profitable for at least 6 months. These can lose more than you put in.</li>
      <li><strong>Hold at most 3–5 trades at once</strong>, and don't make them all the same bet. Five cryptos is really one bet: they move together.</li>
      <li><strong>Respect the market mood.</strong> When the Today page says Negative, trade smaller or not at all. Most stocks fall when the market falls.</li>
      <li><strong>No revenge trading.</strong> After a loss, don't jump into another trade to “win it back”. Stick to the plan or stop for the day.</li>
      <li><strong>Use limit orders, not market orders.</strong> You choose the price; no nasty surprises on fast-moving stocks or thin crypto markets.</li>
      <li><strong>Keep a trading journal.</strong> What you bought, why, entry, stop, target and result. Review it every weekend. The Practice tab does this for you automatically.</li>
      <li><strong>Practice first.</strong> 1–3 months of fake money. If it doesn't work in practice, it won't work with real money.</li>
    </ol>
  </>
}

function Routine() {
  return <>
    <p>The app's signals are built on daily prices, so <strong>10–15 minutes once a day</strong> is enough. Staring at charts all day leads to emotional mistakes.</p>
    <h3>Stocks (weekdays, US Eastern time)</h3>
    <ul>
      <li><strong>Before 9:30am:</strong> open <a href="#/">Today</a>. Check the market mood, your open trades and the best ideas. Read the news on anything you plan to buy.</li>
      <li><strong>After 9:45am:</strong> place limit orders for 1–2 new trades at most. Skip the first 15 minutes: prices jump around wildly at the open. Set each stop-loss right after it fills.</li>
      <li><strong>During the day:</strong> nothing. Your stop and target orders (or price alerts) do the work.</li>
      <li><strong>After 4pm:</strong> log what happened. Sell anything past its "sell by" date the next morning.</li>
    </ul>
    <h3>Crypto (24/7)</h3>
    <ul>
      <li>Pick one fixed time every day, say 8pm, and do the same routine. Crypto never closes, so a fixed habit stops you checking every hour.</li>
      <li>Weekend crypto markets are thinner and can make sudden big moves. Make sure every position has a stop-loss before you log off.</li>
    </ul>
    <h3>Weekly (weekend)</h3>
    <ul>
      <li>Review your journal: win rate, average win vs. average loss, and whether you beat simply holding the S&amp;P 500 (SPY).</li>
      <li>Losing streak? Cut your risk per trade in half until it turns around. Streaks happen even to good systems.</li>
    </ul>
    <div className="callout"><strong>Pattern day trader rule (stocks, US):</strong> in a <em>margin</em> account under $25,000, FINRA rules have limited you to 3 "day trades" (buy and sell the same stock the same day) in any 5 business days, and FINRA has been working on changing this rule, so check your broker's current terms. The simplest fix for beginners: use a <strong>cash account</strong>, and hold trades overnight or longer, as this app's plans do. Crypto has no such rule.</div>
  </>
}

function Apps() {
  return <>
    <p>You only need one app for stocks and, if you want crypto, one for crypto. Fees and features change, so check each app's current fee page before you sign up.</p>
    <div className="table-wrap" style={{ marginTop: 12 }}>
      <table className="table small">
        <thead><tr><th>App</th><th>Best for</th><th>Stocks</th><th>Crypto</th><th>Good to know</th></tr></thead>
        <tbody>
          <tr><td className="sym">Fidelity ⭐</td><td>Best overall for stocks</td><td>$0 commission, fractional shares</td><td>A few coins</td><td>Great order fills (no payment for order flow on stocks), excellent support, OCO orders for stop + target together.</td></tr>
          <tr><td className="sym">Schwab (thinkorswim) ⭐</td><td>Best free charts & practice</td><td>$0 commission</td><td>Limited</td><td>thinkorswim has a free <em>paperMoney</em> practice mode and bracket orders (entry + target + stop in one).</td></tr>
          <tr><td className="sym">Robinhood</td><td>Simplest all-in-one</td><td>$0 commission, fractional</td><td>Yes (built into price)</td><td>The easiest app to learn. Crypto costs are built into the price (spread). Usually can't hold a stop and a profit order on the same shares at once.</td></tr>
          <tr><td className="sym">Kraken Pro ⭐</td><td>Low-fee crypto</td><td>Limited / by region</td><td>~0.25–0.4% fees</td><td>Strong security record. Can attach a take-profit and stop-loss to your buy automatically. Use <strong>Kraken Pro</strong>, not the simple app. Not available in every US state.</td></tr>
          <tr><td className="sym">Coinbase (Advanced)</td><td>Easiest crypto</td><td>—</td><td>~0.4–0.6% in Advanced</td><td>A US public company with a huge coin selection. <strong>Always use Advanced trading</strong>: the simple Buy button can cost 1–4%.</td></tr>
          <tr><td className="sym">Webull</td><td>Free practice + extended hours</td><td>$0 commission</td><td>Yes</td><td>Built-in paper trading and good charts.</td></tr>
          <tr><td className="sym">Interactive Brokers</td><td>Advanced traders later</td><td>Very low cost</td><td>Some</td><td>Powerful but complex. Great once you outgrow the others.</td></tr>
        </tbody>
      </table>
    </div>
    <h3>My recommendation</h3>
    <ul>
      <li><strong>Stocks:</strong> Fidelity (best execution, easy stop + target orders), or Schwab if you want pro charts and a practice account. Robinhood is fine if simplicity matters most.</li>
      <li><strong>Crypto:</strong> Kraken Pro for the lowest fees and automatic stop/target orders, or Coinbase Advanced for ease. Avoid paying the "simple buy" fees.</li>
      <li><strong>Stay away from</strong> offshore exchanges that aren't licensed in your country, and from any app that pushes 10x–100x leverage on beginners.</li>
    </ul>
  </>
}

function Setup() {
  return <>
    <h3>Robinhood (stocks + crypto)</h3>
    <ol>
      <li>Download Robinhood and sign up. You'll need to be 18+, with a US address, your SSN and a photo ID.</li>
      <li>Turn on two-factor authentication: Settings → Security → Two-factor authentication (use an authenticator app).</li>
      <li>Ask for a <strong>cash</strong> account rather than margin. Look under Settings → Investing → Account type. A cash account can't borrow, which means no surprise debts and no pattern-day-trader limit.</li>
      <li>Link your bank: Transfers → Link bank, then deposit. Small deposits may be usable instantly; the rest settles in a few days.</li>
      <li>Each asset page here has exact step-by-step order instructions with the numbers filled in.</li>
    </ol>
    <h3>Coinbase (crypto)</h3>
    <ol>
      <li>Download Coinbase and sign up. Verify your identity with a photo ID.</li>
      <li>Security first: turn on 2-step verification with an authenticator app or passkey, not SMS. Coinbase will <strong>never</strong> call you or ask for your codes.</li>
      <li>Add a payment method: <strong>bank account (ACH)</strong>. Debit cards cost much more.</li>
      <li>Deposit USD, then switch to <strong>Advanced</strong> trading for every buy and sell. The fees are far lower.</li>
    </ol>
    <h3>Kraken (crypto)</h3>
    <ol>
      <li>Sign up at kraken.com and verify to the <em>Intermediate</em> level (photo ID + address) to deposit from a US bank.</li>
      <li>Turn on 2FA for sign-in <em>and</em> for withdrawals, and enable the Global Settings Lock.</li>
      <li>Deposit USD (ACH or wire), then trade in <strong>Kraken Pro</strong> (pro.kraken.com or the Kraken Pro app).</li>
    </ol>
    <h3>Fidelity / Schwab (stocks)</h3>
    <ol>
      <li>Open an individual <strong>brokerage</strong> account (cash account) online. It takes about 10 minutes.</li>
      <li>Link your bank with an electronic funds transfer (EFT/ACH) and deposit.</li>
      <li>Fidelity: use fidelity.com for <em>Conditional → OCO</em> orders. Schwab: use the free <em>thinkorswim</em> app for bracket orders and paperMoney practice.</li>
    </ol>
    <div className="callout"><strong>Security basics:</strong> use a unique password per app (a password manager helps), use authenticator-app 2FA, never share a code or your screen with "support", and never type a crypto wallet's 12- or 24-word recovery phrase into any website.</div>
  </>
}

function Orders() {
  return <>
    <ul>
      <li><strong>Market order:</strong> buy or sell right now at whatever price is available. Fast, but on a jumpy stock or thin crypto you can get a worse price than you saw.</li>
      <li><strong>Limit order:</strong> buy at this price or lower, or sell at this price or higher. You control the price. It might not fill if the price never reaches it. <em>The app's plans always use limit orders to get in.</em></li>
      <li><strong>Stop-loss (stop) order:</strong> "if the price falls to X, sell". This is your safety net. In a sudden crash it can fill below X (called slippage).</li>
      <li><strong>Stop-limit order:</strong> "if it falls to X, try to sell at Y or better". Common on crypto apps. Set Y a little below X (about 0.5%) so it actually fills.</li>
      <li><strong>Take-profit:</strong> a sell limit order at your target price.</li>
      <li><strong>OCO / bracket:</strong> a take-profit and a stop-loss linked together. When one fills, the other cancels. Best of both; available on Fidelity, Schwab and Kraken Pro.</li>
      <li><strong>Day vs. GTC:</strong> a "Day" order expires at the close; "Good till canceled" stays until it fills or you cancel it (often up to 90 days).</li>
    </ul>
  </>
}

function Taxes() {
  return <>
    <p className="small muted">General information for US taxpayers, not tax advice. A tax professional can confirm what applies to you.</p>
    <ul>
      <li><strong>Profit from selling = capital gain.</strong> Held 1 year or less: <em>short-term</em>, taxed like your regular income (10–37%). Held longer: <em>long-term</em>, taxed at 0%, 15% or 20%. Almost every trade from this app's plans is short-term.</li>
      <li><strong>Set aside 25–35% of your trading profits</strong> for taxes, so April isn't a shock.</li>
      <li><strong>Losses help:</strong> they cancel out gains, and up to $3,000 a year of extra net losses can reduce your other income. The rest carries forward to future years.</li>
      <li><strong>Wash-sale rule (stocks):</strong> if you sell at a loss and buy the same stock back within 30 days, you can't claim that loss yet.</li>
      <li><strong>Crypto:</strong> every sale, <em>and every crypto-to-crypto swap</em>, is a taxable event. US exchanges now report crypto sales to the IRS on Form 1099-DA. Tools like Koinly or CoinTracker can build the tax report from your exchange history.</li>
      <li>Your broker sends Form 1099-B for stocks early each year. Keep your own trade journal too.</li>
    </ul>
  </>
}

function Scams() {
  return <>
    <ul>
      <li><strong>"Guaranteed returns" or "can't lose"</strong> is the #1 sign of a scam. Real investing always carries risk.</li>
      <li><strong>"Pig butchering":</strong> a friendly stranger (dating app, wrong-number text, social media) shows you their amazing crypto "platform". You deposit, the balance grows, then you can't withdraw. Only use well-known exchanges you downloaded yourself.</li>
      <li><strong>Fake support:</strong> nobody from Coinbase, Kraken or Robinhood will DM you, call you unexpectedly, or ask for your password, 2FA code or recovery phrase.</li>
      <li><strong>Pump-and-dump groups</strong> (Telegram, Discord, X): "this coin will 100x tonight". Insiders sell to you at the top.</li>
      <li><strong>Paid signal groups and courses</strong> showing Lamborghinis and screenshots of profits. If they could really do it, they wouldn't need your subscription.</li>
      <li>Check any broker or adviser on <strong>FINRA BrokerCheck</strong> (brokercheck.finra.org) and report fraud at reportfraud.ftc.gov or sec.gov/tcr.</li>
    </ul>
  </>
}

const TERMS = [
  ['Stock / share', 'A small piece of ownership in a company. If the company does well, the share usually becomes worth more.'],
  ['ETF', 'A fund that holds many stocks at once and trades like one stock. SPY holds the 500 biggest US companies.'],
  ['Cryptocurrency', 'Digital money that runs on a blockchain (Bitcoin, Ethereum…). It trades 24/7 and swings much more than stocks.'],
  ['Ticker', 'The short code for an asset: AAPL = Apple, BTC = Bitcoin.'],
  ['Bid / ask / spread', 'Bid is the best price buyers offer; ask is the best price sellers want. The gap between them is the spread, a hidden cost every time you trade.'],
  ['Volatility', 'How much a price swings. Crypto is 2–4x more volatile than big stocks. Higher volatility means bigger wins and bigger losses.'],
  ['Moving average (50-day, 200-day)', 'The average price over the last 50 or 200 days. A price above its averages means an uptrend; below means a downtrend.'],
  ['Golden cross / death cross', 'When the 50-day average crosses above the 200-day (golden: bullish) or below it (death: bearish).'],
  ['RSI', 'Relative Strength Index, from 0 to 100. Above 70 = overbought (ran up fast); below 30 = oversold (fell fast).'],
  ['MACD', 'A momentum gauge that compares fast and slow averages. Rising means momentum is building.'],
  ['Bollinger bands', 'A price channel around the 20-day average. Outside the bands = unusually stretched.'],
  ['ATR (Average True Range)', 'The typical daily move in dollars. The app sets stops 2 ATRs below entry and targets 3 ATRs above.'],
  ['VWAP', "Today's average price, weighted by volume. Big traders use it as the day's \"fair price\"."],
  ['Bull / bear market', 'Bull = prices trending up. Bear = prices down 20%+ from the high.'],
  ['Stop-loss', 'An order that sells automatically if the price drops to a level you choose. It caps your loss.'],
  ['Take-profit / target', 'The price where you plan to sell for a gain.'],
  ['Risk/reward', 'How much you could lose vs. gain. The app aims for 1:1.5: risk $10 to make $15.'],
  ['Position size', "How much money you put into one trade. The app sizes it so the stop-loss costs about 1% of your account."],
  ['Drawdown', 'How far an account has fallen from its peak. A 20% drawdown needs a 25% gain to recover.'],
  ['Backtest', 'Testing a strategy on past prices to see how it would have done. Useful, but no promise about the future.'],
  ['Paper trading', 'Practicing with fake money at real prices.'],
  ['Market cap', 'The total value of all of a company’s shares (price × number of shares).'],
  ['Earnings', 'A company’s quarterly profit report. Stocks often jump or drop 5–15% on earnings day.'],
  ['Dividend', 'Cash some companies pay shareholders, usually every quarter.'],
  ['Fractional shares', 'Buying part of a share, e.g. $50 of a $500 stock.'],
  ['Cash vs. margin account', 'Cash: you trade only your own money. Margin: you can borrow from the broker (risky, and costs interest).'],
  ['Settlement (T+1)', 'Stock sales take 1 business day to fully settle into cash.'],
  ['Slippage', 'Getting a worse price than expected, usually during fast moves or with market orders.'],
  ['Liquidity', 'How easily something can be bought or sold without moving the price. Big stocks and BTC are very liquid.'],
  ['Short selling', 'Betting a price will fall by selling borrowed shares. The loss has no limit. Not for beginners.'],
]

function Glossary() {
  return (
    <dl>
      {TERMS.map(([t, d]) => (
        <div key={t} style={{ padding: '10px 0', borderBottom: '1px solid var(--border)' }}>
          <dt style={{ fontWeight: 650 }}>{t}</dt>
          <dd className="small text-2">{d}</dd>
        </div>
      ))}
    </dl>
  )
}

const BODIES = { start: Start, truth: Truth, method: Method, rules: Rules, routine: Routine, apps: Apps, setup: Setup, orders: Orders, taxes: Taxes, scams: Scams, glossary: Glossary }
