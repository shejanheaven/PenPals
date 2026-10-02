// Magic: The Gathering card lookup + prices via Scryfall (free, no key, ~10 req/s).
// Every printing is its own Scryfall card; prices.usd / usd_foil / usd_etched are
// TCGplayer market prices for that exact printing and finish, refreshed daily.

import { fetchJson, price, HttpError } from "./http.js";
import { nameSimilarity, normName, normNumber, normSetCode } from "./match.js";

const SCRYFALL = "https://api.scryfall.com";

export const FINISH_LABELS = { nonfoil: "Normal", foil: "Foil", etched: "Etched Foil" };
const USD_FIELD = { nonfoil: "usd", foil: "usd_foil", etched: "usd_etched" };

const cap = (s) => String(s || "").replace(/^./, (c) => c.toUpperCase());

export function normalizeScryfallCard(c) {
  const p = c.prices || {};
  const finishes = c.finishes?.length ? c.finishes : ["nonfoil"];
  const variants = finishes
    .filter((f) => USD_FIELD[f])
    .map((f) => ({ key: f, label: FINISH_LABELS[f], market: price(p[USD_FIELD[f]]), low: null, mid: null, high: null, directLow: null }));
  // Double-faced cards keep their images on each face.
  const img = c.image_uris || c.card_faces?.[0]?.image_uris || null;
  const eur = price(p.eur);
  const eurFoil = price(p.eur_foil);
  return {
    game: "mtg",
    id: `scry:${c.id}`,
    source: "Scryfall",
    name: c.name,
    type: c.type_line || c.card_faces?.[0]?.type_line || "",
    number: String(c.collector_number ?? ""),
    setTotal: "",
    setId: c.set || "",
    setName: c.set_name || "",
    setCode: String(c.set || "").toUpperCase(),
    releaseDate: c.released_at || "",
    rarity: cap(c.rarity),
    language: c.lang || "en",
    images: img ? { small: img.small || img.normal, large: img.large || img.normal } : null,
    variants,
    cardmarket: eur || eurFoil ? { unit: "EUR", trend: eur, foil: { trend: eurFoil } } : null,
    links: {
      tcgplayer: c.purchase_uris?.tcgplayer || null,
      cardmarket: c.purchase_uris?.cardmarket || null,
      scryfall: c.scryfall_uri || null,
    },
    pricesUpdatedAt: null,
  };
}

export function scoreMtg(card, hint) {
  let s = 0;
  const why = [];
  const sim = nameSimilarity(card.name, hint.name);
  s += sim * 40;
  if (sim === 1) why.push("name");
  if (hint.setCode && normSetCode(hint.setCode) === card.setCode) {
    s += 30;
    why.push("set code");
  }
  if (hint.number && normNumber(hint.number) === normNumber(card.number)) {
    s += 30;
    why.push("number");
  }
  if (!hint.setCode && hint.setName && nameSimilarity(card.setName, hint.setName) >= 0.8) {
    s += 15;
    why.push("set name");
  }
  return { score: Math.round(s), matched: why };
}

const notFound = (e) => e instanceof HttpError && e.status === 404;

async function exactPrinting(setCode, number) {
  try {
    return [await fetchJson(`${SCRYFALL}/cards/${encodeURIComponent(setCode.toLowerCase())}/${encodeURIComponent(number)}`)];
  } catch (e) {
    if (notFound(e)) return [];
    throw e;
  }
}

async function printsOf(name) {
  const q = `!"${name.replace(/"/g, "")}" game:paper`;
  try {
    const res = await fetchJson(`${SCRYFALL}/cards/search?q=${encodeURIComponent(q)}&unique=prints&order=released&dir=desc`);
    return res.data || [];
  } catch (e) {
    if (notFound(e)) return [];
    throw e;
  }
}

async function fuzzyName(name) {
  try {
    return (await fetchJson(`${SCRYFALL}/cards/named?fuzzy=${encodeURIComponent(name)}`)).name || null;
  } catch (e) {
    if (notFound(e)) return null;
    throw e;
  }
}

/** hint: { name, number, setCode, setName } */
export async function searchMtg(hint) {
  const raw = [];
  const warnings = [];
  if (hint.setCode && hint.number) raw.push(...(await exactPrinting(hint.setCode, normNumber(hint.number) || hint.number)));
  if (hint.name) {
    let prints = await printsOf(hint.name);
    if (!prints.length) {
      // Misread or partial name: let Scryfall's fuzzy matcher find the real one.
      const real = await fuzzyName(hint.name);
      if (real && normName(real) !== normName(hint.name)) prints = await printsOf(real);
    }
    raw.push(...prints);
  }

  const seen = new Set();
  const results = raw
    .filter((c) => !seen.has(c.id) && seen.add(c.id))
    .map(normalizeScryfallCard)
    .map((c) => ({ ...c, match: scoreMtg(c, hint) }))
    .sort((a, b) => b.match.score - a.match.score)
    .slice(0, 12);
  if (raw.length > 12) warnings.push("Many printings found. Add the set code and number for an exact match.");
  return { results, provider: "Scryfall", warnings };
}

export async function getMtgCard(id) {
  const raw = id.replace(/^scry:/, "");
  try {
    return normalizeScryfallCard(await fetchJson(`${SCRYFALL}/cards/${encodeURIComponent(raw)}`));
  } catch (e) {
    if (notFound(e)) throw new HttpError(404, "Card not found");
    throw e;
  }
}
