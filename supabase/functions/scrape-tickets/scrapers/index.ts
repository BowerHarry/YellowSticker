// @ts-ignore - Deno npm: specifier works at runtime
import { load } from 'npm:cheerio@1.0.0-rc.12';
import type { ScrapeResult } from '../../_shared/types.ts';
import { adminClient } from '../../_shared/db.ts';

declare const Deno: {
  env: {
    get(name: string): string | undefined;
  };
};

// Performance ID caching (scoped per production and date)
type PerformanceCacheEntry = Record<string, string[]>;
type PerformanceCache = Record<string, PerformanceCacheEntry>;
const performanceCacheKey = '__yellowStickerPerformanceCache__';

const getPerformanceCache = (): PerformanceCache => {
  const globalObj = globalThis as unknown as Record<string, PerformanceCache>;
  if (!globalObj[performanceCacheKey]) {
    globalObj[performanceCacheKey] = {};
  }
  return globalObj[performanceCacheKey];
};

const performanceCache = getPerformanceCache();

const prunePerformanceCache = (currentDate: string) => {
  for (const dateKey of Object.keys(performanceCache)) {
    if (dateKey !== currentDate) {
      delete performanceCache[dateKey];
    }
  }
};

const getCachedPerformanceIds = (currentDate: string, cacheKey: string): string[] | null => {
  prunePerformanceCache(currentDate);
  return performanceCache[currentDate]?.[cacheKey] ?? null;
};

const setCachedPerformanceIds = (currentDate: string, cacheKey: string, ids: string[]) => {
  prunePerformanceCache(currentDate);
  performanceCache[currentDate] = performanceCache[currentDate] ?? {};
  performanceCache[currentDate][cacheKey] = ids;
};

// Check if HTML contains Cloudflare challenge
const isCloudflareChallenge = (html: string): boolean => {
  return html.includes('Just a moment...') || 
         html.includes('cf-challenge') || 
         html.includes('challenge-platform') ||
         /<title[^>]*>Just a moment\.\.\.<\/title>/i.test(html);
};

// Check if HTML is a queue page (Queue-it virtual waiting room)
const isQueuePage = (html: string): boolean => {
  return html.includes('queue-it.net') || 
         html.includes('queueclient') ||
         html.includes('queueconfigloader') ||
         (html.length < 500 && html.includes('queue'));
};

// Supported country codes for ScrapingBee geolocation (ISO 3166-1 format)
// Source: https://www.scrapingbee.com/documentation/country_codes/
const SUPPORTED_COUNTRY_CODES = [
  'af', 'al', 'dz', 'as', 'ad', 'ao', 'ai', 'aq', 'ag', 'ar', 'am', 'aw', 'au', 'at', 'az',
  'bs', 'bh', 'bd', 'bb', 'by', 'be', 'bz', 'bj', 'bm', 'bt', 'bo', 'ba', 'bw', 'bv', 'br',
  'io', 'vg', 'bn', 'bg', 'bf', 'bi', 'kh', 'cm', 'ca', 'cv', 'ky', 'cf', 'td', 'cl', 'cn',
  'cx', 'cc', 'co', 'km', 'cg', 'ck', 'cr', 'hr', 'cu', 'cy', 'cz', 'ci', 'dk', 'dj', 'dm',
  'do', 'tp', 'ec', 'eg', 'sv', 'gq', 'er', 'ee', 'et', 'fk', 'fo', 'fj', 'fi', 'fr', 'gf',
  'pf', 'tf', 'ga', 'gm', 'ge', 'de', 'gh', 'gi', 'gr', 'gl', 'gd', 'gp', 'gu', 'gt', 'gn',
  'gw', 'gy', 'ht', 'hm', 'hn', 'hk', 'hu', 'is', 'in', 'id', 'iq', 'ie', 'ir', 'il', 'it',
  'jm', 'jp', 'jo', 'kz', 'ke', 'ki', 'kp', 'kr', 'kw', 'kg', 'la', 'lv', 'lb', 'ls', 'lr',
  'ly', 'li', 'lt', 'lu', 'mo', 'mg', 'mw', 'my', 'mv', 'ml', 'mt', 'mh', 'mq', 'mr', 'mu',
  'yt', 'mx', 'fm', 'md', 'mc', 'mn', 'ms', 'ma', 'mz', 'mm', 'na', 'nr', 'np', 'nl', 'nc',
  'nz', 'ni', 'ne', 'ng', 'nu', 'nf', 'mp', 'no', 'om', 'pk', 'pw', 'pa', 'pg', 'py', 'pe',
  'ph', 'pn', 'pl', 'pt', 'pr', 'qa', 'ro', 'ru', 'rw', 're', 'lc', 'ws', 'sm', 'st', 'sa',
  'sn', 'sc', 'sl', 'sg', 'sk', 'si', 'sb', 'so', 'za', 'gs', 'es', 'lk', 'sh', 'kn', 'pm',
  'vc', 'sd', 'sr', 'sj', 'sz', 'se', 'ch', 'sy', 'tw', 'tj', 'tz', 'th', 'tg', 'tk', 'to',
  'tt', 'tn', 'tr', 'tm', 'tc', 'tv', 'ug', 'ua', 'ae', 'gb', 'um', 'vi', 'us', 'uy', 'uz',
  'vu', 'va', 've', 'vn', 'wf', 'eh', 'ye', 'zm', 'zw'
];

