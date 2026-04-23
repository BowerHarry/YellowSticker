# Yellow Sticker

Alerts for London theatre standing tickets. When a participating show has
standing tickets available for today, Yellow Sticker spots it and emails you.

## Architecture at a glance

```
┌───────────────────────────┐        ┌────────────────────────────────┐
│  React SPA (web/)         │        │  Supabase                      │
│                           │──auth──▶  - Postgres (productions,       │
│  - marketing / FAQ pages  │        │     subscriptions, users,      │
│  - subscription flow      │──API──▶│     theatres, scrape_heartbeats,│
│  - Stripe Checkout        │        │     notification_logs)         │
│  - /monitor dashboard     │        │  - Edge functions:             │
└───────────────────────────┘        │     report-scrape ◀─── POST    │
                                     │     status-dashboard           │
                                     │     create-checkout-session    │
                                     │     stripe-webhook             │
                                     │     subscription-management    │
                                     │     admin-auth                 │
                                     └──────────────▲─────────────────┘
                                                    │
                                                    │ POSTs scrape results
                                                    │ + heartbeats
                                                    │
                                 ┌──────────────────┴────────────────┐
                                 │  firefox-extension/                │
                                 │  Runs inside Firefox on the Mac    │
                                 │  mini at home. Autostarted via     │
                                 │  launchd; survives reboots.        │
                                 │                                    │
                                 │  1. Alarm every 10m (configurable) │
                                 │  2. Call Delfont JSON API from the │
                                 │     already-authenticated browser  │
                                 │     session (no Cloudflare fight). │
                                 │  3. Count standing tickets.        │
                                 │  4. POST report to Supabase.       │
                                 │                                    │
                                 │  Self-heals by opening a hidden    │
                                 │  tab when CF cookies expire.       │
                                 └───────────┬────────────────────────┘
                                             │
                                             ▼
                                   buytickets.delfontmackintosh.co.uk
                                   (hit from the Mac mini's home IP,
                                    with the real Firefox session)
```

Key design choice: the scraper runs **inside** the user's real Firefox
browser. That means all Cloudflare / Queue-it challenges are handled by the
browser itself exactly as they would be for a human visiting the site — no
stealth plugins, no TLS impersonation, no Docker headless Chromium fighting
interstitials.

## Repo layout

- [`web/`](web/) — React 18 + Vite + TypeScript SPA (subscription flow, `/monitor`).
- [`supabase/`](supabase/) — database schema (`migrations/`), seed data, edge functions.
- [`firefox-extension/`](firefox-extension/) — the scraper itself. Lives in Firefox on the Mac mini.
- [`docs/`](docs/) — setup + reference.

## Stack

- **Frontend**: React 18 + Vite + TypeScript + React Router.
- **Backend**: Supabase (Postgres, Auth, Edge Functions on Deno).
- **Payments**: Stripe Checkout (currently shelved, code preserved).
- **Email**: Resend.
- **Scraping**: a small Firefox WebExtension using the authenticated
  `buytickets.delfontmackintosh.co.uk` JSON API.

## Getting started

- **Scraper** → [`firefox-extension/README.md`](firefox-extension/README.md)
- **Architecture** → [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md)
- **Database schema** → [`docs/DATABASE.md`](docs/DATABASE.md)
- **Environment variables** → [`docs/env.sample`](docs/env.sample)

### Supabase backend

```bash
supabase start
supabase db reset --seed supabase/seed.sql
supabase functions deploy \
  create-checkout-session \
  stripe-webhook \
  status-dashboard \
  subscription-management \
  admin-auth \
  report-scrape
```

Set secrets via `supabase secrets set …`:

```bash
supabase secrets set \
  RESEND_API_KEY=re_... \
  RESEND_FROM_EMAIL=alerts@yourdomain.com \
  ALERT_EMAIL=you@example.com \
  SCRAPER_SHARED_SECRET=$(openssl rand -hex 32)
```

### Firefox extension (the important part)

See [`firefox-extension/README.md`](firefox-extension/README.md). Short
version:

1. Install the extension in Firefox on the Mac mini (temporary add-on or
   signed unlisted `.xpi`).
2. Open its options page and paste in the Supabase URL, anon key, and the
   `SCRAPER_SHARED_SECRET` you set above.
3. Tick **Enabled**, save, and click **Run once now** to confirm.
4. Configure launchd to autostart Firefox at login.

### Frontend (optional for alerts-only mode)

```bash
cd web
npm install
cp env.sample .env.local   # fill values
npm run dev
```

## Current state

- Scraper runs as a Firefox extension on the Mac mini → no Cloudflare
  datacenter blocks, no TLS fingerprint problem, no captcha solvers.
- Notifications go to a single `ALERT_EMAIL` (testing mode). The paid
  per-subscriber fan-out is wired up in the DB but not in the worker yet.
- Frontend + Stripe payment flow are preserved but not actively in use.
