# Stripe test vs live mode

## TL;DR

The only thing that decides whether Yellow Sticker is talking to **test**
Stripe or **live** Stripe is two Supabase secrets:

```
STRIPE_SECRET_KEY         # sk_test_…  OR  sk_live_…
STRIPE_WEBHOOK_SECRET     # whsec_…    (must match the Stripe endpoint
                          # that was created in the same mode as the
                          # secret key above)
```

Nothing else is dual-configured. Prices, DB schema, webhook URL, email
copy, code paths — all identical. `stripeMode()` in
`supabase/functions/_shared/emails.ts` just inspects the `sk_test_` /
`sk_live_` prefix and logs it on boot, so you can verify which mode is
active by tailing edge function logs:

```
create-checkout-session: stripe mode = test
stripe-webhook: stripe mode = test
subscription-management: stripe mode = test
```

## Why the naive flip is dangerous

Test-mode and live-mode Stripe IDs share the same format (`cus_…`,
`sub_…`, `pi_…`) but resolve against **completely disjoint
namespaces**. A `sub_ABC` that exists in test mode does *not* exist in
live mode, and Stripe will return `resource_missing` if you try to act
on it with the wrong key.

If you swap `STRIPE_SECRET_KEY` from test → live (or back) while
subscription rows from the previous mode are still `payment_status='paid'`:

- **Cancel / refund calls fail silently.** `subscription-management`
  catches the `resource_missing` error and continues, but the DB row
  still says `paid` and no money moves.
- **Auto-renewals leak between modes.** Test-mode subscriptions keep
  renewing on Stripe's schedule (free test-card charges). Renewal
  webhooks fired in test mode will fail signature verification against
  a live `STRIPE_WEBHOOK_SECRET`, so the webhook returns 401 and
  `subscription_end` never extends in your DB. The subscriber "expires"
  in your records while Stripe thinks they're still active.
- **Webhook signature failures.** If you point both test and live Stripe
  endpoints at the same URL, one of them will always fail verification.
  Use separate endpoints (see below) — or accept that one mode is
  "active" at a time.

## What we stamp to make this safe

Every `subscriptions` row carries:

```
is_test_mode  boolean  -- true if created / last-activated under sk_test_…
```

It is set by:

- `create-checkout-session` when the row is first inserted (or updated
  from `pending` back to `pending` for a retry), based on
  `stripeMode()`.
- `stripe-webhook` on activation (`checkout.session.completed`), using
  the mode that was live at the moment the row became `paid`. This
  "wins" over the checkout-time stamp: whatever Stripe key flipped the
  row to `paid` is the only key that can legally operate on its Stripe
  IDs.

Use the flag for:

- The `/monitor` **Preview cancel** panel surfaces both the row's mode
  and the runtime mode. If they disagree, it shows a red warning and
  tells you not to cancel until the key is flipped back.
- Dashboards / SQL can exclude historical test rows from revenue
  reporting with a simple `where is_test_mode = false`.

## Recommended setup

### Option A — single Supabase project, one mode active at a time

Simple, what we're running today. Practical rules:

1. Pick one mode. Keep `STRIPE_SECRET_KEY` + `STRIPE_WEBHOOK_SECRET` in
   sync (both test, or both live). Never mix.
2. When you do flip, **expect existing rows from the other mode to go
   dormant**. Cancels and refunds on them will no-op; auto-renewals on
   them will fail silently.
3. Use the `/monitor` preview-cancel panel before running any manual
   cancel — it will flag mismatches.
4. If you need to wipe test data before going live for real:
   ```sql
   -- Dry-run first:
   select id, user_id, production_id, payment_status
   from public.subscriptions where is_test_mode = true;

   -- Cascade-delete test subscriptions + associated notification logs.
   delete from public.notification_logs
    where user_id in (
      select user_id from public.subscriptions where is_test_mode = true
    );
   delete from public.subscriptions where is_test_mode = true;
   ```
   (Users themselves are safe to keep — they're mode-agnostic.)

### Option B — two Supabase projects (cleanest)

For anything beyond early dev, spin up a second Supabase project for
live. The `.env.local` in `web/` and the extension's options page both
point at **one** Supabase project at a time, so there's zero risk of
cross-mode contamination. Deploys:

```
# dev / test
supabase link --project-ref <dev-ref>
supabase functions deploy …
supabase secrets set STRIPE_SECRET_KEY=sk_test_… STRIPE_WEBHOOK_SECRET=whsec_test_…

# prod / live
supabase link --project-ref <prod-ref>
supabase functions deploy …
supabase secrets set STRIPE_SECRET_KEY=sk_live_… STRIPE_WEBHOOK_SECRET=whsec_live_…
```

This is what we'll move to once the monetised product is live.

## Stripe dashboard setup

In the Stripe dashboard, **each mode has its own webhook endpoints,
API keys, and events**. Configure a webhook for each mode you intend to
use:

- Test mode → `https://<project>.supabase.co/functions/v1/stripe-webhook`
  → copy the test `whsec_…` into `STRIPE_WEBHOOK_SECRET` when running
  Option A in test; for Option B, this becomes the webhook secret for
  the dev Supabase project.
- Live mode → same URL (Option A) or the prod project's URL
  (Option B) → copy the live `whsec_…` into that environment's
  `STRIPE_WEBHOOK_SECRET`.

Both webhooks should subscribe to:

```
checkout.session.completed
invoice.payment_succeeded
customer.subscription.deleted
customer.subscription.updated
```

## Confirming which mode you're in right now

```bash
supabase functions logs create-checkout-session --limit 5 | rg "stripe mode"
```

Or, from the `/monitor` preview-cancel panel, look up any subscription —
the result shows `server runtime: test` or `server runtime: live`.
