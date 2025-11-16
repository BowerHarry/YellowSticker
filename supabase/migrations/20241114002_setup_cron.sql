-- Enable required extensions for cron and HTTP requests
create extension if not exists "pg_cron";
create extension if not exists "pg_net";

-- Note: pg_cron and pg_net must be enabled by Supabase support or via dashboard
-- If this migration fails, enable them manually in Supabase Dashboard → Database → Extensions

-- Function to call the scrape-tickets edge function
create or replace function public.invoke_scrape_tickets()
returns void
language plpgsql
security definer
as $$
declare
  function_url text;
  service_role_key text;
begin
  -- Get the function URL (replace with your actual project URL)
  function_url := current_setting('app.settings.functions_url', true);
  
  -- Get service role key from secrets (set via Supabase Dashboard → Settings → API)
  service_role_key := current_setting('app.settings.service_role_key', true);
  
  -- If not set, use environment variable approach
  if function_url is null then
    function_url := 'https://chdluifdihnezhvsjaaj.supabase.co/functions/v1/scrape-tickets';
  end if;
  
  -- Make HTTP request to edge function
  perform
    net.http_post(
      url := function_url,
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || coalesce(service_role_key, 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNoZGx1aWZkaWhuZXpodnNqYWFqIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2MzE0OTI0MywiZXhwIjoyMDc4NzI1MjQzfQ.2mzrFUHm6JZxCrS44hcx1nVvzEYv20TTMmnPOiaFZ4A')
      )
    );
end;
$$;

-- Schedule the cron job (runs every 15 minutes, 8am-6pm only)
-- Schedule format: minute hour day month weekday
-- '*/15 8-17 * * *' = every 15 minutes from 8am to 5:59pm (disabled 6pm-8am)
-- To run all day: '*/15 * * * *'
-- To run at specific times: '0 9,12,15,18 * * *' = at 9am, 12pm, 3pm, 6pm daily
select cron.schedule(
  'scrape-tickets',
  '*/15 8-17 * * *',
  $$
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
      raise notice 'Skipping scrape-tickets: outside allowed hours (8am-6pm). Current hour: %', current_hour;
    end if;
  end $$;
  $$
);

-- To view scheduled jobs:
-- select * from cron.job;

-- To unschedule:
-- select cron.unschedule('scrape-tickets');

