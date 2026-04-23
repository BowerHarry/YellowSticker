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
| `scraping_url`                      | `text`        | landing/series URL                                                              |
| `last_seen_status`                  | `text`        | `unknown` \| `available` \| `unavailable`                                       |
| `last_checked_at`                   | `timestamptz` | set by the worker on every run                                                  |
| `last_standing_tickets_found_at`    | `timestamptz` | set by the worker whenever the run returns `available`                          |
| `description`                       | `text`        | optional marketing copy                                                         |
| `poster_url`                        | `text`        | optional                                                                        |
| `start_date` / `end_date`           | `date`        | the worker only scrapes productions where today ∈ [start_date, end_date]        |

### `subscriptions`

Links a user to a production they've paid to be alerted about.

| column                | type          | notes                                                       |
|-----------------------|---------------|-------------------------------------------------------------|
| `id`                  | `uuid`        | primary key                                                 |
| `user_id`             | `uuid`        | FK → `users.id` (cascade)                                   |
| `production_id`       | `uuid`        | FK → `productions.id` (cascade)                             |
| `payment_status`      | `text`        | `pending` \| `paid` \| `failed` \| `cancelled`              |
| `subscription_start`  | `timestamptz` | filled in by the Stripe webhook                             |
| `subscription_end`    | `timestamptz` | filled in by the Stripe webhook                             |
| `stripe_session_id`   | `text`        | Stripe Checkout session                                     |
| `management_token`    | `text`        | used by the manage-subscription links in email footers      |
| `created_at` / `updated_at` | `timestamptz` |                                                       |

Unique on `(user_id, production_id)` so re-subscribing updates the row.

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

### `scraper_usage_daily`

Legacy daily counter written by the old ScrapingBee-based scraper. **Not written to any more** but kept in place so the `status-dashboard` edge function doesn't break. Drop in a future migration once the dashboard is refactored away from it.

## Indexes

See `supabase/migrations/20241114001_init.sql` and `20241116003_add_theatres_table.sql`. Key indexes:

- `productions(theatre_id)`
- `subscriptions(production_id)`
- `notification_logs(production_id)`

## Access patterns

- **Web SPA** uses the **anon key** to read `productions` (public data) and create pending `subscriptions` via the `create-checkout-session` edge function (which uses the service-role key internally).
- **Edge functions** use the **service-role key** (set via `supabase secrets set`).
- **Scraper worker** uses the **service-role key** to read productions and write `last_seen_status` etc.

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
| `20260423001_remove_scrape_cron.sql`           | **NEW** — unschedules the old pg_cron job                    |
