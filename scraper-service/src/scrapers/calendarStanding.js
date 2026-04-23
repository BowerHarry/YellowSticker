import { load } from 'cheerio';
import { fetchRendered } from '../fetchRendered.js';
import { createLogger } from '../logger.js';

/**
 * Calendar-based standing-ticket scraper for Delfont Mackintosh venues
 * (and any site using the same nLiven ticketing widget).
 *
 * Flow per run:
 *   1. Fetch the calendar/series landing page.
 *   2. Find today's "Event Tray" (performances for today).
 *   3. For each performance, fetch the detailed seating page.
 *   4. Count <circle> elements whose id starts with one of the
 *      standing-ticket prefixes (e.g. "GRAND CIRCLE-STAND-") and
 *      whose class is not "na" (which marks unavailable seats).
 *
 * Performance IDs are cached per day to avoid repeating the calendar
 * discovery step on every run.
 */

// Per-process cache, scoped per day + scraper.
const cache = new Map(); // key: `${dayKey}::${cacheKey}` -> string[] (performance IDs)
let cachedDay = null;

const setCache = (dayKey, cacheKey, ids) => {
  if (cachedDay !== dayKey) {
    cache.clear();
    cachedDay = dayKey;
  }
  cache.set(`${dayKey}::${cacheKey}`, ids);
};

const getCache = (dayKey, cacheKey) => {
  if (cachedDay !== dayKey) {
    cache.clear();
    cachedDay = dayKey;
    return null;
  }
  return cache.get(`${dayKey}::${cacheKey}`) ?? null;
};

const getOrdinal = (n) => {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
};

const extractPerformanceId = (candidates) => {
  for (const candidate of candidates) {
    if (!candidate) continue;
    const trimmed = String(candidate).trim();
    if (/^\d+$/.test(trimmed)) return trimmed;
    const slugIdMatch = trimmed.match(/[a-z0-9-]+-(\d+)/i);
    if (slugIdMatch) return slugIdMatch[1];
    const fallback = trimmed.match(/\b(\d{5,})\b/);
    if (fallback) return fallback[1];
  }
  return null;
};

const normalizeDate = (value) => {
  if (!value) return null;
  const trimmed = String(value).trim();
  if (!trimmed) return null;

  const ymd = trimmed.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (ymd) return `${ymd[2].padStart(2, '0')}-${ymd[3].padStart(2, '0')}-${ymd[1]}`;
  const mdy = trimmed.match(/^(\d{1,2})-(\d{1,2})-(\d{4})$/);
  if (mdy) return `${mdy[1].padStart(2, '0')}-${mdy[2].padStart(2, '0')}-${mdy[3]}`;
  const slashMdy = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (slashMdy) return `${slashMdy[1].padStart(2, '0')}-${slashMdy[2].padStart(2, '0')}-${slashMdy[3]}`;
  return null;
};

const extractStartDate = (candidates) => {
  const patterns = [
    /startDate=([0-9/-]+)/i,
    /startDate%3D([0-9-]+)/i,
    /data-start-date="([^"]+)"/i,
    /data-picker-date="([^"]+)"/i,
  ];
  for (const candidate of candidates) {
    if (!candidate) continue;
    const direct = normalizeDate(candidate);
    if (direct) return direct;
    for (const pattern of patterns) {
      const match = String(candidate).match(pattern);
      if (match?.[1]) {
        const normalized = normalizeDate(match[1]);
        if (normalized) return normalized;
      }
    }
  }
  return null;
};

const extractStandingCircles = (html, prefixes) => {
  const results = [];
  const seen = new Set();
  for (const prefix of prefixes) {
    const regex = new RegExp(`<circle[^>]+id="(${prefix}[^"]+)"[^>]*>`, 'gi');
    let match;
    while ((match = regex.exec(html)) !== null) {
      const id = match[1];
      if (seen.has(id)) continue;
      seen.add(id);
      const classMatch = match[0].match(/class="([^"]*)"/i);
      const className = (classMatch?.[1] ?? '').trim();
      results.push({ id, className });
    }
  }
  return results;
};

/**
 * Returns today's date parts in the given IANA timezone (e.g. "Europe/London").
 * Produces the "MM-DD-YYYY" startDate param plus the aria-label pieces.
 */
const todayInTZ = (timezone) => {
  const now = new Date();
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  const year = parts.find((p) => p.type === 'year').value;
  const month = parts.find((p) => p.type === 'month').value;
  const day = parts.find((p) => p.type === 'day').value;

  const monthLong = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    month: 'long',
  }).format(now);

  return {
    year: Number(year),
    month: Number(month),
    day: Number(day),
    monthLong,
    startDateParam: `${month}-${day}-${year}`,
  };
};

/**
 * Build a calendar-standing scraper function.
 *
 * @param {object} options
 * @param {string} options.name              Human label used in logs.
 * @param {string} options.calendarUrl       URL of the series/calendar page.
 * @param {(performanceId: string, startDateParam: string) => string} options.buildPerformanceUrl
 * @param {string[]} options.seatPrefixes    ID prefixes that identify standing-seat <circle>s.
 * @param {string} options.cacheKey          Stable key for the per-day performance-ID cache.
 * @param {string} options.timezone          IANA TZ for "today".
 * @returns {(browser, url) => Promise<ScrapeResult>}
 */
