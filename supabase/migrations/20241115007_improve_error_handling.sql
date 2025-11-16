-- Improve invoke_scrape_tickets to better handle the HTTP call with error handling
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

