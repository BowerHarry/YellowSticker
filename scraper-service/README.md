# Yellow Sticker scraper worker

Standalone Node.js worker that:

1. Pulls the list of currently-running productions from Supabase.
2. Uses a stealth Puppeteer browser to check each theatre page for standing tickets today.
3. Writes the result back to the `productions` row.
4. When a production transitions to `available`, sends an email alert via Resend.

This is designed to run as a Docker container on a machine you control (e.g. a Mac mini on your home network). Outbound internet is all it needs — no port forwarding, no tunnel.

## Quick start

```bash
cp env.example .env
# fill in the values, at minimum:
#   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, RESEND_API_KEY, ALERT_EMAIL

docker compose up -d --build
docker compose logs -f
```

A one-off run (useful while debugging, won't start the scheduler):

```bash
docker compose run --rm scraper node src/index.js --once
```

See [`../docs/SCRAPER_SETUP.md`](../docs/SCRAPER_SETUP.md) for the full setup and operations guide.
