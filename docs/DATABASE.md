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

### `productions`

One row per show we scrape.

| column                              | type          | notes                                                                           |
|-------------------------------------|---------------|---------------------------------------------------------------------------------|
| `id`                                | `uuid`        | primary key                                                                     |
| `slug`                              | `text`        | unique; also used as part of performance URL patterns                           |
| `name`                              | `text`        | display name                                                                    |
| `theatre`                           | `text`        | display name of the venue; also used by adapters for per-theatre dispatch       |
| `city`                              | `text`        | optional                                                                        |
| `scraping_url`                      | `text`        | public box-office page; used as hidden-tab target when CF cookies need refreshing |
| `series_code`                       | `text`        | ticketing-system-specific identifier (Delfont series code, e.g. `GIEOLI`)       |
| `adapter`                           | `text`        | scraping adapter: `delfont` or `none` (skipped). Default `delfont`.             |
| `scrape_disabled_reason`            | `text`        | if non-null, the extension skips this production                                |
| `last_seen_status`                  | `text`        | `unknown` \| `available` \| `unavailable`                                       |
| `last_checked_at`                   | `timestamptz` | set by `report-scrape` on every scrape cycle                                    |
| `last_standing_tickets_found_at`    | `timestamptz` | set on every scrape cycle while tickets are available                           |
| `last_availability_transition_at`   | `timestamptz` | set **only** on `unavailable → available` flips; anchors per-subscriber alert fan-out |
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
| `last_alerted_at`            | `timestamptz` | most recent availability email sent to this subscriber; used to dedupe fan-out  |
| `is_test_mode`               | `bool`        | `true` if created / activated while `STRIPE_SECRET_KEY` was `sk_test_…`. See [STRIPE_MODES.md](./STRIPE_MODES.md) |
| `created_at` / `updated_at`  | `timestamptz` |                                                                                 |

Unique on `(user_id, production_id)` so re-subscribing updates the row.

**Refund guarantee** is computed from this table + `productions`: if
`productions.last_standing_tickets_found_at` is NULL or
`<= subscriptions.current_period_start`, then no tickets have been found
during the current billing period and the subscription is eligible for a
full refund of `last_payment_intent_id` on cancellation.

**Alert fan-out** is keyed on `subscriptions.last_alerted_at` vs
`productions.last_availability_transition_at`: whenever a scrape reports
`available`, `report-scrape` emails every paid + in-window subscription
whose `last_alerted_at` is NULL or older than the production's latest
`unavailable → available` transition, then bumps `last_alerted_at` on
each. This gives subscribers exactly one email per availability event
(with a 200-per-cycle safety cap), while letting anyone who subscribed
mid-availability catch the next cycle.

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

## Indexes

- `subscriptions(production_id)`
- `subscriptions(production_id, subscription_end) where payment_status='paid'` — partial index for the availability fan-out query
- `subscriptions(is_test_mode)`
- `notification_logs(production_id)`
- `scrape_heartbeats(reported_at desc)` / `(production_id, reported_at desc)`

## Access patterns

- **Web SPA** uses the **anon key** to read `productions` (public data) and create pending `subscriptions` via the `create-checkout-session` edge function (which uses the service-role key internally).
- **Edge functions** use the **service-role key** (set via `supabase secrets set`).
- **Firefox extension** uses the **anon key** to read `productions`, and posts write-requests to the `report-scrape` edge function with a shared secret in the `X-Scraper-Secret` header. It never sees the service-role key.

### Row level security

RLS is enabled on every table in `public` (`20260727120000_enable_rls.sql`):

- **`productions`** has one policy — `select` for `anon` + `authenticated`. This is the only table either the web SPA or the extension queries directly, and both only read it. Writes with the publishable key are refused.
- **`users`, `subscriptions`, `notification_logs`, `scrape_heartbeats`, `scraper_settings`** are deny-all: nothing outside the service role touches them, so the API roles get nothing. Each carries a single `using (false) with check (false)` policy (`20260728130000_explicit_deny_policies.sql`) that grants nothing — it exists to state the intent in the schema and to clear the `rls_enabled_no_policy` lint. To expose one of these later, add a policy *alongside* it; permissive policies are OR'd, so the deny-all one won't block it.

