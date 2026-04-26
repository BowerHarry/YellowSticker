# Stripe: test vs live

## Modes

Edge functions detect mode from **`STRIPE_SECRET_KEY`**:

- `sk_test_*` → test mode (test Checkout, test Customers, test webhooks).
- `sk_live_*` → live mode.

Set **`STRIPE_WEBHOOK_SECRET`** to the signing secret for the **same** mode as `STRIPE_SECRET_KEY` (Dashboard → Developers → Webhooks → your endpoint).

## Going live

1. Replace test keys with live keys in **Supabase secrets** (not in git).  
2. Ensure webhook URL points to the production `stripe-webhook` function and use the **live** signing secret.  
3. Avoid mixing test `subscription` rows with a live Stripe account (and vice versa). Clean test data or use a fresh database if unsure.  
4. Confirm logs on function cold start show the expected Stripe mode string.

## Refunds and guarantees

Cancel/refund behaviour is implemented in `subscription-management` and related webhooks; keep Stripe and DB `is_test_mode` (or equivalent) aligned so operators can see mismatches in tooling.
