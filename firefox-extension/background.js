/*
 * Yellow Sticker Scraper – background script.
 *
 * Design summary
 * --------------
 * An MV2 persistent background script (event page) that:
 *   1. Reads a list of "active" productions from Supabase via the REST API.
 *   2. For each Delfont production with a `series_code`, calls two JSON
 *      endpoints in the user's authenticated buytickets.delfontmackintosh.co.uk
 *      session to determine today's performances and their standing-ticket
 *      counts.
 *   3. POSTs the result to the Supabase `report-scrape` edge function, which
 *      updates the DB and fires availability emails via Resend.
 *   4. When a fetch returns HTML (CF/Queue-it challenge) instead of JSON, it
 *      opens a hidden background tab to the site so the real browser can
 *      silently refresh `cf_clearance` / `__cf_bm`, then retries. If that
 *      fails repeatedly it pings the edge function with a "stuck" kind so the
 *      operator is emailed.
 *
 * Everything runs inside Firefox using the user's own session cookies. The
 * extension never sees or stores those cookies; it just lets Firefox attach
 * them to outgoing requests (`credentials: 'include'`).
 */

'use strict';

const EXTENSION_VERSION = '1.0.0';

// --- Config / storage ------------------------------------------------------
//
// Settings are user-editable via the options page. Defaults are conservative;
// the options page enforces that supabaseUrl / supabaseAnonKey / scraperSecret
// are all set before enabling the scheduler.
const DEFAULTS = {
  supabaseUrl: '',
  supabaseAnonKey: '',
  scraperSecret: '',
  pollMinutes: 10,
  activeHoursStart: 8,
  activeHoursEnd: 22,
  runWhenIdleOnly: false,
  enabled: false,
};

const getSettings = async () => {
  const stored = await browser.storage.local.get(Object.keys(DEFAULTS));
  return { ...DEFAULTS, ...stored };
};

const setSettings = (patch) => browser.storage.local.set(patch);

// Small runtime state kept across alarm ticks. We persist to storage so the
// state survives a background-page suspension / reload.
const getState = async () => {
  const s = await browser.storage.local.get([
    'consecutiveFailures',
    'lastRunAt',
    'lastRunSummary',
    'stuckNotifiedAt',
  ]);
  return {
    consecutiveFailures: s.consecutiveFailures ?? 0,
    lastRunAt: s.lastRunAt ?? null,
    lastRunSummary: s.lastRunSummary ?? null,
    stuckNotifiedAt: s.stuckNotifiedAt ?? null,
  };
};

const setState = (patch) => browser.storage.local.set(patch);

// --- Utility ---------------------------------------------------------------

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const log = (...args) => console.log('[yellow-sticker]', ...args);
const warn = (...args) => console.warn('[yellow-sticker]', ...args);
const error = (...args) => console.error('[yellow-sticker]', ...args);

// Today in Europe/London in a few formats. The API uses `YYYY/MM/01` for the
// month query and ISO datetimes (`LocalDate`) in responses. Event-inventory
// referers use the `MM-DD-YYYY` style.
const todayInLondon = () => {
  const now = new Date();
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/London',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  const year = Number(parts.find((p) => p.type === 'year').value);
  const month = Number(parts.find((p) => p.type === 'month').value);
  const day = Number(parts.find((p) => p.type === 'day').value);
  const pad = (n) => String(n).padStart(2, '0');
  return {
    year,
    month,
    day,
    iso: `${year}-${pad(month)}-${pad(day)}`,
    usStyle: `${pad(month)}-${pad(day)}-${year}`,
    apiMonth: `${year}/${pad(month)}/01`,
  };
};

class ChallengeError extends Error {
  constructor(message, detail) {
    super(message);
    this.name = 'ChallengeError';
    this.detail = detail;
  }
}

// --- Authenticated fetches to buytickets.delfontmackintosh.co.uk ----------
//
// These calls rely on the browser's cookie jar. The extension has
// host-permission for the delfontmackintosh domain, so Firefox will attach
// the site's cookies (including cf_clearance / __cf_bm / Queue-it token).

const SITE_ORIGIN = 'https://buytickets.delfontmackintosh.co.uk';

