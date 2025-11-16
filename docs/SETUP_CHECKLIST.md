# Setup Checklist

Use this checklist to track your setup progress.

## Prerequisites
- [ ] Node.js 20+ installed
- [ ] Supabase CLI installed (`supabase --version`)
- [ ] Stripe CLI installed (`stripe --version`)
- [ ] Supabase project created
- [ ] Stripe account (test mode)
- [ ] Resend account
- [ ] ~~Twilio account~~ (SMS coming soon)

## Step 1: Environment Variables
- [ ] Created `web/.env.local` from `web/env.sample`
- [ ] Filled in `VITE_PUBLIC_SUPABASE_URL`
- [ ] Filled in `VITE_PUBLIC_SUPABASE_ANON_KEY`
- [ ] Filled in `VITE_PUBLIC_SUPABASE_FUNCTIONS_URL`
- [ ] Filled in `VITE_PUBLIC_STRIPE_PUBLISHABLE_KEY`

## Step 2: Frontend Setup
- [ ] Ran `npm install` in `web/` directory
- [ ] Verified no errors

## Step 3: Supabase Database
- [ ] Logged into Supabase CLI (`supabase login`)
- [ ] Linked project (`supabase link --project-ref <id>`)
- [ ] Applied migrations (`supabase db push`)
- [ ] Seeded data (`supabase db reset --seed supabase/seed.sql` or manual)

## Step 4: Edge Functions
- [ ] Deployed `create-checkout-session`
- [ ] Deployed `stripe-webhook`
- [ ] Deployed `scrape-tickets`
- [ ] Set `STRIPE_SECRET_KEY` secret
- [ ] (Note: `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are automatically available - no need to set)
- [ ] Set `STRIPE_WEBHOOK_SECRET` secret
- [ ] Set `RESEND_API_KEY` secret
- [ ] Set `PUBLIC_SITE_URL` secret
- [ ] Set `SCRAPER_USER_AGENTS` secret (optional)
- [ ] Set `SCRAPINGBEE_API_KEY` secret (needed for Hamilton scraper)
- [ ] (Optional) Set `SCRAPINGBEE_PROXY_COUNTRY`, `SCRAPINGBEE_PROXY_COUNTRIES`, `SCRAPINGBEE_PREMIUM_PROXY`

## Step 5: Stripe Webhook
- [ ] Created webhook endpoint in Stripe Dashboard
- [ ] Selected `checkout.session.completed` event
- [ ] Copied webhook signing secret
- [ ] Added secret to Supabase secrets
- [ ] (Local) Started `stripe listen` for local forwarding

## Step 6: Scheduled Scraping
- [ ] Created cron job in Supabase (via SQL Editor or Dashboard)
- [ ] Verified schedule (e.g., every 15 minutes)
- [ ] Tested manual invocation (`supabase functions invoke scrape-tickets`)

## Step 7: Testing
- [ ] Started frontend (`npm run dev`)
- [ ] Visited homepage successfully
- [ ] Clicked on a production
- [ ] Filled subscription form
- [ ] Completed Stripe checkout with test card
- [ ] Verified redirect to success page
- [ ] Checked `users` table in Supabase
- [ ] Checked `subscriptions` table in Supabase
- [ ] Manually triggered scraper
- [ ] Verified notifications sent (check email)
- [ ] Checked `notification_logs` table

## Notes
- Date started: ___________
- Supabase project ID: ___________
- Stripe account mode: [ ] Test [ ] Live
- Production URL: ___________

