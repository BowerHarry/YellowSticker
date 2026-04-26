-- Queued Telegram copy for "subscribed" welcome when the user has not linked Telegram yet.

alter table public.subscriptions
  add column if not exists telegram_pending_welcome_html text;
