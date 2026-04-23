-- Support the Firefox-extension scraper (replaces the Dockerised Puppeteer
-- worker). The extension needs two things the schema doesn't currently model:
--
--   1. A per-production `series_code` + `adapter` so it knows which API
--      endpoint to hit and how to parse the response.
--   2. A `scrape_heartbeats` table so the admin dashboard can tell whether
--      the extension is still ticking and whether it's healthy.
--
-- We also rename `productions.scraping_url` semantics to "public box office
-- page" (used as a fallback referer / for the cookie-refresh hidden tab),
-- and add `scrape_disabled_reason` so the extension can mark a production as
-- currently stuck without us having to remove it from the DB.

alter table public.productions
  add column if not exists series_code text,
  add column if not exists adapter text not null default 'delfont',
  add column if not exists scrape_disabled_reason text;

comment on column public.productions.series_code is
  'Ticketing-system-specific identifier (e.g. Delfont series code "GIEOLI"). The extension uses this to build API URLs. NULL means the production has no automated scraper yet.';
comment on column public.productions.adapter is
  'Which scraping adapter the extension should use. Currently only "delfont" is implemented.';
comment on column public.productions.scrape_disabled_reason is
  'If non-null, the extension skips this production. Set automatically when the production has failed repeatedly; cleared manually.';

-- Backfill series_code from existing scraping_url where possible. The URL
-- shape is https://buytickets.delfontmackintosh.co.uk/tickets/series/<CODE>.
update public.productions
set series_code = substring(scraping_url from '/series/([A-Za-z0-9_-]+)')
where series_code is null
  and scraping_url ~ '/series/[A-Za-z0-9_-]+';

-- Mark productions without a series_code as unsupported so the extension
-- skips them loudly rather than silently.
update public.productions
set adapter = 'none'
where series_code is null;

create index if not exists idx_productions_adapter_active
  on public.productions(adapter)
  where adapter <> 'none';

-- Heartbeat table: one row per report from the extension. Kept as an
-- append-only log rather than an upsert so we can see scraping cadence
-- over time. A cron/retention policy can prune old rows later.
create table if not exists public.scrape_heartbeats (
  id uuid primary key default gen_random_uuid(),
  reported_at timestamptz not null default timezone('utc', now()),
  extension_version text,
  kind text not null check (kind in ('scrape', 'stuck', 'resumed', 'boot')),
  production_id uuid references public.productions(id) on delete set null,
  status text check (status in ('available', 'unavailable', 'error')),
  stand_count integer,
  performance_count integer,
  detail jsonb
);

create index if not exists idx_scrape_heartbeats_reported_at
  on public.scrape_heartbeats(reported_at desc);
create index if not exists idx_scrape_heartbeats_production
  on public.scrape_heartbeats(production_id, reported_at desc);

comment on table public.scrape_heartbeats is
  'Append-only log of scrape-result reports from the Firefox extension. Used by the status dashboard to determine scraper liveness and to see per-production scrape history.';
