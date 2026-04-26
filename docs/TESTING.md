# Testing and operations

## Monitor dashboard (`/monitor`)

The internal dashboard is intended for operators, not end users. Typical uses:

- Send lifecycle email samples via **`send-test-email`**.
- **Preview cancel** — read-only simulation of cancel + Stripe + email side effects (`admin-preview-cancel`).
- **Add production** — poster upload and metadata (`admin-create-production`).
- **Test fixture** — drives a hidden `test-fixture` production through reset → simulate availability → mark tickets found → clear alert state → delete, so you can exercise signup → alert → cancel without touching real shows (`admin-test-fixture`).

## Extension

Use **Run once now** on the extension options page after changing Supabase URL, anon key, or `SCRAPER_SHARED_SECRET`.

## Automated tests

Add project-specific automated tests here as they are introduced (Playwright, integration against `supabase start`, etc.).
