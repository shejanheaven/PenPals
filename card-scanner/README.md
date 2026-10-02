# Binder: Pokémon, Yu-Gi-Oh! & Magic card scanner

Point your iPhone camera at a card. Binder works out the **exact printing** (set, number, rarity, edition), **grades its condition from the photo**, and tells you what it will **realistically sell for** and how much you'd **actually take home** on eBay, TCGplayer, Whatnot, Mercari, a local sale, or a shop buylist. Save cards into your own collections ("Binder 1", "For Sale", "Charizards"…) and track their total value.

It runs as a web app you add to your iPhone home screen. No App Store or Mac needed.

## Why the prices are more realistic than other scanner apps

| Most scanner apps | Binder |
| --- | --- |
| Guess the card from artwork, often the wrong printing | Reads the printed set code / collector number (e.g. `LOB-EN001`, `4/102`) and matches the exact printing, including 1st Edition, reverse holo, and Shadowless |
| Show one "market price" whatever the condition | Grades centering, corners, edges, and surface from your photo. Add a photo of the back for a better grade. Then it prices *your* condition (NM / LP / MP / HP / DMG) or your slab (PSA/BGS/CGC/SGC grade) |
| Mix in asking prices | Starts from **sales**: TCGplayer market price, plus eBay sold averages if you add PriceCharting. Current eBay listings are shown only as competition |
| Ignore fees | Subtracts each platform's 2026 fees (eBay charges its % on sales tax too), per-order fees, and the shipping you'd pay, so you see real take-home money |
| — | Gives a "quick sale" vs "patient" price, and one tap opens **eBay sold listings** for that exact printing and condition |

Fee assumptions (editable in Settings):

| Platform | Fees used |
| --- | --- |
| eBay | 13.25% of price + tax up to $7,500 (2.35% above), + $0.30/$0.40 per order. Store: 12.7%. Optional Promoted Listings rate and the $1,000+ singles promo |
| TCGplayer | 10.75% commission (capped at $75) + 2.5% + $0.30 processing |
| Whatnot | 8% commission (0% above $1,500 for TCG singles) + 2.9% + $0.30; buyer pays shipping |
| Mercari | 10% of the sale; tracked shipping |
| Local / Facebook | No fees; in-person buyers typically pay ~90% of market |
| Shop buylist | ~60% cash / ~75% store credit |

Shipping: eBay Standard Envelope ($0.82) for cards up to $20, otherwise a tracked USPS Ground Advantage label (~$6.50), plus supplies.

## Put it on your iPhone (about 15 minutes)

