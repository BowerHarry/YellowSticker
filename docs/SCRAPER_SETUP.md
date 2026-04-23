# Scraper setup (Mac mini, Docker)

This guide walks you through running the scraper worker on your Mac mini.

## Prerequisites

- macOS Sonoma (or later) on an Intel or Apple-Silicon Mac. Tested path is 2012 Mac mini / Intel i5 / 16 GB / Sonoma.
- **Docker Desktop** installed (`brew install --cask docker` then launch it once to finish setup).
- Your Supabase **service-role key** (Project → Settings → API → `service_role`).
- A live Resend API key and the email address you want alerts sent to.

## 1. Clone the repo on the Mac mini

```bash
git clone https://github.com/YOUR_USER/YellowSticker.git
cd YellowSticker/scraper-service
```

## 2. Configure

```bash
cp env.example .env
```

Edit `.env` and fill in at minimum:

```env
SUPABASE_URL="https://<project>.supabase.co"
SUPABASE_SERVICE_ROLE_KEY="eyJ..."
RESEND_API_KEY="re_..."
RESEND_FROM_EMAIL="onboarding@resend.dev"   # or a verified domain address
ALERT_EMAIL="you@example.com"
```

Optional tuning — defaults in brackets:

```env
SCRAPE_CRON="*/15 8-17 * * *"               # [every 15m, 08:00-17:59 local]
TZ="Europe/London"                          # [Europe/London]
SCRAPE_WAIT_MS="15000"                      # [15000] — JS settle time per page
SCRAPE_INTER_PRODUCTION_DELAY_SEC="30"      # [30] — ±20% jitter applied
RUN_ON_BOOT="true"                          # [true] — run once at container start
DRY_RUN="false"                             # [false] — true = update DB but never send email
HEALTH_PORT="3000"                          # [3000]
```

## 3. Build and start

```bash
docker compose up -d --build
```

The first build pulls Node 20 + Chromium deps and installs the Puppeteer-bundled Chrome. Expect ~2–3 minutes.

## 4. Watch it work

```bash
docker compose logs -f
```

You should see:

```
INFO  [main] Yellow Sticker scraper starting {...}
INFO  [main] Health server listening on :3000
INFO  [main] Scheduled cron "*/15 8-17 * * *" in Europe/London
INFO  [main] Starting scrape (trigger=boot)
INFO  [scrape] Loaded N active production(s)
INFO  [browser] Launching Chromium
INFO  [scrape] Scraping "Hamilton" @ Victoria Palace Theatre
INFO  [fetch] GET https://buytickets.delfontmackintosh.co.uk/... (wait=15000ms)
INFO  [fetch] OK <url> (123456 bytes, 17234ms)
...
```

## 5. Check it's alive

```bash
curl -s http://localhost:3000/health | jq
```

Returns JSON like:

```json
{
  "status": "ok",
  "running": false,
  "lastRunAt": "2026-04-23T09:15:02.123Z",
  "lastRunSummary": [
    { "name": "Hamilton", "status": "unavailable", "notified": false }
  ],
  "lastRunError": null
}
```

Port 3000 is bound to `127.0.0.1` by default, so this is reachable only from the Mac mini itself. If you want to poke it from your laptop, either SSH-tunnel, or change the port binding in `docker-compose.yml` to `3000:3000`.

## 6. Useful one-offs

Run a single scrape immediately, outside the scheduler, and exit:

```bash
docker compose run --rm scraper node src/index.js --once
```

Use `DRY_RUN=true` in `.env` while you're testing so no emails go out:

```bash
DRY_RUN=true docker compose run --rm scraper node src/index.js --once
```

Rebuild and restart after a code change:

```bash
docker compose up -d --build
```

Tail logs:

```bash
docker compose logs -f --tail=200
```

Shell into the container:

```bash
docker compose exec scraper sh
```

## 7. Keeping the Mac mini awake

