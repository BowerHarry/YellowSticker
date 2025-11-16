## Yellow Sticker

Discount theatre ticket alerts for London’s biggest shows. React SPA plus Supabase edge functions handle sign-ups, payments, scraping, and notifications.

### Stack
- React 18 + Vite (TypeScript, React Router)
- Supabase (Auth, Postgres, Edge Functions, cron)
- Stripe Checkout (one-off £4.99)
- Resend email notifications (SMS coming soon)
- Playwright-style scraping placeholders using rotating user agents

### Project structure
- `web/` — frontend SPA
- `supabase/` — database schema, seed data, edge functions
- `docs/` — environment samples & ops notes

### Quick Start

**📖 For detailed setup instructions, see [docs/SETUP.md](docs/SETUP.md)**

This guide covers:
- Environment variable setup
- Supabase database and functions deployment
- Stripe webhook configuration
- Scheduled scraping setup
- Testing the complete flow

### Prerequisites
1. Supabase CLI (`brew install supabase/tap/supabase`)
2. Node 20+
3. Stripe account with webhook forwarding (Stripe CLI recommended)

### Frontend
```bash
cd /Users/harry/YellowSticker/web
npm install
cp env.sample .env.local # then fill values
npm run dev
```

Environment variables:
- `VITE_PUBLIC_SUPABASE_URL`
- `VITE_PUBLIC_SUPABASE_ANON_KEY`
- `VITE_PUBLIC_SUPABASE_FUNCTIONS_URL` (usually `<supabase-url>/functions/v1`)
- `VITE_PUBLIC_STRIPE_PUBLISHABLE_KEY`

### Supabase backend
```bash
cd /Users/harry/YellowSticker
supabase start
supabase db reset --seed supabase/seed.sql
```

Deploy functions:
```bash
supabase functions deploy create-checkout-session
supabase functions deploy stripe-webhook
supabase functions deploy scrape-tickets
supabase functions deploy status-dashboard
```

Set secrets (see `docs/env.sample` for full list):
```bash
supabase secrets set \
  SUPABASE_URL=... \
  SUPABASE_SERVICE_ROLE_KEY=... \
  STRIPE_SECRET_KEY=... \
  STRIPE_WEBHOOK_SECRET=... \
  RESEND_API_KEY=... \
  PUBLIC_SITE_URL=https://yellowsticker.app \
  SCRAPER_USER_AGENTS='["ua1","ua2"]' \
  SCRAPINGANT_API_KEY=... \
  SCRAPINGANT_PROXY_COUNTRIES='["gb","se","fi"]' \
  SCRAPINGANT_DAILY_LIMIT=500 \
  RESEND_DAILY_LIMIT=200 \
  RESEND_MONTHLY_LIMIT=10000
```

Stripe webhook forwarding (local):
```bash
stripe listen --forward-to http://127.0.0.1:54321/functions/v1/stripe-webhook
```

### Scheduled scraping
- Use Supabase Scheduler: `supabase cron create scrape-tickets --schedule "*/15 * * * *" --function scrape-tickets`
- Each run checks every production, updates availability, and notifies paid subscribers.

### Testing the flow
1. Seed productions: `supabase db reset`.
2. Start frontend (`npm run dev`).
3. Use the production page form → hits `create-checkout-session` → Stripe test card.
4. Stripe webhook flips subscription to active.
5. Trigger scraper manually: `supabase functions invoke scrape-tickets`.

### Notes
- Scraper modules live in `supabase/functions/scrape-tickets/scrapers`. Add theatre-specific logic or Playwright drivers there.
- Notification logging stored in `notification_logs` for auditing.
- Hidden monitoring dashboard available at `/monitor` (not linked). It calls the `status-dashboard` edge function for health indicators.
- Admin / dashboard stretch goals can build on Supabase RLS policies & React admin routes.

