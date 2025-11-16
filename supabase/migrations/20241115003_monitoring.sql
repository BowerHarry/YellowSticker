-- Monitoring helpers: scraper usage + database size

create table if not exists public.scraper_usage_daily (
  usage_date date primary key default current_date,
  requests integer not null default 0,
  updated_at timestamptz not null default timezone('utc', now())
);

create or replace function public.increment_scraper_usage(usage_increment integer)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.scraper_usage_daily (usage_date, requests)
  values (current_date, usage_increment)
  on conflict (usage_date)
  do update set
    requests = public.scraper_usage_daily.requests + excluded.requests,
    updated_at = timezone('utc', now());
end;
$$;

-- ensure anon cannot call increment
revoke all on function public.increment_scraper_usage(integer) from public;
grant execute on function public.increment_scraper_usage(integer) to authenticated, service_role;

create or replace function public.get_database_size_bytes()
returns bigint
language sql
security definer
set search_path = public
as $$
  select pg_database_size(current_database());
$$;

revoke all on function public.get_database_size_bytes() from public;
grant execute on function public.get_database_size_bytes() to authenticated, service_role;
