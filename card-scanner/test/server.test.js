import { test } from "node:test";
import assert from "node:assert/strict";
import "./mock-upstream.js"; // patches fetch with fixture responses
import { normNumber, ygoCodeCore, pokemonBaseName, nameSimilarity } from "../api/_lib/match.js";
import { normalizeTcgdexCard, normalizePtcgCard, searchPokemon } from "../api/_lib/pokemon.js";
import { searchYugioh, normalizeYgoCard, pickPrinting } from "../api/_lib/yugioh.js";
import { summarizeListings } from "../api/_lib/ebay.js";
import { normalizePriceCharting } from "../api/_lib/pricecharting.js";
import { IDENTIFY_SCHEMA } from "../api/_lib/claude.js";
import * as fx from "./fixtures.js";
import { POST as identify } from "../api/identify.js";
import { GET as search } from "../api/search.js";
import { GET as ebayRoute } from "../api/ebay.js";
import { GET as img } from "../api/img.js";

test("number / set-code normalization", () => {
  assert.equal(normNumber("025"), "25");
  assert.equal(normNumber("4/102"), "4");
  assert.equal(normNumber("TG05"), "TG5");
  assert.equal(normNumber("SWSH050"), "SWSH50");
  assert.equal(ygoCodeCore("LOB-EN001"), ygoCodeCore("LOB-E001"));
  assert.equal(ygoCodeCore("LOB-EN001"), ygoCodeCore("lob-001"));
  assert.equal(pokemonBaseName("Charizard ex"), "Charizard");
  assert.equal(nameSimilarity("Pokémon Charizard", "pokemon charizard"), 1);
});

test("TCGdex normalization maps variants and prices", () => {
  const c = normalizeTcgdexCard(fx.tcgdexCards["base1-4"]);
  assert.equal(c.id, "tcgdex:base1-4");
  assert.equal(c.setTotal, "102");
  assert.equal(c.variants[0].key, "holofoil");
  assert.equal(c.variants[0].market, 412.37);
  assert.equal(c.cardmarket.trend, 362.4);
  assert.equal(c.cardmarket.foil.trend, null); // 0 means "no data"
  assert.equal(c.images.large, "https://assets.tcgdex.net/en/base/base1/4/high.webp");
});

test("pokemontcg.io normalization", () => {
  const c = normalizePtcgCard(fx.ptcgCharizard.data[0]);
  assert.equal(c.id, "ptcg:base1-4");
  assert.equal(c.setCode, "BS");
  assert.equal(c.variants[0].market, 405);
  assert.equal(c.releaseDate, "1999-01-09");
});

test("Pokémon search ranks the exact printing first (number + set size)", async () => {
  const { results, provider } = await searchPokemon({ name: "Charizard", number: "4", setTotal: "102" });
  assert.equal(provider, "TCGdex");
  assert.equal(results[0].id, "tcgdex:base1-4");
  assert.ok(results[0].match.score > results[1].match.score);
  assert.equal(results[1].id, "tcgdex:base4-4");
});

test("Yu-Gi-Oh! search by set code picks the right printing", async () => {
  const { results } = await searchYugioh({ name: "Blue-Eyes White Dragon", setCode: "LOB-EN001", rarity: "Ultra Rare" });
  assert.equal(results.length, 1);
  assert.equal(results[0].printingKey, "LOB-EN001|Ultra Rare");
  assert.match(results[0].images.large, /^\/api\/img\?u=/);
});

test("Yu-Gi-Oh! printing pick uses rarity when one code has several", () => {
  const c = normalizeYgoCard(fx.ygoBlueEyes);
  assert.equal(pickPrinting(c, { setCode: "SDBE-EN001", rarity: "Common" }).rarity, "Common");
  assert.equal(pickPrinting(c, { setCode: "SDBE-EN001", rarity: "Ultra Rare" }).rarity, "Ultra Rare");
});

