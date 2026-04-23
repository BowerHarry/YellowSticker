// report-scrape: ingest scrape results from the Firefox extension.
//
// The extension POSTs here after each scrape cycle (one call per production),
// plus "stuck" / "resumed" / "boot" heartbeats when it detects its own
// self-healing has escalated. Auth is a single shared secret in the
// X-Scraper-Secret header; we keep this endpoint deliberately narrow so
// compromise would only let an attacker poison our DB with fake statuses.
//
// Request body shape (all fields optional unless noted):
//   {
//     kind: 'scrape' | 'stuck' | 'resumed' | 'boot',   // required
//     extensionVersion: '1.0.0',
//     productionId: '<uuid>',                          // required for 'scrape'
//     status: 'available' | 'unavailable' | 'error',   // required for 'scrape'
//     standCount: 3,
//     performanceCount: 2,
//     performances: [{ eventId: '1154141', startsAt: '2026-04-23T19:00:00Z', standCount: 3 }],
//     detail: { ...free-form... }
//   }
//
// For 'scrape' kind, we also:
//   - update productions.last_seen_status / last_checked_at
//   - fire a Resend email when the status transitions to 'available'
//
// For 'stuck' kind, we email the operator (throttled) so they know the
// extension is blocked and needs a visit.

import { adminClient } from '../_shared/db.ts';
import { availabilityEmail, sendEmail as sendSharedEmail } from '../_shared/emails.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-scraper-secret',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const jsonResponse = (body: unknown, init: ResponseInit = {}) =>
  new Response(JSON.stringify(body), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    ...init,
  });

type Kind = 'scrape' | 'stuck' | 'resumed' | 'boot';
type Status = 'available' | 'unavailable' | 'error';

type Performance = {
  eventId?: string;
  startsAt?: string;
  standCount?: number;
};

type ScraperSettings = {
  pollMinutes?: number;
  activeHoursStart?: number;
  activeHoursEnd?: number;
  timezone?: string;
};

type ReportBody = {
  kind: Kind;
  extensionVersion?: string;
  productionId?: string;
  status?: Status;
  standCount?: number;
  performanceCount?: number;
  performances?: Performance[];
  detail?: Record<string, unknown>;
  reason?: string;
  scraperSettings?: ScraperSettings;
};

type ProductionRow = {
  id: string;
  name: string;
  slug: string;
  theatre: string;
  city?: string | null;
  scraping_url: string;
  series_code: string | null;
  last_seen_status: string | null;
  last_availability_transition_at: string | null;
  end_date: string | null;
};

// Upper bound on how many subscribers we notify synchronously per cycle.
// Keeps the edge function within a reasonable budget even if a production
// suddenly has thousands of subscribers — overflow would need a queue.
const MAX_FANOUT_PER_CYCLE = 200;

const STUCK_EMAIL_COOLDOWN_MS = 3 * 60 * 60 * 1000; // don't spam operator more than once every 3h

const safeString = (v: unknown): string | undefined =>
  typeof v === 'string' && v.trim().length > 0 ? v : undefined;

const safeNumber = (v: unknown): number | undefined =>
  typeof v === 'number' && Number.isFinite(v) ? v : undefined;

const escapeHtml = (value: string) =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const sendEmail = async ({
  to,
  subject,
  html,
}: {
  to: string;
  subject: string;
  html: string;
}): Promise<{ id: string | null } | null> => {
  const apiKey = Deno.env.get('RESEND_API_KEY');
  const fromEmail = Deno.env.get('RESEND_FROM_EMAIL') ?? 'onboarding@resend.dev';
  if (!apiKey) {
    console.warn('RESEND_API_KEY missing — skipping email send');
    return null;
  }
  const resp = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: `Yellow Sticker <${fromEmail}>`,
      to: [to],
      subject,
      html,
    }),
  });
  if (!resp.ok) {
    const text = await resp.text();
    console.error(`Resend failed: ${resp.status} ${text}`);
    return null;
  }
  const body = await resp.json().catch(() => ({}));
  return { id: body?.id ?? null };
};

