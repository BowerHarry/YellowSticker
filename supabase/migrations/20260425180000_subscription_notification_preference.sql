-- Alert channel is per subscription (chosen at checkout / manage for that show).
-- Telegram chat id stays on users (one bot connection per account).

alter table public.subscriptions
  add column if not exists notification_preference text not null default 'email';

alter table public.subscriptions drop constraint if exists subscriptions_notification_preference_check;

alter table public.subscriptions
  add constraint subscriptions_notification_preference_check
  check (notification_preference in ('email', 'telegram', 'both'));

update public.subscriptions s
set notification_preference = u.notification_preference
from public.users u
where s.user_id = u.id
  and u.notification_preference in ('email', 'telegram', 'both');

update public.subscriptions
set notification_preference = 'telegram'
where notification_preference = 'sms';

alter table public.users drop constraint if exists users_notification_preference_check;

alter table public.users drop column if exists notification_preference;
