// Helpers for fuzzy-matching what Claude read off the card against database records.

export function normName(s) {
  return String(s || "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // Pokémon -> Pokemon
    .toLowerCase()
    .replace(/[’'`]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** "025" -> "25", "TG05" -> "TG5", "SWSH050" -> "SWSH50", "4/102" -> "4". */
export function normNumber(s) {
  const raw = String(s || "").split("/")[0].trim().toUpperCase().replace(/\s+/g, "");
  if (!raw) return "";
  const m = raw.match(/^([A-Z-]*?)0*(\d+)([A-Z]*)$/);
  if (m) return `${m[1]}${m[2]}${m[3]}`;
  return raw;
}

export function normSetCode(s) {
  return String(s || "").toUpperCase().replace(/\s+/g, "").trim();
}

/** Yu-Gi-Oh set codes: compare ignoring the language segment (LOB-EN001 ~ LOB-E001 ~ LOB-001). */
export function ygoCodeCore(code) {
  const c = normSetCode(code);
  const m = c.match(/^([A-Z0-9]+)-(?:[A-Z]{1,2})?(\d+)$/);
  return m ? `${m[1]}-${Number(m[2])}` : c;
}

/** Pokémon suffix-stripped base name, e.g. "Charizard ex" -> "Charizard", "Pikachu VMAX" -> "Pikachu". */
export function pokemonBaseName(name) {
  return String(name || "")
    .replace(/\s+(ex|EX|GX|V|VMAX|VSTAR|V-UNION|LV\.?\s*X|BREAK|Prism Star|◇|δ|Star)$/i, "")
    .replace(/^(Dark|Light|Shining|Radiant|Galarian|Alolan|Hisuian|Paldean)\s+/i, "")
    .trim();
}

/** 0..1 similarity on word tokens. */
export function nameSimilarity(a, b) {
  const A = normName(a), B = normName(b);
  if (!A || !B) return 0;
  if (A === B) return 1;
  if (A.includes(B) || B.includes(A)) return 0.8;
  const ta = new Set(A.split(" ")), tb = new Set(B.split(" "));
  let hit = 0;
  for (const t of ta) if (tb.has(t)) hit++;
  return hit / Math.max(ta.size, tb.size);
}
