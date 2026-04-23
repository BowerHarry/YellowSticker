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
│   ─ scraper_settings                                         │
└──────────────────────▲───────────────────────────────────────┘
                       │ service-role writes via report-scrape
                       │ (shared-secret header)
                       │
┌──────────────────────┴───────────────────────────────────────┐
│  firefox-extension/ running inside Firefox on a Mac mini     │
│  ─ alarm every 10m (configurable)                            │
│  ─ authenticated calls to                                    │
│      /api/events/getbymonth?seriesCode=…&requestedTime=…     │
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

React 18 + Vite. Users browse productions, pick one, pay £2 for one month
(or £2/month auto-renew) via Stripe Checkout, and then get emails when
standing tickets appear. A hidden `/monitor` page consumes the
`status-dashboard` edge function for a health overview (including the
extension's most recent heartbeat) and exposes a "send test email" panel
that fires every lifecycle template via the admin-gated
`send-test-email` edge function.

Billing details live in `subscriptions` and are driven end-to-end by the
three Stripe edge functions (`create-checkout-session`, `stripe-webhook`,
`subscription-management`). Test vs live is controlled by the
`STRIPE_SECRET_KEY` prefix (`sk_test_…` vs `sk_live_…`) plus the matching
`STRIPE_WEBHOOK_SECRET`; each function logs its mode on boot. Every
subscription row is stamped with `is_test_mode` at creation / activation
so mode-mismatched cancels are caught by `/monitor`'s preview panel
before they reach Stripe. See [`STRIPE_MODES.md`](STRIPE_MODES.md) for
the full guide. The per-production price is read from the
`PRICE_PER_PRODUCTION_GBP_PENCE` secret (default 200, i.e. £2).

**Status**: preserved as-is; not actively being iterated on while we focus on
the alerting core.

### Supabase (`supabase/`)

- **Database** — see [`DATABASE.md`](DATABASE.md).
- **Edge functions** (Deno runtime, deployed via `supabase functions deploy`):
  - `create-checkout-session` — builds a Stripe Checkout Session for a
    production + user at `PRICE_PER_PRODUCTION_GBP_PENCE`. For auto-renew
    plans it also sets `cancel_at = production.end_date + 7 days` on the
    Stripe Subscription so renewals stop themselves once the show ends.
  - `stripe-webhook` — consumes Stripe events, keeps
    `subscriptions.payment_status` / `current_period_start` /
    `last_payment_intent_id` in sync, fires signup + renewal +
    cancellation emails, and refunds any renewal that Stripe fires after
    the production's end date (belt-and-braces for the `cancel_at` above).
  - `subscription-management` — token-gated manage page (one-click
    cancel). Enforces the refund guarantee: if no standing tickets have
    been found since the subscription's current billing period started,
    the last PaymentIntent is refunded and the subscription is cancelled
    immediately; otherwise it's cancelled at period end.
  - `send-test-email` — admin basic-auth gated; renders and sends each of
    the signup / renewal / cancellation / expiry templates with stub
    data. Used from the `/monitor` "Email templates" panel.
  - `admin-auth` — basic auth gate for `/monitor`.
  - `status-dashboard` — read-only health snapshot: per-production state,
    extension heartbeat freshness, DB size, Resend usage, Stripe activity.
  - `report-scrape` — *write* endpoint used by the Firefox extension. Takes
    a shared-secret header (`X-Scraper-Secret`) and:
    - inserts a row into `scrape_heartbeats`
    - upserts the extension's current scheduler settings
      (`pollMinutes`, `activeHoursStart`, `activeHoursEnd`, `timezone`) into
      the singleton `scraper_settings` row so the monitor can tell "offline"
      from "outside active hours"
    - updates `productions.last_seen_status` / `last_checked_at`
      (and `last_availability_transition_at` on the flip)
    - **fans availability emails out** to every paid subscriber whose
      `last_alerted_at` is older than the current availability event
      (one email per subscriber per event, 200-per-cycle safety cap)
    - also sends the legacy operator copy to `ALERT_EMAIL` on each
      transition, so operators see every flip in their own inbox
    - fires a Resend "scraper stuck" email (throttled) when the extension
      self-reports it can't get past Cloudflare / Queue-it
  - `admin-preview-cancel` — admin basic-auth gated, read-only. Given a
    subscription id / management token / (email + production slug),
    returns the exact refund + Stripe + email effect that
    `subscription-management` cancel would produce, without actually
    doing it. Shares its guarantee logic with `subscription-management`
    so the admin panel and manage page always agree.
  - `admin-test-fixture` — admin basic-auth gated. Maintains a hidden
    `test-fixture` production (adapter=`none`, filtered out of public
    listings by `slug LIKE 'test-%'`) and exposes five actions —
    `reset`, `simulate-available`, `simulate-tickets-found`,
    `clear-alert-state`, `delete` — so the full signup → pay → alert →
    cancel flow can be exercised end-to-end without touching real
    shows. The `simulate-available` action calls `report-scrape`
    internally with the shared secret so the real fan-out path runs.
    See [`TESTING.md`](TESTING.md).
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
   - `GET /api/events/getbymonth?requestedTime=YYYY/MM/01&salesChannel=Web&seriesCode=<code>`
     — returns every performance in the current month. The extension filters
     to rows whose `LocalDate` starts with today's London date and whose
     `HasProducts === true` and `IsBeforeSaleDate === false`.
   - For each surviving `ID`,
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

### Notifications

When a scrape reports `available`:

1. `report-scrape` updates `productions.last_standing_tickets_found_at`
   on every matching cycle.
2. On a clean `unavailable → available` flip, it additionally sets
   `productions.last_availability_transition_at = now`. This is the
   **per-event anchor** — distinct from `last_standing_tickets_found_at`,
   which ticks every cycle while tickets exist and would otherwise
   re-trigger fan-out forever.
3. The fan-out then selects `subscriptions` where
   `payment_status='paid' AND subscription_end > now AND (last_alerted_at IS NULL OR last_alerted_at < last_availability_transition_at)`,
   joined with `users`. For each match we send a Resend availability
   email, bump `subscriptions.last_alerted_at`, and insert a
   `notification_logs` row with the user's id.
4. In parallel, an operator copy goes to `ALERT_EMAIL` on the transition
   so the operator sees every flip (useful while launching).

Practical consequences:

- Each subscriber gets **one** email per availability event — not one
  every 10 minutes while tickets are still there.
- Someone who subscribes *during* ongoing availability catches the next
  cycle (their `last_alerted_at` is NULL, which always predates the
  transition anchor).
- `availability → unavailable → available` counts as a **new event**
  and re-alerts everyone.
- Fan-out is capped at 200 recipients per cycle for safety. Above that
  we'd want a queue; not needed at current volume.

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

- **Mac mini offline / Firefox closed** → no heartbeats. During the
  extension's configured active window (`scraper_settings.active_hours_*`)
  the `/monitor` dashboard flags the scraper as unhealthy if no heartbeat
  arrives within 2× `poll_minutes`. Outside the window it renders as
  "paused" (grey) instead — the extension isn't expected to be running.
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
