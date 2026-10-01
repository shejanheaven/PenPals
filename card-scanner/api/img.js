import { route, queryOf, errorJson } from "./_lib/http.js";

// Cached image proxy for card art from hosts that ask not to be hotlinked.
const ALLOWED = new Set(["images.ygoprodeck.com", "assets.tcgdex.net", "images.pokemontcg.io"]);

export const GET = route(async (request) => {
  let src;
  try {
    src = new URL(queryOf(request).get("u") || "");
  } catch {
    return errorJson(400, "Bad image URL");
  }
  if (src.protocol !== "https:" || !ALLOWED.has(src.hostname)) return errorJson(400, "Image host not allowed");
  const upstream = await fetch(src, { redirect: "error", signal: AbortSignal.timeout(10000) });
  const type = upstream.headers.get("content-type") || "";
  if (!upstream.ok || !type.startsWith("image/")) return errorJson(502, "Image unavailable");
  return new Response(upstream.body, {
    headers: {
      "content-type": type,
      "cache-control": "public, max-age=604800, s-maxage=31536000, immutable",
    },
  });
});
