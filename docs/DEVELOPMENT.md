# Development and deployment

How to run Supabase locally, deploy Edge Functions and secrets, and ship the web app — aimed at whoever operates this repo (typically you).

## Prerequisites

- Node 18+ for `web/`
- [Supabase CLI](https://supabase.com/docs/guides/cli) for database and edge functions
- Firefox for the `firefox-extension/` scraper (see [`firefox-extension/README.md`](../firefox-extension/README.md))

## Local Supabase

```bash
supabase start
supabase db reset   # optional: applies migrations + seed
```

After a reset, if you use **pg_cron** + `invoke_scrape_tickets`, configure database settings as described in [`SECRETS.md`](./SECRETS.md).

## Edge functions

Deploy from the repo root (adjust the function list to match your project):

```bash
supabase functions deploy report-scrape create-checkout-session stripe-webhook
# …add other function names as needed
```

Set secrets (never commit values):

```bash
supabase secrets set SCRAPER_SHARED_SECRET="$(openssl rand -hex 32)"
supabase secrets set BACKEND_API_SECRET_KEY="sb_secret_..."   # Dashboard → API Keys → Secret (custom names cannot start with SUPABASE_)
# Optional: SERVICE_ROLE_KEY for a legacy JWT. The platform may still inject SUPABASE_SERVICE_ROLE_KEY automatically.
# plus RESEND_*, STRIPE_*, etc. — see docs/env.sample
```

## Web SPA

```bash
cd web
npm install
cp env.sample .env.local   # Vite `VITE_*` keys; see comments at top of `web/env.sample`
npm run dev
```

The full backend + operations variable list is in [`env.sample`](./env.sample) (repo root `docs/env.sample` when working from `docs/`).

## Stripe test vs live

Stripe mode follows the **`STRIPE_SECRET_KEY`** prefix (`sk_test_*` vs `sk_live_*`). Test and live objects are not interchangeable; mismatched rows in the database cause confusing cancel/refund behaviour.

Operational checklist (wipe test data before going live, webhook secrets per mode, etc.) lives in [`STRIPE.md`](./STRIPE.md).

## Migrations

- Add new files under `supabase/migrations/` only (do not rewrite applied migrations on shared branches without team agreement).  
- Avoid embedding secrets in SQL; use settings or Vault — [`SECRETS.md`](./SECRETS.md).

## Testing and monitor dashboard

End-to-end checks using the **Test fixture** production and the `/monitor` dashboard are summarized in [`TESTING.md`](./TESTING.md).
