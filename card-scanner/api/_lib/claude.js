// Card identification + condition grading with Claude vision.

import Anthropic from "@anthropic-ai/sdk";
import { HttpError } from "./http.js";

export const aiConfigured = () => Boolean(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN);

const MODEL = () => process.env.SCAN_MODEL || "claude-opus-5-5";
const EFFORT = () => process.env.SCAN_EFFORT || "medium";
// Server-side refusal fallbacks ("default" routing) are supported on these model lines.
const supportsDefaultFallbacks = (m) => /^claude-(opus-5|sonnet-5-5|fable-5)/.test(m);

const str = (description) => ({ type: "string", description });
const obj = (properties) => ({
  type: "object",
  additionalProperties: false,
  required: Object.keys(properties),
  properties,
});

export const IDENTIFY_SCHEMA = obj({
  is_card: { type: "boolean", description: "False if no Pokémon, Yu-Gi-Oh! or Magic: The Gathering card is clearly visible." },
  game: { type: "string", enum: ["pokemon", "yugioh", "mtg", "other", "unknown"] },
  name: str("Official English card name, exactly as the card database would list it (e.g. 'Charizard ex', 'Dark Magician', 'Sheoldred, the Apocalypse'). For double-faced Magic cards use the front face name. Translate non-English cards to their official English name."),
  printed_name: str("Name exactly as printed on the card, in its own language."),
  language: str("Card language, e.g. 'English', 'Japanese'."),
  set_code: str("Yu-Gi-Oh!: the full set code printed under the artwork, e.g. 'LOB-EN001'. Pokémon: the set abbreviation printed at the bottom (e.g. 'PAL', 'OBF') if present. Magic: the set code printed at the bottom left (e.g. 'DMU', 'MKM'). Empty string if not readable — never guess."),
  collector_number: str("Pokémon: the collector number before the slash, e.g. '4' from '4/102', or the full promo/subset number like 'SWSH050', 'TG05', 'SV107'. Magic: the collector number at the bottom left, e.g. '107' or '107a', without leading zeros or a set total. Empty for Yu-Gi-Oh! or if unreadable."),
  set_total: str("Pokémon: the number after the slash, e.g. '102' from '4/102'. Empty if none or unreadable."),
  set_name: str("Best identification of the set/expansion name, e.g. 'Base Set', 'Paldea Evolved', 'Legend of Blue Eyes White Dragon'."),
  rarity: str("Rarity using database wording, e.g. 'Common', 'Rare Holo', 'Double Rare', 'Illustration Rare', 'Special Illustration Rare', 'Ultra Rare', 'Super Rare', 'Secret Rare', 'Ultimate Rare', 'Starlight Rare', 'Quarter Century Secret Rare'. Magic: 'Common', 'Uncommon', 'Rare' or 'Mythic'."),
  finish: { type: "string", enum: ["non-holo", "holo", "reverse-holo", "full-art-textured", "foil", "etched-foil", "unknown"] },
  edition: { type: "string", enum: ["1st Edition", "Unlimited", "Limited Edition", "Shadowless", "unknown"] },
  identification_confidence: { type: "string", enum: ["low", "medium", "high"] },
  graded: obj({
    is_graded: { type: "boolean", description: "True only if the card is sealed in a grading company slab." },
    company: str("PSA, BGS, CGC, SGC, TAG, etc. Empty if not graded."),
    grade: str("Numeric grade on the label, e.g. '10', '9.5'. Empty if not graded."),
    cert_number: str("Certification number on the label if readable, else empty."),
  }),
  condition: obj({
    grade: { type: "string", enum: ["NM", "LP", "MP", "HP", "DMG"], description: "TCGplayer-style raw condition." },
    confidence: { type: "string", enum: ["low", "medium", "high"] },
    centering: str("Estimated centering, e.g. 'Front ~55/45 left-right, 50/50 top-bottom'."),
    corners: str("What you can see of the corners."),
    edges: str("What you can see of the edges (whitening, chipping)."),
    surface: str("Scratches, print lines, scuffs, dents, creases, stains."),
    issues: { type: "array", items: { type: "string" }, description: "Each specific flaw that affects value. Empty array if none seen." },
    grading_outlook: str("If professionally graded, the likely PSA-style range, e.g. 'PSA 8–9', with the main limiting factor."),
    summary: str("One or two plain-English sentences a seller would put in a listing description."),
  }),
  authenticity_flags: { type: "array", items: { type: "string" }, description: "Signs this may be counterfeit or a proxy. Empty array if none." },
  photo_feedback: str("If glare, blur, sleeves, or framing prevented a reliable read or grade, say exactly how to retake the photo. Empty string if the photo was fine."),
});