System Settings → Battery / Energy Saver:

- **Prevent your Mac from sleeping automatically when the display is off** → ON.
- **Start up automatically after a power failure** → ON.
- **Wake for network access** → ON (optional but useful if you SSH in).

Docker Desktop → Settings → General:

- **Start Docker Desktop when you sign in to your computer** → ON.

## 8. Keeping it updated

```bash
cd ~/YellowSticker
git pull
cd scraper-service
docker compose up -d --build
```

## 9. Adding a new production

1. Insert the row into the `productions` table. Make sure:
   - `theatre_id` points at a row in `theatres` with the correct `standing_ticket_prefixes`.
   - `scraping_url` is the series landing page (e.g. `https://buytickets.delfontmackintosh.co.uk/tickets/series/<CODE>`).
   - `start_date` / `end_date` bound the run dates so the worker automatically picks it up / drops it.
   - `slug` matches the URL pattern (e.g. `les-miserables` if the performance URL is `.../les-miserables-<id>`).
2. If the theatre isn't already in `theatres`, add it with the right `standing_ticket_prefixes`. Values we've seen so far: `'GRAND CIRCLE-STAND-'`, `'STALLS-STAND-'`.
3. Next cron tick, the dynamic Delfont scraper will pick it up automatically. If it's a non-Delfont site, add a new branch to `scraper-service/src/scrapers/index.js`.

## 10. Re-enabling per-subscriber notifications (later)

The MVP emails only `ALERT_EMAIL`. To switch to the real fan-out path, edit `scraper-service/src/notify.js` and replace `sendAlert` with a loop that:

1. Queries:
   ```sql
   select s.id, s.management_token, u.email
   from subscriptions s
   join users u on u.id = s.user_id
   where s.production_id = $1 and s.payment_status = 'paid';
   ```
2. Calls Resend once per subscriber (with a manage-subscription link in the footer).
3. Inserts one `notification_logs` row per successful send.

The existing DB model (subscriptions + users + notification_logs) already supports this; only the worker needs editing.

## Troubleshooting

### Chromium fails to launch

```
Error: Failed to launch the browser process!
```

Rebuild the image — the Chromium install likely got interrupted:

```bash
docker compose build --no-cache
docker compose up -d
```

### `SUPABASE_SERVICE_ROLE_KEY` missing

The config loader fails fast. Make sure `.env` exists and contains the key; `docker compose config` prints the resolved config and will highlight typos.

### Runs skip with "Skipping cron run — another run is already in progress"

A previous run is still going (they normally finish in 2–5 minutes; if there are many productions or the sites are slow it can stretch). Either increase `SCRAPE_CRON` interval or lower `SCRAPE_INTER_PRODUCTION_DELAY_SEC`.

### `CLOUDFLARE_BLOCKED` in logs

The worker waited up to 90s in-browser for the Cloudflare interstitial to clear and it didn't. Some notes:

- The scraper uses a **persistent Chromium profile** mounted via the `chrome-profile` Docker volume. Once we've cleared Cloudflare once for a domain, the `cf_clearance` cookie is reused on subsequent runs — so repeated failures usually mean the cookie expired or our fingerprint changed. First runs after a fresh install always take longest.
- If this happens a lot, bump `SCRAPE_WAIT_MS` higher (e.g. `25000`).
- Nuking the profile can help if it gets into a bad state: `docker compose down && docker volume rm scraper-service_chrome-profile && docker compose up -d`.
- Cloudflare tiers its protection per URL: listing/calendar pages usually clear easily; performance-detail pages are more aggressive. The worker already passes the calendar URL as `Referer` to the performance pages to look like normal click-through navigation.

### `Queue-it page detected` in logs

The site routed us into a virtual waiting room. This isn't fatal — the scraper still returns the HTML and the scraper code decides whether to treat the production as unavailable or try again next cycle. It usually means the box office is under heavy load (e.g. new on-sale).