// Legacy single-recipient alert sent to ALERT_EMAIL. We keep it so the
// operator still sees every availability flip in their own inbox for
// debug / monitoring purposes — in parallel with the per-subscriber
// fan-out below.
const sendOperatorAvailabilityEmail = async (
  production: ProductionRow,
  body: ReportBody,
): Promise<string | null> => {
  const to = Deno.env.get('ALERT_EMAIL');
  if (!to) return null;
  const subject = `Standing tickets spotted: ${production.name}`;
  const countLine = body.standCount
    ? `<p>Found <strong>${body.standCount}</strong> standing ticket(s) across <strong>${body.performanceCount ?? '?'}</strong> performance(s).</p>`
    : '';
  const html = `
    <h2>${escapeHtml(production.name)}</h2>
    <p>Standing tickets appear to be available at <strong>${escapeHtml(production.theatre)}</strong>.</p>
    ${countLine}
    <p><a href="${escapeHtml(production.scraping_url)}">Open the box office page</a></p>
    <hr>
    <p style="font-size: 0.85rem; color: #666;">
      Sent by Yellow Sticker (Firefox extension v${escapeHtml(body.extensionVersion ?? '?')})
    </p>
  `;
  const result = await sendEmail({ to, subject, html });
  return result?.id ?? null;
};

type AlertableSubscription = {
  id: string;
  user_id: string;
  production_id: string;
  management_token: string | null;
  last_alerted_at: string | null;
  users: { email: string | null } | { email: string | null }[] | null;
};

// Fan out availability emails to every active subscriber for the given
// production who hasn't already been alerted for the current availability
// event. "Current event" is anchored at `productions.last_availability_transition_at`.
// Returns the list of user_ids we successfully alerted.
const fanOutAvailabilityEmails = async (
  production: ProductionRow,
  body: ReportBody,
): Promise<{ alerted: number; skipped: number; failed: number }> => {
  if (!production.last_availability_transition_at) {
    // Should never happen — caller sets this before invoking us — but fail
    // closed rather than spamming every subscriber.
    return { alerted: 0, skipped: 0, failed: 0 };
  }
  const transitionAt = production.last_availability_transition_at;
  const nowIso = new Date().toISOString();

  const { data: subs, error } = await adminClient
    .from('subscriptions')
    .select('id,user_id,production_id,management_token,last_alerted_at,users(email)')
    .eq('production_id', production.id)
    .eq('payment_status', 'paid')
    .gt('subscription_end', nowIso)
    .or(`last_alerted_at.is.null,last_alerted_at.lt.${transitionAt}`)
    .limit(MAX_FANOUT_PER_CYCLE);

  if (error) {
    console.error('Failed to select alertable subscribers', error);
    return { alerted: 0, skipped: 0, failed: 0 };
  }

  const subscriptions = (subs ?? []) as AlertableSubscription[];
  if (subscriptions.length === 0) {
    return { alerted: 0, skipped: 0, failed: 0 };
  }

  let alerted = 0;
  let failed = 0;
  const results = await Promise.allSettled(
    subscriptions.map(async (sub) => {
      const userRecord = Array.isArray(sub.users) ? sub.users[0] : sub.users;
      const email = userRecord?.email ?? null;
      if (!email) return 'skipped' as const;

      const { subject, html } = availabilityEmail(
        {
          name: production.name,
          theatre: production.theatre,
          city: production.city ?? null,
          slug: production.slug,
          endDate: production.end_date ?? null,
          scrapingUrl: production.scraping_url,
          seriesCode: production.series_code,
        },
        {
          paymentType: 'subscription',
          managementToken: sub.management_token,
        },
        {
          standCount: body.standCount ?? null,
          performanceCount: body.performanceCount ?? null,
        },
      );

      const messageId = await sendSharedEmail({ to: email, subject, html });
      if (!messageId) return 'failed' as const;

      await adminClient
        .from('subscriptions')
        .update({ last_alerted_at: nowIso })
        .eq('id', sub.id);

      await adminClient.from('notification_logs').insert({
        user_id: sub.user_id,
        production_id: production.id,
        type: 'email',
        channel_message_id: messageId,
        payload: {
          recipient: email,
          reason: 'standing_available',
          standCount: body.standCount ?? null,
          performanceCount: body.performanceCount ?? null,
          transitionAt,
        },
      });

      return 'sent' as const;
    }),
  );

  for (const r of results) {
    if (r.status === 'fulfilled') {
      if (r.value === 'sent') alerted++;
      else if (r.value === 'failed') failed++;
    } else {
      failed++;
      console.error('Fan-out exception', r.reason);
    }
  }

  return { alerted, skipped: subscriptions.length - alerted - failed, failed };
};

