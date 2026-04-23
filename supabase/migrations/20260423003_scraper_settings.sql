-- Persist the Firefox extension's scheduling settings server-side so the
-- monitor page can answer "is the scraper online?" correctly. Without this
-- we don't know the extension's polling interval or active-hours window,
-- which are user-editable on the extension's options page.
--
-- The extension POSTs these settings as part of every `report-scrape`
-- payload; the edge function upserts them here. A single-row table is
-- enough — there's one extension deployment per account.

create table if not exists public.scraper_settings (
  id integer primary key default 1,
  poll_minutes integer not null default 10,
  active_hours_start integer not null default 8,
  active_hours_end integer not null default 22,
  timezone text not null default 'Europe/London',
  extension_version text,
  updated_at timestamptz not null default timezone('utc', now()),
  constraint scraper_settings_singleton check (id = 1)
);

comment on table public.scraper_settings is
  'Singleton (id=1) snapshot of the Firefox extension''s scheduling settings, refreshed by the report-scrape edge function. Used by the monitor dashboard to decide whether a missing heartbeat means "extension is offline" or just "outside configured active hours".';

comment on column public.scraper_settings.poll_minutes is
  'Scrape cycle interval in minutes (matches the extension''s `pollMinutes` setting).';
comment on column public.scraper_settings.active_hours_start is
  'Hour of day (0-23, in the extension timezone) when scraping begins.';
comment on column public.scraper_settings.active_hours_end is
  'Hour of day (0-23, exclusive) when scraping stops. If end <= start the window crosses midnight.';
comment on column public.scraper_settings.timezone is
  'IANA timezone name used by the extension when interpreting active-hour bounds.';

insert into public.scraper_settings (id)
values (1)
on conflict (id) do nothing;