// Get a random country code for geolocation (UK or US only for now)
// Using only UK and US to avoid queue pages that may be triggered by certain countries
const getRandomCountryCode = (): string => {
  const preferredCountries = ['gb', 'us']; // UK and US only
  const randomIndex = Math.floor(Math.random() * preferredCountries.length);
  return preferredCountries[randomIndex];
};

// Add random jitter to a delay (in seconds)
const addJitter = (baseDelaySeconds: number, jitterPercent: number = 0.2): number => {
  const jitter = baseDelaySeconds * jitterPercent;
  const randomJitter = (Math.random() * 2 - 1) * jitter; // Random between -jitter and +jitter
  return Math.max(0, baseDelaySeconds + randomJitter);
};

// Try different ScrapingBee configurations as fallbacks
const fetchWithScrapingBee = async (
  targetUrl: string,
  countryCode?: string,
  config?: { usePremiumProxy?: boolean; useResidentialProxy?: boolean; wait?: string },
): Promise<string | null> => {
  const apiKey = Deno.env.get('SCRAPINGBEE_API_KEY');
  if (!apiKey) {
    console.warn('SCRAPINGBEE_API_KEY is not set.');
    return null;
  }

  // ScrapingBee handles Cloudflare and JavaScript rendering
  // Try different proxy types: stealth_proxy (best), premium_proxy (fallback), or residential_proxy (if available)
  const wait = config?.wait || Deno.env.get('SCRAPINGBEE_WAIT') || '15000';
  
  // Build URL with different proxy configurations
  let apiUrl = `https://app.scrapingbee.com/api/v1/?api_key=${apiKey}&url=${encodeURIComponent(targetUrl)}&render_js=true&block_ads=true&block_resources=false&wait=${wait}`;
  
  // Try different proxy types
  if (config?.useResidentialProxy) {
    apiUrl += '&residential_proxy=true';
  } else if (config?.usePremiumProxy) {
    apiUrl += '&premium_proxy=true';
  } else {
    // Default to stealth_proxy (best option)
    apiUrl += '&stealth_proxy=true';
  }
  
  if (countryCode) {
    apiUrl += `&country_code=${countryCode}`;
  }

  const proxyType = config?.useResidentialProxy ? 'residential_proxy' : config?.usePremiumProxy ? 'premium_proxy' : 'stealth_proxy';
  const logMessage = countryCode
    ? `[ScrapingBee] Fetching with render_js=true, ${proxyType}=true, block_ads=true, block_resources=false, country_code=${countryCode}, wait=${wait}ms`
    : `[ScrapingBee] Fetching with render_js=true, ${proxyType}=true, block_ads=true, block_resources=false, wait=${wait}ms`;
  console.log(logMessage);

  try {
    const response = await fetch(apiUrl);
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error('ScrapingBee request failed', response.status, errorText);
      if (response.status === 401 || response.status === 403) {
        throw new Error('SCRAPINGBEE_AUTH_ERROR');
      }
      if (response.status === 429) {
        throw new Error('SCRAPINGBEE_RATE_LIMIT');
      }
      if (response.status === 500 || response.status === 502 || response.status === 503) {
        // Check if the error response contains Cloudflare challenge
        if (isCloudflareChallenge(errorText)) {
          throw new Error('SCRAPINGBEE_CLOUDFLARE_BLOCKED');
        }
        throw new Error('SCRAPINGBEE_SERVER_ERROR');
      }
      return null;
    }

    const html = await response.text();
    if (!html || html.length === 0) {
      console.error('ScrapingBee returned empty response');
      return null;
    }

    // Check if the HTML response is a Cloudflare challenge
    if (isCloudflareChallenge(html)) {
      console.warn('ScrapingBee returned Cloudflare challenge page');
      throw new Error('SCRAPINGBEE_CLOUDFLARE_BLOCKED');
    }

    // Check if the HTML response is a queue page (Queue-it)
    if (isQueuePage(html)) {
      console.warn('ScrapingBee returned queue page (Queue-it) - page may need more time to load');
      // Don't throw error - queue pages might resolve with longer wait times
      // But log it so we know it's happening
    }

    console.log('Fetched rendered HTML via ScrapingBee, length:', html.length);
    return html;
  } catch (error) {
    console.error('ScrapingBee request error:', error);
    throw error; // Re-throw to be caught by fetchRenderedHtml for retry logic
  }
};

