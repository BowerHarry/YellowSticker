-- Stripe test vs live mode are completely disjoint ID namespaces:
-- `cus_…`, `sub_…`, `pi_…` all share the same format but only resolve
-- against the API key that created them. Flipping `STRIPE_SECRET_KEY`
-- from test to live (or back) silently breaks cancels, refunds and
-- webhook signature verification for any subscription rows created
-- under the other mode.
--
-- We stamp the runtime mode onto every subscription at creation /
-- activation so:
--   * admins can tell at a glance which rows belong to which mode,
--   * `admin-preview-cancel` can warn when runtime mode != row mode,
--   * future reporting / dashboards can filter out historical test
--     rows from live revenue counts without having to introspect
--     Stripe IDs.
--
-- Default false: existing rows were created during early testing and
-- should be treated as test unless an operator marks otherwise.
alter table public.subscriptions
  add column if not exists is_test_mode boolean not null default false;

comment on column public.subscriptions.is_test_mode is
  'True if this subscription was created against Stripe test keys. Populated by create-checkout-session and by stripe-webhook on activation. Stripe IDs themselves don''t indicate mode, so this column is the only reliable way to tell historical test rows apart from live ones without calling Stripe.';

create index if not exists idx_subscriptions_is_test
  on public.subscriptions(is_test_mode);
