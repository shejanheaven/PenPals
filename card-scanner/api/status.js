import { json, route } from "./_lib/http.js";
import { aiConfigured } from "./_lib/claude.js";
import { ebayConfigured } from "./_lib/ebay.js";
import { pricechartingConfigured } from "./_lib/pricecharting.js";

export const GET = route(async () =>
  json({
    ai: aiConfigured(),
    ebay: ebayConfigured(),
    pricecharting: pricechartingConfigured(),
    passcodeRequired: Boolean(process.env.APP_PASSCODE),
  }),
);