// Fetch with self-hosted Puppeteer service
const fetchWithSelfHosted = async (
  targetUrl: string,
): Promise<string | null> => {
  const serviceUrl = Deno.env.get('SELF_HOSTED_SCRAPER_URL');
  const apiKey = Deno.env.get('SELF_HOSTED_SCRAPER_API_KEY');
  
  if (!serviceUrl) {
    console.warn('SELF_HOSTED_SCRAPER_URL is not set.');
    return null;
  }
  
  if (!apiKey) {
    console.warn('SELF_HOSTED_SCRAPER_API_KEY is not set.');
    return null;
  }

  const wait = Deno.env.get('SCRAPINGBEE_WAIT') || '15000';
  // Remove trailing slash from serviceUrl to avoid double slashes
  const cleanServiceUrl = serviceUrl.replace(/\/+$/, '');
  const apiUrl = `${cleanServiceUrl}/scrape`;
  
  console.log(`[Self-Hosted] Fetching via ${cleanServiceUrl} with wait=${wait}ms`);
  
  try {
    // Pi scraper can take 20-40 seconds, so use a longer timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 120000); // 2 minutes timeout
    
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        url: targetUrl,
        wait: parseInt(wait, 10),
        timeout: 60000,
      }),
      signal: controller.signal,
    });
    
    clearTimeout(timeoutId);
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error('Self-hosted scraper request failed', response.status, errorText);
      if (response.status === 401 || response.status === 403) {
        throw new Error('SELF_HOSTED_AUTH_ERROR');
      }
      if (response.status === 429) {
        throw new Error('SELF_HOSTED_RATE_LIMIT');
      }
      return null;
    }

    const result = await response.json();
    if (!result.success || !result.html) {
      console.error('Self-hosted scraper returned unsuccessful result:', result);
      return null;
    }

    // Check if the HTML response is a Cloudflare challenge
    // (Pi service returns raw HTML, we do the checking here)
    if (isCloudflareChallenge(result.html)) {
      console.warn('Self-hosted scraper returned Cloudflare challenge page');
      throw new Error('SELF_HOSTED_CLOUDFLARE_BLOCKED');
    }

    console.log(`Fetched raw HTML via self-hosted scraper (Pi), length: ${result.html.length}, elapsed: ${result.elapsed_ms}ms`);
    console.log(`Processing HTML in Supabase Edge Function (cheerio parsing, etc.)`);
    return result.html;
  } catch (error) {
    console.error('Self-hosted scraper request error:', error);
    throw error;
  }
};

// Fetch with ScraperAPI as alternative service
const fetchWithScraperAPI = async (
  targetUrl: string,
): Promise<string | null> => {
  const apiKey = Deno.env.get('SCRAPERAPI_API_KEY');
  if (!apiKey) {
    console.warn('SCRAPERAPI_API_KEY is not set.');
    return null;
  }

  // ScraperAPI handles Cloudflare automatically
  // render=true enables JavaScript rendering
  // premium=true uses premium proxies (better for Cloudflare)
  // country_code=gb sets geolocation
  const apiUrl = `http://api.scraperapi.com/?api_key=${apiKey}&url=${encodeURIComponent(targetUrl)}&render=true&premium=true&country_code=gb`;
  
  console.log('[ScraperAPI] Fetching with render=true, premium=true, country_code=gb');
  
  try {
    const response = await fetch(apiUrl);
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error('ScraperAPI request failed', response.status, errorText);
      if (response.status === 401 || response.status === 403) {
        throw new Error('SCRAPERAPI_AUTH_ERROR');
      }
      if (response.status === 429) {
        throw new Error('SCRAPERAPI_RATE_LIMIT');
      }
      return null;
    }

    const html = await response.text();
    if (!html || html.length === 0) {
      console.error('ScraperAPI returned empty response');
      return null;
    }

    // Check if the HTML response is a Cloudflare challenge
    if (isCloudflareChallenge(html)) {
      console.warn('ScraperAPI returned Cloudflare challenge page');
      throw new Error('SCRAPERAPI_CLOUDFLARE_BLOCKED');
    }

    console.log('Fetched rendered HTML via ScraperAPI, length:', html.length);
    return html;
  } catch (error) {
    console.error('ScraperAPI request error:', error);
    throw error;
  }
};

