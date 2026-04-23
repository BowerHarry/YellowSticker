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

// Hour-of-day (0-23) in the given IANA zone. Returns NaN if the zone is
// invalid (unlikely — we validated the input elsewhere).
const hourInZone = (when: Date, timezone: string): number => {
  try {
    const value = new Intl.DateTimeFormat('en-GB', {
      timeZone: timezone,
      hour: '2-digit',
      hour12: false,
    }).format(when);
    return Number(value);
  } catch {
    return when.getUTCHours();
  }
};

const isWithinWindow = (hour: number, start: number, end: number): boolean => {
  if (!Number.isFinite(hour) || !Number.isFinite(start) || !Number.isFinite(end)) return true;
  if (start === end) return true; // degenerate: always active
  if (start < end) return hour >= start && hour < end;
  // crosses midnight (e.g. 22-6)
  return hour >= start || hour < end;
};

// Today's date in the given timezone as 'YYYY-MM-DD'. Used for filtering
// productions by start_date / end_date.
const todayIsoInZone = (when: Date, timezone: string): string => {
  try {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(when);
    // en-CA gives YYYY-MM-DD
    return parts;
  } catch {
    return when.toISOString().slice(0, 10);
  }
};

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const now = new Date();
    const dayStartIso = startOfDayIso(now);
    const monthStartIso = startOfMonthIso(now);

    // --- Scraper settings (user-editable in the extension) ---------------
    // Seeded by the migration, then kept fresh by report-scrape. Fallbacks
    // mirror the extension's DEFAULTS so a pre-upgrade DB still behaves
    // sensibly.
    const scraperSettingsDefaults = {
      pollMinutes: 10,
      activeHoursStart: 8,
      activeHoursEnd: 22,
      timezone: 'Europe/London',
    };
    let scraperSettings = { ...scraperSettingsDefaults };
    let scraperSettingsUpdatedAt: string | null = null;
    let extensionVersion: string | null = null;
    try {
      const { data, error } = await adminClient
        .from('scraper_settings')
        .select('poll_minutes, active_hours_start, active_hours_end, timezone, extension_version, updated_at')
        .eq('id', 1)
        .maybeSingle();
      if (error) throw error;
      if (data) {
        scraperSettings = {
          pollMinutes: Number(data.poll_minutes) || scraperSettingsDefaults.pollMinutes,
          activeHoursStart: Number(data.active_hours_start) ?? scraperSettingsDefaults.activeHoursStart,
          activeHoursEnd: Number(data.active_hours_end) ?? scraperSettingsDefaults.activeHoursEnd,
          timezone: typeof data.timezone === 'string' && data.timezone ? data.timezone : scraperSettingsDefaults.timezone,
        };
        scraperSettingsUpdatedAt = data.updated_at ?? null;
        extensionVersion = data.extension_version ?? null;
      }
    } catch (error) {
      console.error('Failed to load scraper_settings — falling back to defaults', error);
    }

    const currentHour = hourInZone(now, scraperSettings.timezone);
    const withinActiveWindow = isWithinWindow(
      currentHour,
      scraperSettings.activeHoursStart,
      scraperSettings.activeHoursEnd,
    );
    // Grace window = 2x configured poll interval (so an occasional missed
    // tick doesn't flap the dashboard). Floor to at least 2 minutes.
    const graceMinutes = Math.max(2, Math.ceil(scraperSettings.pollMinutes * 2));
    const graceCutoff = new Date(now.getTime() - graceMinutes * 60 * 1000);
    const graceCutoffIso = graceCutoff.toISOString();

    const todayIso = todayIsoInZone(now, scraperSettings.timezone);

    // --- Productions: only active ones are relevant to monitor -----------
    // "Active" = automated scraper enabled and today within the configured
    // run window.
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
        .select('id,name,last_checked_at,last_standing_tickets_found_at,last_seen_status,adapter,scrape_disabled_reason,start_date,end_date')
        .neq('adapter', 'none')
        .is('scrape_disabled_reason', null)
        .order('name');

      if (productionsError) throw productionsError;

      for (const production of (productions ?? []) as Array<
        Pick<
          ProductionRecord,
          | 'id'
          | 'name'
          | 'last_checked_at'
          | 'last_standing_tickets_found_at'
          | 'last_seen_status'
          | 'adapter'
          | 'scrape_disabled_reason'
          | 'start_date'
          | 'end_date'
        >
      >) {
        if (production.start_date && production.start_date.slice(0, 10) > todayIso) continue;
        if (production.end_date && production.end_date.slice(0, 10) < todayIso) continue;

        const lastChecked = production.last_checked_at ? new Date(production.last_checked_at) : null;
        const lastSeenStatus = (production.last_seen_status as 'available' | 'unavailable' | 'unknown' | null) ?? null;
        const wasRecent = !!lastChecked && lastChecked >= graceCutoff;
        const lastRunPassed = lastSeenStatus !== 'unknown' && lastSeenStatus !== null;

        let status: 'healthy' | 'unhealthy' | 'paused';
        if (!withinActiveWindow) {
          // Extension isn't expected to be running right now.
          status = 'paused';
        } else if (!lastChecked) {
          status = 'unhealthy';
        } else if (lastSeenStatus === 'unknown') {
          status = 'unhealthy';
        } else if (wasRecent && lastRunPassed) {
          status = 'healthy';
        } else if (lastRunPassed && !wasRecent) {
          // Inside the active window but no scrape inside the grace window.
          status = 'unhealthy';
        } else {
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

    // --- Scraper health: align with the extension's schedule -------------
    // The Firefox extension posts a heartbeat to `scrape_heartbeats` on
    // every tick. Outside the configured active window it isn't expected
    // to tick at all, so we render it as "paused" instead of "unhealthy".
    // Inside the window we require a heartbeat within the grace cutoff
    // (2x configured poll interval) to call the extension online.
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
          (r) => r.kind === 'stuck' && r.reported_at >= graceCutoffIso,
        );
      }
    } catch (error) {
      console.error('Failed to load scrape_heartbeats', error);
    }

    const hasFailedProductions = productionStatuses.some((p) => p.lastSeenStatus === 'unknown');
    const heartbeatFresh = !!latestHeartbeatAt && latestHeartbeatAt >= graceCutoffIso;
    let scraperStatus: 'healthy' | 'unhealthy' | 'paused';
    if (!withinActiveWindow) {
      scraperStatus = 'paused';
    } else if (recentStuck) {
      scraperStatus = 'unhealthy';
    } else if (heartbeatFresh && !hasFailedProductions) {
      scraperStatus = 'healthy';
    } else {
      scraperStatus = 'unhealthy';
    }
    const scraperHealthy = scraperStatus === 'healthy';
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
          status: scraperStatus,
          lastCheckedAt,
          lastHeartbeatAt: latestHeartbeatAt,
          lastHeartbeatKind: latestHeartbeatKind,
          recentStuck,
          hasFailedProductions,
          withinActiveWindow,
          graceMinutes,
          extensionVersion,
          settings: {
            ...scraperSettings,
            updatedAt: scraperSettingsUpdatedAt,
          },
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
