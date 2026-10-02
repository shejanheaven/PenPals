import { test } from "node:test";
import assert from "node:assert/strict";
import "./mock-upstream.js"; // patches fetch with fixture responses
import { normalizeScryfallCard, searchMtg, getMtgCard } from "../api/_lib/mtg.js";
import { estimateValue, nearMintReference } from "../src/lib/pricing.js";
import { defaultSelection, numberLabel, selectionOptions, subtitle } from "../src/lib/cards.js";
import { excludeTokens, listingKeywords, mustIncludeTokens, priceChartingQuery, tcgplayerUrl } from "../src/lib/links.js";
import { summarizeListings } from "../api/_lib/ebay.js";
import * as fx from "./fixtures.js";
import { POST as identify } from "../api/identify.js";
import { GET as search } from "../api/search.js";
import { GET as cardRoute } from "../api/card.js";

const m10 = normalizeScryfallCard(fx.scryfallBoltPrints[1]);
const sta = normalizeScryfallCard(fx.scryfallBoltPrints[2]);
const req = (url, init) => new Request(`http://localhost${url}`, init);

test("Scryfall normalization: one variant per finish, TCGplayer prices", () => {
  assert.equal(m10.game, "mtg");
  assert.equal(m10.id, "scry:bolt-m10");
  assert.equal(m10.setCode, "M10");
  assert.equal(m10.number, "146");
  assert.equal(m10.rarity, "Common");
  assert.deepEqual(
    m10.variants.map((v) => [v.key, v.market]),
    [["nonfoil", 3.05], ["foil", 38.5]],
  );
  assert.deepEqual(sta.variants.map((v) => v.key), ["nonfoil", "foil", "etched"]);
  assert.equal(sta.variants[2].market, 9.75);
  assert.equal(m10.images.large, "https://cards.scryfall.io/large/front/bolt-m10.jpg");
  assert.equal(m10.cardmarket.foil.trend, 30);
});

test("double-faced cards take the front face image and type", () => {
  const { image_uris, ...rest } = fx.scryfallBoltPrints[0];
  void image_uris;
  const dfc = normalizeScryfallCard({ ...rest, type_line: undefined, card_faces: [{ type_line: "Creature", image_uris: { small: "s.jpg", normal: "n.jpg" } }] });
  assert.deepEqual(dfc.images, { small: "s.jpg", large: "n.jpg" });
  assert.equal(dfc.type, "Creature");
});

test("Magic search: set code + number puts the exact printing first", async () => {
  const r = await searchMtg({ name: "Lightning Bolt", setCode: "M10", number: "0146" });
  assert.equal(r.provider, "Scryfall");
  assert.equal(r.results[0].id, "scry:bolt-m10");
  assert.deepEqual(r.results[0].match.matched, ["name", "set code", "number"]);
  assert.equal(r.results.length, 3); // no duplicates from the exact + name lookups
});

test("Magic search: misspelled name falls back to Scryfall fuzzy match", async () => {
  const r = await searchMtg({ name: "Lightnin Bolt" });
  assert.equal(r.results.length, 3);
  assert.equal(r.results[0].name, "Lightning Bolt");
});

test("Magic search: unknown card returns no results instead of failing", async () => {
  const r = await searchMtg({ name: "Not A Real Card" });
  assert.deepEqual(r.results, []);
});

test("Magic pricing uses the selected finish", () => {
  assert.equal(estimateValue({ card: m10, selection: "foil", condition: "NM" }).value, 38.5);
  assert.equal(estimateValue({ card: m10, selection: "nonfoil", condition: "NM" }).value, 3.05);
  assert.equal(estimateValue({ card: m10, selection: "nonfoil", condition: "LP" }).value, 2.44);
  // No USD price: falls back to Cardmarket for the same finish, converted.
  const eurOnly = { ...m10, variants: m10.variants.map((v) => ({ ...v, market: null })) };
  const ref = nearMintReference(eurOnly, "foil");
  assert.equal(ref.value, 34.5);
  assert.equal(ref.confidence, "low");
});

test("Magic display helpers and default finish", () => {
  assert.equal(numberLabel(m10), "M10 #146");
  assert.equal(subtitle(m10, "foil"), "Magic 2010 · M10 #146 · Common");
  assert.deepEqual(selectionOptions(m10).map((o) => o.label), ["Normal", "Foil"]);
  assert.equal(defaultSelection(m10, { finish: "foil" }), "foil");
  assert.equal(defaultSelection(m10, { finish: "non-holo" }), "nonfoil");
  assert.equal(defaultSelection(sta, { finish: "etched-foil" }), "etched");
  assert.equal(defaultSelection(m10, { finish: "etched-foil" }), "nonfoil"); // M10 has no etched printing
});

test("Magic eBay comps keep 'Non-Foil' titles but drop foils for a normal copy", () => {
  const ex = excludeTokens(m10, "nonfoil");
  const items = ["Lightning Bolt Magic 2010 Non-Foil NM", "Lightning Bolt Magic 2010 Foil NM", "Lightning Bolt M10 Magic 2010 NM"].map((title) => ({
    title,
    price: { value: "3.00" },
  }));
  const s = summarizeListings(items, { mustInclude: mustIncludeTokens(m10, "nonfoil"), exclude: ex });
  assert.equal(s.count, 2);
  assert.match(listingKeywords(m10, "foil"), /Lightning Bolt Magic 2010 foil/);
  assert.match(priceChartingQuery(m10), /^magic Magic 2010 Lightning Bolt$/);
  assert.match(tcgplayerUrl(m10), /tcgplayer\.com\/product\/mock-bolt-m10/);
});

test("POST /api/identify with a Magic hint matches the exact printing", async () => {
  const res = await identify(req("/api/identify", { method: "POST", body: JSON.stringify({ front: "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQ==", gameHint: "mtg" }) }));
  assert.equal(res.status, 200);
  const data = await res.json();
  assert.equal(data.identification.game, "mtg");
  assert.equal(data.provider, "Scryfall");
  assert.equal(data.candidates[0].id, "scry:bolt-m10");
});

test("GET /api/search and /api/card accept Magic", async () => {
  const s = await search(req("/api/search?game=mtg&name=Lightning%20Bolt"));
  assert.equal(s.status, 200);
  assert.equal((await s.json()).results.length, 3);
  const c = await cardRoute(req("/api/card?id=scry:bolt-sta"));
  assert.equal((await c.json()).card.variants.length, 3);
  assert.equal((await cardRoute(req("/api/card?id=scry:missing"))).status, 404);
  assert.equal(await getMtgCard("scry:bolt-2x2").then((x) => x.setName), "Double Masters 2022");
});
