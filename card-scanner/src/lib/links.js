// Search strings + outbound links for checking real sold prices.

const EXCLUDE = "-lot -proxy -custom -orica";

function pokemonNumberTokens(card) {
  if (!card.number) return [];
  const n = card.number;
  if (!card.setTotal) return [n];
  const padded = /^\d+$/.test(n) ? n.padStart(3, "0") : n;
  return [...new Set([`${n}/${card.setTotal}`, `${padded}/${card.setTotal}`])];
}

/** Words that pin down this printing in a listing title. */
export function listingKeywords(card, selection) {
  if (card.game === "pokemon") {
    const parts = [card.name, pokemonNumberTokens(card)[0] || card.number, card.setName];
    if (selection === "reverseHolofoil") parts.push("reverse holo");
    if (selection?.startsWith("1stEdition")) parts.push("1st edition");
    return parts.filter(Boolean).join(" ");
  }
  const p = card.printings?.find((x) => x.key === selection);
  return [card.name, p?.setCode, p?.rarity].filter(Boolean).join(" ");
}

/** Tokens a listing title must contain to count as the same printing. */
export function mustIncludeTokens(card, selection) {
  if (card.game === "pokemon") return pokemonNumberTokens(card);
  const p = card.printings?.find((x) => x.key === selection);
  return p?.setCode ? [p.setCode] : [];
}

/** Listing-title words that mean a *different* printing than the one selected. */
export function excludeTokens(card, selection, edition) {
  if (card.game !== "pokemon") return edition === "Unlimited" ? ["1st edition", "1st ed"] : [];
  const out = [];
  if (!selection?.startsWith("1stEdition")) out.push("1st edition", "1st ed");
  if (selection !== "reverseHolofoil") out.push("reverse holo", "reverse");
  if (edition !== "Shadowless") out.push("shadowless");
  return out;
}

export function gradeLabel(graded) {
  return graded?.company && graded?.grade ? `${graded.company} ${graded.grade}` : "";
}

export function ebaySearchQuery(card, selection, graded) {
  return [listingKeywords(card, selection), gradeLabel(graded)].filter(Boolean).join(" ");
}

/** eBay completed + sold listings for this exact card: the best reality check there is. */
export function ebaySoldUrl(card, selection, graded) {
  const q = `${ebaySearchQuery(card, selection, graded)} ${EXCLUDE}`;
  const cond = graded?.company ? "2750" : "4000"; // eBay trading-card condition IDs: graded / ungraded
  return `https://www.ebay.com/sch/i.html?_nkw=${encodeURIComponent(q)}&_sacat=183454&LH_Sold=1&LH_Complete=1&LH_ItemCondition=${cond}&_sop=13&rt=nc`;
}

export function ebayActiveUrl(card, selection, graded) {
  const q = `${ebaySearchQuery(card, selection, graded)} ${EXCLUDE}`;
  return `https://www.ebay.com/sch/i.html?_nkw=${encodeURIComponent(q)}&_sacat=183454&LH_BIN=1&_sop=15&rt=nc`;
}

export function priceChartingQuery(card, selection) {
  if (card.game === "pokemon") return ["pokemon", card.setName, card.name, card.number].filter(Boolean).join(" ");
  const p = card.printings?.find((x) => x.key === selection);
  return ["yugioh", card.name, p?.setCode].filter(Boolean).join(" ");
}

export function priceChartingUrl(card, selection) {
  return `https://www.pricecharting.com/search-products?type=prices&q=${encodeURIComponent(priceChartingQuery(card, selection))}`;
}

export function tcgplayerUrl(card) {
  if (card.links?.tcgplayer) return card.links.tcgplayer;
  const game = card.game === "pokemon" ? "pokemon" : "yugioh";
  return `https://www.tcgplayer.com/search/${game}/product?q=${encodeURIComponent(card.name)}&view=grid`;
}
