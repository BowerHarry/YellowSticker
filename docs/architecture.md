## Yellow Sticker architecture

### Frontend
- React SPA served by Vite.
- React Router routes: `/`, `/productions/:slug`, `/checkout/success`.
- Supabase client used directly for data reads; fallback mock data helps local development without credentials.
- Checkout flow calls Supabase Edge Function `create-checkout-session`, which returns a Stripe Checkout URL.

### Backend (Supabase)
- **Database**: `users`, `productions`, `subscriptions`, `notification_logs`.
- **Edge functions**:
  - `create-checkout-session`: validates payload, ensures Supabase user + pending subscription, creates Stripe Checkout session.
  - `stripe-webhook`: finalises subscription after payment, handles failure/expiry.
  - `scrape-tickets`: scheduled job to poll theatre websites, update availability, and dispatch notifications.
- **Cron**: Supabase Scheduler triggers `scrape-tickets` multiple times per day.

### Scraping strategy
- `scrapers/index.ts` exports modular per-theatre scrapers (keyword-based to start).
- Rotates user agents via `SCRAPER_USER_AGENTS`.
- Designed so you can swap in Playwright or custom fetch logic per theatre.

### Notifications
- Email via Resend REST API.
- SMS via Twilio REST API.
- Both channels log entries in `notification_logs` with provider IDs for traceability.

### Payments
- £4.99 (499 pence) Stripe Checkout line item.
- Metadata carries `user_id` + `production_id` so webhook can map back to Supabase rows.
- Subscriptions are one-year fixed; renewing the same show reuses the same row.

### Local development loop
1. `supabase start` to run local Postgres & functions emulator.
2. `npm run dev` inside `web/`.
3. Use Stripe CLI to forward webhooks.
4. Trigger scrapers locally with `supabase functions invoke scrape-tickets`.

