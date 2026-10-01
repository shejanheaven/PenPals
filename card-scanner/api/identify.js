import { json, route, checkPasscode, errorJson, HttpError, withTimeout } from "./_lib/http.js";
import { identifyCard } from "./_lib/claude.js";
import { searchPokemon } from "./_lib/pokemon.js";
import { searchYugioh } from "./_lib/yugioh.js";

// POST /api/identify  { front: dataURL, back?: dataURL, gameHint?: "auto"|"pokemon"|"yugioh" }
// → { identification, candidates, provider, warnings }
export const POST = route(async (request) => {
  const denied = checkPasscode(request);
  if (denied) return denied;

  const started = Date.now();
  let body;
  try {
    body = await request.json();
  } catch {
    return errorJson(400, "Expected a JSON body");
  }
  const { result: id, model } = await identifyCard({
    front: body.front,
    back: body.back || null,
    gameHint: body.gameHint || "auto",
  });

  let lookup = { results: [], provider: null, warnings: [] };
  if (id.is_card && (id.game === "pokemon" || id.game === "yugioh")) {
    // Whatever time Claude left us inside the 60 s function limit.
    const budget = Math.max(5000, 57_000 - (Date.now() - started));
    try {
      lookup = await withTimeout(
        id.game === "pokemon"
          ? searchPokemon({
              name: id.name,
              number: id.collector_number,
              setTotal: id.set_total,
              setCode: id.set_code,
              setName: id.set_name,
            })
          : searchYugioh({ name: id.name, setCode: id.set_code, rarity: id.rarity }),
        budget,
        "Card database lookup",
      );
    } catch (e) {
      lookup.warnings.push(e instanceof HttpError ? e.message : "Card database lookup failed");
    }
  }
  return json({ identification: id, model, candidates: lookup.results, provider: lookup.provider, warnings: lookup.warnings });
});
