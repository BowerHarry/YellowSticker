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
│   ─ scrape_heartbeats      ─ report-scrape  ◀─── POST        │
└──────────────────────▲───────────────────────────────────────┘
                       │ service-role writes via report-scrape
                       │ (shared-secret header)
                       │
┌──────────────────────┴───────────────────────────────────────┐
│  firefox-extension/ running inside Firefox on a Mac mini     │
│  ─ alarm every 10m (configurable)                            │
│  ─ authenticated calls to                                    │
│      /api/events/calendarseries/{seriesCode}                 │
│      /api/eventinventory/{eventID}                           │
│  ─ self-heals by opening a hidden tab when CF cookies expire │
│  ─ POSTs scrape results & heartbeats to report-scrape        │
└──────────────────────┬───────────────────────────────────────┘
                       │ outbound only, via the user's
                       │ own Firefox session cookies
                       ▼
             buytickets.delfontmackintosh.co.uk
```

## Components

### Web SPA (`web/`)

React 18 + Vite. Users browse productions, pick one, pay £4.99 (one-off) via
Stripe Checkout, and then get emails when standing tickets appear. A hidden
`/monitor` page consumes the `status-dashboard` edge function for a health
overview (including the extension's most recent heartbeat).

**Status**: preserved as-is; not actively being iterated on while we focus on
the alerting core.

### Supabase (`supabase/`)

- **Database** — see [`DATABASE.md`](DATABASE.md).
- **Edge functions** (Deno runtime, deployed via `supabase functions deploy`):
  - `create-checkout-session` — builds a Stripe Checkout Session for a
    production + user.
  - `stripe-webhook` — consumes Stripe events, flips
    `subscriptions.payment_status` to `paid`/`failed`/`cancelled`.
  - `subscription-management` — manage-subscription links sent in email
    footers (cancel, change preferences).
  - `admin-auth` — basic auth gate for `/monitor`.
  - `status-dashboard` — read-only health snapshot: per-production state,
    extension heartbeat freshness, DB size, Resend usage, Stripe activity.
  - `report-scrape` — *write* endpoint used by the Firefox extension. Takes
    a shared-secret header (`X-Scraper-Secret`) and:
    - inserts a row into `scrape_heartbeats`
    - updates `productions.last_seen_status` / `last_checked_at`
    - fires a Resend availability email on `unavailable → available`
    - fires a Resend "scraper stuck" email (throttled) when the extension
      self-reports it can't get past Cloudflare / Queue-it
- **Cron** — previously drove a `scrape-tickets` edge function. No longer
  used; migration `20260423001_remove_scrape_cron.sql` unschedules it.

### Firefox scraping extension (`firefox-extension/`)

An MV2 WebExtension that runs inside a permanently-open Firefox instance on
a Mac mini at home. See [`firefox-extension/README.md`](../firefox-extension/README.md)
for install instructions.

Per cycle (every 10 minutes by default):

1. Queries Supabase (`productions` via PostgREST, anon key) for rows with
   `adapter != 'none'`, `scrape_disabled_reason IS NULL`, and today's date
   inside `[start_date, end_date]`.
2. For each Delfont production:
   - `GET /api/events/calendarseries/<series_code>?salesChannel=Web` — finds
     today's `EventID`s by matching `StartDateTime` against today in London.
   - For each `EventID`,
     `GET /api/eventinventory/<EventID>?includeOpens=true&salesChannel=Web`
     — counts `MapSeats` where `!isReserved` and `seatAlertId` maps to a
     `SeatAlertValues` entry with `displayName === 'Standing'`.
   - POSTs
     `{ kind: 'scrape', productionId, status, standCount, performanceCount, … }`
     to `report-scrape`.
3. If any fetch returns HTML (i.e. Cloudflare / Queue-it interstitial), the
   extension opens a hidden background tab to the production's public URL.
   The tab triggers CF's silent JS challenge, refreshing cookies in the
   browser's cookie jar. The extension then retries the API call once.
4. After 5 cycles where *every* production was blocked, the extension POSTs
   `{ kind: 'stuck' }` so the operator gets an email. This throttles itself
   to at most one stuck email per 3 hours.

Because the extension uses the real, logged-in Firefox session, it inherits
the user's `cf_clearance`, `__cf_bm`, Queue-it tokens, etc. There is no
stealth plugin, no TLS impersonation, no headless Chromium fighting CF.

### Notifications (current MVP)

All alerts go to a single `ALERT_EMAIL`. Subscriber fan-out via
`subscriptions` + `users` is intentionally disabled while we confirm the
scraper is stable. To re-enable, extend the availability-email branch of
`supabase/functions/report-scrape/index.ts` to:

- query `subscriptions` where `payment_status='paid'` and
  `production_id = …`, joined with `users`
- loop and `fetch('https://api.resend.com/emails', …)` per recipient
- insert one row per send into `notification_logs`

A `notification_logs` row is already written for every availability email so
you can audit runs.

## Why "browser extension" instead of "Puppeteer in a container"

We spent a long time trying to drive headless Chromium from a Docker
container through Cloudflare and Queue-it: residential IPs, stealth plugins,
persistent profiles, `rebrowser-patches`, Xvfb for headed mode, ScrapingBee,
captcha solvers. None of it was reliable: Cloudflare kept escalating.

Running inside a real Firefox session changes the problem. The browser is
what Cloudflare fingerprints, and the browser here *is* a real browser.
There's no fingerprint to leak and no automation signal to hide. Our only
responsibility is to tick periodically and reason about the JSON that comes
back.

The trade-off is that the Mac mini has to keep Firefox running. Handled via
`launchd`.

## Failure modes & recovery

- **Mac mini offline / Firefox closed** → no heartbeats; the `/monitor`
  dashboard flags the scraper as unhealthy (no heartbeat in 30 min during
  active hours).
- **Cloudflare escalates to interactive Turnstile checkbox** → the hidden
  tab refresh can't complete without a click. After 5 consecutive cycles
  the extension sends a `stuck` email. Fix: visit the site once in the
  normal Firefox window.
- **Queue-it active** during a cycle → API returns HTML. Hidden-tab refresh
  puts the tab in the queue; subsequent cycles clear once Queue-it admits
  us. No manual action required, just a few cycles of "unknown" status.
- **Resend outage** → availability email fails; the scrape result is still
  persisted, but no alert goes out. Because we only email on the
  `unavailable → available` transition, a missed email won't be replayed
  next cycle — known limitation, worth tracking if it becomes a problem.
- **Supabase outage** → POSTs fail; the extension logs and moves on. State
  will re-sync on the next cycle once Supabase recovers.