const SYSTEM = `You are an expert Pokémon TCG, Yu-Gi-Oh! TCG and Magic: The Gathering card identifier and condition grader working inside a card-scanning app. Sellers rely on you to identify the exact printing and judge condition, because both drive resale price.

Identification — read the printed text; do not guess from artwork alone:
- Pokémon: the collector number is at the bottom ("4/102", "025/198", promos like "SWSH050" or "SVP 085", subsets like "TG05/TG30" or "GG70/GG70"). Newer cards print a set abbreviation and regulation mark at the bottom left. WOTC-era cards may have a black "Edition 1" stamp left of the art box (1st Edition); Base Set cards without the art-box drop shadow are Shadowless. Finish: holo = only the artwork is foil; reverse-holo = everything except the artwork is foil.
- Yu-Gi-Oh!: the set code is printed just below the artwork on the right (e.g. "LOB-EN001", "RA01-EN016"); "1st Edition" or "LIMITED EDITION" is printed below the artwork on the left. Rarity cues: Common has a plain name; Rare has a silver-foil name; Super Rare has foil artwork and a plain name; Ultra Rare has foil artwork and a gold-foil name; Secret Rare has diagonal-sparkle foil artwork; Ultimate Rare is embossed; Starlight and Quarter Century Secret Rares have foil across the whole card face.
- Magic: The Gathering: cards from 2023 on print the collector number, rarity letter (C/U/R/M), set code and language at the bottom left, e.g. "0107 R" above "MKM • EN"; older cards print "107/286" or nothing, in which case name the set from the set symbol and frame. Finish: "foil" for a rainbow-sheen traditional foil, "etched-foil" for a metallic etched frame, otherwise "non-holo". Rarity follows the set-symbol colour: black = Common, silver = Uncommon, gold = Rare, orange-red = Mythic. Leave edition "unknown" for Magic.
- If text is unreadable, leave that field empty instead of inventing it, and lower identification_confidence.

Condition — use TCGplayer raw-card standards:
- NM (Near Mint): at most tiny, isolated edge or corner whitening visible only on close inspection; no scratches visible at normal viewing; no creases.
- LP (Lightly Played): minor whitening on several edges/corners, light scuffs or scratches; no creases.
- MP (Moderately Played): obvious whitening, corner wear, noticeable scratching or scuffing, or a light crease.
- HP (Heavily Played): heavy wear, multiple or noticeable creases, bends, or dirt.
- DMG (Damaged): tears, water damage, ink/writing, major creases, peeling, or missing pieces.
Only grade what the photos show. Whitening is mostly visible on the back; if no back photo was provided, say the back was not inspected and lower your confidence rather than assuming it is clean. Treat glare spots as unknown, not as damage. Do not round up: buyers file "item not as described" claims when condition is overstated.

If the card is in a grading slab, read the company, grade, and cert number from the label and still describe what you see.`;

function parseDataUrl(dataUrl, label) {
  const m = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl || "");
  if (!m) throw new HttpError(400, `${label} photo must be a base64 JPEG/PNG/WebP data URL`);
  if (m[2].length > 3_000_000) throw new HttpError(413, `${label} photo is too large`);
  return { type: "image", source: { type: "base64", media_type: m[1], data: m[2] } };
}

let client = null;

/** front/back: data URLs. gameHint: "auto" | "pokemon" | "yugioh" | "mtg". */
export async function identifyCard({ front, back, gameHint = "auto" }) {
  if (!aiConfigured()) throw new HttpError(501, "ANTHROPIC_API_KEY is not set on the server");
  client ??= new Anthropic();

  const content = [{ type: "text", text: "Photo 1 — FRONT of the card:" }, parseDataUrl(front, "Front")];
  if (back) content.push({ type: "text", text: "Photo 2 — BACK of the same card:" }, parseDataUrl(back, "Back"));
  const hint =
    gameHint === "pokemon" ? "The user says this is a Pokémon card." :
    gameHint === "yugioh" ? "The user says this is a Yu-Gi-Oh! card." :
    gameHint === "mtg" ? "The user says this is a Magic: The Gathering card." : "";
  content.push({
    type: "text",
    text: `Identify this card's exact printing and grade its condition. ${hint} ${back ? "" : "No back photo was provided."}`.trim(),
  });

  const model = MODEL();
  const params = {
    model,
    max_tokens: 16000,
    system: SYSTEM,
    output_config: { effort: EFFORT(), format: { type: "json_schema", schema: IDENTIFY_SCHEMA } },
    messages: [{ role: "user", content }],
  };
  if (supportsDefaultFallbacks(model)) {
    params.betas = ["server-side-fallback-2026-07-01"];
    params.fallbacks = "default";
  }

  let response;
  try {
    // No SDK retries: the whole scan has to fit inside the 60 s serverless limit.
    response = await client.beta.messages.create(params, { timeout: 50_000, maxRetries: 0 });
  } catch (e) {
    if (e instanceof Anthropic.AuthenticationError) throw new HttpError(500, "The server's ANTHROPIC_API_KEY was rejected");
    if (e instanceof Anthropic.RateLimitError) throw new HttpError(429, "Too many scans at once — wait a few seconds and try again");
    if (e instanceof Anthropic.BadRequestError) throw new HttpError(400, `Claude rejected the request: ${e.message}`);
    if (e instanceof Anthropic.APIConnectionTimeoutError) throw new HttpError(504, "Identification timed out — try again");
    if (e instanceof Anthropic.APIError) throw new HttpError(502, `Claude API error ${e.status ?? ""}: ${e.message}`);
    throw e;
  }

  if (response.stop_reason === "refusal") throw new HttpError(422, "Claude declined to analyze this photo");
  if (response.stop_reason === "max_tokens") throw new HttpError(502, "Identification response was cut off — try again");
  const text = response.content.filter((b) => b.type === "text").map((b) => b.text).join("");
  let result;
  try {
    result = JSON.parse(text);
  } catch {
    throw new HttpError(502, "Could not parse identification result");
  }
  return { result, model: response.model, usage: response.usage };
}