const shouldSendStuckEmail = async (): Promise<boolean> => {
  const since = new Date(Date.now() - STUCK_EMAIL_COOLDOWN_MS).toISOString();
  const { data, error } = await adminClient
    .from('notification_logs')
    .select('id')
    .gte('sent_at', since)
    .contains('payload', { reason: 'scraper_stuck' })
    .limit(1);
  if (error) {
    console.warn('Failed to check stuck cooldown', error);
    return true; // fail open — better to double-notify than to silently eat an alert
  }
  return (data ?? []).length === 0;
};

const sendStuckEmail = async (body: ReportBody): Promise<string | null> => {
  const to = Deno.env.get('ALERT_EMAIL');
  if (!to) return null;
  if (!(await shouldSendStuckEmail())) {
    console.log('Stuck email throttled (within cooldown)');
    return null;
  }
  const subject = 'Yellow Sticker scraper is stuck';
  const detail = body.detail ? JSON.stringify(body.detail, null, 2) : '(no detail)';
  const html = `
    <h2>Scraper is blocked</h2>
    <p>The Firefox extension has reported it's stuck behind a challenge it can't
    auto-solve. Open the Mac mini, visit the theatre site once to clear the
    challenge, and it'll resume automatically.</p>
    <p><strong>Reason:</strong> ${escapeHtml(body.reason ?? 'unknown')}</p>
    <pre style="background:#f3f3f3;padding:1em;border-radius:6px;font-size:0.8rem;">${escapeHtml(detail)}</pre>
    <hr>
    <p style="font-size: 0.85rem; color: #666;">
      Extension v${escapeHtml(body.extensionVersion ?? '?')}
    </p>
  `;
  const result = await sendEmail({ to, subject, html });
  if (result) {
    // Tag in notification_logs so we can throttle.
    await adminClient.from('notification_logs').insert({
      user_id: null,
      production_id: null,
      type: 'email',
      channel_message_id: result.id,
      payload: { reason: 'scraper_stuck', recipient: to },
    });
  }
  return result?.id ?? null;
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }
  if (req.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, { status: 405 });
  }

  const sharedSecret = Deno.env.get('SCRAPER_SHARED_SECRET');
  if (!sharedSecret) {
    console.error('SCRAPER_SHARED_SECRET not configured');
    return jsonResponse({ error: 'Server misconfigured' }, { status: 500 });
  }
  const providedSecret = req.headers.get('x-scraper-secret');
  if (providedSecret !== sharedSecret) {
    return jsonResponse({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: ReportBody;
  try {
    body = (await req.json()) as ReportBody;
  } catch {
    return jsonResponse({ error: 'Invalid JSON' }, { status: 400 });
  }

  if (!body || !body.kind) {
    return jsonResponse({ error: 'Missing kind' }, { status: 400 });
  }

  // Always persist a heartbeat for every report — makes debugging a lot easier.
  const heartbeatPayload = {
    kind: body.kind,
    extension_version: safeString(body.extensionVersion) ?? null,
    production_id: safeString(body.productionId) ?? null,
    status: safeString(body.status) ?? null,
    stand_count: safeNumber(body.standCount) ?? null,
    performance_count: safeNumber(body.performanceCount) ?? null,
    detail: {
      reason: body.reason ?? null,
      performances: body.performances ?? [],
      ...(body.detail ?? {}),
    },
  };
  const { error: heartbeatError } = await adminClient
    .from('scrape_heartbeats')
    .insert(heartbeatPayload);
  if (heartbeatError) {
    console.error('Failed to insert heartbeat', heartbeatError);
    // Non-fatal — keep going so the availability update / email still fires.
  }

  // Upsert the extension's current scheduler settings so the monitor
  // dashboard can compute online-vs-paused correctly. Missing fields fall
  // back to whatever is already stored (the default row is seeded by the
  // migration).
  if (body.scraperSettings) {
    const s = body.scraperSettings;
    const patch: Record<string, unknown> = {
      id: 1,
      updated_at: new Date().toISOString(),
      extension_version: safeString(body.extensionVersion) ?? null,
    };
    if (safeNumber(s.pollMinutes) !== undefined) patch.poll_minutes = s.pollMinutes;
    if (safeNumber(s.activeHoursStart) !== undefined) patch.active_hours_start = s.activeHoursStart;
    if (safeNumber(s.activeHoursEnd) !== undefined) patch.active_hours_end = s.activeHoursEnd;
    if (safeString(s.timezone)) patch.timezone = s.timezone;
    const { error: settingsError } = await adminClient
      .from('scraper_settings')
      .upsert(patch, { onConflict: 'id' });
    if (settingsError) {
      console.error('Failed to upsert scraper_settings', settingsError);
    }
  }

  // --- scrape report ------------------------------------------------------
  if (body.kind === 'scrape') {
    const productionId = safeString(body.productionId);
    const status = safeString(body.status) as Status | undefined;
    if (!productionId || !status) {
      return jsonResponse({ error: 'scrape kind requires productionId + status' }, { status: 400 });
    }

    const { data: production, error: prodError } = await adminClient
      .from('productions')
      .select('id,name,slug,theatre,city,scraping_url,series_code,last_seen_status,last_availability_transition_at,end_date')
      .eq('id', productionId)
      .maybeSingle();
    if (prodError || !production) {
      return jsonResponse({ error: 'Unknown productionId' }, { status: 404 });
    }

    const prodRow = production as ProductionRow;
    const previous = prodRow.last_seen_status ?? 'unknown';
    const now = new Date().toISOString();

    // Only persist the top-level status if we actually got a clean result.
    // An 'error' status means the extension tried but couldn't read the seat
    // map this cycle — treat as unknown rather than flipping to unavailable.
    const persistedStatus = status === 'error' ? 'unknown' : status;
    const isTransitionToAvailable = status === 'available' && previous !== 'available';

    const patch: Record<string, unknown> = {
      last_seen_status: persistedStatus,
      last_checked_at: now,
    };
    if (status === 'available') {
      patch.last_standing_tickets_found_at = now;
    }
    if (isTransitionToAvailable) {
      // Anchor for the per-subscriber fan-out dedup. Only bumped on the
      // flip so ongoing availability doesn't re-alert the same users.
      patch.last_availability_transition_at = now;
      prodRow.last_availability_transition_at = now;
    }

    const { error: updateError } = await adminClient
      .from('productions')
      .update(patch)
      .eq('id', productionId);
    if (updateError) {
      console.error(`Failed to update production ${productionId}`, updateError);
      return jsonResponse({ error: 'Failed to update production' }, { status: 500 });
    }

    let operatorEmailId: string | null = null;
    let fanOut = { alerted: 0, skipped: 0, failed: 0 };

    if (status === 'available') {
      // Fan out to subscribers whose last_alerted_at is older than the
      // current transition anchor. On the transition cycle that's
      // everyone active; on subsequent "still available" cycles it's
      // just anyone who subscribed in between.
      try {
        fanOut = await fanOutAvailabilityEmails(prodRow, body);
      } catch (error) {
        console.error('Fan-out failed', error);
      }

      // Operator copy (only on the transition, to match prior behavior).
      if (isTransitionToAvailable) {
        try {
          operatorEmailId = await sendOperatorAvailabilityEmail(prodRow, body);
          if (operatorEmailId) {
            await adminClient.from('notification_logs').insert({
              user_id: null,
              production_id: productionId,
              type: 'email',
              channel_message_id: operatorEmailId,
              payload: {
                recipient: Deno.env.get('ALERT_EMAIL') ?? null,
                reason: 'standing_available_operator',
                standCount: body.standCount ?? null,
                performanceCount: body.performanceCount ?? null,
              },
            });
          }
        } catch (error) {
          console.error('Failed to send operator availability email', error);
        }
      }
    }

    return jsonResponse({
      ok: true,
      productionId,
      previousStatus: previous,
      newStatus: persistedStatus,
      transition: isTransitionToAvailable,
      operatorEmailId,
      fanOut,
    });
  }

  // --- stuck report -------------------------------------------------------
  if (body.kind === 'stuck') {
    const emailId = await sendStuckEmail(body);
    return jsonResponse({ ok: true, emailId });
  }

  // --- boot / resumed -----------------------------------------------------
  // Nothing more to do beyond the heartbeat insert above.
  return jsonResponse({ ok: true });
});
