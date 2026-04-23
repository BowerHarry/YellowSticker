# Architecture

## Data flow

```
┌────────────────┐        1. sign up + pay          ┌─────────────┐
│                │ ───────────────────────────────▶ │             │
│   Web SPA      │ ◀─ 2. Stripe Checkout redirect ─ │   Stripe    │
│                │ ◀─ 3. webhook marks row paid  ── │             │
└──────┬─────────┘                                  └─────────────┘
       │  4. read productions / subscriptions
       ▼
┌──────────────────────────────────────────────────────────────┐
│                         Supabase                             │
│   Postgres                 Edge Functions                    │
│   ─ users                  ─ create-checkout-session         │
│   ─ productions            ─ stripe-webhook                  │
│   ─ theatres               ─ subscription-management         │
│   ─ subscriptions          ─ admin-auth                      │
│   ─ notification_logs      ─ status-dashboard                │
└──────────────────────▲───────────────────────────────────────┘
                       │ service-role writes
                       │
┌──────────────────────┴───────────────────────────────────────┐
│  scraper-service (Docker container on a home machine)        │
│  ─ cron (every 15m, 8-18 local)                              │
│  ─ Puppeteer + stealth browser                               │
│  ─ cheerio HTML parsing                                      │
│  ─ Resend email on state transition                          │
└──────────────────────┬───────────────────────────────────────┘
                       │ outbound only
                       ▼
                 Theatre websites
```

## Components

### Web SPA (`web/`)

React 18 + Vite. Users browse productions, pick one, pay £4.99 (one-off) via Stripe Checkout, and then get emails when standing tickets appear. A hidden `/monitor` page consumes the `status-dashboard` edge function for a health overview.

**Status**: preserved as-is; not actively being iterated on while we focus on the scraper.

### Supabase (`supabase/`)

- **Database** — see [`DATABASE.md`](DATABASE.md).
- **Edge functions** (Deno runtime, deployed via `supabase functions deploy`):
  - `create-checkout-session` — builds a Stripe Checkout Session for a production + user.
  - `stripe-webhook` — consumes Stripe events, flips `subscriptions.payment_status` to `paid`/`failed`/`cancelled`.
  - `subscription-management` — manage-subscription links sent in email footers (cancel, change preferences).
  - `admin-auth` — basic auth gate for `/monitor`.
  - `status-dashboard` — read-only health snapshot (scraper last run, DB size, Resend usage, Stripe activity).
- **Cron** — previously drove a `scrape-tickets` edge function. **No longer used**: migration `20260423001_remove_scrape_cron.sql` unschedules it. The scraper-service worker owns scheduling now.

### Scraper service (`scraper-service/`)

Standalone Node.js worker packaged as a Docker image.

Responsibilities per run:

1. Query `productions` (joined with `theatres`) where today falls between `start_date` and `end_date`.
2. Pick a scraper implementation for each production (see below).
3. Launch a single stealth Puppeteer browser and reuse it across all productions in the run (cheaper than one browser per URL).
4. For each production:
   - fetch the calendar / listing page
   - identify today's performances
   - fetch each performance page
   - count standing-ticket `<circle>` elements whose class isn't `na`
5. Update `productions.last_seen_status`, `last_checked_at`, and (when found) `last_standing_tickets_found_at`.
6. If status transitions from anything other than `available` → `available`, send an alert email via Resend to `ALERT_EMAIL`.

**Scraper selection** (`scraper-service/src/scrapers/index.js`):

1. **Hardcoded per-theatre** — for shows on Delfont Mackintosh's nLiven widget (Hamilton, Les Mis, Oliver!, All My Sons, Importance of Being Earnest). We know the exact URL patterns and seat-ID prefixes for these.
2. **Dynamic Delfont** — for any other production whose `scraping_url` is a `.../tickets/series/CODE` URL. Uses `theatres.standing_ticket_prefixes` from the DB.
3. **Keyword fallback** — for anything else: fetch the page, look for "standing", "rush", "day seats".

### Notifications (current MVP)

All alerts go to a single `ALERT_EMAIL`. Subscriber fan-out via `subscriptions` + `users` is **intentionally disabled** while we confirm the scraper is stable. To re-enable, extend `scraper-service/src/notify.js` to:

- query `subscriptions` where `payment_status='paid'` and `production_id = …`, joined with `users`
- loop and `fetch('https://api.resend.com/emails', …)` per recipient
- insert one row per send into `notification_logs`

A `notification_logs` row with `user_id = null` is written for every alert in MVP mode so you can audit runs.

## Why "push" (from the home machine) instead of "pull" (from Supabase)

Supabase edge functions run on shared cloud infrastructure. When they reach out to ticketing sites, requests come from datacenter IPs that are pre-flagged by Cloudflare's bot-detection layer. No amount of stealth / premium residential proxies / ScrapingBee / ScraperAPI reliably solved this for us.

Running the worker on a residential IP from a home machine side-steps the problem entirely. The only cost is that the Mac mini needs to stay powered on and online.

## Failure modes & recovery

- **Mac mini offline** → worker doesn't run; the `productions.last_checked_at` goes stale; the `/monitor` dashboard flags the scraper as unhealthy.
- **Cloudflare-blocks a run** → the worker logs `CLOUDFLARE_BLOCKED`, marks the production's `last_seen_status` as `unknown`, moves on. Next cron tick retries. No alert email is sent.
- **Resend outage** → email send fails; the scrape result is still persisted, but no alert goes out. The next time the production flips `available → available` we won't re-send (the transition already happened) — this is a known limitation, worth tracking if it becomes an issue.
- **Supabase outage** → worker errors on load; state is not updated; run is effectively skipped.