export const createCalendarStandingScraper = ({
  name,
  calendarUrl,
  buildPerformanceUrl,
  seatPrefixes,
  cacheKey,
  timezone,
}) => {
  const log = createLogger(`scraper:${name}`);
  const prefixes = Array.isArray(seatPrefixes) ? seatPrefixes : [seatPrefixes];
  const cacheId = cacheKey ?? calendarUrl ?? name;

  return async (browser) => {
    const { year, day, monthLong, startDateParam } = todayInTZ(timezone);
    const todayLabel = `Event Tray for ${monthLong} ${getOrdinal(day)} ${year}`;

    log.info(`Fetching calendar ${calendarUrl}`);
    const calendarHtml = await fetchRendered(browser, calendarUrl);
    const $ = load(calendarHtml);

    // Try exact aria-label match first, then common variants.
    let tray = $(`[aria-label="${todayLabel}"]`).first();
    if (!tray.length) {
      const alternatives = [
        `Event Tray for ${monthLong} ${day} ${year}`,
        `Event Tray for ${monthLong} ${day}, ${year}`,
        `Event Tray for ${getOrdinal(day)} ${monthLong} ${year}`,
      ];
      for (const alt of alternatives) {
        tray = $(`[aria-label="${alt}"]`).first();
        if (tray.length) {
          log.debug(`Matched alternative label "${alt}"`);
          break;
        }
      }
    }

    if (!tray.length) {
      log.warn('Today\'s event tray not found in calendar DOM');
      return { status: 'unavailable', reason: 'Could not locate today\'s performances in calendar DOM' };
    }

    const performanceNodes = tray.find('calendar-event').toArray();
    if (performanceNodes.length === 0) {
      return {
        status: 'unavailable',
        reason: 'Calendar tray found but no performances were listed for today',
      };
    }

    const discoveredIds = new Set();
    for (const node of performanceNodes) {
      const eventHtml = $.html(node) ?? '';
      const eventAttrs = node.attribs ?? {};
      const buttonNode = $(node).find('button, a').first();
      const buttonAttrs = buttonNode.get(0)?.attribs ?? {};
      const buttonHtml = buttonNode.length ? $.html(buttonNode) ?? '' : '';

      const id = extractPerformanceId([
        eventAttrs['data-performance-id'],
        eventAttrs['data-event-id'],
        eventAttrs['data-performance'],
        eventAttrs['data-session-id'],
        eventAttrs['data-id'],
        buttonAttrs['data-performance-id'],
        buttonAttrs['data-event-id'],
        buttonAttrs['data-session-id'],
        buttonAttrs['data-id'],
        eventHtml,
        buttonHtml,
      ]);

      if (!id) continue;

      // Skip performances clearly marked for another day.
      const dateHint = extractStartDate([
        eventAttrs['data-start-date'],
        eventAttrs['data-picker-date'],
        eventAttrs['data-date'],
        buttonAttrs['data-start-date'],
        buttonAttrs['data-picker-date'],
        eventHtml,
        buttonHtml,
      ]);
      if (dateHint && dateHint !== startDateParam) {
        log.debug(`Skipping performance ${id} (date=${dateHint} != today ${startDateParam})`);
        continue;
      }

      discoveredIds.add(id);
    }

    const cachedIds = getCache(startDateParam, cacheId);
    const targetIds = cachedIds?.length ? cachedIds : Array.from(discoveredIds);
    if (targetIds.length && !cachedIds?.length) {
      setCache(startDateParam, cacheId, targetIds);
    }

    if (!targetIds.length) {
      return {
        status: 'unavailable',
        reason: 'Could not derive performance IDs for today',
      };
    }

    log.info(`Today's performance IDs: ${targetIds.join(', ')}`);

    let standingTotal = 0;
    for (const id of targetIds) {
      const perfUrl = buildPerformanceUrl(id, startDateParam);
      try {
        // Send the calendar URL as the Referer — a real user reached the
        // performance page by clicking from the calendar, so a direct hit
        // with no referer raises bot-suspicion on Cloudflare.
        const perfHtml = await fetchRendered(browser, perfUrl, { referer: calendarUrl });
        const circles = extractStandingCircles(perfHtml, prefixes);
        const available = circles.filter((c) => c.className !== 'na');
        log.info(
          `Performance ${id}: ${circles.length} standing circle(s), ${available.length} available`,
        );
        standingTotal += available.length;
      } catch (error) {
        log.error(`Performance ${id} failed`, error.message || String(error));
      }
    }

    if (standingTotal > 0) {
      return {
        status: 'available',
        reason: `Found ${standingTotal} standing ticket(s) across ${targetIds.length} performance(s)`,
        standCount: standingTotal,
      };
    }

    return {
      status: 'unavailable',
      reason: `Checked ${targetIds.length} performance(s); no standing tickets available`,
    };
  };
};

/**
 * Simple fallback: pull HTML and look for keywords.
 * Used when we don't have structured scraping logic for a theatre.
 */
export const createKeywordScraper = (keywords) => async (browser, url) => {
  const html = await fetchRendered(browser, url);
  const lower = html.toLowerCase();
  const match = keywords.find((keyword) => lower.includes(keyword));
  return {
    status: match ? 'available' : 'unavailable',
    reason: match ? `found keyword "${match}"` : 'no keywords detected',
  };
};
