# Cadence — a mindful planner

*Plan with intention. Live with rhythm.*

Cadence keeps your **day, week, month and year** in one calm place: a schedule
that tells you what matters *right now*, goals that connect to the time you
actually spend, gentle reminders on your phone, and a few quiet minutes of
reflection each evening.

It's an installable web app (a PWA): it works on iPhone, Android and desktop,
opens offline, sends notifications, and needs no App Store.

---

## What's inside

**Today**
- A "Now" card: what you're doing this minute, how long is left, what's next, and a one-tap **Focus** timer.
- Morning **intention** ("What would make today meaningful?").
- Your timed schedule, anytime tasks and habits (with streaks 🔥), and unfinished tasks from earlier days you can **do today or let go**.
- This week's focus goals, an evening "close the day" prompt, and a quiet line to start the day.

**Plan**: Day (hour-by-hour timeline), Week, Month and Year views. The Year view
is a heatmap of how many of your plans you kept each day, plus how many days are left in the year.

**Goals**: Year → Month → Week goals, each with a *why*. Measure them as done/not yet, as
steps, or as a number. A number can **count itself** from schedule items linked to the goal
(e.g. "Run 12 times" counts every completed "Morning run"). Weekly goals can support monthly
ones, which support yearly ones. You can also **let a goal go**, without guilt.

**Reflect**: daily mood, energy, three good things and a journal; weekly, monthly and
yearly reviews with charts (plans kept, mood, where your energy went) and review prompts.

**Notes**: a place for loose thoughts: lists, ideas, what someone said. Search them, colour them by
area of life, pin the important ones to the top, and turn any note into something on your plan.

**Music**: save your Spotify playlists, albums, songs or podcasts (Settings → Connections → Spotify, or
*Add music* in the sidebar). On a computer the player sits in the sidebar and keeps playing while you move
between pages; on a phone it appears on Today. Whole songs play if you're signed in to Spotify in that
browser, 30-second previews otherwise.

**Mindfulness built in**: a **Breathe** exercise (box, 4·7·8, even), a **Focus** mode that
keeps the screen awake and chimes at the end, optional mindful-pause nudges, and language
that's encouraging rather than naggy.

**Quick add in plain English**, for example:

| You type | Cadence understands |
|---|---|
| `Run tomorrow 7am for 45 min every weekday #health` | Tomorrow, 7:00–7:45 AM, repeats Mon–Fri, Health |
| `Team sync every Mon and Wed 10-11am #work` | Weekly on Mon & Wed, 10–11 AM, Work |
| `Call mom Sunday at 5` | This Sunday, 5:00 PM |
| `Pay rent on the 1st every month` | Monthly on the 1st |
| `Dinner with Priya Friday 7:30pm` | Friday, 7:30 PM |

**Talk to it.** Tap the mic (above the + button on your phone, *Speak* or `V` on a computer) and
just say it: "Make an appointment for 4 pm today", "Remind me to call mom at five thirty",
"Gym every Monday and Wednesday at 6 p.m.". Clear requests are added straight away (with Undo);
anything vague waits for you to check it. Voice uses your browser's built-in speech recognition
(Chrome, Edge, Android, and Safari on iPhone/Mac); if it isn't available, your keyboard's mic
dictation works in the same box.

Also: undo on everything, light/dark themes, six accent colours, 24-hour clock, Monday/Sunday
week start, keyboard shortcuts on desktop (`N` new, `V` speak, `T` today, `1`–`5` views, `B` breathe, `I` inbox).

---

## Run it on your computer

```bash
cd cadence
npm install
npm run dev        # http://localhost:5173
npm test           # 48 tests covering dates, repeats, the parser, reminders, calendar files, stats, sync
npm run build      # production build in dist/
```

Without any setup, everything is saved **on the device** (in the browser). Nothing is sent anywhere.

## Put it online (Vercel, ~5 minutes)

