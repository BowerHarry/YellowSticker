# Yellow Sticker

Alerts for London theatre standing tickets. When a participating show drops standing tickets for today, Yellow Sticker notices and emails you.

## Architecture at a glance

```
┌───────────────────────────┐        ┌────────────────────────────────┐
│  React SPA (web/)         │        │  Supabase                      │
│                           │──auth──▶  - Postgres (productions,       │
│  - marketing / FAQ pages  │        │     subscriptions, users,      │
│  - subscription flow      │──API──▶│     theatres, notification_logs│
│  - Stripe Checkout        │        │  - Edge functions:             │
│  - /monitor dashboard     │        │     create-checkout-session    │
└───────────────────────────┘        │     stripe-webhook             │
                                     │     subscription-management    │
                                     │     admin-auth                 │
                                     │     status-dashboard           │
                                     └──────────────▲─────────────────┘
                                                    │
                                                    │ writes status,
                                                    │ reads productions
                                                    │
                                 ┌──────────────────┴────────────────┐
                                 │  scraper-service/  (Docker)        │
                                 │  Runs on a home machine            │
                                 │  (e.g. Mac mini over home Wi-Fi).  │
                                 │                                    │
                                 │  1. cron (every 15m, 8-18 UK)      │
                                 │  2. load active productions        │
                                 │  3. Puppeteer + stealth            │
                                 │  4. update DB row                  │
                                 │  5. Resend email to ALERT_EMAIL    │
                                 │     on state transition            │
                                 └───────────┬────────────────────────┘
                                             │
                                             ▼
                                         Theatre
                                       websites (hit
                                       from your home IP)
```

The scraper **only needs outbound internet** — nothing calls into it from the public internet. This is what fixes the Cloudflare / datacenter-IP problem we fought in previous rounds.

## Repo layout

- [`web/`](web/) — React 18 + Vite + TypeScript SPA. Subscription flow + `/monitor` dashboard.
- [`supabase/`](supabase/) — database schema (`migrations/`), seed data, and edge functions.
- [`scraper-service/`](scraper-service/) — Dockerised Node.js worker that does the actual scraping + emailing.
- [`docs/`](docs/) — setup guides and reference docs.

## Stack

- **Frontend**: React 18 + Vite + TypeScript + React Router.
- **Backend**: Supabase (Postgres, Auth, Edge Functions running on Deno).
- **Payments**: Stripe Checkout.
- **Email**: Resend.
- **Scraping**: Puppeteer + `puppeteer-extra-plugin-stealth`, running in Docker on a home machine.

## Getting started

- **Scraper (the important bit for now)** → [`docs/SCRAPER_SETUP.md`](docs/SCRAPER_SETUP.md)
- **Full architecture** → [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md)
- **Database schema** → [`docs/DATABASE.md`](docs/DATABASE.md)
- **Environment variables** → [`docs/env.sample`](docs/env.sample)

### Frontend (optional while we focus on alerts)

```bash
cd web
npm install
cp env.sample .env.local   # then fill values
npm run dev
```

### Supabase backend

```bash
supabase start
supabase db reset --seed supabase/seed.sql
supabase functions deploy create-checkout-session stripe-webhook status-dashboard subscription-management admin-auth
```

Set the secrets listed in [`docs/env.sample`](docs/env.sample) via `supabase secrets set …`.

### Scraper worker

```bash
cd scraper-service
cp env.example .env   # fill in Supabase + Resend + ALERT_EMAIL
docker compose up -d --build
docker compose logs -f
```

## Current state of things

- ✅ Scraper runs from a home machine → no more Cloudflare datacenter blocks.
- ✅ Notifications go to a single `ALERT_EMAIL` (testing mode). The subscription / paid-user fan-out is wired up in the DB but not in the worker yet; see [`docs/SCRAPER_SETUP.md`](docs/SCRAPER_SETUP.md) for where to re-enable it.
- 🛠️ Frontend + Stripe payment flow are preserved but not actively in use. Fine to leave as-is for now.
