# Pen Pals — Business Setup Guide

## Stack
- **Vercel** — hosting (free, auto-deploys from GitHub)
- **Supabase** — database + user accounts (free up to 50,000 users)
- **Google AdSense** — ad revenue
- **Buy Me a Coffee** — donations

---

## Step 1 — Supabase (10 minutes)

1. Go to **supabase.com** → New project (free)
2. Go to **SQL Editor** → paste the contents of `supabase/schema.sql` → Run
3. Go to **Settings → API** → copy:
   - Project URL
   - anon/public key
4. Create `.env` file in this folder:
   ```
   VITE_SUPABASE_URL=https://your-project.supabase.co
   VITE_SUPABASE_ANON_KEY=your-anon-key
   ```

## Step 2 — Vercel (5 minutes)

1. Push this folder to GitHub (github.com → New repo → upload files)
2. Go to **vercel.com** → New Project → Import from GitHub
3. Add environment variables (same as your .env file):
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
4. Deploy — you get a live URL like `penpals.vercel.app`

## Step 3 — Custom Domain (~$12/year)

1. Buy a domain at **namecheap.com** (search for penpals.app, penpals.chat, etc.)
2. In Vercel → your project → Settings → Domains → add your domain
3. Follow their DNS instructions (takes ~10 min)

---

## Adding Ad Revenue

### Google AdSense
1. Sign up at **adsense.google.com** with your live domain
2. Wait for approval (1-3 days, needs real content)
3. In `index.html`, uncomment and replace `ca-pub-XXXXXXXX` with your publisher ID
4. In each component, uncomment the `<ins className="adsbygoogle">` blocks and replace slot IDs
5. Ad slots are already placed at:
   - Landing page top banner
   - Landing page bottom banner
   - Sidebar (desktop)
   - Center (when no chat selected)
   - Chat header (subtle text ad)

### Carbon Ads (easier approval, developer audience)
```html
<script async type="text/javascript" src="//cdn.carbonads.com/carbon.js?serve=YOURCODE&placement=YOURDOMAIN" id="_carbonads_js"></script>
```

---

## Adding Donations

### Buy Me a Coffee (easiest)
1. Sign up at **buymeacoffee.com**
2. In `Landing.jsx` and `PenPalsApp.jsx`, replace `YOUR_NAME` with your username
3. Uncomment the widget code in the `donate-slot` div

### Ko-fi floating button
Add to `index.html` before `</body>`:
```html
<script src='https://storage.ko-fi.com/cdn/scripts/overlay-widget.js'></script>
<script>kofiWidgetOverlay.draw('YOUR_KOFI_NAME', {'type':'floating-chat','floating-chat-color':'#7eb8f7'})</script>
```

---

## Future: Premium Subscriptions (Stripe)

When you're ready to charge for premium features:
1. Sign up at **stripe.com**
2. Create a Payment Link for $5/month
3. Add a "Go Premium" button that opens the Stripe link
4. Use Stripe webhooks to update a `is_premium` column in Supabase

---

## Local Development

```bash
npm install
cp .env.example .env   # fill in your Supabase keys
npm run dev            # opens at http://localhost:5173
```

## Deploy Update

Every time you push to GitHub, Vercel auto-deploys. That's it.
