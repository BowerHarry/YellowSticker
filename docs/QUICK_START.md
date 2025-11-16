# Quick Start Summary

This is a condensed version of the full setup. For detailed instructions, see [SETUP.md](SETUP.md).

## 1. Environment Files

```bash
# Frontend
cd web
cp env.sample .env.local
# Edit .env.local with your Supabase and Stripe keys
```

## 2. Install & Link

```bash
cd web && npm install
cd .. && supabase login && supabase link --project-ref YOUR_PROJECT_ID
```

## 3. Database

```bash
supabase db push                    # Apply migrations
# Then seed via Supabase Dashboard → SQL Editor (paste contents of supabase/seed.sql)
```

## 4. Deploy Functions

```bash
supabase functions deploy create-checkout-session
supabase functions deploy stripe-webhook
supabase functions deploy scrape-tickets
```

## 5. Set Secrets

```bash
supabase secrets set \
  STRIPE_SECRET_KEY="sk_test_xxx" \
  STRIPE_WEBHOOK_SECRET="whsec_xxx" \
  RESEND_API_KEY="re_xxx" \
  PUBLIC_SITE_URL="http://localhost:5173" \
  SCRAPER_USER_AGENTS='["Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36","Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15"]' \
  SCRAPINGBEE_API_KEY="your_scrapingbee_api_key" \
  SCRAPINGBEE_PROXY_COUNTRY="gb" \
  SCRAPINGBEE_PROXY_COUNTRIES='["ae", "au", "br", "ca", "cn", "de", "es", "fr", "gb", "hk", "pl", "in", "it", "il", "jp", "nl", "ru", "sa", "th", "us", "cz", "id", "sg", "vn", "kr", "my", "ph"]' \
  # SCRAPINGBEE_PREMIUM_PROXY="true" \  # Optional: use premium proxies (more reliable, higher cost)
  # SCRAPINGBEE_STEALTH_PROXY="true" \  # Optional: stealth proxy pool (highest cost)
  SCRAPINGBEE_BLOCK_RESOURCES="false" \
```

**Note**: `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are automatically available to Edge Functions (no need to set them).
**ScrapingBee**: Sign up at scrapingbee.com to get an API key for the Hamilton scraper. Adjust proxy settings via `SCRAPINGBEE_PROXY_*` env if you get 403/429 blocks; optionally rotate through multiple countries with `SCRAPINGBEE_PROXY_COUNTRIES`.

## 6. Stripe Webhook

1. Stripe Dashboard → Webhooks → Add endpoint
2. URL: `https://xxx.supabase.co/functions/v1/stripe-webhook`
3. Event: `checkout.session.completed`
4. Copy signing secret → add to secrets (Step 5)

## 7. Cron Job

In Supabase SQL Editor:

```sql
SELECT cron.schedule(
  'scrape-tickets',
  '*/15 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://xxx.supabase.co/functions/v1/scrape-tickets',
    headers := jsonb_build_object(
      'Authorization', 'Bearer YOUR_SERVICE_ROLE_KEY'
    )
  );
  $$
);
```

**First**: Enable `pg_cron` and `pg_net` extensions in Dashboard → Database → Extensions

## 8. Test

```bash
cd web && npm run dev
# Visit http://localhost:5173
# Subscribe to a production → checkout → verify in Supabase tables
```

---

**Full guide**: [SETUP.md](SETUP.md)  
**Checklist**: [SETUP_CHECKLIST.md](SETUP_CHECKLIST.md)