const fetchDelfontJSON = async (path, { referer } = {}) => {
  const url = `${SITE_ORIGIN}${path}`;
  const headers = {
    Accept: 'application/json, text/plain, */*',
    'Accept-Language': 'en-GB,en;q=0.9',
  };
  if (referer) headers.Referer = referer;

  const resp = await fetch(url, {
    method: 'GET',
    credentials: 'include',
    headers,
    redirect: 'follow',
  });

  const contentType = resp.headers.get('content-type') || '';
  // CF/Queue-it interstitials are served as text/html regardless of what the
  // API would return. Easiest discriminator.
  if (!contentType.includes('json')) {
    const snippet = (await resp.text().catch(() => '')).slice(0, 200);
    throw new ChallengeError('Non-JSON response from Delfont', {
      url,
      status: resp.status,
      contentType,
      snippet,
    });
  }

  if (!resp.ok) {
    throw new Error(`Delfont API ${resp.status}: ${url}`);
  }
  return resp.json();
};

// Open a hidden background tab to the production's public URL. The real
// browser will execute any CF JS challenge silently, refreshing cookies,
// then we close the tab and retry the API call. This is the self-healing
// step that removes the need for human intervention in the common case.
const refreshCookiesViaHiddenTab = async (url, timeoutMs = 60000) => {
  log(`Opening hidden tab to refresh cookies: ${url}`);
  const tab = await browser.tabs.create({ url, active: false });
  try {
    await waitForTabComplete(tab.id, timeoutMs);
    // Give any lazy post-load CF / in-page XHRs a chance to settle. Five
    // seconds is generous but cheap in the grand scheme.
    await sleep(5000);
  } finally {
    try {
      await browser.tabs.remove(tab.id);
    } catch (e) {
      // Tab may have been closed already (e.g. redirected to queue-it on a
      // different origin) — fine to swallow.
    }
  }
};

const waitForTabComplete = (tabId, timeoutMs) =>
  new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      browser.tabs.onUpdated.removeListener(listener);
      reject(new Error('Tab load timed out'));
    }, timeoutMs);
    const listener = (id, change) => {
      if (id === tabId && change.status === 'complete') {
        clearTimeout(timer);
        browser.tabs.onUpdated.removeListener(listener);
        resolve();
      }
    };
    browser.tabs.onUpdated.addListener(listener);
  });

// Wrapper: try the fetch; on ChallengeError, refresh cookies via hidden tab
// and retry once. If the second attempt also fails we surface the error to
// the caller (which will record a per-production failure).
const fetchDelfontJSONWithHealing = async (path, { referer, productionUrl } = {}) => {
  try {
    return await fetchDelfontJSON(path, { referer });
  } catch (err) {
    if (!(err instanceof ChallengeError)) throw err;
    log(`Challenge detected on ${path}; attempting cookie refresh`);
    if (productionUrl) {
      await refreshCookiesViaHiddenTab(productionUrl);
    }
    return await fetchDelfontJSON(path, { referer });
  }
};

// --- Delfont adapter -------------------------------------------------------
//
// Two endpoints are used:
//
//   1. GET /api/events/getbymonth?requestedTime=YYYY/MM/01
//                                &salesChannel=Web&seriesCode=<code>
//      Returns an array of performance objects for the given month. We
//      filter to ones whose `LocalDate` is on today's London date, that
//      have `HasProducts=true` and `IsBeforeSaleDate=false` (i.e. the
//      tickets are actually on sale right now).
//
//   2. GET /api/eventinventory/<EventID>?includeOpens=true&salesChannel=Web
//      Returns the full seat map + SeatAlertValues. We count entries in
//      MapSeats whose alert is "Standing" and aren't already reserved.
//
// Both are authenticated only by the user's Firefox cookies, which are
// refreshed as a side-effect of the hidden-tab self-healing step.

const pickTodayPerformances = (events, todayIso) =>
  events.filter(
    (e) =>
      typeof e?.LocalDate === 'string' &&
      e.LocalDate.startsWith(todayIso) &&
      e?.HasProducts === true &&
      e?.IsBeforeSaleDate !== true,
  );

/**
 * Count available standing tickets in an `eventinventory` response.
 *
 * Approach:
 *   - Walk SeatAlertValues; collect all alertIds whose displayName === 'Standing'.
 *   - Count MapSeats entries where !isReserved AND seatAlertId ∈ standingIds.
 *   - Also add any general-admission standing sections (MapGASections) with
 *     available capacity, in case the venue uses GA rather than per-seat.
 */
