// Pricing engine: turns raw market data into a realistic sale price for *this* copy
// (exact printing + condition or grade), then into take-home money per platform.
// Everything here is pure so it can be unit-tested (see test/pricing.test.js).

export const CONDITIONS = [
  { key: "NM", label: "Near Mint", short: "NM" },
  { key: "LP", label: "Lightly Played", short: "LP" },
  { key: "MP", label: "Moderately Played", short: "MP" },
  { key: "HP", label: "Heavily Played", short: "HP" },
  { key: "DMG", label: "Damaged", short: "DMG" },
];

export const GRADERS = ["PSA", "BGS", "CGC", "SGC", "TAG"];

// Defaults reflect US marketplace fee schedules as of 2026. All editable in Settings.
export const DEFAULT_SETTINGS = {
  // What a played copy sells for relative to Near Mint (TCGplayer-style condition ladder).
  conditionMultipliers: { NM: 1, LP: 0.8, MP: 0.62, HP: 0.42, DMG: 0.28 },
  salesTaxRate: 0.075, // eBay & TCGplayer charge their % fees on the tax the buyer pays too
  eurToUsd: 1.15, // only used when the sole price source is Cardmarket (EUR)
  quickSaleFactor: 0.88, // price that usually sells within days (Best Offer / undercut)
  patientFactor: 1.06, // price you can hold out for with a well-photographed listing

  ebay: {
    store: false, // Store subscribers: 12.7% up to $2,500 instead of 13.25% up to $7,500
    promotedRate: 0, // Promoted Listings ad rate, e.g. 0.03 for 3%
    highValuePromo: false, // eBay promo: 50% off final value fee for singles $1,000+
  },
  shipping: {
    envelopeMax: 20, // eBay Standard Envelope is only allowed for items ≤ $20
    envelopeLabel: 0.82, // eBay Standard Envelope, 1 oz
    stamp: 0.78, // plain envelope + stamp (TCGplayer orders under $20)
    envelopeSupplies: 0.35, // penny sleeve + toploader + envelope
    trackedLabel: 6.5, // USPS Ground Advantage under 1 lb
    trackedSupplies: 1.0, // bubble mailer + toploader + team bag
  },
  localFactor: 0.9, // in-person buyers (Facebook Marketplace, card shows) typically pay ~90% of market
  buylistCash: 0.6, // local game store cash offer, % of market
  buylistCredit: 0.75, // store-credit offer, % of market
};

export function mergeSettings(saved) {
  const d = DEFAULT_SETTINGS;
  const s = saved || {};
  return {
    ...d,
    ...s,
    conditionMultipliers: { ...d.conditionMultipliers, ...(s.conditionMultipliers || {}) },
    ebay: { ...d.ebay, ...(s.ebay || {}) },
    shipping: { ...d.shipping, ...(s.shipping || {}) },
  };
}

const r2 = (n) => (n === null || n === undefined || !Number.isFinite(n) ? null : Math.round(n * 100) / 100);

// ───────────────────────── base (Near Mint) price ─────────────────────────

/** Pick the most trustworthy Near-Mint reference for the chosen printing/variant. */
export function nearMintReference(card, selection, settings = DEFAULT_SETTINGS) {
  if (!card) return null;
  if (card.game === "pokemon") {
    const v = card.variants?.find((x) => x.key === selection) || card.variants?.[0];
    if (v?.market) return { value: v.market, source: `TCGplayer market price (${v.label})`, basis: "recent TCGplayer sales", confidence: "high" };
    if (v?.mid) return { value: v.mid, source: `TCGplayer mid listing (${v.label})`, basis: "current listings, not sales", confidence: "medium" };
    if (v?.low) return { value: v.low, source: `TCGplayer lowest listing (${v.label})`, basis: "cheapest listing in any condition", confidence: "low" };
    const cm = card.cardmarket;
    const eur = (selection === "reverseHolofoil" ? cm?.foil?.trend || cm?.foil?.avg30 : null) || cm?.trend || cm?.avg30;
    if (eur) return { value: r2(eur * settings.eurToUsd), source: `Cardmarket trend €${eur.toFixed(2)} (EU)`, basis: "European sales, converted", confidence: "low" };
    return null;
  }
  if (card.game === "yugioh") {
    const p = card.printings?.find((x) => x.key === selection);
    if (p?.price) return { value: p.price, source: `TCGplayer price for ${p.setCode} (${p.rarity})`, basis: "this exact printing", confidence: "medium" };
    if (card.cardPrices?.tcgplayer)
      return {
        value: card.cardPrices.tcgplayer,
        source: "TCGplayer (cheapest printing of this card)",
        basis: "not specific to your printing",
        confidence: "low",
      };
    if (card.cardPrices?.cardmarket)
      return { value: r2(card.cardPrices.cardmarket * settings.eurToUsd), source: "Cardmarket (EU, cheapest printing)", basis: "European sales, converted", confidence: "low" };
    return null;
  }
  return null;
}