const fetchRenderedHtml = async (
  targetUrl: string,
  retryCount = 0,
  previousCountryCode?: string,
  triedQueueRetry = false,
  scrapingBeeConfig?: { usePremiumProxy?: boolean; useResidentialProxy?: boolean; wait?: string },
): Promise<string> => {
  const maxRetries = 1; // Retry once for server errors
  
  // ONLY use self-hosted Pi scraper - no fallbacks to ScrapingBee/ScraperAPI
  try {
    const selfHostedResult = await fetchWithSelfHosted(targetUrl);
    if (selfHostedResult) {
      console.log(`Fetched rendered HTML via self-hosted scraper (Pi) for ${targetUrl}`);
      return selfHostedResult;
    }
  } catch (selfHostedError) {
    const errorMessage = (selfHostedError as Error).message;
    console.error('Self-hosted scraper (Pi) failed:', errorMessage);
    
    // Handle rate limit - wait and retry
    if (errorMessage.includes('SELF_HOSTED_RATE_LIMIT') || errorMessage.includes('429')) {
      console.warn('Pi scraper rate limit hit, waiting 60 seconds before retry...');
      const delayWithJitter = addJitter(60, 0.2); // 60 seconds ± 20% jitter
      await new Promise((resolve) => setTimeout(resolve, delayWithJitter * 1000));
      if (retryCount < maxRetries) {
        return fetchRenderedHtml(targetUrl, retryCount + 1, previousCountryCode, triedQueueRetry, scrapingBeeConfig);
      }
    }
    
    // Handle server errors - retry once
    if (errorMessage.includes('SELF_HOSTED_SERVER_ERROR') || errorMessage.includes('ECONNREFUSED') || errorMessage.includes('ETIMEDOUT')) {
      console.warn('Pi scraper server error, retrying...');
      if (retryCount < maxRetries) {
        const delayWithJitter = addJitter(5, 0.3); // 5 seconds ± 30% jitter
        await new Promise((resolve) => setTimeout(resolve, delayWithJitter * 1000));
        return fetchRenderedHtml(targetUrl, retryCount + 1, previousCountryCode, triedQueueRetry, scrapingBeeConfig);
      }
    }
    
    // For all other errors, throw immediately (no fallback to other services)
    throw selfHostedError;
  }
  
  throw new Error('Self-hosted scraper (Pi) returned null - check Pi service configuration');
};

type CalendarStandingScraperConfig = {
  calendarUrl?: string;
  buildPerformanceUrl: (performanceId: string, startDateParam: string) => string;
  seatCircleIdPrefix?: string | string[];
  name?: string;
  cacheKey?: string;
};

// Function to create a scraper with dynamic prefixes (from database)
export const createCalendarStandingScraperWithPrefixes = (
  config: Omit<CalendarStandingScraperConfig, 'seatCircleIdPrefix'>,
  prefixes: string[],
) => {
  return createCalendarStandingScraper({
    ...config,
    seatCircleIdPrefix: prefixes,
  });
};

const extractCircles = (source: string, idPrefix: string) => {
  const regex = new RegExp(`<circle[^>]+id="(${idPrefix}[^"]+)"[^>]*>`, 'gi');
  const results: Array<{ id: string; className: string; rawTag: string }> = [];
  let match: RegExpExecArray | null;
  while ((match = regex.exec(source)) !== null) {
    const id = match[1];
    const fullTag = match[0];
    const classMatch = fullTag.match(/class="([^"]*)"/i);
    const className = (classMatch?.[1] ?? '').trim();
    results.push({ id, className, rawTag: fullTag });
  }
  return results;
};

const extractCirclesMultiplePrefixes = (source: string, idPrefixes: string | string[]) => {
  const prefixes = Array.isArray(idPrefixes) ? idPrefixes : [idPrefixes];
  const allResults: Array<{ id: string; className: string; rawTag: string }> = [];
  const seenIds = new Set<string>();
  
  for (const prefix of prefixes) {
    const circles = extractCircles(source, prefix);
    for (const circle of circles) {
      if (!seenIds.has(circle.id)) {
        seenIds.add(circle.id);
        allResults.push(circle);
      }
    }
  }
  
  return allResults;
};

const extractPerformanceIdFromStrings = (candidates: Array<string | undefined | null>): string | null => {
  for (const candidate of candidates) {
    if (!candidate) continue;
    const trimmed = candidate.trim();
    
    // Direct numeric ID
    if (/^\d+$/.test(trimmed)) {
      return trimmed;
    }
    
    // Pattern: {slug}-{id} (e.g., hamilton-12345, inter-alia-67890)
    // This matches any slug followed by a dash and digits
    const slugIdMatch = trimmed.match(/[a-z0-9-]+-(\d+)/i);
    if (slugIdMatch) {
      return slugIdMatch[1];
    }
    
    // Fallback: any 5+ digit number
    const regexMatch = trimmed.match(/\b(\d{5,})\b/);
    if (regexMatch) {
      return regexMatch[1];
    }
  }
  return null;
};

