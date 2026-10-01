// Yu-Gi-Oh! card lookup + prices via YGOPRODeck (free, no key, 20 req/s limit).
// Per-printing prices come from card_sets[].set_price (TCGplayer-based, USD).

import { fetchJson, price, HttpError } from "./http.js";
import { nameSimilarity, normName, ygoCodeCore } from "./match.js";

const YGO = "https://db.ygoprodeck.com/api/v7";

/** YGOPRODeck asks apps not to hotlink images, so we serve them through our cached proxy. */
export const proxied = (url) => (url ? `/api/img?u=${encodeURIComponent(url)}` : null);

export function normalizeYgoCard(c) {
  const img = c.card_images?.[0] || {};
  const cp = c.card_prices?.[0] || {};
  return {
    game: "yugioh",
    id: `ygo:${c.id}`,
    source: "YGOPRODeck",
    name: c.name,
    type: c.type || c.humanReadableCardType || "",
    images: img.image_url ? { small: proxied(img.image_url_small || img.image_url), large: proxied(img.image_url) } : null,
    printings: (c.card_sets || []).map((s) => ({
      key: `${s.set_code}|${s.set_rarity}`,
      setCode: s.set_code,
      setName: s.set_name,
      rarity: s.set_rarity,
      rarityCode: s.set_rarity_code || "",
      price: price(s.set_price),
    })),
    cardPrices: {
      tcgplayer: price(cp.tcgplayer_price),
      cardmarket: price(cp.cardmarket_price),
      ebay: price(cp.ebay_price),
      amazon: price(cp.amazon_price),
      coolstuffinc: price(cp.coolstuffinc_price),
    },
    links: {
      ygoprodeck: c.ygoprodeck_url || null,
      tcgplayer: `https://www.tcgplayer.com/search/yugioh/product?q=${encodeURIComponent(c.name)}`,
    },
    pricesUpdatedAt: null,
  };
}

/** Best printing for what was read off the card (set code first, then rarity). */
export function pickPrinting(card, hint) {
  if (!card.printings.length) return null;
  const core = hint.setCode ? ygoCodeCore(hint.setCode) : "";
  let pool = core ? card.printings.filter((p) => ygoCodeCore(p.setCode) === core) : [];
  if (!pool.length) pool = card.printings;
  if (hint.rarity) {
    const sorted = [...pool].sort((a, b) => nameSimilarity(b.rarity, hint.rarity) - nameSimilarity(a.rarity, hint.rarity));
    return sorted[0];
  }
  return pool[0];
}

export function scoreYugioh(card, hint) {
  let s = 0;
  const why = [];
  const sim = nameSimilarity(card.name, hint.name);
  s += sim * 40;
  if (sim === 1) why.push("name");
  const core = hint.setCode ? ygoCodeCore(hint.setCode) : "";
  if (core && card.printings.some((p) => ygoCodeCore(p.setCode) === core)) {
    s += 50;
    why.push("set code");
  }
  return { score: Math.round(s), matched: why };
}

async function bySetCode(setCode) {
  try {
    const info = await fetchJson(`${YGO}/cardsetsinfo.php?setcode=${encodeURIComponent(setCode)}`);
    if (!info?.id) return [];
    const res = await fetchJson(`${YGO}/cardinfo.php?id=${encodeURIComponent(info.id)}`);
    return res.data || [];
  } catch (e) {
    if (e instanceof HttpError && e.status === 400) return []; // "no card matching your query"
    throw e;
  }
}

async function byName(name) {
  try {
    const res = await fetchJson(`${YGO}/cardinfo.php?name=${encodeURIComponent(name)}`);
    if (res.data?.length) return res.data;
  } catch (e) {
    if (!(e instanceof HttpError && e.status === 400)) throw e;
  }
  try {
    const res = await fetchJson(`${YGO}/cardinfo.php?fname=${encodeURIComponent(name)}&num=15&offset=0`);
    return res.data || [];
  } catch (e) {
    if (e instanceof HttpError && e.status === 400) return [];
    throw e;
  }
}

/** hint: { name, setCode, rarity } */
export async function searchYugioh(hint) {
  const raw = [];
  if (hint.setCode) raw.push(...(await bySetCode(hint.setCode)));
  if (hint.name && !raw.some((c) => normName(c.name) === normName(hint.name))) raw.push(...(await byName(hint.name)));

  const seen = new Set();
  const results = raw
    .filter((c) => !seen.has(c.id) && seen.add(c.id))
    .map(normalizeYgoCard)
    .map((c) => ({ ...c, match: scoreYugioh(c, hint), printingKey: pickPrinting(c, hint)?.key || null }))
    .sort((a, b) => b.match.score - a.match.score)
    .slice(0, 12);
  return { results, provider: "YGOPRODeck", warnings: [] };
}

export async function getYugiohCard(id) {
  const raw = id.replace(/^ygo:/, "");
  const res = await fetchJson(`${YGO}/cardinfo.php?id=${encodeURIComponent(raw)}`);
  if (!res.data?.[0]) throw new HttpError(404, "Card not found");
  return normalizeYgoCard(res.data[0]);
}
