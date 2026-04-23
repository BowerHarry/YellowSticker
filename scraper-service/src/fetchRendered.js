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

/**
 * Navigates a fresh page to `url` and returns the rendered HTML.
 * Handles Cloudflare interstitials by waiting and retrying in-browser.
 *
 * Throws:
 *   - Error('CLOUDFLARE_BLOCKED') if the interstitial never clears.
 *   - Error('QUEUE_PAGE') if the page is stuck behind a Queue-it waiting room.
 *   - Any underlying Puppeteer navigation error.
 */
export const fetchRendered = async (browser, url, { waitMs = config.scrape.waitMs } = {}) => {
  const page = await newStealthPage(browser);
  const start = Date.now();
  try {
    log.info(`GET ${url} (wait=${waitMs}ms)`);
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 120000 });

    // Give JS a moment before we start interacting / inspecting.
    await sleep(2000 + Math.random() * 2000);

    // Light human-ish interaction to help clear challenges.
    await page.mouse.move(100 + Math.random() * 300, 100 + Math.random() * 300);
    for (let i = 0; i < 3; i++) {
      await page.evaluate(() => window.scrollBy(0, 200 + Math.random() * 300));
      await sleep(400 + Math.random() * 600);
    }

    if (waitMs > 0) await sleep(waitMs);

    // If we landed on a Cloudflare interstitial, keep waiting (up to ~30s).
    let html = await page.content();
    if (looksLikeCloudflareChallenge(html)) {
      log.warn('Cloudflare interstitial detected; waiting for it to clear');
      for (let i = 0; i < 6; i++) {
        await sleep(5000);
        await page.mouse.move(100 + Math.random() * 400, 100 + Math.random() * 400);
        html = await page.content();
        if (!looksLikeCloudflareChallenge(html)) {
          log.info(`Cloudflare cleared after ~${(i + 1) * 5}s`);
          break;
        }
      }
    }

    html = await page.content();
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
