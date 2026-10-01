// Display helpers + mapping what Claude saw onto database variants.

export const GAME_LABEL = { pokemon: "Pokémon", yugioh: "Yu-Gi-Oh!" };

export function numberLabel(card) {
  if (card.game === "pokemon") return card.setTotal ? `${card.number}/${card.setTotal}` : card.number ? `#${card.number}` : "";
  return "";
}

/** Options the user can choose between: Pokémon variants or Yu-Gi-Oh! printings. */
export function selectionOptions(card) {
  if (card.game === "pokemon") return (card.variants || []).map((v) => ({ key: v.key, label: v.label, price: v.market ?? v.mid ?? v.low }));
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
  if (card.game === "pokemon") return [card.setName, numberLabel(card), card.rarity].filter(Boolean).join(" · ");
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
