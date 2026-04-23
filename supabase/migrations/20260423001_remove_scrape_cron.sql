-- Scraping is now performed by the standalone `scraper-service` worker
-- (see scraper-service/README.md). The Supabase edge function that used to
-- drive it has been removed, so the pg_cron job that invoked it must go too.

-- Drop the scheduled job if it exists. `cron.unschedule` errors if the job
-- is missing, so we wrap it in an anonymous block.
do $$
begin
  if exists (select 1 from cron.job where jobname = 'scrape-tickets') then
    perform cron.unschedule('scrape-tickets');
  end if;
exception
  when undefined_table then
    -- pg_cron not installed in this environment; nothing to unschedule.
    null;
end;
$$;

-- Retire the invoker function; it called an edge function that no longer exists.
drop function if exists public.invoke_scrape_tickets();

-- Leave scraper_usage_daily + increment_scraper_usage in place for now.
-- They're unused by the new worker but harmless, and dropping them would
-- break the status-dashboard edge function until it's updated in the same
-- deploy. If you want them gone later, drop them in a follow-up migration
-- once the dashboard stops referencing them.