test("eBay listing summary drops junk, graded and wrong-printing listings", () => {
  const s = summarizeListings(fx.ebaySearchResponse.itemSummaries, { mustInclude: ["4/102", "004/102"] });
  assert.equal(s.strictMatch, true);
  assert.equal(s.count, 4); // 449.99, 399+5, 360+4.5, 1200 — no PSA, no lot/proxy, no title without number
  assert.equal(s.low, 364.5);
  const graded = summarizeListings(fx.ebaySearchResponse.itemSummaries, { graded: true, gradeLabel: "PSA 9" });
  assert.equal(graded.count, 1);
  const unlimited = summarizeListings(fx.ebaySearchResponse.itemSummaries, { mustInclude: ["4/102", "004/102"], exclude: ["shadowless", "1st edition"] });
  assert.equal(unlimited.count, 3); // the $1,200 Shadowless listing is a different printing
  const none = summarizeListings(fx.ebaySearchResponse.itemSummaries, { graded: true, gradeLabel: "PSA 10" });
  assert.equal(none.count, 0);
});

test("PriceCharting pennies → dollars with grade fields", () => {
  const p = normalizePriceCharting(fx.priceChartingResponse.products[0]);
  assert.equal(p.prices.ungraded, 389);
  assert.equal(p.prices.psa10, 11500);
  assert.equal(p.prices.grade9_5, 4200);
});

test("structured-output schema: every object is closed and fully required", () => {
  const walk = (s, path) => {
    if (s.type === "object") {
      assert.equal(s.additionalProperties, false, path);
      assert.deepEqual(s.required.sort(), Object.keys(s.properties).sort(), path);
      for (const [k, v] of Object.entries(s.properties)) walk(v, `${path}.${k}`);
    }
    if (s.type === "array") walk(s.items, `${path}[]`);
  };
  walk(IDENTIFY_SCHEMA, "root");
});

const req = (url, init) => new Request(`http://localhost${url}`, init);
const tinyJpeg = "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQ==";

test("POST /api/identify returns identification + ranked candidates", async () => {
  const res = await identify(req("/api/identify", { method: "POST", body: JSON.stringify({ front: tinyJpeg }) }));
  assert.equal(res.status, 200);
  const data = await res.json();
  assert.equal(data.identification.name, "Charizard");
  assert.equal(data.candidates[0].id, "tcgdex:base1-4");
});

test("POST /api/identify validates the photo", async () => {
  const res = await identify(req("/api/identify", { method: "POST", body: JSON.stringify({ front: "nope" }) }));
  assert.equal(res.status, 400);
});

test("passcode is enforced when APP_PASSCODE is set", async () => {
  process.env.APP_PASSCODE = "pikachu";
  try {
    const denied = await identify(req("/api/identify", { method: "POST", body: JSON.stringify({ front: tinyJpeg }) }));
    assert.equal(denied.status, 401);
    const ok = await ebayRoute(req("/api/ebay?q=charizard", { headers: { "x-app-passcode": "pikachu" } }));
    assert.equal(ok.status, 200);
  } finally {
    delete process.env.APP_PASSCODE;
  }
});

test("GET /api/search validates input and caches results", async () => {
  assert.equal((await search(req("/api/search?game=pokemon"))).status, 400);
  const res = await search(req("/api/search?game=yugioh&name=Blue-Eyes%20White%20Dragon"));
  assert.equal(res.status, 200);
  assert.match(res.headers.get("cache-control"), /s-maxage/);
});

test("image proxy only serves allow-listed hosts", async () => {
  assert.equal((await img(req("/api/img?u=" + encodeURIComponent("https://evil.example.com/x.jpg")))).status, 400);
  const ok = await img(req("/api/img?u=" + encodeURIComponent("https://images.ygoprodeck.com/images/cards/1.jpg")));
  assert.equal(ok.status, 200);
  assert.match(ok.headers.get("cache-control"), /immutable/);
});
