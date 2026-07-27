-- Clear nine of the ten Supabase security lints. `pg_net` living in `public`
-- is deliberately left alone — see the note at the bottom of this file.
--
-- Nothing here changes behaviour for the website, the Firefox extension, or
-- any edge function. Details per section.

-- ---- 1. Retire the dead scrape plumbing -----------------------------------
-- `20260423001_remove_scrape_cron.sql` unscheduled the `scrape-tickets` cron
-- job and dropped `invoke_scrape_tickets()` when scraping moved to the Firefox
-- extension + `report-scrape`. Two later migrations
-- (`20260423140000`, `20260423150000`) then `create or replace`d the function
-- back into existence — hardening a function that had just been deleted, with
-- no cron job left to call it. `invoke_scrape_tickets_guarded()` was never
-- dropped at all. The edge function both of them POST to (`scrape-tickets`)
-- no longer exists.
--
-- Beyond being dead, `invoke_scrape_tickets` is `security definer` and
-- executable by `anon` over `/rest/v1/rpc/`: anyone holding the publishable
-- key could make the database fire an HTTP request carrying
-- `app.settings.service_role_key`. (Not a key disclosure — `net.http_post` is
-- async and returns only a request id — but an unauthenticated trigger for
-- outbound requests that carry the secret key.)

-- Belt and braces: pg_cron stores job commands as text, not as a dependency,
-- so dropping a function referenced by a live job would leave that job erroring
-- on every tick instead of failing loudly here. Unschedule anything that still
-- mentions these functions before removing them.
do $$
declare
  job record;
begin
  for job in
    select jobname from cron.job where command like '%invoke_scrape_tickets%'
  loop
    perform cron.unschedule(job.jobname);
    raise notice 'Unscheduled stale cron job: %', job.jobname;
  end loop;
exception
  when undefined_table then
    -- pg_cron not installed in this environment; nothing to unschedule.
    null;
end;
$$;

drop function if exists public.invoke_scrape_tickets_guarded();
drop function if exists public.invoke_scrape_tickets();

-- ---- 2. Pin set_updated_at's search_path ----------------------------------
-- `alter function` rather than `create or replace`: it leaves the body and the
-- attached triggers (users, productions, subscriptions) untouched.
--
-- The body only calls `timezone()` and `now()`, both in `pg_catalog`, which is
-- always searched implicitly — so an empty search_path is safe. If this
-- function ever grows a reference to a table, that reference must be
-- schema-qualified.
alter function public.set_updated_at() set search_path = '';

-- ---- 3. Lock down get_database_size_bytes ---------------------------------
-- Its only caller is the `status-dashboard` edge function, which goes through
-- `adminClient` (service role) and is unaffected by these grants.
--
-- `20241115003_monitoring.sql` already revoked this from `public` and granted
-- it to `authenticated, service_role`, yet the linter reports `anon` can
-- execute it — so prod privileges have drifted from the migration chain at
-- some point. Naming every role explicitly makes the end state unambiguous
-- regardless of how it drifted.
revoke all on function public.get_database_size_bytes() from public;
revoke all on function public.get_database_size_bytes() from anon;
revoke all on function public.get_database_size_bytes() from authenticated;
grant execute on function public.get_database_size_bytes() to service_role;

-- ---- 4. Stop the poster bucket being listable -----------------------------
-- `20241115009_setup_storage.sql` added a SELECT policy covering the whole
-- bucket, which lets any client enumerate every file in it.
--
-- Poster images are not served through that policy: the site builds
-- `/storage/v1/object/public/<bucket>/<path>` URLs by hand
-- (`web/src/lib/supabaseClient.ts`), and the public-object endpoint bypasses
-- RLS entirely for public buckets. The only other storage call in the codebase
-- is the upload in the `admin-create-production` edge function, which runs as
-- service role. Nothing anywhere calls `.list()`.
--
-- Net effect: posters keep loading, the bucket stops being enumerable. A
-- future admin file-browser would need its own, narrower policy.
drop policy if exists "Public read access for production posters" on storage.objects;

-- ---- Not addressed here: pg_net in `public` -------------------------------
-- `alter extension pg_net set schema extensions` can fail outright (the
-- extension may not be relocatable) and can break references depending on
-- where its objects actually live. Supabase Database Webhooks are also built
-- on pg_net and are configured in the dashboard rather than in this repo, so
-- the blast radius isn't visible from here.
--
-- After section 1, nothing in this repo uses pg_net at all — so the likely
-- resolution is dropping the extension rather than relocating it, once the
-- dashboard has been checked for webhooks. Deliberately a separate decision.
