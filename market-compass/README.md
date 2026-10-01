# Market Compass

Real-time stock and crypto tracker that tells beginners, in plain English, **what to buy or sell, at what price, where to put the stop-loss, when to take profit, how long to hold, and how much to put in**, with step-by-step instructions for Robinhood, Coinbase, Kraken, Fidelity and Schwab.

> **Honest note.** No app can guarantee profits. Markets react to news nobody can see coming, and most day traders lose money. Market Compass stacks well-researched edges, tests them on each asset's real history (including data they never saw), only flags **★ Top picks** when everything lines up, and keeps losses small when it's wrong. Practice with the built-in fake-money account before using real money.

## What's inside

| Feature | How it works |
|---|---|
| **Live prices** | Crypto streams tick by tick from Coinbase (Kraken as backup). Stocks refresh every 15s from Yahoo Finance, or stream tick by tick from Finnhub if you add a free key. |
| **Price history** | 5 years of daily candles from Yahoo Finance, with automatic fallback to Coinbase and Kraken (crypto) or Stooq (stocks). |
| **News** | Yahoo Finance, Google News, CNBC, MarketWatch, CoinDesk and Cointelegraph (plus Finnhub with a key). Each headline is scored positive or negative, tagged High/Medium/Low impact, and explained ("why this matters"). |
| **Signals** | 9 research-backed factors: trend, short- and long-term momentum, 52-week high, strength vs. the market, RSI, Bollinger bands, volume, news sentiment and market mood. |
| **Strategies** | Trend-following and buy-the-dip-in-an-uptrend, each backtested on years of real data with fees, and walk-forward checked on recent data the rule never saw. |
| **Trade plan** | Entry (limit price), stop-loss, target, sell-by date, position size from your account and risk %, and the best time of day to act. |
| **Self-check** | Every asset page replays what the app said yesterday, 2, 3, 5, 10, 15 and 20 days ago (using only data available on each day) and grades it ✓/✗. The Ideas page has a report card across all assets. |
| **Self-tuning** | Daily, across all stocks (and separately all crypto), it measures which factors predicted the next 5 days over the past year and re-weights them. It then tests the new weights on the last ~2 months, which tuning never saw, and keeps them only if they win there. |
| **Cold-streak guard** | If an asset's buy calls have been wrong more often than chance over the last 3 months, confidence drops and it can't be a Top pick. |
| **Safety filters** | Plans end before earnings reports, trade size halves in stormy markets, bad price ticks are ignored, and each position is capped at 25% of your account. |
| **Forecast** | Likely price range for the hold period (2-in-3 and 19-in-20 chances), drawn as a cone on the chart. |
| **Practice** | A $10,000 fake-money account at real prices, with automatic stop-loss and target exits. |
| **Learn** | A starter path, the honest odds, how the app picks trades, golden rules, a daily routine, which app to use, account setup, order types, US taxes, scams, and a glossary. |
| **AI briefing** *(optional)* | Claude reads the latest headlines and explains them in plain English. |

## Deploy (free, about 10 minutes)

Same stack as Pen Pals: **Vercel** hosting, auto-deployed from GitHub.

1. Go to **vercel.com** → **Add New → Project** → import this GitHub repo.
2. Set **Root Directory** to `market-compass` (important: this repo holds more than one app).
3. Vercel detects Vite automatically. Click **Deploy**.
4. Open your URL. That's it: real data, no keys needed.

### Optional keys (Vercel → Project → Settings → Environment Variables)

| Variable | What it unlocks | Where to get it |
|---|---|---|
| `FINNHUB_KEY` | Tick-by-tick live US stock prices, extra company news, and more reliable earnings dates | Free at **finnhub.io** (sign up → API key) |
| `ANTHROPIC_API_KEY` | The 🤖 AI news briefing on each asset page | **console.anthropic.com** → API keys (pay per use) |
| `AI_ACCESS_CODE` | Any password you choose. Stops strangers using your AI credits if your site is public. | You make it up |

Redeploy after adding keys (Deployments → ⋯ → Redeploy).

## Local development

```bash
cd market-compass
npm install
cp .env.example .env   # optional keys
npm run dev            # http://localhost:5173 (the /api functions run locally too)
npm test               # 43 tests: indicators, signals, backtests, self-tuning, parsers, market hours
```

Want to look around without internet? **Settings → Demo mode** uses made-up data, labeled everywhere it appears.

## How the code is organized

```
api/            Vercel functions (Web-standard Request → Response)
  history.js    price history with source fallbacks
  quotes.js     latest prices for many symbols
  news.js       aggregated, scored headlines
  earnings.js   next earnings date (Finnhub → Yahoo)
  analyze.js    optional Claude news briefing
  config.js     which optional features are on
server/         data-source adapters shared by the functions
src/lib/
  indicators.js SMA, EMA, RSI, MACD, Bollinger, ATR, VWAP…
  signals.js    9-factor score, 2 strategies, walk-forward backtest, self-check,
                self-tuning, trade plan, forecast
  sentiment.js  headline scoring, categories, "why it matters"
  data.js       API client + live price hub (Coinbase/Kraken/Finnhub WebSockets)
  analysis.js   loads an asset and runs the engine; the daily scan + self-tuning
  store.js      settings, watchlist, practice account (browser localStorage)
src/pages/      Today, Ideas, Asset, News, Practice, Learn, Settings
tests/          node:test unit tests
```

## Limits to know

- **Free data sources are unofficial.** Yahoo Finance and the RSS feeds can change formats or rate-limit without warning. The app falls back to other sources, and shows a clear error if every source fails. For a serious setup, add `FINNHUB_KEY`.
- **Stock prices without Finnhub** update every 15 seconds, not every tick.
- **Signals use daily prices**, so they suit trades held for days to weeks ("swing trading"), checked once a day. They're not built for minute-by-minute scalping.
- **Self-tuning learns slowly on purpose.** One week of prices is mostly noise, so the app never re-tunes on a week alone. It learns from a year and checks itself against the last ~2 months.
- **Backtests are not promises.** They include fees but not taxes or slippage, and news isn't part of the historical test (there's no free headline archive).
- Educational tool, not financial advice.