const countStandingSeats = (inventory) => {
  const standingIds = new Set();
  const alertMap = inventory?.SeatAlertValues ?? {};
  for (const [id, value] of Object.entries(alertMap)) {
    const name = value?.displayName ?? value?.DisplayName;
    if (typeof name === 'string' && name.toLowerCase() === 'standing') {
      standingIds.add(Number(id));
    }
  }

  let count = 0;
  const mapSeats = Array.isArray(inventory?.MapSeats) ? inventory.MapSeats : [];
  for (const seat of mapSeats) {
    if (seat?.isReserved) continue;
    const alertId = seat?.seatAlertId ?? seat?.SeatAlertId;
    if (alertId !== undefined && alertId !== null && standingIds.has(Number(alertId))) {
      count += 1;
    }
  }

  const gaSections = Array.isArray(inventory?.MapGASections) ? inventory.MapGASections : [];
  for (const section of gaSections) {
    const name = section?.Name ?? section?.name ?? '';
    const available = section?.AvailableCapacity ?? section?.availableCapacity ?? 0;
    if (typeof name === 'string' && /stand/i.test(name) && typeof available === 'number') {
      count += available;
    }
  }

  return count;
};

/**
 * Full scrape for a single Delfont production.
 * Returns a "report" object ready to be POSTed to /report-scrape.
 */
const scrapeDelfontProduction = async (production) => {
  const { id, name, series_code: seriesCode, scraping_url: productionUrl } = production;
  if (!seriesCode) {
    return { productionId: id, status: 'error', reason: 'missing series_code' };
  }

  const today = todayInLondon();

  // 1. List all performances in this month for the series. The widget uses
  //    a lowercase series code in the query; we follow the same convention.
  const monthPath =
    `/api/events/getbymonth?requestedTime=${encodeURIComponent(today.apiMonth)}` +
    `&salesChannel=Web&seriesCode=${encodeURIComponent(seriesCode.toLowerCase())}`;
  let events;
  try {
    events = await fetchDelfontJSONWithHealing(monthPath, {
      referer: productionUrl,
      productionUrl,
    });
  } catch (err) {
    return {
      productionId: id,
      status: 'error',
      reason: err.name === 'ChallengeError' ? 'cloudflare_or_queueit' : 'calendar_fetch_failed',
      detail: { message: err.message, challenge: err.detail ?? null },
    };
  }

  if (!Array.isArray(events)) {
    return {
      productionId: id,
      status: 'error',
      reason: 'calendar_unexpected_shape',
      detail: { receivedType: typeof events },
    };
  }

  const todayEvents = pickTodayPerformances(events, today.iso);
  log(
    `[${name}] month has ${events.length} event(s), ${todayEvents.length} on ${today.iso}`,
  );

  if (todayEvents.length === 0) {
    return {
      productionId: id,
      status: 'unavailable',
      reason: 'no_performances_today',
      performanceCount: 0,
      standCount: 0,
      performances: [],
    };
  }

  // 2. For each performance, fetch the seat-map inventory JSON.
  let totalStanding = 0;
  const performances = [];
  for (const event of todayEvents) {
    const eventId = String(event.ID);
    const urlSafeName = event.UrlSafeName || `${name.toLowerCase().replace(/\s+/g, '-')}-${eventId}`;
    const invPath = `/api/eventinventory/${encodeURIComponent(eventId)}?includeOpens=true&salesChannel=Web`;
    // Referer mirrors what a real browser would send from the event page.
    const referer = `${productionUrl}/${urlSafeName}?startDate=${today.usStyle}`;
    try {
      const inventory = await fetchDelfontJSONWithHealing(invPath, {
        referer,
        productionUrl,
      });
      const standCount = countStandingSeats(inventory);
      totalStanding += standCount;
      performances.push({
        eventId,
        standCount,
        localDate: event.LocalDate,
        availabilityCount: event.AvailabilityCount,
      });
      log(`[${name}] event ${eventId} (${event.LocalDate}): ${standCount} standing ticket(s)`);
    } catch (err) {
      warn(`[${name}] event ${eventId} failed`, err);
      performances.push({ eventId, error: err.message });
    }
  }

  const status = totalStanding > 0 ? 'available' : 'unavailable';
  return {
    productionId: id,
    status,
    standCount: totalStanding,
    performanceCount: todayEvents.length,
    performances,
    reason: status === 'available' ? `found ${totalStanding} standing ticket(s)` : undefined,
  };
};

