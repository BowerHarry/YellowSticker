# End-to-end testing: Stripe + alerts

This is the supported way to exercise the full signup → pay → alert →
cancel flow without touching real productions.

## Prerequisites

1. Stripe keys must be in **test mode** (`STRIPE_SECRET_KEY=sk_test_…`).
   See `docs/STRIPE_MODES.md` — nothing else controls the mode.
2. `ADMIN_USERNAME` / `ADMIN_PASSWORD` set in Supabase secrets.
3. `RESEND_API_KEY` + `RESEND_FROM_EMAIL` set (alerts go via Resend).
4. `PUBLIC_SITE_URL` set to the web origin you're testing against.
5. You're logged into `/monitor` on the web app.

## Concept

The `admin-test-fixture` edge function maintains a single production row
with slug `test-fixture` and `adapter='none'`. Key properties:

- **Hidden from public listings.** The web filters out `slug LIKE 'test-%'`.
- **Ignored by the Firefox extension.** `adapter='none'` means no real
  scrape cycles run against it, so your simulated state is never
  clobbered.
- **Still fully functional** for signup, Stripe checkout, alerts, and
  cancellation — the rest of the pipeline doesn't care that it's a
  fixture.

All actions in this doc are driven from the "Test fixture" card on
`/monitor`. Every button maps 1:1 to a JSON action on the edge function,
so you can also script via `curl` if needed (see bottom of doc).

## Happy path: new subscription → alert → cancel with refund

1. **Reset fixture** — click "Reset fixture". This upserts the
   `test-fixture` row and clears any stale alert cursors. Idempotent.
2. **Subscribe.** Open `/productions/test-fixture` in a fresh browser
   (or incognito). Pay with a Stripe test card
   (`4242 4242 4242 4242`, any future expiry, any CVC, any zip).
3. **Confirm the signup email.** You should receive a signup email at
   the address you used. The management link points at
   `${PUBLIC_SITE_URL}/subscriptions/…`.
4. **Simulate availability.** Back on `/monitor`, click
   "Simulate availability". This calls `report-scrape` internally with
   `status='available'`, which:
   - sets `productions.last_seen_status = 'available'`
   - sets `productions.last_availability_transition_at = now()`
   - fans out an availability email to every active paid subscriber
     whose `last_alerted_at` is older than the transition (i.e. all of
     them, first time through)
   - stamps `subscriptions.last_alerted_at = now()`
   - writes a row to `notification_logs`.
5. **Confirm the alert email.** Subject: "Standing tickets available —
   Test Fixture Show". The CTA links to the fixture's fake Delfont URL.
6. **Cancel with refund.** Open the management link from the signup
   email and click Cancel. Because we never set
   `last_standing_tickets_found_at` between payment and cancel (the
   fixture resets it to `null`), the refund guarantee applies and
   Stripe issues a full refund against the last PaymentIntent.
7. **Confirm the cancellation + refund email.**

## Alert-dedup path: already-alerted subscribers don't re-email

After step 4 above:

1. Click "Simulate availability" again.
2. The fan-out runs but skips the subscriber (because
   `last_alerted_at >= last_availability_transition_at`). You should
   see no new email.
3. Click "Clear alert state", then "Simulate availability" again —
   email should arrive.

## No-refund path: tickets were found, guarantee doesn't apply

1. Reset fixture, subscribe, confirm signup.
2. On `/monitor`, click "Mark tickets found (disables refund)". This
   sets `last_standing_tickets_found_at = now()`, mimicking a real
   scrape cycle that found seats after the user paid.
3. Cancel via the management link. The cancellation should be deferred
   to period end (no immediate refund). The email subject will be
   "Your cancellation takes effect on …".
4. (Optionally) use the "Preview cancel" panel on `/monitor` with the
   user's email + slug `test-fixture` to inspect what a cancel *would*
   do before the user hits the button. `refundEligible=false`,
   `effective='period_end'`.

## Admin preview (no-op inspection)

"Preview cancel" on `/monitor` mirrors the logic the user-facing cancel
button runs, but is read-only. Useful for:

- Debugging refund disputes ("why did Harry get refunded but Sara
  didn't?").
- Confirming a subscription is in the expected Stripe mode before you
  touch it. The result includes a `mode` block flagging
  `runtime` vs `row` mismatches.

## Cleanup

Click "Delete fixture" on `/monitor`. This removes the production, all
its subscriptions, and all its notification_logs. Refunds already
issued on Stripe are **not** reversed — delete affects our DB only.

If you only want to rerun the happy path, "Reset fixture" is enough;
it keeps existing subscription rows but clears their `last_alerted_at`
so the next "Simulate availability" re-emails them.

## Curl equivalents

Every button hits `POST /functions/v1/admin-test-fixture` with
`X-Admin-Authorization: Basic base64(ADMIN_USERNAME:ADMIN_PASSWORD)`
and one of:

```json
{ "action": "reset" }
{ "action": "simulate-available", "standCount": 3, "performanceCount": 2 }
{ "action": "simulate-tickets-found" }
{ "action": "clear-alert-state" }
{ "action": "delete" }
```

Example:

```bash
BASIC=$(printf '%s:%s' "$ADMIN_USERNAME" "$ADMIN_PASSWORD" | base64)
curl -sS -X POST \
  -H "X-Admin-Authorization: Basic $BASIC" \
  -H "Content-Type: application/json" \
  -d '{"action":"reset"}' \
  "$SUPABASE_URL/functions/v1/admin-test-fixture"
```

## Deployment

This is a separate edge function and needs to be deployed:

```bash
supabase functions deploy admin-test-fixture
```

Nothing else — the migrations, shared helpers, and report-scrape are
already deployed as part of the main pipeline.
