-- Enable row level security on every table in `public`.
--
-- Supabase's default grants give the `anon` and `authenticated` roles table
-- privileges on `public`, and RLS is the only thing that constrains them.
-- With RLS off, the publishable key — which ships in the website's JS bundle
-- and in the Firefox extension's options page — grants full read *and write*
-- on all of these tables via PostgREST. Anyone could PATCH a `scraping_url`
-- or DELETE every production.
--
-- The service role bypasses RLS entirely, so none of the edge functions are
-- affected: they all go through the single `adminClient` in
-- `functions/_shared/db.ts`, built from a secret key. Likewise DB-side
-- functions and the pg_cron wrappers, which run as the table owner.
--
-- Rollback for any individual table is:
--   alter table public.<name> disable row level security;

-- ---- productions: publicly readable, nothing else -------------------------
-- Two anon-key readers, both read-only:
--   * the website  — `web/src/lib/api.ts` (getProductions,
--     getComingSoonProductions, getProductionBySlug)
--   * the extension — `firefox-extension/background.js`
--     (listActiveProductions)
-- `using (true)` reproduces today's read behaviour exactly; the change is
-- that INSERT/UPDATE/DELETE from the publishable key stop working.
--
-- Note this is row-level only: the website selects `*`, so `scraping_url`,
-- `series_code`, `adapter` and `scrape_disabled_reason` remain publicly
-- visible. Narrowing that needs column grants or a public view, and the
-- extension genuinely reads those columns — separate piece of work.
alter table public.productions enable row level security;

create policy "productions are publicly readable"
  on public.productions
  for select
  to anon, authenticated
  using (true);

-- ---- everything else: deny-all to anon ------------------------------------
-- No policies at all, deliberately. Nothing outside the service role touches
-- these tables — `productions` is the only table the website or the extension
-- query — so RLS with no policy is the correct posture: anon gets nothing,
-- edge functions are unaffected.
--
-- These hold the data that actually matters: emails and phone numbers
-- (`users`), telegram chat IDs and link tokens (`users`), Stripe customer and
-- subscription IDs (`subscriptions`), and `subscriptions.management_token` —
-- a bearer token that lets whoever holds it cancel a subscription.
alter table public.users enable row level security;
alter table public.subscriptions enable row level security;
alter table public.notification_logs enable row level security;
alter table public.scrape_heartbeats enable row level security;
alter table public.scraper_settings enable row level security;