// --- Supabase calls --------------------------------------------------------

const listActiveProductions = async (settings) => {
  const today = todayInLondon().iso;
  // Directly query PostgREST. `productions` is readable with the anon key
  // (row-level security allows SELECT for anon — same as the public website).
  //
  // The filter replicates the scrape worker's old logic:
  //   adapter != 'none'
  //   AND scrape_disabled_reason IS NULL
  //   AND (start_date IS NULL OR start_date <= today)
  //   AND (end_date IS NULL OR end_date >= today)
  const params = new URLSearchParams({
    select: 'id,slug,name,theatre,scraping_url,series_code,adapter,last_seen_status,start_date,end_date',
    adapter: 'neq.none',
    scrape_disabled_reason: 'is.null',
    order: 'name.asc',
  });
  const url = `${settings.supabaseUrl}/rest/v1/productions?${params.toString()}`;
  const resp = await fetch(url, {
    headers: {
      apikey: settings.supabaseAnonKey,
      Authorization: `Bearer ${settings.supabaseAnonKey}`,
      Accept: 'application/json',
    },
  });
  if (!resp.ok) {
    const text = await resp.text().catch(() => '');
    throw new Error(`Supabase productions query failed: ${resp.status} ${text}`);
  }
  const rows = await resp.json();
  // Final filter in JS for date range (PostgREST filters on date columns are
  // more awkward; doing it here keeps the logic obvious).
  return (rows ?? []).filter((row) => {
    if (row.start_date && row.start_date.slice(0, 10) > today) return false;
    if (row.end_date && row.end_date.slice(0, 10) < today) return false;
    return true;
  });
};

// Snapshot of the scheduler settings that are meaningful server-side (the
// monitor dashboard needs them to decide "is the extension online or just
// paused outside its active window?"). We deliberately do NOT send
// credentials (supabaseAnonKey, scraperSecret) — those stay client-side.
const schedulerSettingsFor = (settings) => ({
  pollMinutes: Number(settings.pollMinutes) || DEFAULTS.pollMinutes,
  activeHoursStart: Number(settings.activeHoursStart) ?? DEFAULTS.activeHoursStart,
  activeHoursEnd: Number(settings.activeHoursEnd) ?? DEFAULTS.activeHoursEnd,
  timezone: 'Europe/London',
});

const postReport = async (settings, body) => {
  const url = `${settings.supabaseUrl}/functions/v1/report-scrape`;
  const resp = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: settings.supabaseAnonKey,
      Authorization: `Bearer ${settings.supabaseAnonKey}`,
      'X-Scraper-Secret': settings.scraperSecret,
    },
    body: JSON.stringify({
      ...body,
      extensionVersion: EXTENSION_VERSION,
      scraperSettings: schedulerSettingsFor(settings),
    }),
  });
  if (!resp.ok) {
    const text = await resp.text().catch(() => '');
    throw new Error(`report-scrape failed: ${resp.status} ${text}`);
  }
  return resp.json().catch(() => ({}));
};

// --- Scheduler -------------------------------------------------------------

const ALARM_NAME = 'yellow-sticker-scrape';
const STUCK_THRESHOLD = 5; // consecutive fully-failed cycles before we email

const isWithinActiveHours = (settings) => {
  const hour = Number(
    new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Europe/London',
      hour: '2-digit',
      hour12: false,
    }).format(new Date()),
  );
  const { activeHoursStart: start, activeHoursEnd: end } = settings;
  if (start <= end) return hour >= start && hour < end;
  // crosses midnight (e.g. 22-6)
  return hour >= start || hour < end;
};

