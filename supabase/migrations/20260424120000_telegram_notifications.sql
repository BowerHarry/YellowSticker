-- Telegram as an optional channel (replaces legacy 'sms' preference value).

update public.users set notification_preference = 'telegram' where notification_preference = 'sms';
update public.notification_logs set type = 'telegram' where type = 'sms';

alter table public.users drop constraint if exists users_notification_preference_check;
alter table public.users
  add constraint users_notification_preference_check
  check (notification_preference in ('email', 'telegram', 'both'));

alter table public.notification_logs drop constraint if exists notification_logs_type_check;
alter table public.notification_logs
  add constraint notification_logs_type_check
  check (type in ('email', 'telegram'));

alter table public.users add column if not exists telegram_chat_id bigint;
alter table public.users add column if not exists telegram_link_token text;
create unique index if not exists users_telegram_link_token_key on public.users (telegram_link_token)
  where telegram_link_token is not null;