const normalizeStartDate = (value: string): string | null => {
  const trimmed = value.trim();
  if (!trimmed) return null;

  const ymd = trimmed.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (ymd) {
    const [, year, month, day] = ymd;
    return `${month.padStart(2, '0')}-${day.padStart(2, '0')}-${year}`;
  }

  const mdy = trimmed.match(/^(\d{1,2})-(\d{1,2})-(\d{4})$/);
  if (mdy) {
    const [, month, day, year] = mdy;
    return `${month.padStart(2, '0')}-${day.padStart(2, '0')}-${year}`;
  }

  const slashMdy = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (slashMdy) {
    const [, month, day, year] = slashMdy;
    return `${month.padStart(2, '0')}-${day.padStart(2, '0')}-${year}`;
  }

  return null;
};

const extractStartDateFromStrings = (candidates: Array<string | undefined | null>): string | null => {
  const patterns = [
    /startDate=([0-9/-]+)/i,
    /startDate%3D([0-9-]+)/i,
    /data-start-date="([^"]+)"/i,
    /data-picker-date="([^"]+)"/i,
  ];

  for (const candidate of candidates) {
    if (!candidate) continue;

    const normalizedDirect = normalizeStartDate(candidate);
    if (normalizedDirect) {
      return normalizedDirect;
    }

    for (const pattern of patterns) {
      const match = candidate.match(pattern);
      if (match && match[1]) {
        const normalized = normalizeStartDate(match[1]);
        if (normalized) {
          return normalized;
        }
      }
    }
  }

  return null;
};

