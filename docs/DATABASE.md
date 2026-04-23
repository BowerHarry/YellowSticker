# Database schema

All tables live in the `public` schema. Migrations are in [`supabase/migrations/`](../supabase/migrations) and run in timestamp order.

## Tables

### `users`

One row per person who has ever signed up.

| column                   | type          | notes                                                   |
|--------------------------|---------------|---------------------------------------------------------|
| `id`                     | `uuid`        | primary key                                             |
| `email`                  | `text`        | unique                                                  |
| `phone`                  | `text`        | nullable (SMS was never wired up)                       |
| `notification_preference`| `text`        | `email` \| `sms` \| `both`                              |
| `created_at` / `updated_at` | `timestamptz` | auto-maintained                                      |

### `theatres`

Scraping configuration per venue.

| column                     | type       | notes                                                     |
|----------------------------|------------|-----------------------------------------------------------|
| `id`                       | `uuid`     | primary key                                               |
| `name`                     | `text`     | unique, matches `productions.theatre`                     |
| `standing_ticket_prefixes` | `text[]`   | e.g. `{'STALLS-STAND-', 'GRAND CIRCLE-STAND-'}`           |
| `created_at` / `updated_at`| `timestamptz` |                                                        |

### `productions`

One row per show we scrape.

| column                              | type          | notes                                                                           |
|-------------------------------------|---------------|---------------------------------------------------------------------------------|
| `id`                                | `uuid`        | primary key                                                                     |
| `slug`                              | `text`        | unique; also used as part of performance URL patterns                           |
| `name`                              | `text`        | display name                                                                    |
| `theatre`                           | `text`        | legacy denormalised theatre name (still used for scraper matching)              |
| `theatre_id`                        | `uuid`        | FK → `theatres.id`                                                              |
| `city`                              | `text`        | optional                                                                        |
| `scraping_url`                      | `text`        | public box-office page; used as hidden-tab target when CF cookies need refreshing |
| `series_code`                       | `text`        | ticketing-system-specific identifier (Delfont series code, e.g. `GIEOLI`)       |
| `adapter`                           | `text`        | scraping adapter: `delfont` or `none` (skipped). Default `delfont`.             |
| `scrape_disabled_reason`            | `text`        | if non-null, the extension skips this production                                |
| `last_seen_status`                  | `text`        | `unknown` \| `available` \| `unavailable`                                       |
| `last_checked_at`                   | `timestamptz` | set by `report-scrape` on every scrape cycle                                    |
| `last_standing_tickets_found_at`    | `timestamptz` | set when a scrape returns `available`                                           |
| `description`                       | `text`        | optional marketing copy                                                         |
| `poster_url`                        | `text`        | optional                                                                        |
| `start_date` / `end_date`           | `date`        | the extension only scrapes productions where today ∈ [start_date, end_date]     |

### `subscriptions`

Links a user to a production they've paid to be alerted about.

| column                       | type          | notes                                                                           |
|------------------------------|---------------|---------------------------------------------------------------------------------|
| `id`                         | `uuid`        | primary key                                                                     |
| `user_id`                    | `uuid`        | FK → `users.id` (cascade)                                                       |
| `production_id`              | `uuid`        | FK → `productions.id` (cascade)                                                 |
| `payment_status`             | `text`        | `pending` \| `paid` \| `failed` \| `cancelled` \| `refunded` \| `refund_failed` |
| `payment_type`               | `text`        | `subscription` (auto-renew) \| `one-time` (single month)                        |
| `subscription_start`         | `timestamptz` | set by the Stripe webhook                                                       |
| `subscription_end`           | `timestamptz` | set by the Stripe webhook (matches Stripe `current_period_end`)                 |
| `current_period_start`       | `timestamptz` | start of the billing window covered by the most recent charge                   |
| `stripe_session_id`          | `text`        | Stripe Checkout session                                                         |
| `stripe_subscription_id`     | `text`        | Stripe Subscription id (auto-renew only)                                        |
| `stripe_customer_id`         | `text`        | Stripe Customer id                                                              |
| `last_payment_intent_id`     | `text`        | PaymentIntent for the most recent successful charge (what we refund)            |
| `last_charge_amount_pence`   | `int`         | amount (pence) of the most recent charge                                        |
| `management_token`           | `text`        | used by the manage-subscription links in email footers                          |
| `cancellation_reason`        | `text`        | free-form, e.g. `user_cancel`, `production_ended`                               |
| `created_at` / `updated_at`  | `timestamptz` |                                                                                 |

Unique on `(user_id, production_id)` so re-subscribing updates the row.

**Refund guarantee** is computed from this table + `productions`: if
`productions.last_standing_tickets_found_at` is NULL or
`<= subscriptions.current_period_start`, then no tickets have been found
during the current billing period and the subscription is eligible for a
full refund of `last_payment_intent_id` on cancellation.

### `notification_logs`

One row per email sent (or attempted), for audit.