1. Push this repo to GitHub (it already is, if you're reading this there).
2. Go to **vercel.com → Add New → Project → Import** this repository.
3. Set **Root Directory** to `cadence`. Vercel detects Vite automatically.
4. Click **Deploy**. You'll get a URL like `cadence-yourname.vercel.app`.

## Install it on your phone

- **iPhone**: open your Cadence URL in **Safari** → tap **Share** → **Add to Home Screen** → open
  Cadence from the Home Screen → **Settings → Notifications on this device**. (iPhone only allows
  web-app notifications after it's added to the Home Screen.)
- **Android**: open the URL in Chrome → **Install app** (or menu → *Add to Home screen*) → turn on
  notifications in Settings.
- **Desktop**: Chrome/Edge show an install icon in the address bar.

---

## How reminders reach you

| | Works when… | Setup |
|---|---|---|
| **In-app banners** (with a soft chime) | Cadence is open in front of you | none |
| **Device notifications** | Cadence is open or was used recently | turn on in Settings |
| **Push notifications** | Always, even when the app is fully closed | the optional cloud (below) |
| **Phone calendar alerts** | Always, for exported events | Settings → Connections → Phone calendar → Export .ics |

You get: a reminder before each timed block (you choose how long before), a morning check-in,
an evening reflection prompt, a weekly review on the last evening of the week, and optional
mindful pauses. If you're looking at the app when a reminder is due, you get a banner instead
of a system notification, and the same reminder is never shown twice.

---

## Optional: cloud sync, push and the inbox webhook (Supabase, ~15 minutes)

Turning this on gives you:
- **One planner on all your devices** (phone + computer), merged change-by-change so nothing is lost.
- **Push reminders even when Cadence is closed.**
- **A private webhook** that drops texts, emails and automations into your Cadence Inbox.

You need a free [Supabase](https://supabase.com) project and the
[Supabase CLI](https://supabase.com/docs/guides/cli).

**1. Database.** Supabase → **SQL Editor** → paste `supabase/schema.sql` → **Run**.

**2. Push keys.** Generate a key pair (keep the private key secret):
```bash
npx web-push generate-vapid-keys
```

**3. Functions.** From the `cadence` folder:
```bash
supabase login
supabase link --project-ref <PROJECT_REF>
supabase secrets set VAPID_PUBLIC_KEY=<public key> VAPID_PRIVATE_KEY=<private key> \
  VAPID_SUBJECT=mailto:<your email> CRON_SECRET=<any long random string>
supabase functions deploy send-reminders --no-verify-jwt
supabase functions deploy capture --no-verify-jwt
```

**4. Run the sender every minute.** Supabase → **Database → Extensions**: enable `pg_cron`
and `pg_net`. Then open `supabase/cron.sql`, replace `<PROJECT_REF>` and `<CRON_SECRET>`,
and run it in the SQL Editor.

**5. Connect the app.** Copy `.env.example` to `.env` (for local) and add the same three values
in **Vercel → Project → Settings → Environment Variables**, then redeploy:
```
VITE_SUPABASE_URL=https://<PROJECT_REF>.supabase.co
VITE_SUPABASE_ANON_KEY=<Settings → API → anon public key>
VITE_VAPID_PUBLIC_KEY=<public key from step 2>
```

**6. Sign in** from Cadence → Settings → *Sync & backup* on each device. Whatever is already on
the device is merged into your account.

---

## Connecting your texts and email

Everything captured lands in your **Inbox** (top bar), already understood ("Friday 7:30 PM"), so you can add it to your
plan with one tap, edit it first, or dismiss it. You decide what deserves your time.

### Texts, with no setup (any phone)
Copy the message, open Cadence → **Inbox** → **Paste**. It arrives already understood
("Friday 7:30 PM"), ready to add with one tap.

### Texts on iPhone, from the Share menu (needs the cloud)
1. Open **Shortcuts** → **+** → name it **Add to Cadence**.
2. Tap the **ⓘ** → turn on **Show in Share Sheet** → accepts **Text**.
3. Add **Get Contents of URL**:
   - URL: your webhook from Cadence → Settings → Connections (`…/functions/v1/capture?token=…`)
   - Method **POST**, Request Body **JSON**: `text` = *Shortcut Input*, `source` = `sms`.
4. Press-and-hold any text → **Share** → **Add to Cadence**. It runs in the background and
   lands in your Inbox.

(On iPhone, a Shortcut that *opens a link* goes to Safari, which keeps separate storage from the
Home Screen app, so use the webhook rather than the capture link there.)

### Texts on iPhone, automatically (needs the cloud)
Shortcuts → **Automation** → **+** → **Message** → choose a sender or "message contains"
(e.g. *meet*, *appointment*, *dinner*) → **Run Immediately** → add the same
**Get Contents of URL** step, with `text` = *Message* and `from` = *Sender*.

### Capture link (Android, desktop, or using Cadence in the browser)
Opening `https://<your-cadence-url>/?capture=<text>` captures that text into the Inbox; add
`&add=1` to put it straight on your plan. Handy for bookmarks, launchers and automations.

### Android & desktop
Install Cadence, then use the normal **Share** menu from Messages, Gmail, or a web page and pick Cadence.

### Email (needs the cloud)
Any of these posts emails to your webhook:
- **Zapier / Make**: "New email matching search" (Gmail/Outlook) → *Webhooks: POST* with JSON
  `{"text": "<subject>\n<body>", "source": "email", "from": "<from>"}`.
- **Gmail filter + Apps Script** (free): make a filter that applies the label **Cadence**, then at
  [script.google.com](https://script.google.com) create a project with the code below, set your
  webhook URL, and add a time-driven trigger (every 5 minutes) for `sendToCadence`:
  ```js
  const WEBHOOK = 'https://<PROJECT_REF>.supabase.co/functions/v1/capture?token=<your token>'
  function sendToCadence() {
    const label = GmailApp.getUserLabelByName('Cadence')
    if (!label) return
    for (const thread of label.getThreads(0, 20)) {
      const msg = thread.getMessages().pop()
      UrlFetchApp.fetch(WEBHOOK, {
        method: 'post',
        contentType: 'application/json',
        payload: JSON.stringify({ text: msg.getSubject() + '\n' + msg.getPlainBody().slice(0, 1500), source: 'email', from: msg.getFrom() }),
      })
      thread.removeLabel(label)
    }
  }
  ```
- **iPhone Mail**: Shortcuts automation **Email** (from a sender / subject contains) → Get Contents of URL, as for texts.

### Anything else (IFTTT, Make, scripts)
```bash
curl -X POST 'https://<PROJECT_REF>.supabase.co/functions/v1/capture?token=<your token>' \
  -H 'content-type: application/json' \
  -d '{"text":"Call the dentist tomorrow 10am","source":"zapier"}'
```
The webhook also accepts form posts, plain text, and `GET ?text=…`. You can reset your token
anytime in Settings, which disables the old link.

### Calendars
Settings → Connections → **Phone calendar**: export everything as an `.ics` file (repeats,
skipped days and alerts included) for Apple, Google or Outlook Calendar, or import an `.ics`
to bring existing events in.

---

## Your data

- Without the cloud, everything stays in this browser on this device. **Settings → Your data**
  lets you download a full backup (`.json`) and restore it anywhere. Restores merge, they don't overwrite.
- With the cloud, data lives in *your* Supabase project, protected by row-level security
  (each account can only read its own rows). The webhook token only lets someone **add** to your Inbox.

## Project layout

```
cadence/
├─ src/
│  ├─ lib/            pure logic: dates, repeats, natural-language parser, reminders, .ics, stats, sync merge
│  ├─ store/          the planner state (localStorage-first), actions, UI layers, defaults
│  ├─ services/       notifications & scheduler, cloud sync + push (Supabase), install prompt
│  ├─ integrations/   capture from links/share sheet/webhook, notification actions
│  ├─ components/     UI kit, item rows & editors, charts, inbox, focus & breathe
│  └─ views/          Today, Plan, Goals, Reflect, Settings, Onboarding
├─ public/            service worker, web manifest (with share target), icons
├─ supabase/          schema.sql, cron.sql, functions/send-reminders, functions/capture
└─ tests/             vitest unit tests
```

## Ideas for later

- Direct Gmail / Outlook connection (OAuth) alongside the webhook.
- Two-way Google Calendar sync.
- Native iOS/Android wrappers (e.g. Capacitor) for exact-time local notifications without a server.
- Drag-to-reschedule in the day and week views.
