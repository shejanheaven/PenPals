// eBay Browse API (official, free developer keys). Returns *active* Buy-It-Now listings.
// eBay does not offer sold-listing data to regular developers, so the app shows these as
// "what sellers are asking" and links out to eBay's own sold-listings search for true comps.

import { fetchJson, HttpError } from "./http.js";

const EBAY = "https://api.ebay.com";
const CCG_SINGLES_CATEGORY = "183454"; // Collectible Card Games > CCG Individual Cards
export const EBAY_CONDITION = { graded: "2750", ungraded: "4000" };

let cachedToken = null; // survives warm serverless invocations

export const ebayConfigured = () => Boolean(process.env.EBAY_CLIENT_ID && process.env.EBAY_CLIENT_SECRET);

async function getToken() {
  if (cachedToken && cachedToken.expiresAt > Date.now() + 60_000) return cachedToken.token;
  const basic = Buffer.from(`${process.env.EBAY_CLIENT_ID}:${process.env.EBAY_CLIENT_SECRET}`).toString("base64");
  const res = await fetchJson(`${EBAY}/identity/v1/oauth2/token`, {
    method: "POST",
    headers: { authorization: `Basic ${basic}`, "content-type": "application/x-www-form-urlencoded" },
    body: "grant_type=client_credentials&scope=https%3A%2F%2Fapi.ebay.com%2Foauth%2Fapi_scope",
  });
  cachedToken = { token: res.access_token, expiresAt: Date.now() + (res.expires_in || 7200) * 1000 };
  return cachedToken.token;
}

const JUNK = /\b(lots?|bundle|proxy|custom|orica|fan ?art|metal|replica|you pick|pick your|choose|digital|code card|jumbo|oversized|playmat|empty|mystery|repack)\b/i;
const GRADED = /\b(PSA|BGS|CGC|SGC|TAG|ACE|beckett|graded|slab)\b/i;

export function quantile(sorted, q) {
  if (!sorted.length) return null;
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos), hi = Math.ceil(pos);
  const v = sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
  return Math.round(v * 100) / 100;
}

/**
 * Pure filtering/stats so it can be unit-tested.
 * opts: { mustInclude: string[] (any-of), exclude: string[] (none-of), graded: bool, gradeLabel: "PSA 10" }
 */
export function summarizeListings(items, { mustInclude = [], exclude = [], graded = false, gradeLabel = "" } = {}) {
  const without = exclude.filter(Boolean).map((w) => w.toLowerCase());
  const gradeRe = gradeLabel
    ? new RegExp(`\\b${gradeLabel.trim().replace(/\s+/g, "\\s*").replace(/\./g, "\\.")}(?![\\d.])`, "i")
    : null;
  const rows = (items || [])
    .map((it) => {
      const p = parseFloat(it.price?.value);
      const ship = parseFloat(it.shippingOptions?.[0]?.shippingCost?.value || "0");
      return {
        title: it.title || "",
        price: p,
        shipping: Number.isFinite(ship) ? ship : 0,
        total: Math.round((p + (Number.isFinite(ship) ? ship : 0)) * 100) / 100,
        url: it.itemWebUrl,
        image: it.image?.imageUrl || it.thumbnailImages?.[0]?.imageUrl || null,
        condition: it.condition || "",
      };
    })
    .filter((r) => Number.isFinite(r.price) && r.price > 0 && !JUNK.test(r.title))
    .filter((r) => !without.some((w) => r.title.toLowerCase().includes(w)))
    .filter((r) => (graded ? (gradeRe ? gradeRe.test(r.title) : GRADED.test(r.title)) : !GRADED.test(r.title)));

  const tokens = mustInclude.filter(Boolean).map((t) => t.toLowerCase().replace(/\s+/g, ""));
  const strict = tokens.length
    ? rows.filter((r) => {
        const t = r.title.toLowerCase().replace(/\s+/g, "");
        return tokens.some((tok) => t.includes(tok));
      })
    : rows;
  const use = strict.length >= 3 || !tokens.length ? strict : rows;
  const totals = use.map((r) => r.total).sort((a, b) => a - b);
  return {
    count: use.length,
    strictMatch: use === strict && tokens.length > 0,
    low: totals[0] ?? null,
    p25: quantile(totals, 0.25),
    median: quantile(totals, 0.5),
    p75: quantile(totals, 0.75),
    listings: [...use].sort((a, b) => a.total - b.total).slice(0, 8),
  };
}

export async function searchEbayActive({ q, mustInclude, exclude, graded, gradeLabel }) {
  if (!ebayConfigured()) throw new HttpError(501, "eBay keys not configured");
  const token = await getToken();
  const filter = [
    "buyingOptions:{FIXED_PRICE}",
    `conditionIds:{${graded ? EBAY_CONDITION.graded : EBAY_CONDITION.ungraded}}`,
    "priceCurrency:USD",
  ].join(",");
  const url =
    `${EBAY}/buy/browse/v1/item_summary/search?q=${encodeURIComponent(q)}` +
    `&category_ids=${CCG_SINGLES_CATEGORY}&filter=${encodeURIComponent(filter)}&limit=100`;
  const res = await fetchJson(url, {
    headers: { authorization: `Bearer ${token}`, "x-ebay-c-marketplace-id": "EBAY_US" },
  });
  return { query: q, ...summarizeListings(res.itemSummaries, { mustInclude, exclude, graded, gradeLabel }) };
}
