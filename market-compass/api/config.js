import { json } from '../server/http.js'

// Tells the browser which optional features are switched on.
// FINNHUB_KEY is a free, browser-safe key (Finnhub's own docs use it client-side);
// it powers live tick-by-tick US stock prices over a WebSocket.
export function GET() {
  return json({
    ai: Boolean(process.env.ANTHROPIC_API_KEY),
    finnhubKey: process.env.FINNHUB_KEY || null,
  }, { cache: 60 })
}
