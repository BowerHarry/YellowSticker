-- Update the cron schedule to run only between 8am-6pm (every 15 minutes)
-- First, unschedule the old job if it exists
select cron.unschedule('scrape-tickets') where exists (
  select 1 from cron.job where jobname = 'scrape-tickets'
);

-- Schedule the new job with time restrictions
select cron.schedule(
  'scrape-tickets',
  '*/15 8-17 * * *',
  $cron$
  -- Only run if current hour is between 8am and 5:59pm (UTC)
  -- This provides an extra safety check in case cron timing is off
  do $$
  declare
    current_hour int;
  begin
    current_hour := extract(hour from now());
    if current_hour >= 8 and current_hour < 18 then
      perform public.invoke_scrape_tickets();
    else
      raise notice 'Skipping scrape-tickets: outside allowed hours (8am-6pm UTC). Current hour: %', current_hour;
    end if;
  end $$;
  $cron$
);

