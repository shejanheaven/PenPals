import { json, route, queryOf, checkPasscode, errorJson } from "./_lib/http.js";
import { searchEbayActive } from "./_lib/ebay.js";

// GET /api/ebay?q=...&must=4/102,004/102&exclude=shadowless,1st edition&graded=1&grade=PSA%2010
export const GET = route(async (request) => {
  const denied = checkPasscode(request);
  if (denied) return denied;
  const p = queryOf(request);
  const q = (p.get("q") || "").trim();
  if (!q) return errorJson(400, "Missing q");
  const data = await searchEbayActive({
    q,
    mustInclude: (p.get("must") || "").split(",").map((s) => s.trim()).filter(Boolean),
    exclude: (p.get("exclude") || "").split(",").map((s) => s.trim()).filter(Boolean),
    graded: p.get("graded") === "1",
    gradeLabel: p.get("grade") || "",
  });
  return json(data, { cache: "private, max-age=600" });
});