export const createCalendarStandingScraper = ({
  calendarUrl,
  buildPerformanceUrl,
  seatCircleIdPrefix = 'GRAND CIRCLE-STAND-',
  name = 'production',
  cacheKey,
}: CalendarStandingScraperConfig) => {
  const prefixes = Array.isArray(seatCircleIdPrefix) ? seatCircleIdPrefix : [seatCircleIdPrefix];
  return async (url: string): Promise<ScrapeResult> => {
    try {
      const calendarPageUrl = calendarUrl ?? url;
      console.log(`Fetching ${name} calendar:`, calendarPageUrl);

      const html = await fetchRenderedHtml(calendarPageUrl);

      const today = new Date();
      const month = today.toLocaleString('en-US', { month: 'long' });
      const day = today.getDate();
      const year = today.getFullYear();
      const monthNumeric = today.getMonth() + 1;
      const startDateParam = `${String(monthNumeric).padStart(2, '0')}-${String(day).padStart(2, '0')}-${year}`;

      const getOrdinal = (n: number) => {
        const s = ['th', 'st', 'nd', 'rd'];
        const v = n % 100;
        return n + (s[(v - 20) % 10] || s[v] || s[0]);
      };

      const todayLabel = `Event Tray for ${month} ${getOrdinal(day)} ${year}`;
      console.log(`Looking for today's event tray:`, todayLabel);

      const $ = load(html);
      
      // Debug: Log HTML length and sample
      console.log(`[${name}] HTML received, length: ${html.length}`);
      
      // Log a sample to see what we're getting
      const htmlSample = html.slice(0, 1000);
      console.log(`[${name}] HTML sample (first 1000 chars):`, htmlSample);
      
      // Check if it looks like a proper HTML document
      const hasHtmlTag = html.includes('<html') || html.includes('<HTML');
      const hasBodyTag = html.includes('<body') || html.includes('<BODY');
      console.log(`[${name}] HTML structure check - has <html>: ${hasHtmlTag}, has <body>: ${hasBodyTag}`);
      
      // Check for Cloudflare challenge page (more specific detection)
      const hasCloudflareTitle = /<title[^>]*>Just a moment\.\.\.<\/title>/i.test(html);
      const hasCloudflareChallenge = html.includes('cf-browser-verification') || 
                                     html.includes('challenge-platform') ||
                                     (html.includes('Just a moment') && html.includes('cf-challenge'));
      
      // Check for actual content - if we have these, it's NOT a challenge page
      const hasActualContent = html.includes('ng-app="nLivenApp"') || 
                               html.includes('nliven-v2') ||
                               html.includes('event-selector-calendar') ||
                               html.includes('calendar-event');
      
      // Only treat as challenge if it has the challenge title/elements AND doesn't have the actual site content
      if ((hasCloudflareTitle || hasCloudflareChallenge) && !hasActualContent) {
        console.error(`[${name}] Cloudflare challenge page detected - scraping API failed to bypass Cloudflare protection`);
        console.log(`[${name}] Challenge check: title=${hasCloudflareTitle}, challenge=${hasCloudflareChallenge}, hasContent=${hasActualContent}`);
        return {
          status: 'unavailable',
          reason: 'Cloudflare protection detected. The scraping API cannot bypass Cloudflare protection.',
        };
      }
      
      // Log if we detected challenge elements but also have content (shouldn't happen, but good to know)
      if ((hasCloudflareTitle || hasCloudflareChallenge) && hasActualContent) {
        console.warn(`[${name}] Challenge elements detected but page also has actual content - treating as valid page`);
      }
      
      // Check if we got a queue page instead of actual content
      if (isQueuePage(html)) {
        console.warn(`[${name}] Received queue page (Queue-it) - content not fully loaded`);
        return {
          status: 'unavailable',
          reason: 'Queue page detected - site is using a virtual waiting room. Content may need more time to load.',
        };
      }
      
      // Check for common calendar-related elements
      const hasCalendarElements = html.includes('calendar') || html.includes('event') || html.includes('tray');
      console.log(`[${name}] Contains calendar/event/tray keywords: ${hasCalendarElements}`);
      
      // Try to find the event tray with exact aria-label match
      let todayTray = $(`[aria-label="${todayLabel}"]`).first();
      
      // If not found, try alternative patterns
      if (!todayTray || todayTray.length === 0) {
        console.log(`[${name}] Exact aria-label match not found, trying alternatives...`);
        
        // Try with different date formats
        const altLabel1 = `Event Tray for ${month} ${day} ${year}`;
        const altLabel2 = `Event Tray for ${month} ${day}, ${year}`;
        const altLabel3 = `Event Tray for ${getOrdinal(day)} ${month} ${year}`;
        
        todayTray = $(`[aria-label="${altLabel1}"]`).first();
        if (todayTray && todayTray.length > 0) {
          console.log(`[${name}] Found with alternative format: ${altLabel1}`);
        } else {
          todayTray = $(`[aria-label="${altLabel2}"]`).first();
          if (todayTray && todayTray.length > 0) {
            console.log(`[${name}] Found with alternative format: ${altLabel2}`);
          } else {
            todayTray = $(`[aria-label="${altLabel3}"]`).first();
            if (todayTray && todayTray.length > 0) {
              console.log(`[${name}] Found with alternative format: ${altLabel3}`);
            }
          }
        }
        
        // Try finding by partial aria-label match
        if (!todayTray || todayTray.length === 0) {
          const allAriaLabels = $('[aria-label]').map((_, el) => $(el).attr('aria-label')).get();
          console.log(`[${name}] All aria-labels found in DOM (first 10):`, allAriaLabels.slice(0, 10));
          
          // Try partial match
          const partialMatch = allAriaLabels.find(label => 
            label && (
              label.includes(`Event Tray`) && 
              (label.includes(month) || label.includes(String(day)) || label.includes(String(year)))
            )
          );
          
          if (partialMatch) {
            console.log(`[${name}] Found partial match:`, partialMatch);
            todayTray = $(`[aria-label="${partialMatch}"]`).first();
          }
        }
      }

      if (!todayTray || todayTray.length === 0) {
        console.log('Could not find today\'s event tray in DOM');
        // Log a sample of the HTML structure for debugging
        const calendarElements = $('[aria-label*="Event"], [aria-label*="event"], [aria-label*="Tray"], [aria-label*="tray"]');
        console.log(`[${name}] Found ${calendarElements.length} elements with event/tray in aria-label`);
        if (calendarElements.length > 0) {
          calendarElements.slice(0, 3).each((_, el) => {
            console.log(`[${name}] Sample aria-label:`, $(el).attr('aria-label'));
          });
        }
        return {
          status: 'unavailable',
          reason: 'Could not locate today\'s performances in calendar DOM',
        };
      }

      const performanceNodes = todayTray.find('calendar-event').toArray();
      const buttonCount = performanceNodes.length;
      console.log(`Found ${buttonCount} performance(s) for today in HTML`);

      if (buttonCount === 0) {
        return {
          status: 'unavailable',
          reason: 'Calendar tray found but no performances were listed for today',
        };
      }

      const todaysCalendarIds = new Set<string>();
      const todaysCalendarUrlMap: Record<string, string> = {};
      const cacheIdentifier = cacheKey ?? calendarPageUrl ?? name;

      for (const [index, node] of performanceNodes.entries()) {
        const eventHtml = $.html(node) ?? '';
        const eventAttrs = (node as { attribs?: Record<string, string> }).attribs ?? {};
        const eventAttributesLog = Object.keys(eventAttrs).reduce<Record<string, string>>((acc, key) => {
          acc[key] = eventAttrs[key];
          return acc;
        }, {});

        const buttonCheerio = $(node).find('button, a').first();
        const buttonHtml = buttonCheerio && buttonCheerio.length > 0 ? $.html(buttonCheerio) ?? '' : '';
        const buttonAttrs = (buttonCheerio?.get?.(0) as { attribs?: Record<string, string> } | undefined)?.attribs ?? {};

        console.log(`[${name}] Performance ${index + 1} attributes:`, {
          event: eventAttributesLog,
          button: buttonAttrs,
        });

        const performanceId = extractPerformanceIdFromStrings([
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

        if (!performanceId) {
          console.warn(
            `[${name}] Unable to extract performance ID for event ${index + 1}. Event HTML snippet:`,
            eventHtml.slice(0, 400),
          );
          continue;
        }

        const cachedIds = getCachedPerformanceIds(startDateParam, cacheIdentifier);
        if (cachedIds && cachedIds.includes(performanceId)) {
          console.log(
            `[${name}] Performance ${performanceId} already in cache for today (${startDateParam}), will use cached URL.`,
          );
          todaysCalendarIds.add(performanceId);
          todaysCalendarUrlMap[performanceId] = buildPerformanceUrl(performanceId, startDateParam);
          continue;
        }

        const eventStartDate = extractStartDateFromStrings([
          eventAttrs['data-start-date'],
          eventAttrs['data-picker-date'],
          eventAttrs['data-date'],
          buttonAttrs['data-start-date'],
          buttonAttrs['data-picker-date'],
          eventHtml,
          buttonHtml,
        ]);

        if (eventStartDate && eventStartDate !== startDateParam) {
          console.log(
            `[${name}] Performance ${index + 1} has startDate ${eventStartDate} (not today ${startDateParam}), skipping detailed scrape.`,
          );
          continue;
        } else if (!eventStartDate) {
          console.log(`[${name}] Performance ${index + 1} has no explicit startDate. Assuming today (${startDateParam}).`);
        }

        todaysCalendarIds.add(performanceId);
        todaysCalendarUrlMap[performanceId] = buildPerformanceUrl(performanceId, startDateParam);
        console.log(`[${name}] Performance ${index + 1} URL:`, todaysCalendarUrlMap[performanceId]);
      }

      let targetIds = getCachedPerformanceIds(startDateParam, cacheIdentifier);
      if (targetIds && targetIds.length > 0) {
        console.log(`[${name}] Using cached performance IDs for today:`, targetIds);
      } else if (todaysCalendarIds.size > 0) {
        targetIds = Array.from(todaysCalendarIds);
        setCachedPerformanceIds(startDateParam, cacheIdentifier, targetIds);
        console.log(`[${name}] Cached new performance IDs for today:`, targetIds);
      }

      if (!targetIds || targetIds.length === 0) {
        console.warn(`[${name}] No performance IDs available for today after caching logic.`);
        return {
          status: 'unavailable',
          reason: 'Could not derive performance IDs for today',
        };
      }

      const performanceUrls = targetIds.map(
        (id) => todaysCalendarUrlMap[id] ?? buildPerformanceUrl(id, startDateParam),
      );

      const scraperRequestsThisRun = 1 + performanceUrls.length;
      try {
        await adminClient.rpc('increment_scraper_usage', { usage_increment: scraperRequestsThisRun });
      } catch (usageError) {
        console.error(`[${name}] Failed to record scraper usage`, usageError);
      }

      let standingTotal = 0;

      for (const performanceUrl of performanceUrls) {
        try {
          const detailHtml = await fetchRenderedHtml(performanceUrl);
          const standingCircles = extractCirclesMultiplePrefixes(detailHtml, prefixes);

          console.log(
            `[${name}] Performance URL ${performanceUrl} -> standing circles detected: ${standingCircles.length} (checking prefixes: ${prefixes.join(', ')})`,
          );

          const availableStanding = standingCircles.filter((circle) => circle.className !== 'na');
          standingTotal += availableStanding.length;

          if (standingCircles.length > 0) {
            console.log(
              `[${name}] Standing circle snapshot: ${standingCircles
                .slice(0, 5)
                .map((circle) => `${circle.id}:${circle.className || '(none)'}`)
                .join(', ')}`,
            );
          }
        } catch (detailError) {
          console.error(`[${name}] Failed to fetch performance detail page`, performanceUrl, detailError);
        }
      }

      if (standingTotal > 0) {
        return {
          status: 'available',
          reason: `Found ${standingTotal} standing ticket(s) across ${performanceUrls.length} performance(s)`,
        };
      }

      return {
        status: 'unavailable',
        reason: `Checked ${performanceUrls.length} performance(s), no standing tickets available. Logged ${standingTotal} available standing circle(s).`,
      };
    } catch (error) {
      console.error(`[${name}] calendar scraper error:`, error);
      const message = (error as Error).message ?? '';
      
      // For authentication errors and rate limits, return unavailable (these are expected issues)
      if (message === 'SCRAPINGBEE_AUTH_ERROR' || message === 'SCRAPINGBEE_RATE_LIMIT') {
        return {
          status: 'unavailable',
          reason: 'ScrapingBee authentication error or rate limit exceeded. Check API key and quota.',
        };
      }
      
      // For server errors, throw the error so it's caught by the main handler and marked as 'unknown' (failure)
      // The retry logic in fetchRenderedHtml already tried, so this is a persistent failure
      if (message === 'SCRAPINGBEE_SERVER_ERROR') {
        throw error; // Re-throw to mark production as failed (unknown status)
      }
      
      // For any other errors, re-throw them
      throw error;
    }
  };
};

const hamiltonScraper = createCalendarStandingScraper({
  name: 'Hamilton',
  calendarUrl: 'https://buytickets.delfontmackintosh.co.uk/tickets/series/vpham',
  buildPerformanceUrl: (performanceId, startDateParam) =>
    `https://buytickets.delfontmackintosh.co.uk/tickets/series/VPHAM/hamilton-${performanceId}?startDate=${startDateParam}`,
  cacheKey: 'hamilton',
});

const lesMisScraper = createCalendarStandingScraper({
  name: 'Les Miserables',
  calendarUrl: 'https://buytickets.delfontmackintosh.co.uk/tickets/series/SONLMSEPT25',
  buildPerformanceUrl: (performanceId, startDateParam) =>
    `https://buytickets.delfontmackintosh.co.uk/tickets/series/SONLMSEPT25/les-miserables-${performanceId}?startDate=${startDateParam}`,
  cacheKey: 'lesmis',
});

const oliverScraper = createCalendarStandingScraper({
  name: 'Oliver!',
  calendarUrl: 'https://buytickets.delfontmackintosh.co.uk/tickets/series/GIEOLI',
  buildPerformanceUrl: (performanceId, startDateParam) =>
    `https://buytickets.delfontmackintosh.co.uk/tickets/series/GIEOLI/oliver-${performanceId}?startDate=${startDateParam}`,
  seatCircleIdPrefix: 'STALLS-STAND-',
  cacheKey: 'oliver',
});

const allMySonsScraper = createCalendarStandingScraper({
  name: 'All My Sons',
  calendarUrl: 'https://buytickets.delfontmackintosh.co.uk/tickets/series/WYNAMS',
  buildPerformanceUrl: (performanceId, startDateParam) =>
    `https://buytickets.delfontmackintosh.co.uk/tickets/series/WYNAMS/all-my-sons-${performanceId}?startDate=${startDateParam}`,
  seatCircleIdPrefix: ['STALLS-STAND-', 'GRAND CIRCLE-STAND-'],
  cacheKey: 'allmysons',
});

const importanceOfBeingEarnestScraper = createCalendarStandingScraper({
  name: 'The Importance of Being Earnest',
  calendarUrl: 'https://buytickets.delfontmackintosh.co.uk/tickets/series/COWIBE',
  buildPerformanceUrl: (performanceId, startDateParam) =>
    `https://buytickets.delfontmackintosh.co.uk/tickets/series/COWIBE/importance-of-being-earnest-${performanceId}?startDate=${startDateParam}`,
  seatCircleIdPrefix: ['GRAND CIRCLE-STAND-', 'STALLS-STAND-'],
  cacheKey: 'importance',
});

const keywordScraper = (keywords: string[]) => async (url: string): Promise<ScrapeResult> => {
  const html = await fetchRenderedHtml(url);
  const normalized = html.toLowerCase();
  const match = keywords.find((keyword) => normalized.includes(keyword));

  return {
    status: match ? 'available' : 'unavailable',
    reason: match ? `found keyword "${match}"` : 'no keywords detected',
  };
};

const defaultScraper = keywordScraper(['standing', 'rush', 'day seats', 'dayseats', 'standing tickets']);

export const scrapers: Record<string, (url: string) => Promise<ScrapeResult>> = {
  'Victoria Palace Theatre': hamiltonScraper,
  'Sondheim Theatre': lesMisScraper,
  'London Palladium': oliverScraper,
  'Wyndham\'s Theatre': allMySonsScraper,
  'Noël Coward Theatre': importanceOfBeingEarnestScraper,
  default: defaultScraper,
};
