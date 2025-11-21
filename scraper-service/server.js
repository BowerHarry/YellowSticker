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
  const { url, wait = 15000, timeout = 120000 } = req.body; // Increased default timeout to 120s for Cloudflare
  
  if (!url) {
    return res.status(400).json({ error: 'Missing required parameter: url' });
  }

  let browser = null;
  const startTime = Date.now();

  try {
    console.log(`[Scraper] Starting scrape for: ${url}`);
    
    // Enhanced Undetected Chrome configuration for VPS
    // Use 'new' headless mode which is harder to detect than old headless
    // Puppeteer will use its downloaded Chrome automatically (no executablePath needed)
    
    browser = await puppeteer.launch({
      headless: 'new', // New headless mode (harder to detect)
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage', // Prevents /dev/shm issues
        '--disable-accelerated-2d-canvas',
        '--no-first-run',
        '--disable-gpu',
        '--disable-blink-features=AutomationControlled',
        // Enhanced stealth args
        '--disable-features=IsolateOrigins,site-per-process',
        '--disable-web-security',
        '--disable-features=VizDisplayCompositor',
        // Remove automation indicators
        '--disable-infobars',
        '--window-size=1920,1080',
        '--disable-extensions',
      ],
      ignoreHTTPSErrors: true,
    });

    const page = await browser.newPage();
    
    // Set realistic viewport (common desktop resolution)
    await page.setViewport({ width: 1920, height: 1080 });
    
    // Enhanced Undetected Chrome: Override navigator properties to look more like a real browser
    await page.evaluateOnNewDocument(() => {
      // Remove webdriver property completely (not just set to false)
      Object.defineProperty(navigator, 'webdriver', {
        get: () => undefined,
      });
      
      // Override plugins to look like a real browser
      Object.defineProperty(navigator, 'plugins', {
        get: () => [1, 2, 3, 4, 5],
      });
      
      // Override languages
      Object.defineProperty(navigator, 'languages', {
        get: () => ['en-GB', 'en', 'en-US'],
      });
      
      // Enhanced Chrome object (more complete)
      window.chrome = {
        runtime: {},
        loadTimes: function() {},
        csi: function() {},
        app: {}
      };
      
      // Override permissions
      const originalQuery = window.navigator.permissions.query;
      window.navigator.permissions.query = (parameters) => (
        parameters.name === 'notifications' ?
          Promise.resolve({ state: Notification.permission }) :
          originalQuery(parameters)
      );
      
      // Override platform
      Object.defineProperty(navigator, 'platform', {
        get: () => 'Linux x86_64',
      });
      
      // Override hardwareConcurrency (make it realistic)
      Object.defineProperty(navigator, 'hardwareConcurrency', {
        get: () => 4,
      });
      
      // Override deviceMemory
      Object.defineProperty(navigator, 'deviceMemory', {
        get: () => 8,
      });
    });

    // Set realistic user agent (matching Chrome 131)
    await page.setUserAgent(
      'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'
    );
    
    // Set additional browser properties
    await page.evaluateOnNewDocument(() => {
      // Override getBattery to return realistic values
      if (navigator.getBattery) {
        navigator.getBattery = () => Promise.resolve({
          charging: true,
          chargingTime: 0,
          dischargingTime: Infinity,
          level: 0.8,
        });
      }
    });

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
      await page.goto('https://www.google.com', { waitUntil: 'domcontentloaded', timeout: 15000 });
      await page.waitForTimeout(2000 + Math.random() * 2000); // 2-4 seconds
      
      // Simulate interaction on Google
      await page.mouse.move(100 + Math.random() * 200, 100 + Math.random() * 200);
      await page.waitForTimeout(500 + Math.random() * 1000);
    } catch (e) {
      // Ignore if Google is blocked, continue anyway
      console.log('[Scraper] Could not establish session, continuing...');
    }
    
    // Now navigate to the target URL with more lenient timeout
    // Use 'domcontentloaded' first, then wait for networkidle
    let navigationSuccess = false;
    let retries = 0;
    const maxRetries = 2;
    
    while (!navigationSuccess && retries < maxRetries) {
      try {
        await page.goto(url, {
          waitUntil: 'domcontentloaded',
          timeout: timeout,
        });
        navigationSuccess = true;
      } catch (error) {
        if (error.message.includes('Navigation timeout') && retries < maxRetries - 1) {
          console.log(`[Scraper] Navigation timeout, retrying (${retries + 1}/${maxRetries})...`);
          retries++;
          await page.waitForTimeout(5000);
          continue;
        }
        throw error;
      }
    }

    // Wait a bit for initial page load
    await page.waitForTimeout(2000 + Math.random() * 2000);

    // Simulate human-like behavior
    await page.mouse.move(50 + Math.random() * 200, 50 + Math.random() * 200);
    await page.waitForTimeout(300 + Math.random() * 700);
    
    // Scroll down gradually (like a human would)
    const scrollSteps = 3 + Math.floor(Math.random() * 3); // 3-6 steps
    for (let i = 0; i < scrollSteps; i++) {
      await page.evaluate(() => {
        window.scrollBy(0, 200 + Math.random() * 300);
      });
      await page.waitForTimeout(500 + Math.random() * 1000);
    }
    
    // Wait for network to settle
    await page.waitForTimeout(3000);

    // Wait for JavaScript to execute (helps with Cloudflare challenges)
    if (wait > 0) {
      console.log(`[Scraper] Waiting ${wait}ms for JavaScript execution...`);
      await page.waitForTimeout(wait);
    }
    
    // Check for Cloudflare challenge and wait longer if needed
    let pageContent = await page.content();
    let cloudflareDetected = false;
    
    // Check for Cloudflare indicators
    const cloudflareIndicators = [
      'Just a moment',
      'cf-challenge',
      'Checking your browser',
      'DDoS protection by Cloudflare',
      'cf-browser-verification',
      'cf_clearance',
    ];
    
    for (const indicator of cloudflareIndicators) {
      if (pageContent.includes(indicator)) {
        cloudflareDetected = true;
        break;
      }
    }
    
    if (cloudflareDetected) {
      console.log('[Scraper] Cloudflare challenge detected, waiting up to 30 seconds...');
      
      // Wait longer and check multiple times (VPS is faster, can handle more checks)
      for (let i = 0; i < 6; i++) { // 6 checks = 30 seconds
        await page.waitForTimeout(5000); // Wait 5 seconds
        
        // Interact to help pass challenge
        await page.mouse.move(100 + Math.random() * 300, 100 + Math.random() * 300);
        await page.evaluate(() => {
          window.scrollTo(0, Math.random() * document.body.scrollHeight);
        });
        
        // Re-check if challenge is still present
        pageContent = await page.content();
        let stillBlocked = false;
        for (const indicator of cloudflareIndicators) {
          if (pageContent.includes(indicator)) {
            stillBlocked = true;
            break;
          }
        }
        
        if (!stillBlocked) {
          console.log('[Scraper] Cloudflare challenge appears to have passed');
          await page.waitForTimeout(2000); // Give it a moment to fully load
          break;
        }
        
        console.log(`[Scraper] Still waiting for Cloudflare challenge (${i + 1}/6)...`);
      }
      
      // Final check
      pageContent = await page.content();
      for (const indicator of cloudflareIndicators) {
        if (pageContent.includes(indicator)) {
          console.warn('[Scraper] Cloudflare challenge still present after waiting');
          // Don't throw here - let Supabase handle it
        }
      }
    }

    // Get the raw HTML - no processing, just return it
    // Supabase Edge Functions will do all the parsing and processing
    // Use try-catch to handle frame detached errors
    let html;
    try {
      html = await page.content();
    } catch (error) {
      if (error.message.includes('frame') || error.message.includes('detached')) {
        console.warn('[Scraper] Frame detached error, trying to recover...');
        // Try to get content from the main frame
        try {
          const frames = page.frames();
          const mainFrame = frames.find(f => f === page.mainFrame()) || frames[0];
          if (mainFrame) {
            html = await mainFrame.content();
          } else {
            throw new Error('Could not recover from frame detached error');
          }
        } catch (recoveryError) {
          throw new Error(`Frame detached and could not recover: ${recoveryError.message}`);
        }
      } else {
        throw error;
      }
    }
    
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
    
    // Try to get page content even if there was an error (might still have useful HTML)
    let errorHtml = null;
    if (browser) {
      try {
        const pages = await browser.pages();
        if (pages.length > 0) {
          errorHtml = await pages[0].content();
          // Check if it's actually a Cloudflare challenge
          if (errorHtml && (
            errorHtml.includes('Just a moment') ||
            errorHtml.includes('cf-challenge') ||
            errorHtml.includes('Checking your browser')
          )) {
            console.warn('[Scraper] Detected Cloudflare challenge in error response');
            res.status(500).json({
              success: false,
              error: 'CLOUDFLARE_BLOCKED',
              url: url,
              elapsed_ms: elapsed,
            });
            return;
          }
        }
      } catch (e) {
        // Ignore errors when trying to get error HTML
      }
    }
    
    // Check if it's a timeout or navigation error
    if (error.message.includes('Navigation timeout') || error.message.includes('timeout')) {
      res.status(500).json({
        success: false,
        error: `Navigation timeout: ${error.message}`,
        url: url,
        elapsed_ms: elapsed,
      });
    } else if (error.message.includes('frame') || error.message.includes('detached')) {
      res.status(500).json({
        success: false,
        error: `Frame detached: ${error.message}`,
        url: url,
        elapsed_ms: elapsed,
      });
    } else if (error.message.includes('CLOUDFLARE_BLOCKED') || error.message.includes('net::ERR')) {
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
      try {
        await browser.close();
      } catch (e) {
        console.error('[Scraper] Error closing browser:', e.message);
      }
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

