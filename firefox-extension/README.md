# Yellow Sticker Scraper (Firefox extension)

A small Firefox WebExtension that polls the
`buytickets.delfontmackintosh.co.uk` JSON API from your already-authenticated
Firefox session, and reports standing-ticket availability to Supabase.

Because requests go out from a real, logged-in Firefox instance, there is no
Cloudflare or Queue-it challenge to fight in the common case. The extension
also self-heals by opening a hidden tab to the box-office page whenever a
challenge does appear, so cookies refresh automatically.

## How it works

1. Alarm fires every N minutes (default 10) while the extension is enabled.
2. Extension queries Supabase (`productions` table via PostgREST, read-only
   anon key) for productions whose `adapter = 'delfont'` and whose
   `[start_date, end_date]` range contains today.
3. For each such production:
   - `GET /api/events/calendarseries/<series_code>?salesChannel=Web` →
     find today's performances by `EventID`.
   - For each of today's `EventID`s,
     `GET /api/eventinventory/<EventID>?includeOpens=true&salesChannel=Web` →
     count `MapSeats` where `!isReserved && SeatAlertValues[seatAlertId].displayName === 'Standing'`.
   - POST the summary to the `report-scrape` Supabase edge function.
4. Edge function updates the `productions` row, writes a `scrape_heartbeats`
   row, and fires a Resend email to `ALERT_EMAIL` on an `unavailable →
   available` transition.

If a fetch returns HTML (i.e. Cloudflare challenge, Queue-it waiting room),
the extension opens a hidden background tab to the production's public URL,
waits for it to fully load (which runs CF's silent JS challenge), closes the
tab, and retries. After 5 cycles where every production is still blocked it
POSTs a `stuck` heartbeat so you get an operator email.

## Install on your Mac mini (one-time)

### Option A — temporary install (dev flow)

1. `firefox-extension/` in this repo is the unpacked extension.
2. In Firefox, open `about:debugging#/runtime/this-firefox`.
3. Click **Load Temporary Add-on…** and pick `firefox-extension/manifest.json`.
4. Visit `about:addons → Yellow Sticker Scraper → Preferences` and fill in
   the Supabase URL, anon key, and scraper shared secret.
5. Tick **Enabled**, click **Save**, then **Run once now** to verify.

The temporary install goes away when Firefox restarts. Fine for testing;
not fine for the "always-on Mac mini" use case.

### Option B — signed unlisted install (recommended, long-term)

1. Zip the extension contents:
   ```bash
   cd firefox-extension
   zip -r ../yellow-sticker.zip . -x '*.DS_Store'
   ```
2. Create a free Firefox add-on developer account at
   <https://addons.mozilla.org/developers/>.
3. Submit the zip as a **"unlisted"** add-on (the extension will not be
   discoverable on addons.mozilla.org, but Mozilla will sign it for you).
4. Download the signed `.xpi` they return.
5. Double-click the `.xpi` in Firefox to install permanently.

The signed build survives restarts and can be installed on any Firefox
profile on the Mac mini.

## Autostart on the Mac mini

Create `~/Library/LaunchAgents/com.yellowsticker.firefox.plist`:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN"
  "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
  <dict>
    <key>Label</key><string>com.yellowsticker.firefox</string>
    <key>ProgramArguments</key>
    <array>
      <string>/Applications/Firefox.app/Contents/MacOS/firefox</string>
      <string>--profile</string>
      <string>/Users/harry/Library/Application Support/Firefox/Profiles/default</string>
    </array>
    <key>RunAtLoad</key><true/>
    <key>KeepAlive</key><true/>
  </dict>
</plist>
```

Replace the profile path with whatever Firefox shows at
`about:profiles`. Then:

```bash
launchctl load -w ~/Library/LaunchAgents/com.yellowsticker.firefox.plist
```

Firefox now starts automatically at login and respawns if it crashes. Set
the Mac mini to auto-login (System Settings → Users & Groups → Login
Options) so Firefox comes back after a reboot.

## When does it need human intervention?

Only when Cloudflare escalates from its silent JS challenge to an
interactive Turnstile checkbox. This is rare on a warm residential
Firefox profile — usually weeks or months apart — and you'll know it's
happened because:

- You get an email titled **"Yellow Sticker scraper is stuck"**.
- The popup and options page show a non-zero "consecutive blocked
  cycles" counter.

Fix: open Firefox on the Mini, visit
<https://buytickets.delfontmackintosh.co.uk/tickets/series/GIEOLI>,
click the checkbox if Cloudflare asks, close the tab. Scraping resumes
on the next tick.

## Settings reference

| Setting | Default | Notes |
|---|---|---|
| `supabaseUrl` | — | Project URL (e.g. `https://xxx.supabase.co`). |
| `supabaseAnonKey` | — | Anon/public key. Used for read-only `productions` query. |
| `scraperSecret` | — | Matches `SCRAPER_SHARED_SECRET` on the `report-scrape` edge function. |
| `pollMinutes` | 10 | How often the scrape alarm fires. |
| `activeHoursStart` / `activeHoursEnd` | 8 / 22 | London-time window in which the alarm runs. Outside this window ticks are skipped. |
| `enabled` | false | Master toggle. Unchecking pauses without losing settings. |

## Development

Point `web-ext` at this directory to hot-reload during development:

```bash
cd firefox-extension
npx web-ext run
```

To lint:

```bash
npx web-ext lint
```
