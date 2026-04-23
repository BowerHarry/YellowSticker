import { adminClient } from '../_shared/db.ts';
import type { ProductionRecord } from '../_shared/types.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
};

const jsonResponse = (body: unknown, init: ResponseInit = {}) =>
  new Response(JSON.stringify(body), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    ...init,
  });

const getNumberEnv = (key: string, fallback: number): number => {
  const value = Deno.env.get(key);
  if (!value) return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const startOfDayIso = (date: Date) => {
  const copy = new Date(date);
  copy.setUTCHours(0, 0, 0, 0);
  return copy.toISOString();
};

const startOfMonthIso = (date: Date) => {
  const copy = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1, 0, 0, 0, 0));
  return copy.toISOString();
};

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const now = new Date();
    const fifteenMinutesAgo = new Date(now.getTime() - 15 * 60 * 1000);
    const dayStartIso = startOfDayIso(now);
    const monthStartIso = startOfMonthIso(now);

    const productionStatuses: Array<{
      id: string;
      name: string;
      lastCheckedAt: string | null;
      lastStandingTicketsFoundAt: string | null;
      lastSeenStatus: 'available' | 'unavailable' | 'unknown' | null;
      status: 'healthy' | 'unhealthy' | 'paused';
    }> = [];
    try {
      const { data: productions, error: productionsError } = await adminClient
        .from('productions')
        .select('id,name,last_checked_at,last_standing_tickets_found_at,last_seen_status')
        .order('name');

      if (productionsError) throw productionsError;

      const currentHour = now.getUTCHours();
      const isRunningHours = currentHour >= 8 && currentHour < 18; // 8am-6pm UTC

      for (const production of (productions ?? []) as Pick<
        ProductionRecord,
        'id' | 'name' | 'last_checked_at' | 'last_standing_tickets_found_at' | 'last_seen_status'
      >[]) {
        const lastChecked = production.last_checked_at ? new Date(production.last_checked_at) : null;
        const lastSeenStatus = (production.last_seen_status as 'available' | 'unavailable' | 'unknown' | null) ?? null;
        const wasRecent = !!lastChecked && lastChecked >= fifteenMinutesAgo;
        const lastRunPassed = lastSeenStatus !== 'unknown' && lastSeenStatus !== null;

        let status: 'healthy' | 'unhealthy' | 'paused';
        if (!lastChecked) {
          // Never checked
          status = 'unhealthy';
        } else if (lastSeenStatus === 'unknown') {
          // Last run failed
          status = 'unhealthy';
        } else if (wasRecent && lastRunPassed) {
          // Recent (within 15 mins) and passed - definitely healthy
          status = 'healthy';
        } else if (!isRunningHours && lastRunPassed) {
          // Outside running hours, last run passed, but it's been >15 mins
          // Show as paused (grey) since job isn't running during these hours
          status = 'paused';
        } else if (isRunningHours && lastRunPassed && !wasRecent) {
          // Inside running hours, last run passed, but it's been >15 mins
          // Should have run by now - show as unhealthy (red)
          status = 'unhealthy';
        } else if (lastRunPassed) {
          // Last run passed (fallback - shouldn't normally reach here)
          status = 'healthy';
        } else {
          // Shouldn't happen, but default to unhealthy
          status = 'unhealthy';
        }

        productionStatuses.push({
          id: production.id,
          name: production.name,
          lastCheckedAt: production.last_checked_at ?? null,
          lastStandingTicketsFoundAt: production.last_standing_tickets_found_at ?? null,
          lastSeenStatus,
          status,
        });
      }
    } catch (error) {
      console.error('Failed to load productions', error);
    }

    // Scraper health: the Firefox extension posts a heartbeat to
    // `scrape_heartbeats` on every scrape cycle. If we haven't seen any
    // heartbeat in the last 30 minutes during active hours, something is
    // wrong (browser closed, laptop asleep, extension crashed, etc).
    // We also flag unhealthy if a 'stuck' heartbeat is the most recent
    // thing we've heard from it.
    const thirtyMinAgo = new Date(now.getTime() - 30 * 60 * 1000).toISOString();
    let latestHeartbeatAt: string | null = null;
    let latestHeartbeatKind: string | null = null;
    let recentStuck = false;
    try {
      const { data: hb, error: hbError } = await adminClient
        .from('scrape_heartbeats')
        .select('reported_at, kind')
        .order('reported_at', { ascending: false })
        .limit(5);
      if (hbError) throw hbError;
      const rows = (hb ?? []) as Array<{ reported_at: string; kind: string }>;
      if (rows.length > 0) {
        latestHeartbeatAt = rows[0].reported_at;
        latestHeartbeatKind = rows[0].kind;
        recentStuck = rows.some(
          (r) => r.kind === 'stuck' && r.reported_at >= thirtyMinAgo,
        );
      }
    } catch (error) {
      console.error('Failed to load scrape_heartbeats', error);
    }

    const hasFailedProductions = productionStatuses.some((p) => p.lastSeenStatus === 'unknown');
    const heartbeatFresh = !!latestHeartbeatAt && latestHeartbeatAt >= thirtyMinAgo;
    const scraperHealthy = heartbeatFresh && !recentStuck && !hasFailedProductions;
    const lastCheckedAt = productionStatuses.reduce<string | null>((latest, p) => {
      if (!p.lastCheckedAt) return latest;
      if (!latest || p.lastCheckedAt > latest) return p.lastCheckedAt;
      return latest;
    }, null);

    // Database limits
    const monthlyUserLimit = getNumberEnv('SUPABASE_MONTHLY_USER_LIMIT', 50000);
    const dbSizeLimitBytes = getNumberEnv('SUPABASE_DB_SIZE_LIMIT_BYTES', 500 * 1024 * 1024);

    let monthlyUsers = 0;
    try {
      const { count, error } = await adminClient
        .from('users')
        .select('id', { head: true, count: 'exact' })
        .gte('created_at', monthStartIso);
      if (error) throw error;
      monthlyUsers = count ?? 0;
    } catch (error) {
      console.error('Failed to compute monthly users', error);
    }

    let databaseSizeBytes = 0;
    try {
      const { data, error } = await adminClient.rpc('get_database_size_bytes');
      if (error) throw error;
      databaseSizeBytes = typeof data === 'number' ? data : 0;
    } catch (error) {
      console.error('Failed to fetch database size', error);
    }

    const databaseHealthy = monthlyUsers < monthlyUserLimit && databaseSizeBytes < dbSizeLimitBytes;

    // Email provider usage (Resend)
    const resendDailyLimit = getNumberEnv('RESEND_DAILY_LIMIT', 200);
    const resendMonthlyLimit = getNumberEnv('RESEND_MONTHLY_LIMIT', 10000);
    let resendDailyUsage = 0;
    let resendMonthlyUsage = 0;
    try {
      const [{ count: dayCount, error: dayError }, { count: monthCount, error: monthError }] = await Promise.all([
        adminClient
          .from('notification_logs')
          .select('id', { head: true, count: 'exact' })
          .eq('type', 'email')
          .gte('sent_at', dayStartIso),
        adminClient
          .from('notification_logs')
          .select('id', { head: true, count: 'exact' })
          .eq('type', 'email')
          .gte('sent_at', monthStartIso),
      ]);
      if (dayError) throw dayError;
      if (monthError) throw monthError;
      resendDailyUsage = dayCount ?? 0;
      resendMonthlyUsage = monthCount ?? 0;
    } catch (error) {
      console.error('Failed to load email usage stats', error);
    }
    const emailHealthy = resendDailyUsage < resendDailyLimit && resendMonthlyUsage < resendMonthlyLimit;

    // Payment provider status (Stripe)
    const stripeLookbackDays = getNumberEnv('STRIPE_HEALTH_LOOKBACK_DAYS', 30);
    const stripeLookbackIso = new Date(now.getTime() - stripeLookbackDays * 24 * 60 * 60 * 1000).toISOString();
    let stripeLastPaidAt: string | null = null;
    let stripeHealthy = false;
    try {
      const { data, error } = await adminClient
        .from('subscriptions')
        .select('updated_at')
        .eq('payment_status', 'paid')
        .gte('updated_at', stripeLookbackIso)
        .order('updated_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      stripeLastPaidAt = data?.updated_at ?? null;
      stripeHealthy = !!stripeLastPaidAt;
    } catch (error) {
      console.error('Failed to load Stripe status', error);
    }

    return jsonResponse({
      timestamp: now.toISOString(),
      productions: productionStatuses,
      services: {
        scraper: {
          healthy: scraperHealthy,
          lastCheckedAt,
          lastHeartbeatAt: latestHeartbeatAt,
          lastHeartbeatKind: latestHeartbeatKind,
          recentStuck,
          hasFailedProductions,
        },
        database: {
          healthy: databaseHealthy,
          monthlyUsers,
          monthlyUserLimit,
          sizeBytes: databaseSizeBytes,
          sizeLimitBytes: dbSizeLimitBytes,
        },
        email: {
          healthy: emailHealthy,
          dailyUsage: resendDailyUsage,
          dailyLimit: resendDailyLimit,
          monthlyUsage: resendMonthlyUsage,
          monthlyLimit: resendMonthlyLimit,
        },
        payment: {
          healthy: stripeHealthy,
          lastPaidAt: stripeLastPaidAt,
          lookbackDays: stripeLookbackDays,
        },
      },
    });
  } catch (error) {
    console.error('status-dashboard error', error);
    return jsonResponse({ error: 'Failed to compute status' }, { status: 500 });
  }
});
