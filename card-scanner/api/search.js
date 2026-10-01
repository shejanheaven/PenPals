import { json, route, queryOf, errorJson, PRICE_CACHE } from "./_lib/http.js";
import { searchPokemon } from "./_lib/pokemon.js";
import { searchYugioh } from "./_lib/yugioh.js";

// GET /api/search?game=pokemon&name=Charizard&number=4&total=102&setCode=&setName=&rarity=
export const GET = route(async (request) => {
  const q = queryOf(request);
  const game = q.get("game");
  const hint = {
    name: (q.get("name") || "").trim(),
    number: (q.get("number") || "").trim(),
    setTotal: (q.get("total") || "").trim(),
    setCode: (q.get("setCode") || "").trim(),
    setName: (q.get("setName") || "").trim(),
    rarity: (q.get("rarity") || "").trim(),
  };
  if (!hint.name && !hint.setCode) return errorJson(400, "Enter a card name or set code");
  if (game === "pokemon") return json(await searchPokemon(hint), { cache: PRICE_CACHE });
  if (game === "yugioh") return json(await searchYugioh(hint), { cache: PRICE_CACHE });
  return errorJson(400, "game must be pokemon or yugioh");
});