const runOnce = async () => {
  const settings = await getSettings();
  if (!settings.enabled) {
    log('scraper disabled in settings — skipping tick');
    return;
  }
  if (!settings.supabaseUrl || !settings.supabaseAnonKey || !settings.scraperSecret) {
    warn('settings incomplete — visit the options page');
    return;
  }
  if (!isWithinActiveHours(settings)) {
    log('outside active hours — skipping tick');
    return;
  }

  let productions;
  try {
    productions = await listActiveProductions(settings);
  } catch (err) {
    error('failed to list productions', err);
    return;
  }
  log(`scraping ${productions.length} production(s)`);

  const results = [];
  let cycleBlocked = true; // flip to false as soon as any production succeeds

  for (const production of productions) {
    if (production.adapter !== 'delfont') {
      // No other adapters implemented yet.
      continue;
    }
    let report;
    try {
      report = await scrapeDelfontProduction(production);
    } catch (err) {
      error(`scrape threw for ${production.name}`, err);
      report = {
        productionId: production.id,
        status: 'error',
        reason: 'uncaught',
        detail: { message: err.message },
      };
    }
    if (report.status !== 'error') cycleBlocked = false;

    try {
      await postReport(settings, { kind: 'scrape', ...report });
    } catch (err) {
      error(`failed to post report for ${production.name}`, err);
    }
    results.push({ name: production.name, status: report.status, standCount: report.standCount });
  }

  const state = await getState();
  const nextConsecutive = cycleBlocked ? (state.consecutiveFailures ?? 0) + 1 : 0;
  await setState({
    consecutiveFailures: nextConsecutive,
    lastRunAt: new Date().toISOString(),
    lastRunSummary: results,
  });

  if (nextConsecutive >= STUCK_THRESHOLD) {
    log(`cycle blocked ${nextConsecutive} times in a row — reporting stuck`);
    try {
      await postReport(settings, {
        kind: 'stuck',
        reason: `Extension hit Cloudflare / Queue-it ${nextConsecutive} cycles in a row.`,
        detail: { consecutiveFailures: nextConsecutive, productionCount: productions.length },
      });
      await setState({ stuckNotifiedAt: new Date().toISOString() });
    } catch (err) {
      error('failed to post stuck report', err);
    }
  } else if (cycleBlocked) {
    log(`cycle blocked (${nextConsecutive}/${STUCK_THRESHOLD})`);
  } else {
    log('cycle complete', results);
  }
};

// --- Alarm wiring ----------------------------------------------------------

const ensureAlarm = async () => {
  const settings = await getSettings();
  const existing = await browser.alarms.get(ALARM_NAME);
  if (!settings.enabled) {
    if (existing) {
      await browser.alarms.clear(ALARM_NAME);
      log('alarm cleared (scraper disabled)');
    }
    return;
  }
  const period = Math.max(1, Number(settings.pollMinutes) || DEFAULTS.pollMinutes);
  if (existing && existing.periodInMinutes === period) return;
  browser.alarms.create(ALARM_NAME, {
    delayInMinutes: Math.min(1, period),
    periodInMinutes: period,
  });
  log(`alarm set to fire every ${period} minute(s)`);
};

browser.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name !== ALARM_NAME) return;
  runOnce().catch((err) => error('runOnce crashed', err));
});

browser.runtime.onStartup.addListener(async () => {
  log('browser started — booting scraper');
  try {
    const settings = await getSettings();
    if (settings.enabled && settings.supabaseUrl && settings.scraperSecret) {
      await postReport(settings, { kind: 'boot' });
    }
  } catch (err) {
    warn('failed to post boot heartbeat', err);
  }
  await ensureAlarm();
});

browser.runtime.onInstalled.addListener(async (details) => {
  log('extension installed/updated', details.reason);
  await ensureAlarm();
});

// When settings change, recompute the alarm so new polling intervals take
// effect immediately rather than on next browser restart.
browser.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local') return;
  if (changes.enabled || changes.pollMinutes) {
    ensureAlarm().catch((err) => warn('failed to update alarm', err));
  }
});

// Allow the options / popup page to trigger an immediate run for testing.
browser.runtime.onMessage.addListener(async (message) => {
  if (message?.type === 'run-now') {
    await runOnce();
    return { ok: true };
  }
  if (message?.type === 'get-state') {
    return { state: await getState(), settings: await getSettings() };
  }
  return undefined;
});

// Kick the alarm up on initial load (needed when the background page is
// resurrected after being suspended).
ensureAlarm().catch((err) => warn('failed to initialise alarm', err));
