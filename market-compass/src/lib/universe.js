// The assets the app scans for ideas. Anyone can add more to their watchlist.

export const STOCKS = [
  { symbol: 'SPY', name: 'S&P 500 ETF', note: "The 500 biggest US companies in one fund. The market's pulse." },
  { symbol: 'QQQ', name: 'Nasdaq-100 ETF', note: 'The 100 biggest tech-heavy Nasdaq companies.' },
  { symbol: 'AAPL', name: 'Apple' },
  { symbol: 'MSFT', name: 'Microsoft' },
  { symbol: 'NVDA', name: 'NVIDIA' },
  { symbol: 'AMZN', name: 'Amazon' },
  { symbol: 'GOOGL', name: 'Alphabet (Google)' },
  { symbol: 'META', name: 'Meta Platforms' },
  { symbol: 'TSLA', name: 'Tesla' },
  { symbol: 'AVGO', name: 'Broadcom' },
  { symbol: 'AMD', name: 'AMD' },
  { symbol: 'NFLX', name: 'Netflix' },
  { symbol: 'PLTR', name: 'Palantir' },
  { symbol: 'COIN', name: 'Coinbase' },
  { symbol: 'UBER', name: 'Uber' },
  { symbol: 'JPM', name: 'JPMorgan Chase' },
  { symbol: 'V', name: 'Visa' },
  { symbol: 'COST', name: 'Costco' },
  { symbol: 'WMT', name: 'Walmart' },
  { symbol: 'LLY', name: 'Eli Lilly' },
  { symbol: 'XOM', name: 'Exxon Mobil' },
  { symbol: 'DIS', name: 'Disney' },
].map(s => ({ ...s, kind: 'stock' }))

export const CRYPTO = [
  { symbol: 'BTC-USD', name: 'Bitcoin', note: 'The original and biggest cryptocurrency. It sets the mood for all crypto.' },
  { symbol: 'ETH-USD', name: 'Ethereum' },
  { symbol: 'SOL-USD', name: 'Solana' },
  { symbol: 'XRP-USD', name: 'XRP' },
  { symbol: 'DOGE-USD', name: 'Dogecoin' },
  { symbol: 'ADA-USD', name: 'Cardano' },
  { symbol: 'AVAX-USD', name: 'Avalanche' },
  { symbol: 'LINK-USD', name: 'Chainlink' },
  { symbol: 'LTC-USD', name: 'Litecoin' },
  { symbol: 'DOT-USD', name: 'Polkadot' },
].map(s => ({ ...s, kind: 'crypto' }))

export const UNIVERSE = [...STOCKS, ...CRYPTO]

export const BENCHMARK = { stock: 'SPY', crypto: 'BTC-USD' }
export const BENCHMARK_NAME = { stock: 'The US stock market (S&P 500)', crypto: 'The crypto market (Bitcoin)' }

export const DEFAULT_WATCHLIST = ['SPY', 'AAPL', 'NVDA', 'TSLA', 'BTC-USD', 'ETH-USD', 'SOL-USD']

export const kindOf = symbol => (/-USD$/.test(symbol) ? 'crypto' : 'stock')

export function infoFor(symbol) {
  return UNIVERSE.find(a => a.symbol === symbol) || { symbol, name: symbol, kind: kindOf(symbol) }
}

export const displaySymbol = symbol => symbol.replace(/-USD$/, '')