/** PriceCharting price field for a slab grade, e.g. ("PSA", "10") -> psa10. */
export function gradedField(company, grade) {
  const g = parseFloat(grade);
  const c = String(company || "").toUpperCase();
  if (g === 10) return { PSA: "psa10", BGS: "bgs10", CGC: "cgc10", SGC: "sgc10" }[c] || "psa10";
  if (g >= 9.5) return "grade9_5";
  if (g >= 9) return "grade9";
  if (g >= 8) return "grade8";
  if (g >= 7) return "grade7";
  return null;
}

const CONF_RANK = { low: 0, medium: 1, high: 2 };
const minConf = (a, b) => (CONF_RANK[a] <= CONF_RANK[b] ? a : b);

/**
 * input: { card, selection, condition: "NM"|..., graded: {company, grade} | null,
 *          pricecharting: {prices:{...}} | null, ebayActive: {median, count, strictMatch} | null }
 * Returns a realistic sale price (what a buyer pays, before shipping/tax) with its reasoning.
 */
export function estimateValue(input, settingsIn) {
  const settings = mergeSettings(settingsIn);
  const { card, selection, condition = "NM", graded = null, pricecharting = null, ebayActive = null } = input;
  const notes = [];
  const sources = [];
  let value = null;
  let confidence = "low";
  let nmBase = null;
  let multiplier = null;

  if (graded?.company && graded?.grade) {
    const field = gradedField(graded.company, graded.grade);
    const pcVal = field ? pricecharting?.prices?.[field] : null;
    if (pcVal) {
      value = pcVal;
      confidence = "high";
      sources.push({ label: `${graded.company} ${graded.grade} — eBay sold average (PriceCharting)`, value: pcVal });
      if (field === "psa10" && graded.company.toUpperCase() !== "PSA") notes.push("No grader-specific 10 price; using PSA 10.");
    } else if (ebayActive?.median && ebayActive.count >= 3) {
      value = r2(ebayActive.median * 0.9);
      confidence = "low";
      sources.push({ label: `${graded.company} ${graded.grade} — eBay asking median (${ebayActive.count} listings) less 10%`, value });
      notes.push("Graded estimate is based on asking prices. Check eBay sold listings before you price it.");
    } else {
      notes.push("No graded sales data. Add a PriceCharting token or eBay keys, or check eBay sold listings.");
    }
    const ref = nearMintReference(card, selection, settings);
    if (ref) sources.push({ label: `Raw NM reference: ${ref.source}`, value: ref.value });
    return finish();
  }

  const ref = nearMintReference(card, selection, settings);
  const pcRaw = pricecharting?.prices?.ungraded || null;
  if (ref) sources.push({ label: ref.source, value: ref.value, note: ref.basis });
  if (pcRaw) sources.push({ label: "eBay sold average, ungraded (PriceCharting)", value: pcRaw });

  if (ref && pcRaw) {
    const ratio = pcRaw / ref.value;
    if (ratio > 0.5 && ratio < 2) {
      nmBase = r2((ref.value + pcRaw) / 2);
      confidence = ref.confidence === "low" ? "medium" : "high";
      notes.push("Base price blends TCGplayer with recent eBay sales.");
    } else {
      nmBase = ref.value;
      confidence = minConf(ref.confidence, "medium");
      notes.push("The PriceCharting price is far from TCGplayer, so it may be a different printing. It was not used.");
    }
  } else if (ref) {
    nmBase = ref.value;
    confidence = ref.confidence;
  } else if (pcRaw) {
    nmBase = pcRaw;
    confidence = "medium";
  }

  if (nmBase !== null) {
    multiplier = settings.conditionMultipliers[condition] ?? 1;
    value = r2(nmBase * multiplier);
    if (condition !== "NM") notes.push(`${condition} copies typically sell for about ${Math.round(multiplier * 100)}% of Near Mint.`);
  } else {
    notes.push("No price data for this printing. Check eBay sold listings.");
  }

  if (ebayActive?.median && ebayActive.count >= 3 && value) {
    sources.push({ label: `eBay asking median (${ebayActive.count} active listings)`, value: ebayActive.median, note: "asking prices, not sales" });
    if (ebayActive.median < value * 0.7) notes.push("eBay listings are well below this estimate, so the price may be falling. Price it to sell.");
    else if (ebayActive.median > value * 1.6)
      notes.push("eBay sellers are asking much more than the card actually sells for. Don't price off asking prices.");
  }
  if (value !== null && value < 1) notes.push("Cards under $1 usually only sell in bulk lots.");
  return finish();

  function finish() {
    return {
      value: r2(value),
      quick: value !== null ? r2(value * settings.quickSaleFactor) : null,
      patient: value !== null ? r2(value * settings.patientFactor) : null,
      nmBase: r2(nmBase),
      multiplier,
      condition: graded?.company ? `${graded.company} ${graded.grade}` : condition,
      confidence,
      sources,
      notes,
    };
  }
}

