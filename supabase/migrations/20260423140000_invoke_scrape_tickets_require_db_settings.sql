-- Ensure invoke_scrape_tickets never relied on revoked or historical in-repo JWT fallbacks.
-- Applies the same contract as docs/SECRETS.md: app.settings.functions_url and app.settings.service_role_key.
create or replace function public.invoke_scrape_tickets()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  function_url text;
  service_role_key text;
  request_id bigint;
begin
  function_url := nullif(trim(coalesce(current_setting('app.settings.functions_url', true), '')), '');
  service_role_key := nullif(trim(coalesce(current_setting('app.settings.service_role_key', true), '')), '');

  if function_url is null then
    raise exception
      'app.settings.functions_url is not set (see docs/SECRETS.md).';
  end if;

  if service_role_key is null then
    raise exception
      'app.settings.service_role_key is not set (see docs/SECRETS.md).';
  end if;

  begin
    select net.http_post(
      url := function_url,
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'apikey', service_role_key,
        'Authorization', 'Bearer ' || service_role_key
      )
    ) into request_id;

    raise notice 'Queued HTTP request to scrape-tickets function, request_id: %, url: %', request_id, function_url;

  exception when others then
    raise warning 'Failed to queue HTTP request to scrape-tickets: %', sqlerrm;
    raise;
  end;
end;
$$;
