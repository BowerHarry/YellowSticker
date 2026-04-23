// admin-test-fixture: operator helpers for end-to-end testing the
// Stripe + alerts flow without polluting real production rows.
//
// Exposes five actions under one POST endpoint:
//
//   reset                  — upsert the `test-fixture` production row
//                            and clear its alert state. Idempotent.
//   simulate-available     — flip the fixture to `available` with fresh
//                            transition anchor, then call report-scrape
//                            internally so the real fan-out path runs.
//   simulate-tickets-found — set `last_standing_tickets_found_at = now`
//                            so the refund guarantee will NOT apply on
//                            the next cancel. Doesn't trigger fan-out.
//   clear-alert-state      — zero out availability / alert cursors on
//                            both the production and all its active
//                            subscribers so you can re-run T3.
//   delete                 — remove the fixture and all dependent
//                            subscriptions + notification_logs. Cleanup.
//
// Auth: X-Admin-Authorization basic-auth (same pattern as the other
// admin endpoints).
import { adminClient } from '../_shared/db.ts';

const TEST_SLUG = 'test-fixture';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, x-admin-authorization',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const jsonResponse = (body: unknown, init: ResponseInit = {}) =>
  new Response(JSON.stringify(body), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    ...init,
  });

const verifyBasicAuth = (req: Request): boolean => {
  const adminUsername = Deno.env.get('ADMIN_USERNAME');
  const adminPassword = Deno.env.get('ADMIN_PASSWORD');
  if (!adminUsername || !adminPassword) return false;
  const header = req.headers.get('x-admin-authorization') ?? '';
  if (!header.startsWith('Basic ')) return false;
  try {
    const decoded = atob(header.slice('Basic '.length));
    const [u, ...rest] = decoded.split(':');
    return u === adminUsername && rest.join(':') === adminPassword;
  } catch {
    return false;
  }
};

type Action =
  | 'reset'
  | 'simulate-available'
  | 'simulate-tickets-found'
  | 'clear-alert-state'
  | 'delete';

type SimulateBody = {
  action: 'simulate-available';
  standCount?: number;
  performanceCount?: number;
};

type RequestBody =
  | { action: Exclude<Action, 'simulate-available'> }
  | SimulateBody;

// Load (or null) the fixture row. We need its id for downstream SQL
// and its raw state so the UI can render it.
const loadFixture = async () => {
  const { data, error } = await adminClient
    .from('productions')
    .select(
      'id,slug,name,theatre,end_date,last_seen_status,last_checked_at,last_standing_tickets_found_at,last_availability_transition_at,scrape_disabled_reason,adapter',
    )
    .eq('slug', TEST_SLUG)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data;
};

const reset = async () => {
  const nowMinus1Day = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const nowPlus60Days = new Date(Date.now() + 60 * 24 * 60 * 60 * 1000).toISOString();

  // Upsert (create or reset). `adapter: 'none'` means the Firefox
  // extension ignores it — real scrape cycles can't clobber our
  // deliberately-set state.
  const { error } = await adminClient
    .from('productions')
    .upsert(
      {
        slug: TEST_SLUG,
        name: 'Test Fixture Show',
        theatre: 'Test Theatre',
        city: 'London',
        scraping_url:
          'https://buytickets.delfontmackintosh.co.uk/tickets/series/TESTFIX',
        series_code: 'TESTFIX',
        adapter: 'none',
        scrape_disabled_reason: null,
        start_date: nowMinus1Day,
        end_date: nowPlus60Days,
        last_seen_status: 'unknown',
        last_checked_at: null,
        last_standing_tickets_found_at: null,
        last_availability_transition_at: null,
        description: 'Operator-only test fixture. Hidden from public listings.',
      },
      { onConflict: 'slug' },
    );
  if (error) throw new Error(error.message);

  // Also clear any lingering alert cursors on existing active
  // subscriptions so a follow-up simulate-available always alerts.
  const fixture = await loadFixture();
  if (fixture) {
    await adminClient
      .from('subscriptions')
      .update({ last_alerted_at: null })
      .eq('production_id', fixture.id);
  }
  return fixture;
};

