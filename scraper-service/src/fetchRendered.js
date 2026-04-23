import { newStealthPage } from './browser.js';
import { createLogger } from './logger.js';
import { config } from './config.js';

const log = createLogger('fetch');

const CLOUDFLARE_INDICATORS = [
  'Just a moment',
  'cf-challenge',
  'Checking your browser',
  'DDoS protection by Cloudflare',
  'cf-browser-verification',
  'cf_clearance',
];

const looksLikeCloudflareChallenge = (html) =>
  CLOUDFLARE_INDICATORS.some((indicator) => html.includes(indicator));

const looksLikeQueuePage = (html) =>
  html.includes('queue-it.net') ||
  html.includes('queueclient') ||
  html.includes('queueconfigloader') ||
  (html.length < 500 && html.toLowerCase().includes('queue'));

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// How long (total, seconds) to keep polling while Cloudflare's interstitial
// is visible before giving up. Split into 5-second intervals.
const CF_MAX_WAIT_SECONDS = 90;

/**
 * Navigates a fresh page to `url` and returns the rendered HTML.
 * Handles Cloudflare interstitials by waiting and retrying in-browser.
 *
 * @param {import('puppeteer').Browser} browser
 * @param {string} url
 * @param {object} [options]
 * @param {number} [options.waitMs]    JS settle time after DOM-content-loaded.
 * @param {string} [options.referer]   Sent as `Referer` header. Pass the page
 *                                     the user "came from" (usually the
 *                                     calendar URL) to avoid looking like a
 *                                     direct deep-link hit.
 *
 * Throws:
 *   - Error('CLOUDFLARE_BLOCKED') if the interstitial never clears.
 *   - Any underlying Puppeteer navigation error.
 */
export const fetchRendered = async (browser, url, { waitMs = config.scrape.waitMs, referer } = {}) => {
  const page = await newStealthPage(browser);
  const start = Date.now();
  try {
    log.info(`GET ${url} (wait=${waitMs}ms${referer ? `, referer=${referer}` : ''})`);

    const gotoOptions = { waitUntil: 'domcontentloaded', timeout: 120000 };
    if (referer) gotoOptions.referer = referer;
    await page.goto(url, gotoOptions);

    // Short initial settle before we decide whether we're on a challenge page.
    await sleep(1500 + Math.random() * 1500);

    let html = await page.content();

    // Only simulate human activity if we landed on actual content. Scrolling
    // on a Cloudflare challenge page can interfere with the challenge script
    // and has been observed to make things worse.
    if (!looksLikeCloudflareChallenge(html)) {
      await page.mouse.move(100 + Math.random() * 300, 100 + Math.random() * 300);
      for (let i = 0; i < 3; i++) {
        await page.evaluate(() => window.scrollBy(0, 200 + Math.random() * 300));
        await sleep(400 + Math.random() * 600);
      }
      if (waitMs > 0) await sleep(waitMs);
    } else {
      // We're on a challenge page — do nothing, let CF's JS run.
      log.warn('Cloudflare interstitial detected on initial load; waiting quietly');
    }

    // Poll until the challenge clears (or we give up).
    html = await page.content();
    if (looksLikeCloudflareChallenge(html)) {
      const intervals = Math.ceil(CF_MAX_WAIT_SECONDS / 5);
      for (let i = 0; i < intervals; i++) {
        await sleep(5000);
        html = await page.content();
        if (!looksLikeCloudflareChallenge(html)) {
          log.info(`Cloudflare cleared after ~${(i + 1) * 5}s`);
          // Give the post-challenge redirect a moment to finish.
          await sleep(2000);
          html = await page.content();
          break;
        }
      }
    }

    if (looksLikeCloudflareChallenge(html)) {
      throw new Error('CLOUDFLARE_BLOCKED');
    }
    if (looksLikeQueuePage(html)) {
      // Not fatal — caller may still choose to mark unavailable.
      log.warn('Queue-it page detected; returning HTML for caller to decide');
    }

    const elapsed = Date.now() - start;
    log.info(`OK ${url} (${html.length} bytes, ${elapsed}ms)`);
    return html;
  } finally {
    await page.close().catch(() => {});
  }
};
