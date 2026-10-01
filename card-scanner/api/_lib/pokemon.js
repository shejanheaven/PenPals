// Pokémon card lookup + prices.
// Primary: TCGdex (free, no key, includes TCGplayer + Cardmarket prices).
// Fallback: pokemontcg.io (free key optional; scheduled to shut down March 2027).

import { fetchJson, price, HttpError } from "./http.js";
import { nameSimilarity, normNumber, normSetCode, pokemonBaseName } from "./match.js";

const TCGDEX = "https://api.tcgdex.net/v2/en";
const PTCG = "https://api.pokemontcg.io/v2";

export const VARIANT_LABELS = {
  normal: "Normal",
  holofoil: "Holo",
  reverseHolofoil: "Reverse Holo",
  "1stEdition": "1st Edition",
  "1stEditionNormal": "1st Edition",
  "1stEditionHolofoil": "1st Edition Holo",
  unlimited: "Unlimited",
  unlimitedNormal: "Unlimited",
  unlimitedHolofoil: "Unlimited Holo",
};

// TCGdex uses kebab-case variant keys; normalize to pokemontcg.io-style camelCase.
const TCGDEX_VARIANT_KEYS = {
  normal: "normal",
  holofoil: "holofoil",
  "reverse-holofoil": "reverseHolofoil",
  "1st-edition": "1stEdition",
  "1st-edition-normal": "1stEditionNormal",
  "1st-edition-holofoil": "1stEditionHolofoil",
  unlimited: "unlimited",
  "unlimited-normal": "unlimitedNormal",
  "unlimited-holofoil": "unlimitedHolofoil",
};

function camelVariantKey(k) {
  return TCGDEX_VARIANT_KEYS[k] || k.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
}

function variantEntry(key, p) {
  return {
    key,
    label: VARIANT_LABELS[key] || key,
    market: price(p.marketPrice ?? p.market),
    low: price(p.lowPrice ?? p.low),
    mid: price(p.midPrice ?? p.mid),
    high: price(p.highPrice ?? p.high),
    directLow: price(p.directLowPrice ?? p.directLow),
  };
}

// ───────────────────────── TCGdex ─────────────────────────

export function normalizeTcgdexCard(c) {
  const tp = c.pricing?.tcgplayer || {};
  const cm = c.pricing?.cardmarket || null;
  const variants = Object.entries(tp)
    .filter(([, v]) => v && typeof v === "object")
    .map(([k, v]) => variantEntry(camelVariantKey(k), v))
    .filter((v) => v.market || v.mid || v.low);

  // If there is no price data, still expose the printed variants so the user can pick one.
  if (!variants.length && c.variants) {
    const v = c.variants;
    if (v.normal) variants.push(variantEntry("normal", {}));
    if (v.holo) variants.push(variantEntry("holofoil", {}));
    if (v.reverse) variants.push(variantEntry("reverseHolofoil", {}));
    if (v.firstEdition) variants.push(variantEntry(v.holo ? "1stEditionHolofoil" : "1stEdition", {}));
  }

  const img = c.image || null;
  return {
    game: "pokemon",
    id: `tcgdex:${c.id}`,
    source: "TCGdex",
    name: c.name,
    number: String(c.localId ?? ""),
    setTotal: c.set?.cardCount?.official ? String(c.set.cardCount.official) : "",
    setId: c.set?.id || "",
    setName: c.set?.name || "",
    setCode: c.set?.abbreviation?.official || "",
    releaseDate: c.set?.releaseDate || "",
    rarity: c.rarity || "",
    images: img ? { small: `${img}/low.webp`, large: `${img}/high.webp` } : null,
    variants,
    cardmarket: cm
      ? {
          unit: cm.unit || "EUR",
          trend: price(cm.trend),
          avg1: price(cm.avg1),
          avg7: price(cm.avg7),
          avg30: price(cm.avg30),
          low: price(cm.low),
          avg: price(cm.avg),
          foil: {
            trend: price(cm["trend-holo"]),
            avg7: price(cm["avg7-holo"]),
            avg30: price(cm["avg30-holo"]),
            low: price(cm["low-holo"]),
          },
        }
      : null,
    links: {
      tcgplayer: null,
      cardmarket: null,
    },
    pricesUpdatedAt: tp.updated || cm?.updated || null,
  };
}

async function tcgdexSearch(hint) {
  const names = [...new Set([hint.name, pokemonBaseName(hint.name)].filter(Boolean))];
  let brief = [];
  for (const n of names) {
    const list = await fetchJson(`${TCGDEX}/cards?name=${encodeURIComponent(n)}`);
    if (Array.isArray(list) && list.length) {
      brief = list;
      break;
    }
  }
  if (!brief.length) return [];

  const wanted = normNumber(hint.number);
  let pool = wanted ? brief.filter((b) => normNumber(b.localId) === wanted) : [];
  if (!pool.length) {
    // No number (or no number match): prefer closest names.
    pool = [...brief].sort((a, b) => nameSimilarity(b.name, hint.name) - nameSimilarity(a.name, hint.name));
  }
  pool = pool.slice(0, 12);

  const settled = await Promise.allSettled(
    pool.map((b) => fetchJson(`${TCGDEX}/cards/${encodeURIComponent(b.id)}`)),
  );
  return settled.filter((s) => s.status === "fulfilled" && s.value?.id).map((s) => normalizeTcgdexCard(s.value));
}

// ───────────────────────── pokemontcg.io ─────────────────────────