1. **Get an Anthropic API key.** It powers the card reading and condition grading. Go to [console.anthropic.com](https://console.anthropic.com) → API Keys → Create key, and add a few dollars of credit.
2. **Deploy to Vercel (free).**
   1. Go to [vercel.com](https://vercel.com) → **Add New → Project** → import this GitHub repo.
   2. Set **Root Directory** to `card-scanner`. The framework is detected as Vite.
   3. Under **Environment Variables**, add:
      - `ANTHROPIC_API_KEY`: your key
      - `APP_PASSCODE`: any word you choose. Without it, anyone who finds your URL could run scans on your key.
   4. Click **Deploy**. You'll get a URL like `binder-yourname.vercel.app`.
3. **Install on your iPhone.** Open the URL in **Safari** → tap **Share** → **Add to Home Screen**. Open Binder from the home screen and allow camera access.
4. In Binder, go to **Settings → App passcode** and enter the same passcode.

Scan a card: fill the green frame with it, tilt slightly to kill glare, and tap the shutter. For tiny set codes, the 📷 button on the right uses the iPhone camera app, which focuses better.

## Optional: even better price data

Add these as extra Vercel environment variables, then redeploy.

| Variable | What it adds | Cost |
| --- | --- | --- |
| `PRICECHARTING_TOKEN` | **eBay sold averages** for your card, ungraded and per grade (PSA 7–10, BGS 10, CGC 10, SGC 10). The best addition for "what will it sell for on eBay" and the only source of graded prices | Paid PriceCharting subscription with API access |
| `EBAY_CLIENT_ID` + `EBAY_CLIENT_SECRET` | Live eBay Buy-It-Now listings for the exact printing, filtered to drop lots, proxies, graded slabs, and other printings | Free: [developer.ebay.com](https://developer.ebay.com) → Application Keys → **Production** keyset |
| `POKEMONTCG_API_KEY` | Higher rate limits on the backup Pokémon database | Free: [dev.pokemontcg.io](https://dev.pokemontcg.io) |
| `SCAN_MODEL` / `SCAN_EFFORT` | Override the Claude model (default `claude-opus-5-5`) or effort (default `medium`) | — |

eBay does not give regular developers access to *sold* listing data, which is why sold averages come from PriceCharting and the app links straight to eBay's own sold-listings search.

## What a scan costs

Each scan is one Claude request with your photo. With the default model, expect roughly **3–10¢ per scan**. Adding a back photo makes a second request. Card lookups and prices use free databases (TCGdex, Pokémon TCG API, YGOPRODeck, Scryfall). Set `SCAN_MODEL=claude-sonnet-5-5` to roughly halve the cost.

## Your data

Collections, notes, and your card photos stay **on your phone** (IndexedDB). Use **Settings → Export backup** now and then; it saves a file you can keep in iCloud Drive. **Import backup** restores it on any device. Each collection can also be exported as CSV for spreadsheets or bulk listing.

Binder also keeps one **value snapshot per day** on the phone, and the Collections screen charts your total over 7 days, 30 days, 90 days, or all time. The change includes cards you added or removed, not only price moves, and it says so when that happened. Snapshots are included in backups.

## Local development

```bash
cd card-scanner
npm install
cp .env.example .env      # add ANTHROPIC_API_KEY
npm run dev               # http://localhost:5173 (camera works on localhost)
npm test                  # unit + API tests (offline)
MOCK_APIS=1 npm run dev   # whole app offline with sample data, no keys needed
```

To try it on your phone before deploying, run `npm run dev` and open the Network URL it prints. iOS only allows the camera over HTTPS, though, so the shutter only works once deployed. The 📷 / photo buttons work either way.

## Good to know

- **Condition grading is an estimate from photos.** It's good at spotting whitening, scratches, creases, and off-centering, but glare and sleeves hide flaws. Always check under a bright light before you list a valuable card.
- **Yu-Gi-Oh! prices are per set code + rarity.** The free data doesn't split 1st Edition from Unlimited. Binder warns you when it detects 1st Edition; check the eBay sold link for old sets.
- **Japanese and other non-English cards** are identified, but the price data is for English printings.
- **Magic prices are per printing and finish** (Normal, Foil, Etched Foil) from Scryfall, which reports TCGplayer market prices once a day. Pick the right finish on the card screen; foils can be worth many times the normal copy.
- Pokémon data comes from TCGdex, with the Pokémon TCG API as a backup (that API is scheduled to shut down in March 2027).

## Project layout

```
card-scanner/
├── api/                    Vercel serverless functions
│   ├── identify.js         POST photo(s) → Claude vision → identification + matching cards
│   ├── search.js           manual card search
│   ├── card.js             refresh one card's prices
│   ├── ebay.js             live eBay listings (optional)
│   ├── pricecharting.js    eBay sold averages incl. graded (optional)
│   ├── img.js              cached image proxy
│   └── _lib/               providers (TCGdex, Pokémon TCG API, YGOPRODeck, Scryfall, eBay, PriceCharting, Claude)
├── src/
│   ├── components/         Scanner, ScanFlow, CardView, Collections, Search, Settings
│   └── lib/                pricing engine, eBay links, IndexedDB storage, image cropping
└── test/                   node:test suites + offline mocks of every upstream API
```

Not affiliated with The Pokémon Company, Konami, Wizards of the Coast, Scryfall, eBay, TCGplayer, or PriceCharting.
