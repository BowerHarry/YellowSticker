import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import AnonymizeUAPlugin from 'puppeteer-extra-plugin-anonymize-ua';
import { createLogger } from './logger.js';

puppeteer.use(StealthPlugin());
puppeteer.use(AnonymizeUAPlugin());

const log = createLogger('browser');

// Persistent profile location. Mounted as a Docker volume so cookies
// (including Cloudflare's `cf_clearance`) survive container restarts.
// Once we pass a Cloudflare challenge for a domain, that clearance cookie
// is usually good for ~30 min – a few hours, which skips the challenge on
// subsequent runs entirely.
const USER_DATA_DIR = process.env.CHROME_USER_DATA_DIR || '/app/.chrome-profile';

export const launchBrowser = async () => {
  log.info(`Launching Chromium (userDataDir=${USER_DATA_DIR})`);
  const browser = await puppeteer.launch({
    headless: 'new',
    userDataDir: USER_DATA_DIR,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-accelerated-2d-canvas',
      '--no-first-run',
      '--disable-gpu',
      '--disable-blink-features=AutomationControlled',
      '--disable-infobars',
      '--window-size=1920,1080',
      '--disable-extensions',
    ],
    ignoreHTTPSErrors: true,
  });
  return browser;
};

// Inject common anti-detection overrides before any page script runs.
const installStealthOverrides = async (page) => {
  await page.evaluateOnNewDocument(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
    Object.defineProperty(navigator, 'plugins', { get: () => [1, 2, 3, 4, 5] });
    Object.defineProperty(navigator, 'languages', { get: () => ['en-GB', 'en', 'en-US'] });
    Object.defineProperty(navigator, 'hardwareConcurrency', { get: () => 4 });
    Object.defineProperty(navigator, 'deviceMemory', { get: () => 8 });
    Object.defineProperty(navigator, 'platform', { get: () => 'MacIntel' });
    window.chrome = { runtime: {}, loadTimes: () => {}, csi: () => {}, app: {} };
    const originalQuery = window.navigator.permissions?.query;
    if (originalQuery) {
      window.navigator.permissions.query = (parameters) =>
        parameters.name === 'notifications'
          ? Promise.resolve({ state: Notification.permission })
          : originalQuery(parameters);
    }
  });
};

export const newStealthPage = async (browser) => {
  const page = await browser.newPage();
  await page.setViewport({ width: 1920, height: 1080 });
  await installStealthOverrides(page);
  // Keep the Chrome version reasonably current: Cloudflare correlates UA
  // Chrome major version with the fingerprint of the actual binary. Stale
  // major versions raise the bot-suspicion score.
  await page.setUserAgent(
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36',
  );
  // NOTE: we deliberately don't set Sec-Fetch-Site here — Chrome infers it
  // per-navigation based on whether a Referer is present (same-origin vs
  // none), and overriding it to a fixed value like 'none' across all
  // navigations is a known bot fingerprint.
  await page.setExtraHTTPHeaders({
    'Accept-Language': 'en-GB,en;q=0.9,en-US;q=0.8',
    Accept:
      'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
    'Accept-Encoding': 'gzip, deflate, br, zstd',
    'Upgrade-Insecure-Requests': '1',
  });
  return page;
};
