import { test } from "node:test";
import assert from "node:assert/strict";
import {
  estimateValue,
  ebayFees,
  tcgplayerFees,
  whatnotFees,
  platformPayouts,
  shippingCost,
  nearMintReference,
  gradedField,
  mergeSettings,
  DEFAULT_SETTINGS,
} from "../src/lib/pricing.js";
import { ebaySoldUrl, mustIncludeTokens, listingKeywords, excludeTokens } from "../src/lib/links.js";
import { normalizeTcgdexCard } from "../api/_lib/pokemon.js";
import { normalizeYgoCard } from "../api/_lib/yugioh.js";
import { tcgdexCards, ygoBlueEyes } from "./fixtures.js";

const charizard = normalizeTcgdexCard(tcgdexCards["base1-4"]);
const blueEyes = normalizeYgoCard(ygoBlueEyes);
const near = (a, b, eps = 0.011) => assert.ok(Math.abs(a - b) <= eps, `${a} ≈ ${b}`);

test("eBay fees: 13.25% of price+tax plus per-order fee", () => {
  const f = ebayFees(100, { salesTaxRate: 0.075 });
  near(f.finalValue, 107.5 * 0.1325);
  assert.equal(f.perOrder, 0.4);
  near(f.total, 107.5 * 0.1325 + 0.4);
  assert.equal(ebayFees(5, { salesTaxRate: 0 }).perOrder, 0.3);
});

test("eBay fees: tier above $7,500 drops to 2.35%", () => {
  const f = ebayFees(10000, { salesTaxRate: 0 });
  near(f.finalValue, 7500 * 0.1325 + 2500 * 0.0235);
});

test("eBay store subscriber rate and high-value promo", () => {
  near(ebayFees(100, { salesTaxRate: 0, ebay: { store: true } }).finalValue, 12.7);
  const promo = ebayFees(2000, { salesTaxRate: 0, ebay: { highValuePromo: true } });
  near(promo.finalValue, 2000 * 0.1325 * 0.5);
});

test("TCGplayer commission caps at $75", () => {
  const f = tcgplayerFees(1000, { salesTaxRate: 0 });
  assert.equal(f.commission, 75);
  near(f.processing, 1000 * 0.025 + 0.3);
});

test("Whatnot commission stops at $1,500", () => {
  near(whatnotFees(2000, { salesTaxRate: 0 }).commission, 120);
});

test("shipping: Standard Envelope only for items ≤ $20", () => {
  const s = DEFAULT_SETTINGS.shipping;
  near(shippingCost(15, "ebay"), s.envelopeLabel + s.envelopeSupplies);
  near(shippingCost(25, "ebay"), s.trackedLabel + s.trackedSupplies);
});

test("platform payouts are sorted best-first and never exceed sale price", () => {
  const rows = platformPayouts(50);
  assert.equal(rows.length, 6);
  for (let i = 1; i < rows.length; i++) assert.ok(rows[i - 1].net >= rows[i].net);
  for (const r of rows) assert.ok(r.net <= 50);
  const ebay = rows.find((r) => r.key === "ebay");
  near(ebay.net, 50 - ebay.fees - ebay.shipping);
});

test("cheap cards: tracked-shipping platforms go negative (realistic)", () => {
  const rows = platformPayouts(2);
  assert.ok(rows.find((r) => r.key === "mercari").net < 0);
});

test("NM reference prefers TCGplayer market for the chosen variant", () => {
  const ref = nearMintReference(charizard, "holofoil");
  assert.equal(ref.value, 412.37);
  assert.equal(ref.confidence, "high");
});

test("condition multiplier applied to NM base", () => {
  const e = estimateValue({ card: charizard, selection: "holofoil", condition: "LP" });
  near(e.value, 412.37 * 0.8);
  assert.equal(e.confidence, "high");
  assert.ok(e.quick < e.value && e.patient > e.value);
});

test("PriceCharting ungraded blends with TCGplayer when close", () => {
  const e = estimateValue({ card: charizard, selection: "holofoil", condition: "NM", pricecharting: { prices: { ungraded: 389 } } });
  near(e.nmBase, (412.37 + 389) / 2);
});

test("PriceCharting ignored when it looks like a different printing", () => {
  const e = estimateValue({ card: charizard, selection: "holofoil", condition: "NM", pricecharting: { prices: { ungraded: 4000 } } });
  assert.equal(e.nmBase, 412.37);
  assert.ok(e.notes.some((n) => /different printing/.test(n)));
});

test("graded uses the grade-specific sold price", () => {
  assert.equal(gradedField("PSA", "10"), "psa10");
  assert.equal(gradedField("BGS", "9.5"), "grade9_5");
  assert.equal(gradedField("CGC", "8.5"), "grade8");
  const e = estimateValue({
    card: charizard,
    selection: "holofoil",
    graded: { company: "PSA", grade: "9" },
    pricecharting: { prices: { grade9: 2600 } },
  });
  assert.equal(e.value, 2600);
  assert.equal(e.condition, "PSA 9");
});

test("graded without data says so instead of inventing a number", () => {
  const e = estimateValue({ card: charizard, selection: "holofoil", graded: { company: "PSA", grade: "10" } });
  assert.equal(e.value, null);
  assert.ok(e.notes.length > 0);
});

test("Yu-Gi-Oh!: uses exact printing price, not the cheapest reprint", () => {
  const e = estimateValue({ card: blueEyes, selection: "LOB-EN001|Ultra Rare", condition: "NM" });
  assert.equal(e.value, 185.33);
  const cheap = estimateValue({ card: blueEyes, selection: "nope", condition: "NM" });
  assert.equal(cheap.confidence, "low");
});

test("settings merge keeps nested defaults", () => {
  const s = mergeSettings({ shipping: { trackedLabel: 5 } });
  assert.equal(s.shipping.trackedLabel, 5);
  assert.equal(s.shipping.envelopeLabel, DEFAULT_SETTINGS.shipping.envelopeLabel);
  assert.equal(s.conditionMultipliers.LP, 0.8);
});

test("eBay sold-listings link targets this exact printing", () => {
  const url = new URL(ebaySoldUrl(charizard, "holofoil"));
  assert.equal(url.searchParams.get("LH_Sold"), "1");
  assert.match(url.searchParams.get("_nkw"), /Charizard 4\/102 Base Set/);
  assert.deepEqual(mustIncludeTokens(charizard, "holofoil"), ["4/102", "004/102"]);
  assert.match(listingKeywords(blueEyes, "LOB-EN001|Ultra Rare"), /LOB-EN001 Ultra Rare/);
  const graded = new URL(ebaySoldUrl(charizard, "holofoil", { company: "PSA", grade: "10" }));
  assert.match(graded.searchParams.get("_nkw"), /PSA 10/);
  assert.equal(graded.searchParams.get("LH_ItemCondition"), "2750");
});

test("eBay comps exclude other printings of the same card", () => {
  assert.ok(excludeTokens(charizard, "holofoil", "Unlimited").includes("shadowless"));
  assert.ok(excludeTokens(charizard, "holofoil").includes("1st edition"));
  assert.ok(!excludeTokens(charizard, "1stEditionHolofoil").includes("1st edition"));
  assert.ok(!excludeTokens(charizard, "reverseHolofoil").includes("reverse holo"));
  assert.deepEqual(excludeTokens(blueEyes, "LOB-EN001|Ultra Rare", "1st Edition"), []);
});
