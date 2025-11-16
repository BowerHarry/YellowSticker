import { adminClient } from '../_shared/db.ts';
import type { ProductionRecord } from '../_shared/types.ts';
import { notifySubscribers } from '../_shared/notifications.ts';
import { scrapers } from './scrapers/index.ts';
import { createDynamicScraper } from './scrapers/dynamic.ts';

const jsonResponse = (body: unknown, init: ResponseInit = {}) =>
  new Response(JSON.stringify(body), {
    headers: { 'Content-Type': 'application/json' },
    ...init,
  });

Deno.serve(async () => {
  const now = new Date();
  const nowISO = now.toISOString();

  // Only scrape productions that are currently active (within their date range)
  // Also load theatre configuration for standing ticket patterns
  const { data: productions, error } = await adminClient
    .from('productions')
    .select(`
      *,
      theatre:theatres (
        id,
        name,
        standing_ticket_prefixes
      )
    `)
    .lte('start_date', nowISO) // start_date <= now
    .or(`end_date.is.null,end_date.gte.${nowISO}`); // end_date is null OR end_date >= now

  if (error || !productions) {
    console.error('Failed to load productions', error);
    return jsonResponse({ error: 'Failed to load productions' }, { status: 500 });
  }

  console.log(`Found ${productions.length} active production(s) to scrape (filtered by date range)`);

  const summary: Array<{ production: string; status: string; notified: boolean }> = [];

  // Process productions sequentially
  // ScrapingBee can handle requests quickly, but we add a small delay to be respectful
  for (let i = 0; i < productions.length; i++) {
    const production = productions[i] as ProductionRecord & {
      theatre?: { id: string; name: string; standing_ticket_prefixes: string[] } | null;
    };
    
    // Get theatre configuration
    const theatre = production.theatre;
    if (!theatre) {
      console.warn(`Production ${production.name} has no theatre configuration, skipping`);
      continue;
    }
    
    // Use hardcoded scrapers first (they have exact URLs that were working)
    // Only use dynamic scraper as fallback for new productions without hardcoded scrapers
    const hardcodedScraper = scrapers[theatre.name];
    const scraper = hardcodedScraper ?? createDynamicScraper(production, theatre.standing_ticket_prefixes) ?? scrapers.default;

    // Delay between productions to reduce Cloudflare blocking
    // Longer delays with jitter help avoid detection patterns
    if (i > 0) {
      const baseDelaySeconds = 30; // Base 30 seconds between productions
      const delayWithJitter = baseDelaySeconds + (Math.random() * 2 - 1) * (baseDelaySeconds * 0.2); // ±20% jitter
      const delayMs = Math.max(0, delayWithJitter * 1000);
      console.log(`Waiting ${delayWithJitter.toFixed(1)} seconds before scraping ${production.name}...`);
      await new Promise(resolve => setTimeout(resolve, delayMs));
    }

    try {
      // Retry logic for rate limit errors
      let result;
      let retryCount = 0;
      const maxRetries = 2;
      
      while (retryCount <= maxRetries) {
        try {
          result = await scraper(production.scraping_url);
          break; // Success, exit retry loop
        } catch (scrapeError) {
          const errorMessage = scrapeError instanceof Error ? scrapeError.message : String(scrapeError);
          
          // Check if it's a rate limit error (ScrapingBee)
          if ((errorMessage.includes('429') || 
               errorMessage.includes('Rate limit exceeded') || 
               errorMessage.includes('SCRAPINGBEE_RATE_LIMIT')) && retryCount < maxRetries) {
            retryCount++;
            const waitTime = 30; // Wait 30 seconds for rate limit to reset
            console.log(`Rate limit hit for ${production.name} (attempt ${retryCount}/${maxRetries}), waiting ${waitTime} seconds...`);
            await new Promise(resolve => setTimeout(resolve, waitTime * 1000));
            continue;
          }
          
          // Not a rate limit error, or max retries reached - throw it
          throw scrapeError;
        }
      }
      
      if (!result) {
        throw new Error('Failed to scrape after retries');
      }

      const previous = production.last_seen_status ?? 'unknown';
      const now = new Date().toISOString();

      const updateData: {
        last_seen_status: string;
        last_checked_at: string;
        last_standing_tickets_found_at?: string;
      } = {
        last_seen_status: result.status,
        last_checked_at: now,
      };

      // Update last_standing_tickets_found_at when tickets are found
      if (result.status === 'available') {
        updateData.last_standing_tickets_found_at = now;
      }

      await adminClient
        .from('productions')
        .update(updateData)
        .eq('id', production.id);

      let notified = false;
      if (result.status === 'available' && previous !== 'available') {
        console.log(`Status changed to available for ${production.name}, notifying subscribers...`);
        try {
          await notifySubscribers(production, result);
          notified = true;
          console.log(`Notification process completed for ${production.name}`);
        } catch (notifyError) {
          console.error(`Failed to notify subscribers for ${production.name}:`, notifyError);
          notified = false;
        }
      } else {
        console.log(`No notification needed for ${production.name} - status: ${result.status}, previous: ${previous}`);
      }

      summary.push({ production: production.name, status: result.status, notified });
    } catch (scrapeError) {
      console.error(`Scraper failed for ${production.name}`, scrapeError);
      await adminClient
        .from('productions')
        .update({ last_seen_status: 'unknown', last_checked_at: new Date().toISOString() })
        .eq('id', production.id);

      summary.push({ production: production.name, status: 'error', notified: false });
    }
  }

  return jsonResponse({ ok: true, summary });
});

