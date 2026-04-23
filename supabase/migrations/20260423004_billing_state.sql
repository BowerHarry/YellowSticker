-- Billing state needed to honour the refund guarantee and the end-of-run
-- lifecycle.
--
-- Guarantee: "if no standing tickets have been found since your last
-- payment at the point of cancellation or renewal, you will receive a full
-- refund". To do that we need to know:
--   1. Which Stripe PaymentIntent to refund (`last_payment_intent_id`).
--   2. When the current billing period started
--      (`current_period_start` — compared against
--      `productions.last_standing_tickets_found_at`).
--   3. Whether this is an auto-renew subscription or a single month
--      (`payment_type`).
-- We also keep `stripe_subscription_id` / `stripe_customer_id` so the
-- cancel/refund edge functions don't have to pay a Stripe API round-trip
-- just to fish them out of an old Checkout Session.

alter table public.subscriptions
  add column if not exists stripe_subscription_id text,
  add column if not exists stripe_customer_id text,
  add column if not exists last_payment_intent_id text,
  add column if not exists last_charge_amount_pence integer,
  add column if not exists current_period_start timestamptz,
  add column if not exists payment_type text
    check (payment_type in ('subscription', 'one-time')),
  add column if not exists cancellation_reason text;

comment on column public.subscriptions.stripe_subscription_id is
  'Stripe Subscription id for auto-renew plans. NULL for one-off payments.';
comment on column public.subscriptions.stripe_customer_id is
  'Stripe Customer id, captured on the first successful charge so we can link future Stripe events to this subscription quickly.';
comment on column public.subscriptions.last_payment_intent_id is
  'Stripe PaymentIntent id for the most recent successful charge. Used to issue refunds under the standing-ticket guarantee.';
comment on column public.subscriptions.last_charge_amount_pence is
  'Amount (in pence) of the most recent successful charge. Informational — we refund the whole PaymentIntent, not a partial amount.';
comment on column public.subscriptions.current_period_start is
  'Start of the billing period covered by the most recent successful charge. Refunds are issued when `productions.last_standing_tickets_found_at` is NULL or <= this value.';
comment on column public.subscriptions.payment_type is
  '"subscription" = Stripe Subscription (auto-renew). "one-time" = single Checkout Session payment. Mirrors the `paymentType` metadata we set at checkout.';
comment on column public.subscriptions.cancellation_reason is
  'Free-form reason for the most recent cancellation (e.g. "user_cancel", "production_ended", "post_end_grace_expired"). Used in emails + support.';

-- Extend payment_status enum via CHECK constraint. We rewrite the
-- constraint because PostgreSQL can''t edit CHECK in place.
alter table public.subscriptions
  drop constraint if exists subscriptions_payment_status_check;
alter table public.subscriptions
  add constraint subscriptions_payment_status_check
  check (payment_status in (
    'pending',
    'paid',
    'failed',
    'cancelled',
    'refunded',
    'refund_failed'
  ));

create index if not exists idx_subscriptions_stripe_sub_id
  on public.subscriptions(stripe_subscription_id)
  where stripe_subscription_id is not null;