// ───────────────────────── platform payouts ─────────────────────────

export function ebayFees(price, settingsIn) {
  const s = mergeSettings(settingsIn);
  const base = price * (1 + s.salesTaxRate); // free-shipping listing: fee base is item + tax
  const rate = s.ebay.store ? 0.127 : 0.1325;
  const cap = s.ebay.store ? 2500 : 7500;
  let fvf = rate * Math.min(base, cap) + 0.0235 * Math.max(0, base - cap);
  if (s.ebay.highValuePromo && price >= 1000) fvf -= 0.5 * rate * Math.min(base, cap);
  const perOrder = base > 10 ? 0.4 : 0.3;
  const promoted = price * (s.ebay.promotedRate || 0);
  return { finalValue: r2(fvf), perOrder, promoted: r2(promoted), total: r2(fvf + perOrder + promoted) };
}

export function tcgplayerFees(price, settingsIn) {
  const s = mergeSettings(settingsIn);
  const commission = Math.min(price * 0.1075, 75);
  const processing = price * (1 + s.salesTaxRate) * 0.025 + 0.3;
  return { commission: r2(commission), processing: r2(processing), total: r2(commission + processing) };
}

export function mercariFees(price) {
  return { selling: r2(price * 0.1), total: r2(price * 0.1) };
}

export function whatnotFees(price, settingsIn) {
  const s = mergeSettings(settingsIn);
  const commission = 0.08 * Math.min(price, 1500); // 0% on the portion above $1,500 for TCG singles
  const processing = 0.029 * price * (1 + s.salesTaxRate) + 0.3;
  return { commission: r2(commission), processing: r2(processing), total: r2(commission + processing) };
}

/** Cost for the seller to ship one card, by method. */
export function shippingCost(price, method, settingsIn) {
  const sh = mergeSettings(settingsIn).shipping;
  if (method === "ebay") return price <= sh.envelopeMax ? r2(sh.envelopeLabel + sh.envelopeSupplies) : r2(sh.trackedLabel + sh.trackedSupplies);
  if (method === "letter") return price < 20 ? r2(sh.stamp + sh.envelopeSupplies) : r2(sh.trackedLabel + sh.trackedSupplies);
  if (method === "tracked") return r2(sh.trackedLabel + sh.trackedSupplies);
  if (method === "supplies") return price < 20 ? sh.envelopeSupplies : sh.trackedSupplies;
  return 0;
}

