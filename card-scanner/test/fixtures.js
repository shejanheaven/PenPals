// Upstream API response shapes used by unit tests and the offline dev mock (MOCK_APIS=1).
// Shapes follow the public docs of TCGdex, pokemontcg.io, YGOPRODeck, eBay Browse and PriceCharting.

export const tcgdexCharizardList = [
  { id: "base1-4", localId: "4", name: "Charizard", image: "https://assets.tcgdex.net/en/base/base1/4" },
  { id: "base4-4", localId: "4", name: "Charizard", image: "https://assets.tcgdex.net/en/base/base4/4" },
  { id: "sv03-125", localId: "125", name: "Charizard ex", image: "https://assets.tcgdex.net/en/sv/sv03/125" },
  { id: "swsh9-154", localId: "154", name: "Charizard V", image: "https://assets.tcgdex.net/en/swsh/swsh9/154" },
];

export const tcgdexCards = {
  "base1-4": {
    id: "base1-4",
    localId: "4",
    name: "Charizard",
    image: "https://assets.tcgdex.net/en/base/base1/4",
    category: "Pokemon",
    rarity: "Rare",
    set: { id: "base1", name: "Base Set", cardCount: { official: 102, total: 102 } },
    variants: { normal: false, reverse: false, holo: true, firstEdition: false },
    pricing: {
      cardmarket: { updated: "2026-09-30T00:47:13.000Z", unit: "EUR", avg: 350.1, low: 180, trend: 362.4, avg1: 340, avg7: 355.2, avg30: 349.9, "avg-holo": null, "low-holo": null, "trend-holo": 0, "avg1-holo": null, "avg7-holo": null, "avg30-holo": null },
      tcgplayer: {
        updated: "2026-09-30T20:07:36.000Z",
        unit: "USD",
        holofoil: { lowPrice: 289.99, midPrice: 420.5, highPrice: 2500, marketPrice: 412.37, directLowPrice: null },
      },
    },
  },
  "base4-4": {
    id: "base4-4",
    localId: "4",
    name: "Charizard",
    image: "https://assets.tcgdex.net/en/base/base4/4",
    rarity: "Rare",
    set: { id: "base4", name: "Base Set 2", cardCount: { official: 130, total: 130 } },
    variants: { holo: true },
    pricing: { tcgplayer: { updated: "2026-09-30T20:07:36.000Z", unit: "USD", holofoil: { lowPrice: 150, midPrice: 210, highPrice: 900, marketPrice: 198.12, directLowPrice: null } } },
  },
  "sv03-125": {
    id: "sv03-125",
    localId: "125",
    name: "Charizard ex",
    image: "https://assets.tcgdex.net/en/sv/sv03/125",
    rarity: "Double rare",
    set: { id: "sv03", name: "Obsidian Flames", cardCount: { official: 197, total: 230 } },
    variants: { normal: false, reverse: false, holo: true },
    pricing: { tcgplayer: { updated: "2026-09-30T20:07:36.000Z", unit: "USD", holofoil: { lowPrice: 3.1, midPrice: 4.6, highPrice: 20, marketPrice: 4.25, directLowPrice: 3.9 } } },
  },
  "swsh9-154": {
    id: "swsh9-154",
    localId: "154",
    name: "Charizard V",
    image: "https://assets.tcgdex.net/en/swsh/swsh9/154",
    rarity: "Ultra Rare",
    set: { id: "swsh9", name: "Brilliant Stars", cardCount: { official: 172, total: 186 } },
    variants: { holo: true },
    pricing: { tcgplayer: { updated: "2026-09-30T20:07:36.000Z", unit: "USD", holofoil: { lowPrice: 171.99, midPrice: 252.97, highPrice: 1500, marketPrice: 232.62, directLowPrice: 157.86 } } },
  },
};

export const ptcgCharizard = {
  data: [
    {
      id: "base1-4",
      name: "Charizard",
      number: "4",
      rarity: "Rare Holo",
      set: { id: "base1", name: "Base", printedTotal: 102, total: 102, ptcgoCode: "BS", releaseDate: "1999/01/09" },
      images: { small: "https://images.pokemontcg.io/base1/4.png", large: "https://images.pokemontcg.io/base1/4_hires.png" },
      tcgplayer: {
        url: "https://prices.pokemontcg.io/tcgplayer/base1-4",
        updatedAt: "2026/09/30",
        prices: { holofoil: { low: 289.99, mid: 420.5, high: 2500, market: 405.0, directLow: null } },
      },
      cardmarket: {
        url: "https://prices.pokemontcg.io/cardmarket/base1-4",
        updatedAt: "2026/09/30",
        prices: { averageSellPrice: 350.1, lowPrice: 180, trendPrice: 362.4, avg1: 340, avg7: 355.2, avg30: 349.9, reverseHoloTrend: 0 },
      },
    },
  ],
};

