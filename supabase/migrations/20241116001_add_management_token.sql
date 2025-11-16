-- Add management_token to subscriptions table for email-based subscription management
alter table public.subscriptions 
add column if not exists management_token text unique;

-- Create index for fast lookups
create index if not exists idx_subscriptions_management_token 
on public.subscriptions(management_token) 
where management_token is not null;

-- Generate tokens for existing subscriptions (if any)
update public.subscriptions
set management_token = gen_random_uuid()::text
where management_token is null;

