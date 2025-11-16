create extension if not exists "pgcrypto";

create table if not exists public.users (
  id uuid primary key default gen_random_uuid(),
  email text unique,
  phone text,
  notification_preference text not null default 'email' check (notification_preference in ('email', 'sms', 'both')),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.productions (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  name text not null,
  theatre text not null,
  scraping_url text not null,
  last_seen_status text default 'unknown' check (last_seen_status in ('unknown', 'available', 'unavailable')),
  last_checked_at timestamptz,
  description text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.users(id) on delete cascade,
  production_id uuid references public.productions(id) on delete cascade,
  payment_status text not null default 'pending' check (payment_status in ('pending', 'paid', 'failed', 'cancelled')),
  subscription_start timestamptz,
  subscription_end timestamptz,
  stripe_session_id text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (user_id, production_id)
);

create table if not exists public.notification_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.users(id) on delete cascade,
  production_id uuid references public.productions(id) on delete cascade,
  sent_at timestamptz not null default timezone('utc', now()),
  type text not null check (type in ('email', 'sms')),
  channel_message_id text,
  payload jsonb
);

create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$ language plpgsql;

create trigger set_timestamp_users
before update on public.users
for each row execute procedure public.set_updated_at();

create trigger set_timestamp_productions
before update on public.productions
for each row execute procedure public.set_updated_at();

create trigger set_timestamp_subscriptions
before update on public.subscriptions
for each row execute procedure public.set_updated_at();

create index if not exists idx_subscriptions_production on public.subscriptions(production_id);
create index if not exists idx_notification_logs_production on public.notification_logs(production_id);

