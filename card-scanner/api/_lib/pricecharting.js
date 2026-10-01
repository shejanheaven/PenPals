// PriceCharting API (paid token). Its card prices are built from completed eBay sales,
// including graded prices — the closest thing to "what it actually sells for on eBay".
// Prices come back in pennies.

import { fetchJson, HttpError } from "./http.js";

export const pricechartingConfigured = () => Boolean(process.env.PRICECHARTING_TOKEN);

const FIELDS = {
  ungraded: "loose-price",
  grade7: "cib-price",
  grade8: "new-price",
  grade9: "graded-price",
  grade9_5: "box-only-price",
  psa10: "manual-only-price",
  bgs10: "bgs-10-price",
  cgc10: "condition-17-price",
  sgc10: "condition-18-price",
};

export function normalizePriceCharting(p) {
  const out = {};
  for (const [k, field] of Object.entries(FIELDS)) {
    const cents = Number(p[field]);
    out[k] = Number.isFinite(cents) && cents > 0 ? Math.round(cents) / 100 : null;
  }
  return {
    id: String(p.id ?? ""),
    product: p["product-name"] || "",
    console: p["console-name"] || "",
    prices: out,
    url: p.id ? `https://www.pricecharting.com/offers?product=${encodeURIComponent(p.id)}` : null,
  };
}

export async function searchPriceCharting(query) {
  if (!pricechartingConfigured()) throw new HttpError(501, "PriceCharting token not configured");
  const t = encodeURIComponent(process.env.PRICECHARTING_TOKEN);
  const res = await fetchJson(`https://www.pricecharting.com/api/products?t=${t}&q=${encodeURIComponent(query)}`);
  if (res.status && res.status !== "success") throw new HttpError(502, res["error-message"] || "PriceCharting error");
  const products = (res.products || []).map(normalizePriceCharting);
  return { query, best: products[0] || null, alternatives: products.slice(1, 6) };
}
