import express from 'express';
import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import AnonymizeUAPlugin from 'puppeteer-extra-plugin-anonymize-ua';
import dotenv from 'dotenv';

dotenv.config();

// Add stealth plugin to avoid detection
puppeteer.use(StealthPlugin());
puppeteer.use(AnonymizeUAPlugin());

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;
const API_KEY = process.env.API_KEY || process.env.SCRAPER_API_KEY;

// Simple API key authentication
const authenticate = (req, res, next) => {
  const authHeader = req.headers.authorization;
  const providedKey = authHeader?.replace('Bearer ', '') || req.query.api_key;
  
  if (!API_KEY) {
    console.warn('WARNING: No API_KEY set - allowing all requests (not recommended for production)');
    return next();
  }
  
  if (providedKey !== API_KEY) {
    return res.status(401).json({ error: 'Unauthorized - invalid API key' });
  }
  
  next();
};

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'yellow-sticker-scraper' });
});

// Main scraping endpoint - SIMPLIFIED: Just returns raw HTML, no processing
// All HTML parsing and processing happens in Supabase Edge Functions
app.post('/scrape', authenticate, async (req, res) => {
  const { url, wait = 15000, timeout = 60000 } = req.body;
  
  if (!url) {
    return res.status(400).json({ error: 'Missing required parameter: url' });
  }

  let browser = null;
  const startTime = Date.now();

  try {
    console.log(`[Scraper] Starting scrape for: ${url}`);
    
    // Launch browser with stealth settings optimized for Pi 2B
    // Use system Chromium on ARM (Raspberry Pi) if available
    const executablePath = process.env.PUPPETEER_EXECUTABLE_PATH || undefined;
    
    browser = await puppeteer.launch({
      headless: true,
      executablePath: executablePath, // Use system Chromium on ARM
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage', // Critical for Pi 2B with limited RAM
        '--disable-accelerated-2d-canvas',
        '--no-first-run',
        '--no-zygote', // Saves memory on Pi
        '--disable-gpu',
        '--disable-blink-features=AutomationControlled',
        // Additional args for ARM/Raspberry Pi
        '--disable-software-rasterizer',
        '--disable-extensions',
        '--disable-background-networking', // Save resources
        '--disable-background-timer-throttling',
        '--disable-renderer-backgrounding',
        '--disable-backgrounding-occluded-windows',
        '--disable-features=TranslateUI',
        '--disable-ipc-flooding-protection',
        '--memory-pressure-off', // Important for Pi 2B
      ],
    });

    const page = await browser.newPage();
    
    // Set realistic viewport (common desktop resolution)
    await page.setViewport({ width: 1920, height: 1080 });
    
    // Override navigator properties to look more like a real browser
    await page.evaluateOnNewDocument(() => {
      // Remove webdriver property
      Object.defineProperty(navigator, 'webdriver', {
        get: () => false,
      });
      
      // Override plugins to look like a real browser
      Object.defineProperty(navigator, 'plugins', {
        get: () => [1, 2, 3, 4, 5],
      });
      
      // Override languages
      Object.defineProperty(navigator, 'languages', {
        get: () => ['en-GB', 'en', 'en-US'],
      });
      
      // Add chrome object (Chrome-specific)
      window.chrome = {
        runtime: {},
      };
      
      // Override permissions
      const originalQuery = window.navigator.permissions.query;
      window.navigator.permissions.query = (parameters) => (
        parameters.name === 'notifications' ?
          Promise.resolve({ state: Notification.permission }) :
          originalQuery(parameters)
      );
    });

    // Set user agent (use a more recent Chrome version)
    await page.setUserAgent(
      'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'
    );

    // Set extra headers to look more like a real browser
    await page.setExtraHTTPHeaders({
      'Accept-Language': 'en-GB,en;q=0.9,en-US;q=0.8',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
      'Accept-Encoding': 'gzip, deflate, br, zstd',
      'Connection': 'keep-alive',
      'Upgrade-Insecure-Requests': '1',
      'Sec-Fetch-Dest': 'document',
      'Sec-Fetch-Mode': 'navigate',
      'Sec-Fetch-Site': 'none',
      'Sec-Fetch-User': '?1',
      'Cache-Control': 'max-age=0',
    });

    // Navigate to the page with realistic behavior
    console.log(`[Scraper] Navigating to: ${url}`);
    
    // First, visit a simple page to establish a "session" (like a real browser would)
    try {
      await page.goto('https://www.google.com', { waitUntil: 'domcontentloaded', timeout: 10000 });
      await page.waitForTimeout(1000 + Math.random() * 2000); // Random delay 1-3 seconds
    } catch (e) {
      // Ignore if Google is blocked, continue anyway
      console.log('[Scraper] Could not establish session, continuing...');
    }
    
    // Now navigate to the target URL
    await page.goto(url, {
      waitUntil: 'networkidle2',
      timeout: timeout,
    });

    // Simulate human-like behavior: mouse movements and scrolling
    await page.mouse.move(Math.random() * 100, Math.random() * 100);
    await page.evaluate(() => {
      window.scrollTo(0, Math.random() * 500);
    });
    await page.waitForTimeout(500 + Math.random() * 1000);

    // Wait for JavaScript to execute (helps with Cloudflare challenges)
    if (wait > 0) {
      console.log(`[Scraper] Waiting ${wait}ms for JavaScript execution...`);
      await page.waitForTimeout(wait);
    }
    
    // Additional wait if Cloudflare challenge might be present
    // Check for common Cloudflare indicators and wait longer if needed
    const pageContent = await page.content();
    if (pageContent.includes('Just a moment') || pageContent.includes('cf-challenge')) {
      console.log('[Scraper] Cloudflare challenge detected, waiting longer...');
      await page.waitForTimeout(10000); // Wait 10 more seconds
      // Scroll and interact to help pass challenge
      await page.evaluate(() => {
        window.scrollTo(0, document.body.scrollHeight);
      });
      await page.waitForTimeout(5000);
    }

    // Get the raw HTML - no processing, just return it
    // Supabase Edge Functions will do all the parsing and processing
    const html = await page.content();
    const elapsed = Date.now() - startTime;

    console.log(`[Scraper] Successfully fetched HTML for ${url} in ${elapsed}ms (${html.length} bytes)`);
    console.log(`[Scraper] Returning raw HTML - processing will happen in Supabase`);

    // Return raw HTML only - Supabase does all the heavy lifting
    res.json({
      success: true,
      html: html, // Raw HTML - no processing
      url: url,
      elapsed_ms: elapsed,
      size_bytes: html.length,
    });

  } catch (error) {
    const elapsed = Date.now() - startTime;
    console.error(`[Scraper] Error fetching ${url} after ${elapsed}ms:`, error.message);
    
    // Check if it's a Cloudflare challenge
    if (error.message.includes('CLOUDFLARE_BLOCKED') || error.message.includes('net::ERR')) {
      res.status(500).json({
        success: false,
        error: 'CLOUDFLARE_BLOCKED',
        url: url,
        elapsed_ms: elapsed,
      });
    } else {
      res.status(500).json({
        success: false,
        error: error.message,
        url: url,
        elapsed_ms: elapsed,
      });
    }
  } finally {
    if (browser) {
      await browser.close();
    }
  }
});

// Note: Cloudflare challenge detection removed - Supabase will handle this
// Pi service just returns raw HTML, no processing

// Start server
app.listen(PORT, '0.0.0.0', () => {
  console.log(`[Scraper] Server running on port ${PORT}`);
  console.log(`[Scraper] API key required: ${API_KEY ? 'Yes' : 'No (WARNING: Not secure!)'}`);
});

