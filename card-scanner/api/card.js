import { json, route, queryOf, errorJson, PRICE_CACHE } from "./_lib/http.js";
import { getPokemonCard } from "./_lib/pokemon.js";
import { getYugiohCard } from "./_lib/yugioh.js";
import { getMtgCard } from "./_lib/mtg.js";

// GET /api/card?id=tcgdex:base1-4 | ptcg:base1-4 | ygo:46986414 | scry:<uuid>  — fresh card data + prices
export const GET = route(async (request) => {
  const id = queryOf(request).get("id") || "";
  if (id.startsWith("ygo:")) return json({ card: await getYugiohCard(id) }, { cache: PRICE_CACHE });
  if (id.startsWith("scry:")) return json({ card: await getMtgCard(id) }, { cache: PRICE_CACHE });
  if (id.startsWith("tcgdex:") || id.startsWith("ptcg:")) return json({ card: await getPokemonCard(id) }, { cache: PRICE_CACHE });
  return errorJson(400, "Unknown card id");
});
