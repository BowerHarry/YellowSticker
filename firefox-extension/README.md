# Firefox extension (scraper)

This WebExtension runs **inside Firefox** (typically on a always-on Mac mini). It polls theatre inventory using the **same cookies and session** as a normal visitor, then POSTs results to the Supabase **`report-scrape`** edge function.

## Why in-browser?

Cloudflare and similar protections see a real browser TLS fingerprint and session. The extension does not ship headless Chromium or datacenter scraping tricks.

## Quick setup

1. Load the folder as a **temporary extension** (Firefox → `about:debugging` → This Firefox → Load Temporary Add-on → `manifest.json`), or install a signed build if you distribute one.
2. Open **Options** and set:
   - Supabase project URL  
   - **Publishable** API key (`sb_publishable_…` from Dashboard → Settings → API Keys — not the secret key)  
   - `SCRAPER_SHARED_SECRET` (must match the value set for edge functions)
3. Enable the extension, **Save**, then **Run once now** to verify connectivity.

## Autostart

Use **launchd** (macOS) or your OS scheduler to open Firefox at login so the extension keeps running across reboots.

## Further reading

- System context: [`docs/ARCHITECTURE.md`](../docs/ARCHITECTURE.md)  
- Secrets and rotation: [`docs/SECRETS.md`](../docs/SECRETS.md)
