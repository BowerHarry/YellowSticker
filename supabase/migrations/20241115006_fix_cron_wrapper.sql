-- Drop the function if it exists (in case return type changed)
drop function if exists public.invoke_scrape_tickets_guarded();

-- Create wrapper function that checks time window and calls the scraper
-- This allows pg_cron to properly track success/failure
create function public.invoke_scrape_tickets_guarded()
returns text
language plpgsql
security definer
as $$
declare
  current_hour int;
  request_id bigint;
begin
  current_hour := extract(hour from now());
  
  -- Only run if current hour is between 8am and 5:59pm (UTC)
  if current_hour >= 8 and current_hour < 18 then
    -- Call the actual function
    perform public.invoke_scrape_tickets();
    return 'scrape-tickets invoked successfully';
  else
    raise notice 'Skipping scrape-tickets: outside allowed hours (8am-6pm UTC). Current hour: %', current_hour;
    return format('skipped: outside hours (current hour: %)', current_hour);
  end if;
end;
$$;

-- Update the cron job to call the wrapper function
-- First, unschedule the old job if it exists
select cron.unschedule('scrape-tickets') where exists (
  select 1 from cron.job where jobname = 'scrape-tickets'
);

-- Schedule the new job to call the wrapper (runs every 15 minutes)
-- The wrapper will enforce the 8am-6pm UTC window
select cron.schedule(
  'scrape-tickets',
  '*/15 * * * *',
  $$select public.invoke_scrape_tickets_guarded();$$
);

-- Improve invoke_scrape_tickets to better handle the HTTP call
-- Note: net.http_post is asynchronous, so we can't wait for the response
-- But we can at least verify the request was queued
create or replace function public.invoke_scrape_tickets()
returns void
language plpgsql
security definer
as $$
declare
  function_url text;
  service_role_key text;
  request_id bigint;
begin
  -- Get the function URL
  function_url := current_setting('app.settings.functions_url', true);
  
  -- Get service role key from secrets
  service_role_key := current_setting('app.settings.service_role_key', true);
  
  -- If not set, use hardcoded values (fallback)
  if function_url is null then
    function_url := 'https://chdluifdihnezhvsjaaj.supabase.co/functions/v1/scrape-tickets';
  end if;
  
  if service_role_key is null then
    service_role_key := 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNoZGx1aWZkaWhuZXpodnNqYWFqIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2MzE0OTI0MywiZXhwIjoyMDc4NzI1MjQzfQ.2mzrFUHm6JZxCrS44hcx1nVvzEYv20TTMmnPOiaFZ4A';
  end if;
  
  -- Make HTTP request to edge function
  -- net.http_post returns a request_id (bigint) for async requests
  begin
    select net.http_post(
      url := function_url,
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || service_role_key
      )
    ) into request_id;
    
    -- Log the request ID for debugging
    raise notice 'Queued HTTP request to scrape-tickets function, request_id: %, url: %', request_id, function_url;
    
  exception when others then
    -- If HTTP call fails, log the error
    raise warning 'Failed to queue HTTP request to scrape-tickets: %', sqlerrm;
    raise; -- Re-raise to fail the function
  end;
  
  -- Note: We can't wait for the response here since net.http_post is async
  -- The Edge Function will execute asynchronously
  -- To check if it succeeded, query net.http_response table later or check Edge Function logs
end;
$$;