export const ygoBlueEyes = {
  id: 89631139,
  name: "Blue-Eyes White Dragon",
  type: "Normal Monster",
  ygoprodeck_url: "https://ygoprodeck.com/card/blue-eyes-white-dragon-7485",
  card_sets: [
    { set_name: "Legend of Blue Eyes White Dragon", set_code: "LOB-EN001", set_rarity: "Ultra Rare", set_rarity_code: "(UR)", set_price: "185.33" },
    { set_name: "Legend of Blue Eyes White Dragon", set_code: "LOB-E001", set_rarity: "Ultra Rare", set_rarity_code: "(UR)", set_price: "0" },
    { set_name: "Legendary Collection 1", set_code: "LC01-EN004", set_rarity: "Ultra Rare", set_rarity_code: "(UR)", set_price: "6.12" },
    { set_name: "Structure Deck: Saga of Blue-Eyes White Dragon", set_code: "SDBE-EN001", set_rarity: "Ultra Rare", set_rarity_code: "(UR)", set_price: "3.05" },
    { set_name: "Structure Deck: Saga of Blue-Eyes White Dragon", set_code: "SDBE-EN001", set_rarity: "Common", set_rarity_code: "(C)", set_price: "1.10" },
  ],
  card_images: [
    {
      id: 89631139,
      image_url: "https://images.ygoprodeck.com/images/cards/89631139.jpg",
      image_url_small: "https://images.ygoprodeck.com/images/cards_small/89631139.jpg",
      image_url_cropped: "https://images.ygoprodeck.com/images/cards_cropped/89631139.jpg",
    },
  ],
  card_prices: [{ cardmarket_price: "0.32", tcgplayer_price: "0.98", ebay_price: "4.99", amazon_price: "1.50", coolstuffinc_price: "1.49" }],
};

export const ygoSetInfoLOB001 = {
  id: 89631139,
  name: "Blue-Eyes White Dragon",
  set_name: "Legend of Blue Eyes White Dragon",
  set_code: "LOB-EN001",
  set_rarity: "Ultra Rare",
  set_price: "185.33",
};

export const ebaySearchResponse = {
  total: 7,
  itemSummaries: [
    { title: "Charizard 4/102 Base Set Holo Rare Pokemon WOTC", price: { value: "449.99", currency: "USD" }, shippingOptions: [{ shippingCost: { value: "0.00", currency: "USD" } }], itemWebUrl: "https://www.ebay.com/itm/1", condition: "Ungraded" },
    { title: "Pokemon Charizard 004/102 base set unlimited holo", price: { value: "399.00", currency: "USD" }, shippingOptions: [{ shippingCost: { value: "5.00", currency: "USD" } }], itemWebUrl: "https://www.ebay.com/itm/2", condition: "Ungraded" },
    { title: "Charizard 4/102 Holo Base Set LP", price: { value: "360.00", currency: "USD" }, shippingOptions: [{ shippingCost: { value: "4.50", currency: "USD" } }], itemWebUrl: "https://www.ebay.com/itm/3", condition: "Ungraded" },
    { title: "Charizard 4/102 PSA 9 Base Set", price: { value: "2900.00", currency: "USD" }, itemWebUrl: "https://www.ebay.com/itm/4", condition: "Graded" },
    { title: "Pokemon card lot 50 cards Charizard 4/102 proxy", price: { value: "20.00", currency: "USD" }, itemWebUrl: "https://www.ebay.com/itm/5" },
    { title: "Charizard Base Set Holo Rare", price: { value: "420.00", currency: "USD" }, itemWebUrl: "https://www.ebay.com/itm/6" },
    { title: "Charizard 4/102 Shadowless", price: { value: "1200.00", currency: "USD" }, itemWebUrl: "https://www.ebay.com/itm/7" },
  ],
};