| column                | type          | notes                                                                  |
|-----------------------|---------------|------------------------------------------------------------------------|
| `id`                  | `uuid`        | primary key                                                            |
| `user_id`             | `uuid`        | FK → `users.id`; **nullable** (null for worker's `ALERT_EMAIL` sends)  |
| `production_id`       | `uuid`        | FK → `productions.id`                                                  |
| `sent_at`             | `timestamptz` | default `now()`                                                        |
| `type`                | `text`        | `email` \| `sms`                                                       |
| `channel_message_id`  | `text`        | provider id (legacy field; the scraper writes it inside `payload`)     |
| `payload`             | `jsonb`       | provider id, recipient, reason, stand count, etc.                      |

### `scrape_heartbeats`

Append-only log of scrape-result reports from the Firefox extension.

| column               | type          | notes                                                              |
|----------------------|---------------|--------------------------------------------------------------------|
| `id`                 | `uuid`        | primary key                                                        |
| `reported_at`        | `timestamptz` | default `now()`                                                    |
| `extension_version`  | `text`        | e.g. `'1.0.0'`                                                     |
| `kind`               | `text`        | `scrape` \| `stuck` \| `resumed` \| `boot`                         |
| `production_id`      | `uuid`        | nullable; set for `scrape`                                         |
| `status`             | `text`        | `available` \| `unavailable` \| `error`                            |
| `stand_count`        | `int`         | number of standing tickets found                                   |
| `performance_count`  | `int`         | number of today's performances checked                             |
| `detail`             | `jsonb`       | free-form — raw per-performance results, CF diagnostics, etc.      |

Indexed on `reported_at` (desc) and `(production_id, reported_at desc)` so
the status dashboard and admin queries are cheap.

### `scraper_settings`

Singleton row (always `id = 1`) holding the Firefox extension's current
scheduler settings. Upserted by `report-scrape` on every heartbeat; read by
`status-dashboard` to decide whether a missing heartbeat means the
extension is offline or just outside its configured active window.

| column               | type          | notes                                                 |
|----------------------|---------------|-------------------------------------------------------|
| `id`                 | `int`         | always `1` (`CHECK` constraint)                       |
| `poll_minutes`       | `int`         | extension's `pollMinutes` setting                     |
| `active_hours_start` | `int`         | hour-of-day (0-23) the window opens                   |
| `active_hours_end`   | `int`         | hour-of-day (0-23, exclusive) the window closes       |
| `timezone`           | `text`        | IANA zone used for the window (e.g. `Europe/London`)  |
| `extension_version`  | `text`        | last-reported version string                          |
| `updated_at`         | `timestamptz` | auto-touched on every upsert                          |

### `scraper_usage_daily`

Legacy daily counter written by the old ScrapingBee-based scraper. **Not
written to any more** but kept in place so the `status-dashboard` edge
function doesn't break. Drop in a future migration once the dashboard is
refactored away from it.

## Indexes

See `supabase/migrations/20241114001_init.sql` and `20241116003_add_theatres_table.sql`. Key indexes:

- `productions(theatre_id)`
- `subscriptions(production_id)`
- `notification_logs(production_id)`

## Access patterns

- **Web SPA** uses the **anon key** to read `productions` (public data) and create pending `subscriptions` via the `create-checkout-session` edge function (which uses the service-role key internally).
- **Edge functions** use the **service-role key** (set via `supabase secrets set`).
- **Firefox extension** uses the **anon key** to read `productions`, and posts write-requests to the `report-scrape` edge function with a shared secret in the `X-Scraper-Secret` header. It never sees the service-role key.

## Migrations reference

| file                                           | purpose                                                      |
|------------------------------------------------|--------------------------------------------------------------|
| `20241114001_init.sql`                         | tables + triggers                                            |
| `20241114002_setup_cron.sql`                   | pg_cron job for the old scrape-tickets edge function         |
| `20241115003_monitoring.sql`                   | `scraper_usage_daily` + `increment_scraper_usage` + db-size  |
| `20241115004_update_cron_schedule.sql`         | tuned the old cron schedule                                  |
| `20241115005_add_last_standing_tickets_found.sql` | added the column                                          |
| `20241115006_fix_cron_wrapper.sql`             | cron wrapper fix                                             |
| `20241115007_improve_error_handling.sql`       | error-handling tweaks                                        |
| `20241115008_add_city_and_poster.sql`          | added `city` + `poster_url` columns                          |
| `20241115009_setup_storage.sql`                | Supabase Storage bucket for posters                          |
| `20241116001_add_management_token.sql`         | manage-subscription token on `subscriptions`                 |
| `20241116002_add_production_dates.sql`         | `start_date` / `end_date`                                    |
| `20241116003_add_theatres_table.sql`           | `theatres` table + FK                                        |
| `20260423001_remove_scrape_cron.sql`           | unschedules the old pg_cron job                              |
| `20260423002_extension_scraper.sql`            | `series_code` / `adapter`, `scrape_heartbeats` table         |
| `20260423003_scraper_settings.sql`             | singleton `scraper_settings` table so the monitor knows the extension's active window |
| `20260423004_billing_state.sql`                | billing state on `subscriptions` (Stripe ids, PaymentIntent, `current_period_start`, `payment_type`, `refunded` / `refund_failed` states) for the refund guarantee |
