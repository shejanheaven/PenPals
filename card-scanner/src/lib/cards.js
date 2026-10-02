// Display helpers + mapping what Claude saw onto database variants.

export const GAME_LABEL = { pokemon: "Pokémon", yugioh: "Yu-Gi-Oh!", mtg: "Magic" };
export const GAMES = Object.entries(GAME_LABEL).map(([value, label]) => ({ value, label }));

/** Pokémon and Magic price per finish (variants); Yu-Gi-Oh! prices per printing. */
export const hasVariants = (card) => card.game === "pokemon" || card.game === "mtg";

export function numberLabel(card) {
  if (card.game === "pokemon") return card.setTotal ? `${card.number}/${card.setTotal}` : card.number ? `#${card.number}` : "";
  if (card.game === "mtg") return [card.setCode, card.number && `#${card.number}`].filter(Boolean).join(" ");
  return "";
}

/** Options the user can choose between: Pokémon/Magic finishes or Yu-Gi-Oh! printings. */
export function selectionOptions(card) {
  if (hasVariants(card)) return (card.variants || []).map((v) => ({ key: v.key, label: v.label, price: v.market ?? v.mid ?? v.low }));
  return (card.printings || []).map((p) => ({ key: p.key, label: `${p.setCode} · ${p.rarity}`, sub: p.setName, price: p.price }));
}

export function selectionLabel(card, key) {
  const o = selectionOptions(card).find((x) => x.key === key);
  return o?.label || "";
}

/** Best variant/printing for an identification result. */
export function defaultSelection(card, ident) {
  if (card.game === "yugioh") return card.printingKey || card.printings?.[0]?.key || null;
  const keys = (card.variants || []).map((v) => v.key);
  if (!keys.length) return null;
  if (card.game === "mtg") {
    const want = ident?.finish === "etched-foil" ? "etched" : ident?.finish === "foil" || ident?.finish === "holo" ? "foil" : "nonfoil";
    return keys.includes(want) ? want : keys[0];
  }
  const first = ident?.edition === "1st Edition";
  const finish = ident?.finish;
  const prefs = [];
  if (first) prefs.push(finish === "non-holo" ? "1stEditionNormal" : "1stEditionHolofoil", "1stEdition");
  if (finish === "reverse-holo") prefs.push("reverseHolofoil");
  if (finish === "holo" || finish === "full-art-textured") prefs.push("holofoil", "unlimitedHolofoil");
  if (finish === "non-holo") prefs.push("normal", "unlimited", "unlimitedNormal");
  return prefs.find((k) => keys.includes(k)) || keys[0];
}

export function subtitle(card, selection) {
  if (hasVariants(card)) return [card.setName, numberLabel(card), card.rarity].filter(Boolean).join(" · ");
  const p = card.printings?.find((x) => x.key === selection);
  return [p?.setName, p?.setCode, p?.rarity].filter(Boolean).join(" · ") || card.type;
}

/** Strip search-only fields before saving a card into a collection. */
export function cardSnapshot(card) {
  const { match, printingKey, ...rest } = card;
  void match;
  void printingKey;
  return rest;
}
