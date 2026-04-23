-- Drop schema baggage that no code reads or writes anymore.
--
-- 1. `scraper_usage_daily` + `increment_scraper_usage()` — populated
--    by the old pg_cron scraper (removed in
--    `20260423001_remove_scrape_cron.sql`). The Firefox extension
--    records per-cycle detail in `scrape_heartbeats`, which is the
--    new canonical source.
--
-- 2. `theatres` table + `productions.theatre_id` FK — the theatres
--    table was an abandoned attempt at normalising venue data and
--    per-theatre standing-ticket config. `productions.theatre` (text)
--    is still the column the app + adapters actually use. `theatre_id`
--    was only ever written by `seed.sql`'s one-shot backfill and is
--    never read.
--
-- 3. `standing_ticket_prefixes` on `theatres` — each adapter hard-codes
--    its own standing-ticket detection (see `firefox-extension/background.js`
--    Delfont adapter, which inspects the seat-map's `SeatAlertValues`
--    for `displayName === 'Standing'`). This column never drove any
--    behaviour.

-- ---- 1. scraper_usage_daily ----------------------------------------------
drop function if exists public.increment_scraper_usage(integer);
drop table if exists public.scraper_usage_daily;

-- ---- 2 + 3. theatres + productions.theatre_id ----------------------------
-- The FK would block the table drop, so clear the column first.
alter table public.productions
  drop column if exists theatre_id;

drop table if exists public.theatres;
