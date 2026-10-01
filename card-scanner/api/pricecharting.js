import { json, route, queryOf, checkPasscode, errorJson } from "./_lib/http.js";
import { searchPriceCharting } from "./_lib/pricecharting.js";

// GET /api/pricecharting?q=pokemon charizard base set 4
export const GET = route(async (request) => {
  const denied = checkPasscode(request);
  if (denied) return denied;
  const q = (queryOf(request).get("q") || "").trim();
  if (!q) return errorJson(400, "Missing q");
  return json(await searchPriceCharting(q), { cache: "private, max-age=3600" });
});
