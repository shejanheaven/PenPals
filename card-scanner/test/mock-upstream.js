// Offline mock of every upstream API, for local UI work and automated tests.
// Enabled with `MOCK_APIS=1 npm run dev`. Never loaded in production.

import * as fx from "./fixtures.js";

process.env.ANTHROPIC_API_KEY ||= "mock-key";
process.env.EBAY_CLIENT_ID ||= "mock";
process.env.EBAY_CLIENT_SECRET ||= "mock";
process.env.PRICECHARTING_TOKEN ||= "mock";

const realFetch = globalThis.fetch;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const jsonRes = (data, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json" } });

function placeholderImage(label) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="245" height="342" viewBox="0 0 245 342">
<rect width="245" height="342" rx="12" fill="#f4c542"/><rect x="14" y="40" width="217" height="150" fill="#3a2f7a"/>
<text x="122" y="28" font-family="sans-serif" font-size="16" text-anchor="middle" fill="#222">${label}</text></svg>`;
  return new Response(svg, { headers: { "content-type": "image/svg+xml" } });
}

globalThis.fetch = async function mockFetch(input, init = {}) {
  const url = new URL(input instanceof Request ? input.url : String(input));
  const p = url.searchParams;
  const host = url.hostname;

  if (host === "api.anthropic.com") {
    const body = JSON.parse(init.body || "{}");
    const text = JSON.stringify(body.messages?.[0]?.content || []);
    const result = /Yu-Gi-Oh/i.test(text) ? fx.identifyBlueEyes : fx.identifyCharizard;
    await sleep(900);
    return jsonRes({
      id: "msg_mock",
      type: "message",
      role: "assistant",
      model: body.model,
      content: [{ type: "text", text: JSON.stringify(result) }],
      stop_reason: "end_turn",
      stop_sequence: null,
      usage: { input_tokens: 2400, output_tokens: 600 },
    });
  }

  if (host === "api.tcgdex.net") {
    const m = url.pathname.match(/^\/v2\/en\/cards\/(.+)$/);
    if (m) {
      const card = fx.tcgdexCards[decodeURIComponent(m[1])];
      return card ? jsonRes(card) : jsonRes({ error: "not found" }, 404);
    }
    if (url.pathname === "/v2/en/cards") {
      const name = (p.get("name") || "").toLowerCase();
      return jsonRes(fx.tcgdexCharizardList.filter((c) => c.name.toLowerCase().includes(name)));
    }
  }

  if (host === "api.pokemontcg.io") {
    if (/charizard/i.test(p.get("q") || "") || url.pathname.endsWith("/base1-4")) {
      return url.pathname.endsWith("/base1-4") ? jsonRes({ data: fx.ptcgCharizard.data[0] }) : jsonRes(fx.ptcgCharizard);
    }
    return jsonRes({ data: [] });
  }

  if (host === "db.ygoprodeck.com") {
    if (url.pathname.endsWith("/cardsetsinfo.php")) {
      return /^LOB-EN001$/i.test(p.get("setcode") || "")
        ? jsonRes(fx.ygoSetInfoLOB001)
        : jsonRes({ error: "No card matching your query was found in the database." }, 400);
    }
    if (url.pathname.endsWith("/cardinfo.php")) {
      const hit =
        p.get("id") === String(fx.ygoBlueEyes.id) ||
        (p.get("name") || "").toLowerCase() === fx.ygoBlueEyes.name.toLowerCase() ||
        /blue/i.test(p.get("fname") || "");
      return hit ? jsonRes({ data: [fx.ygoBlueEyes] }) : jsonRes({ error: "No card matching your query was found in the database." }, 400);
    }
  }

  if (host === "api.ebay.com") {
    if (url.pathname.includes("/oauth2/token")) return jsonRes({ access_token: "mock", expires_in: 7200, token_type: "Application Access Token" });
    return jsonRes(fx.ebaySearchResponse);
  }

  if (host === "www.pricecharting.com") {
    return /charizard/i.test(p.get("q") || "") ? jsonRes(fx.priceChartingResponse) : jsonRes({ status: "success", products: [] });
  }

  if (["assets.tcgdex.net", "images.ygoprodeck.com", "images.pokemontcg.io"].includes(host)) {
    return placeholderImage(decodeURIComponent(url.pathname.split("/").pop()));
  }

  return realFetch(input, init);
};

console.log("[mock-upstream] external APIs are mocked");