Edge functions are unaffected throughout — they go through `adminClient` (`functions/_shared/db.ts`), and the service role bypasses RLS.

Two consequences worth remembering when adding features:

- Any new browser-side read needs an explicit policy, or it silently returns zero rows.
- RLS is row-level only. `productions` is selected with `*`, so every column on it — including `scraping_url`, `series_code`, `adapter` — is public. Don't add a secret-bearing column to that table.

### Checking the live posture

Migrations describe intent; prod can drift from them (a `get_database_size_bytes` grant to `anon` was found in July 2026 that no migration ever made). These queries check the database itself. Run them in the SQL Editor after any security-related change.

Every table, its RLS state and policy count — a table here that isn't in the migrations is unprotected and needs one:

```sql
select c.relname, c.relrowsecurity as rls_enabled, (select count(*) from pg_policies p where p.schemaname = 'public' and p.tablename = c.relname) as policies from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relkind = 'r' order by 1;
```

Expected: all `rls_enabled = true`, and `productions` the only row with a policy.

What the API roles can execute — nothing should be callable by `anon`:

```sql
select n.nspname || '.' || p.proname as function, has_function_privilege('anon', p.oid, 'execute') as anon, has_function_privilege('authenticated', p.oid, 'execute') as authenticated, p.prosecdef as security_definer, p.proconfig as settings from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' order by 1;
```

Expected: `set_updated_at` (a trigger function, with `search_path=` pinned) and `get_database_size_bytes` (service role only).

Any database-side HTTP call — this project has none; all outbound requests come from edge functions:

```sql
select n.nspname || '.' || p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace where p.prosrc ilike '%net.http%';
```

Leftover privileged values in database configuration:

```sql
select name, setting from pg_settings where name like 'app.settings.%';
```

Expected: no rows. See [`SECRETS.md`](./SECRETS.md) if `app.settings.service_role_key` is still set.

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
| `20260423005_subscription_alerts.sql`          | `subscriptions.last_alerted_at` + `productions.last_availability_transition_at` + partial index for per-user availability fan-out |
| `20260423006_stripe_mode_flag.sql`             | `subscriptions.is_test_mode` so test vs live Stripe rows can be told apart without calling Stripe |
| `20260423007_drop_dead_tables.sql`             | drops `scraper_usage_daily` + `increment_scraper_usage()` (legacy pg_cron bookkeeping) and `theatres` + `productions.theatre_id` (abandoned normalisation that the app never read) |
| `20260423140000_invoke_scrape_tickets_require_db_settings.sql` | hardened the old cron invoker (since dropped — see `20260727130000`) |
| `20260423150000_invoke_scrape_tickets_apikey_header.sql` | sent `apikey` + `Authorization` from the old cron invoker (since dropped) |
| `20260424120000_telegram_notifications.sql`    | `users.telegram_chat_id` / `telegram_link_token` for standing-ticket alerts |
| `20260425180000_subscription_notification_preference.sql` | per-subscription `notification_preference` |
| `20260426120000_telegram_pending_welcome.sql`  | `telegram_pending_welcome_html` staged until `/start` |
| `20260727120000_enable_rls.sql`                | enables RLS on every `public` table; public `select` policy on `productions`, deny-all elsewhere |
| `20260727130000_lint_hardening.sql`            | drops the dead `invoke_scrape_tickets` + `_guarded` functions, pins `set_updated_at`'s `search_path`, restricts `get_database_size_bytes()` to `service_role`, removes the listable-bucket policy on `storage.objects` |
| `20260728120000_drop_pg_net.sql`               | drops `pg_net` — unused once the cron invoker is gone (no webhooks, no cron jobs) |
| `20260728130000_explicit_deny_policies.sql`    | no-op `using (false)` policies on the five deny-all tables, so the schema states the intent and the `rls_enabled_no_policy` lint clears |
