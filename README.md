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
└───────────────────────────┘                                             │     report-scrape ◀─── POST    │
                                     │     status-dashboard           │
                                     │     create-checkout-session    │
                                     │     stripe-webhook             │
                                     │     request-manage-link        │
                                     │     subscription-management    │
                                     │     send-test-email            │
                                     │     admin-preview-cancel       │
                                     │     admin-test-fixture         │
                                     │     admin-create-production    │
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
- **Payments**: Stripe Checkout (£2/month per production, auto-renew or
  single-month). Test vs live is controlled by the `STRIPE_SECRET_KEY`
  prefix (`sk_test_*` → test, `sk_live_*` → live); the affected edge
  functions log their detected mode on boot.
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
  request-manage-link \
  status-dashboard \
  subscription-management \
  send-test-email \
  admin-preview-cancel \
  admin-test-fixture \
  admin-create-production \
  admin-auth \
  report-scrape
```

Set secrets via `supabase secrets set …`:

```bash
supabase secrets set \
  RESEND_API_KEY=re_... \
  RESEND_FROM_EMAIL=alerts@yourdomain.com \
  ALERT_EMAIL=you@example.com \
  SCRAPER_SHARED_SECRET=$(openssl rand -hex 32) \
  STRIPE_SECRET_KEY=sk_test_... \
  STRIPE_WEBHOOK_SECRET=whsec_... \
  PRICE_PER_PRODUCTION_GBP_PENCE=200 \
  ADMIN_USERNAME=admin \
  ADMIN_PASSWORD=$(openssl rand -base64 24)
```

When promoting to production, replace `sk_test_…` / `whsec_…` with the
live-mode equivalents from the Stripe Dashboard. Each Stripe-aware edge
function logs `stripe mode = test|live|unknown` on boot so you can
confirm.

> ⚠️  The two Stripe secrets above are the **only** switch between test
> and live mode. Stripe IDs from one mode don't resolve in the other,
> and flipping with stale `paid` rows in the DB silently breaks cancels
> and refunds. `subscriptions.is_test_mode` is stamped per row to make
> mismatches visible in `/monitor` → **Preview cancel**. See
> [`docs/STRIPE_MODES.md`](docs/STRIPE_MODES.md) for the full guide,
> including how to wipe test data before going live.

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
- Availability alerts fan out to every paid subscriber of the affected
  production (one email per subscriber per availability event, capped at
  200/cycle). An operator copy to `ALERT_EMAIL` is sent in parallel on
  each transition for monitoring.
- Stripe Checkout is live at £2/month per production with both auto-renew
  and one-off options. The refund guarantee ("no alerts, no charge") is
  enforced by `subscription-management` on cancel; `stripe-webhook` also
  sets Stripe `cancel_at` to stop renewals 7 days after each production's
  `end_date`.
- Header now includes a customer **Log in** entrypoint. Users enter their
  email on `/login` and receive one or more magic manage links via
  `request-manage-link` (non-enumerating response).
- The `/monitor` dashboard exposes:
  - a one-click sender for every lifecycle email template (signup,
    renewal, cancel, expiry) via `send-test-email`;
  - an admin **Preview cancel** panel that shows, for any subscription,
    the exact refund + Stripe + email effect a cancel would produce —
    read-only, powered by `admin-preview-cancel`;
  - an **Add production** form (poster upload + Delfont fields + date
    range) backed by `admin-create-production`;
  - a **Test fixture** panel that drives a hidden `test-fixture`
    production end-to-end (reset, simulate availability, mark tickets
    found, clear alert state, delete) so you can exercise the full
    signup → alert → cancel flow without touching real shows. See
    [`docs/TESTING.md`](docs/TESTING.md).