const simulateAvailable = async (
  standCount: number,
  performanceCount: number,
) => {
  const fixture = await loadFixture();
  if (!fixture) {
    throw new Error('Test fixture does not exist — run action="reset" first.');
  }

  // Forward through the real report-scrape endpoint so the fan-out
  // logic (transition detection, subscriber dedup, notification_logs,
  // operator copy) runs exactly as it does in production. Saves us
  // from duplicating ~100 lines here.
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const sharedSecret = Deno.env.get('SCRAPER_SHARED_SECRET');
  if (!supabaseUrl || !sharedSecret) {
    throw new Error(
      'SUPABASE_URL or SCRAPER_SHARED_SECRET missing — cannot invoke report-scrape.',
    );
  }

  const resp = await fetch(`${supabaseUrl}/functions/v1/report-scrape`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Scraper-Secret': sharedSecret,
    },
    body: JSON.stringify({
      kind: 'scrape',
      productionId: fixture.id,
      status: 'available',
      standCount,
      performanceCount,
      extensionVersion: 'admin-test-fixture',
    }),
  });
  const payload = await resp.json().catch(() => ({}));
  return { status: resp.status, reportScrape: payload };
};

const simulateTicketsFound = async () => {
  const fixture = await loadFixture();
  if (!fixture) {
    throw new Error('Test fixture does not exist — run action="reset" first.');
  }
  const now = new Date().toISOString();
  const { error } = await adminClient
    .from('productions')
    .update({
      last_standing_tickets_found_at: now,
      last_availability_transition_at: now,
      last_seen_status: 'available',
    })
    .eq('id', fixture.id);
  if (error) throw new Error(error.message);
  return { markedAt: now };
};

const clearAlertState = async () => {
  const fixture = await loadFixture();
  if (!fixture) {
    throw new Error('Test fixture does not exist — run action="reset" first.');
  }
  const { error: prodError } = await adminClient
    .from('productions')
    .update({
      last_standing_tickets_found_at: null,
      last_availability_transition_at: null,
      last_seen_status: 'unknown',
    })
    .eq('id', fixture.id);
  if (prodError) throw new Error(prodError.message);

  const { error: subError } = await adminClient
    .from('subscriptions')
    .update({ last_alerted_at: null })
    .eq('production_id', fixture.id);
  if (subError) throw new Error(subError.message);

  return { ok: true };
};

const deleteFixture = async () => {
  const fixture = await loadFixture();
  if (!fixture) return { deleted: false };

  // Notification logs don't FK to subscriptions, but they do FK to
  // productions — delete them first to avoid dangling-on-delete
  // surprises if the FK is ever changed to RESTRICT.
  await adminClient.from('notification_logs').delete().eq('production_id', fixture.id);
  await adminClient.from('subscriptions').delete().eq('production_id', fixture.id);
  const { error } = await adminClient.from('productions').delete().eq('id', fixture.id);
  if (error) throw new Error(error.message);
  return { deleted: true };
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }
  if (req.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, { status: 405 });
  }
  if (!verifyBasicAuth(req)) {
    return jsonResponse({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: RequestBody;
  try {
    body = (await req.json()) as RequestBody;
  } catch {
    return jsonResponse({ error: 'Invalid JSON' }, { status: 400 });
  }

  try {
    switch (body.action) {
      case 'reset': {
        const fixture = await reset();
        return jsonResponse({ ok: true, action: 'reset', fixture });
      }
      case 'simulate-available': {
        const standCount =
          typeof body.standCount === 'number' && body.standCount >= 0
            ? body.standCount
            : 3;
        const performanceCount =
          typeof body.performanceCount === 'number' && body.performanceCount >= 0
            ? body.performanceCount
            : 2;
        const result = await simulateAvailable(standCount, performanceCount);
        return jsonResponse({ ok: true, action: 'simulate-available', ...result });
      }
      case 'simulate-tickets-found': {
        const result = await simulateTicketsFound();
        return jsonResponse({ ok: true, action: 'simulate-tickets-found', ...result });
      }
      case 'clear-alert-state': {
        const result = await clearAlertState();
        return jsonResponse({ ok: true, action: 'clear-alert-state', ...result });
      }
      case 'delete': {
        const result = await deleteFixture();
        return jsonResponse({ ok: true, action: 'delete', ...result });
      }
      default:
        return jsonResponse(
          {
            error: 'Unknown action',
            available: [
              'reset',
              'simulate-available',
              'simulate-tickets-found',
              'clear-alert-state',
              'delete',
            ],
          },
          { status: 400 },
        );
    }
  } catch (error) {
    console.error('admin-test-fixture error', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return jsonResponse({ error: message }, { status: 500 });
  }
});