/** Take-home money for selling at `price` on each platform, best first. */
export function platformPayouts(price, settingsIn) {
  if (!price || price <= 0) return [];
  const s = mergeSettings(settingsIn);
  const rows = [];

  const eb = ebayFees(price, s);
  const ebShip = shippingCost(price, "ebay", s);
  rows.push({
    key: "ebay",
    name: "eBay",
    salePrice: r2(price),
    fees: eb.total,
    shipping: ebShip,
    net: r2(price - eb.total - ebShip),
    detail: [
      `Final value fee ${s.ebay.store ? "12.7%" : "13.25%"} on price + tax: $${eb.finalValue.toFixed(2)}`,
      `Per-order fee: $${eb.perOrder.toFixed(2)}`,
      ...(eb.promoted ? [`Promoted listing: $${eb.promoted.toFixed(2)}`] : []),
      price <= s.shipping.envelopeMax ? "Ships by eBay Standard Envelope" : "Ships tracked (USPS Ground Advantage)",
    ],
    note: "Most buyers. Free shipping listings sell faster.",
  });

  const tp = tcgplayerFees(price, s);
  const tpShip = shippingCost(price, "letter", s);
  rows.push({
    key: "tcgplayer",
    name: "TCGplayer",
    salePrice: r2(price),
    fees: tp.total,
    shipping: tpShip,
    net: r2(price - tp.total - tpShip),
    detail: [`Commission 10.75%: $${tp.commission.toFixed(2)}`, `Payment processing 2.5% + $0.30: $${tp.processing.toFixed(2)}`],
    note: "Buyers shop by price, so list at or just under market. You need a seller account.",
  });

  const wn = whatnotFees(price, s);
  const wnShip = shippingCost(price, "supplies", s);
  rows.push({
    key: "whatnot",
    name: "Whatnot",
    salePrice: r2(price),
    fees: wn.total,
    shipping: wnShip,
    net: r2(price - wn.total - wnShip),
    detail: [`Commission 8%: $${wn.commission.toFixed(2)}`, `Processing 2.9% + $0.30: $${wn.processing.toFixed(2)}`, "Buyer pays shipping"],
    note: "Auctions can go over or under market. Best for hot cards.",
  });

  const mc = mercariFees(price);
  const mcShip = shippingCost(price, "tracked", s);
  rows.push({
    key: "mercari",
    name: "Mercari",
    salePrice: r2(price),
    fees: mc.total,
    shipping: mcShip,
    net: r2(price - mc.total - mcShip),
    detail: [`Selling fee 10%: $${mc.selling.toFixed(2)}`, "Tracked shipping required"],
    note: "Only worth it for higher-value cards, since tracked shipping eats small sales.",
  });

  const local = r2(price * s.localFactor);
  rows.push({
    key: "local",
    name: "Local / Facebook Marketplace",
    salePrice: local,
    fees: 0,
    shipping: 0,
    net: local,
    detail: [`In-person buyers usually pay ~${Math.round(s.localFactor * 100)}% of market`, "No fees, no shipping"],
    note: "Meet in a public place and take cash or a payment app with no buyer refunds.",
  });

  const cash = r2(price * s.buylistCash);
  const credit = r2(price * s.buylistCredit);
  rows.push({
    key: "buylist",
    name: "Card shop buylist",
    salePrice: cash,
    fees: 0,
    shipping: 0,
    net: cash,
    detail: [`Cash ~${Math.round(s.buylistCash * 100)}% of market`, `Store credit ~${Math.round(s.buylistCredit * 100)}%: $${credit.toFixed(2)}`],
    note: "Instant money. Shops often pass on cards under ~$2.",
  });

  return rows.sort((a, b) => b.net - a.net);
}