export function normalizePtcgCard(c) {
  const prices = c.tcgplayer?.prices || {};
  const cm = c.cardmarket?.prices || null;
  return {
    game: "pokemon",
    id: `ptcg:${c.id}`,
    source: "Pokémon TCG API",
    name: c.name,
    number: String(c.number ?? ""),
    setTotal: c.set?.printedTotal ? String(c.set.printedTotal) : "",
    setId: c.set?.id || "",
    setName: c.set?.name || "",
    setCode: c.set?.ptcgoCode || "",
    releaseDate: (c.set?.releaseDate || "").replace(/\//g, "-"),
    rarity: c.rarity || "",
    images: c.images ? { small: c.images.small, large: c.images.large } : null,
    variants: Object.entries(prices)
      .map(([k, v]) => variantEntry(k, v || {}))
      .filter((v) => v.market || v.mid || v.low),
    cardmarket: cm
      ? {
          unit: "EUR",
          trend: price(cm.trendPrice),
          avg1: price(cm.avg1),
          avg7: price(cm.avg7),
          avg30: price(cm.avg30),
          low: price(cm.lowPrice),
          avg: price(cm.averageSellPrice),
          foil: {
            trend: price(cm.reverseHoloTrend),
            avg7: price(cm.reverseHoloAvg7),
            avg30: price(cm.reverseHoloAvg30),
            low: price(cm.reverseHoloLow),
          },
        }
      : null,
    links: { tcgplayer: c.tcgplayer?.url || null, cardmarket: c.cardmarket?.url || null },
    pricesUpdatedAt: c.tcgplayer?.updatedAt || c.cardmarket?.updatedAt || null,
  };
}

function ptcgHeaders() {
  const key = process.env.POKEMONTCG_API_KEY;
  return key ? { "X-Api-Key": key } : {};
}

const q = (s) => `"${String(s).replace(/["\\]/g, "")}"`;

async function ptcgSearch(hint) {
  const tries = [];
  const num = normNumber(hint.number);
  const total = parseInt(hint.setTotal, 10);
  if (hint.name && num && total) tries.push(`name:${q(hint.name)} number:${num} set.printedTotal:${total}`);
  if (hint.name && num) tries.push(`name:${q(hint.name)} number:${num}`);
  if (num && total) tries.push(`number:${num} set.printedTotal:${total}`);
  if (hint.name) tries.push(`name:${q(hint.name)}`);
  const base = pokemonBaseName(hint.name);
  if (base && base !== hint.name) tries.push(`name:${q(base)}${num ? ` number:${num}` : ""}`);

  for (const query of tries) {
    const url = `${PTCG}/cards?q=${encodeURIComponent(query)}&pageSize=20&orderBy=-set.releaseDate`;
    const res = await fetchJson(url, { headers: ptcgHeaders(), timeoutMs: 15000 });
    if (res?.data?.length) return res.data.map(normalizePtcgCard);
  }
  return [];
}

// ───────────────────────── scoring + public API ─────────────────────────

export function scorePokemon(card, hint) {
  let s = 0;
  const why = [];
  const sim = nameSimilarity(card.name, hint.name);
  s += sim * 30;
  if (sim === 1) why.push("name");
  if (hint.number && normNumber(card.number) === normNumber(hint.number)) {
    s += 40;
    why.push("number");
  }
  if (hint.setTotal && card.setTotal && parseInt(card.setTotal, 10) === parseInt(hint.setTotal, 10)) {
    s += 20;
    why.push("set size");
  }
  if (hint.setCode && card.setCode && normSetCode(card.setCode) === normSetCode(hint.setCode)) {
    s += 15;
    why.push("set code");
  }
  if (hint.setName && card.setName && nameSimilarity(card.setName, hint.setName) >= 0.8) {
    s += 10;
    why.push("set name");
  }
  if (card.variants.some((v) => v.market || v.mid)) s += 2; // tie-breaker: prefer priced records
  return { score: Math.round(s), matched: why };
}

function rank(cards, hint) {
  return cards
    .map((c) => ({ ...c, match: scorePokemon(c, hint) }))
    .sort((a, b) => b.match.score - a.match.score);
}

const hasPrices = (c) => c?.variants?.some((v) => v.market || v.mid || v.low);

/**
 * hint: { name, number, setTotal, setCode, setName }
 * Returns { results, provider, warnings }
 */
export async function searchPokemon(hint) {
  const warnings = [];
  let results = [];
  let provider = "TCGdex";
  try {
    results = rank(await tcgdexSearch(hint), hint);
  } catch (e) {
    warnings.push(`TCGdex unavailable (${e.message})`);
  }

  if (!results.length || !hasPrices(results[0])) {
    try {
      const alt = rank(await ptcgSearch(hint), hint);
      if (alt.length && (!results.length || (hasPrices(alt[0]) && alt[0].match.score >= results[0].match.score))) {
        results = alt;
        provider = "Pokémon TCG API";
      }
    } catch (e) {
      warnings.push(`Pokémon TCG API unavailable (${e.message})`);
    }
  }
  if (!results.length && warnings.length === 2) throw new HttpError(502, `Card databases are unreachable right now. ${warnings.join("; ")}`);
  return { results: results.slice(0, 12), provider, warnings };
}

export async function getPokemonCard(id) {
  const [prov, raw] = [id.slice(0, id.indexOf(":")), id.slice(id.indexOf(":") + 1)];
  if (prov === "tcgdex") return normalizeTcgdexCard(await fetchJson(`${TCGDEX}/cards/${encodeURIComponent(raw)}`));
  if (prov === "ptcg") {
    const res = await fetchJson(`${PTCG}/cards/${encodeURIComponent(raw)}`, { headers: ptcgHeaders() });
    return normalizePtcgCard(res.data);
  }
  throw new HttpError(400, `Unknown Pokémon card id: ${id}`);
}