export const priceChartingResponse = {
  status: "success",
  products: [
    {
      id: "625",
      "product-name": "Charizard #4",
      "console-name": "Pokemon Base Set",
      "loose-price": 38900,
      "cib-price": 120000,
      "new-price": 150000,
      "graded-price": 260000,
      "box-only-price": 420000,
      "manual-only-price": 1150000,
      "bgs-10-price": 2500000,
      "condition-17-price": 900000,
      "condition-18-price": 800000,
    },
  ],
};

/** What Claude returns for a Base Set Charizard photo (structured output). */
export const identifyCharizard = {
  is_card: true,
  game: "pokemon",
  name: "Charizard",
  printed_name: "Charizard",
  language: "English",
  set_code: "",
  collector_number: "4",
  set_total: "102",
  set_name: "Base Set",
  rarity: "Rare Holo",
  finish: "holo",
  edition: "Unlimited",
  identification_confidence: "high",
  graded: { is_graded: false, company: "", grade: "", cert_number: "" },
  condition: {
    grade: "LP",
    confidence: "medium",
    centering: "Front ~60/40 left-right, 55/45 top-bottom",
    corners: "Slight whitening on the top-left and bottom-right corners",
    edges: "Light whitening along the right edge; back not inspected",
    surface: "A couple of faint scratches across the holo foil",
    issues: ["Light corner whitening", "Faint holo scratches"],
    grading_outlook: "Likely PSA 6–7, limited by holo scratches and centering",
    summary: "Lightly played: light corner whitening and faint scratches on the holo. No creases.",
  },
  authenticity_flags: [],
  photo_feedback: "Add a photo of the back to check edge whitening.",
};

export const identifyBlueEyes = {
  ...identifyCharizard,
  game: "yugioh",
  name: "Blue-Eyes White Dragon",
  printed_name: "Blue-Eyes White Dragon",
  set_code: "LOB-EN001",
  collector_number: "",
  set_total: "",
  set_name: "Legend of Blue Eyes White Dragon",
  rarity: "Ultra Rare",
  finish: "holo",
  edition: "1st Edition",
  condition: { ...identifyCharizard.condition, grade: "MP", summary: "Moderately played: whitening on all corners." },
};

// ── Scryfall (Magic: The Gathering) ──
const scryCard = (o) => ({
  object: "card",
  lang: "en",
  name: "Lightning Bolt",
  type_line: "Instant",
  rarity: "uncommon",
  finishes: ["nonfoil", "foil"],
  ...o,
  image_uris: {
    small: `https://cards.scryfall.io/small/front/${o.id}.jpg`,
    normal: `https://cards.scryfall.io/normal/front/${o.id}.jpg`,
    large: `https://cards.scryfall.io/large/front/${o.id}.jpg`,
  },
  scryfall_uri: `https://scryfall.com/card/${o.set}/${o.collector_number}/lightning-bolt`,
  purchase_uris: { tcgplayer: `https://www.tcgplayer.com/product/mock-${o.id}`, cardmarket: "https://www.cardmarket.com/mock" },
});

export const scryfallBoltPrints = [
  scryCard({ id: "bolt-2x2", set: "2x2", set_name: "Double Masters 2022", collector_number: "117", released_at: "2022-07-08", prices: { usd: "1.62", usd_foil: "4.10", usd_etched: null, eur: "1.20", eur_foil: "3.50" } }),
  scryCard({ id: "bolt-m10", set: "m10", set_name: "Magic 2010", collector_number: "146", released_at: "2009-07-17", rarity: "common", prices: { usd: "3.05", usd_foil: "38.50", usd_etched: null, eur: "2.40", eur_foil: "30.00" } }),
  scryCard({ id: "bolt-sta", set: "sta", set_name: "Strixhaven Mystical Archive", collector_number: "42", released_at: "2021-04-23", rarity: "rare", finishes: ["nonfoil", "foil", "etched"], prices: { usd: "2.80", usd_foil: "6.90", usd_etched: "9.75", eur: null, eur_foil: null } }),
];

export const identifyBolt = {
  ...identifyCharizard,
  game: "mtg",
  name: "Lightning Bolt",
  printed_name: "Lightning Bolt",
  set_code: "M10",
  collector_number: "146",
  set_total: "",
  set_name: "Magic 2010",
  rarity: "Common",
  finish: "foil",
  edition: "unknown",
  condition: { ...identifyCharizard.condition, grade: "NM", summary: "Near mint: clean edges and corners." },
};
