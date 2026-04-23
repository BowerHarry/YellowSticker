import { supabase } from './supabase.js';
import { launchBrowser } from './browser.js';
import { selectScraper } from './scrapers/index.js';
import { sendAlert } from './notify.js';
import { createLogger } from './logger.js';
import { config } from './config.js';

const log = createLogger('scrape');

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const jitter = (base, pct = 0.2) => {
  const delta = base * pct;
  return Math.max(0, base + (Math.random() * 2 - 1) * delta);
};

const loadActiveProductions = async () => {
  const nowISO = new Date().toISOString();
  const { data, error } = await supabase
    .from('productions')
    .select(`
      id, slug, name, theatre, scraping_url,
      last_seen_status, last_checked_at, last_standing_tickets_found_at,
      start_date, end_date,
      theatre:theatres (id, name, standing_ticket_prefixes)
    `)
    .lte('start_date', nowISO)
    .or(`end_date.is.null,end_date.gte.${nowISO}`);

  if (error) {
    throw new Error(`Failed to load productions: ${error.message}`);
  }
  return data ?? [];
};

const updateProduction = async (production, status) => {
  const now = new Date().toISOString();
  const patch = { last_seen_status: status, last_checked_at: now };
  if (status === 'available') patch.last_standing_tickets_found_at = now;

  const { error } = await supabase.from('productions').update(patch).eq('id', production.id);
  if (error) {
    log.warn(`Failed to update production ${production.name}: ${error.message}`);
  }
};

/**
 * Scrape every active production once.
 * Called by the cron scheduler AND the --once CLI flag.
 *
 * @returns {Promise<Array<{name: string, status: string, notified: boolean}>>}
 */
export const runScrape = async () => {
  const productions = await loadActiveProductions();
  log.info(`Loaded ${productions.length} active production(s)`);

  if (productions.length === 0) {
    return [];
  }

  const browser = await launchBrowser();
  const summary = [];

  try {
    for (let i = 0; i < productions.length; i++) {
      const production = productions[i];
      const theatreName = production.theatre?.name ?? production.theatre ?? 'unknown';

      if (i > 0) {
        const delaySec = jitter(config.scrape.interProductionDelaySeconds);
        log.info(`Sleeping ${delaySec.toFixed(1)}s before next production`);
        await sleep(delaySec * 1000);
      }

      log.info(`Scraping "${production.name}" @ ${theatreName}`);
      const previous = production.last_seen_status ?? 'unknown';

      try {
        const scraper = selectScraper(production);
        const result = await scraper.run(browser);
        await updateProduction(production, result.status);

        let notified = false;
        if (result.status === 'available' && previous !== 'available') {
          log.info(`${production.name}: status transitioned to available — notifying`);
          try {
            await sendAlert(production, result);
            notified = true;
          } catch (error) {
            log.error(`Failed to send alert for ${production.name}`, error.message || String(error));
          }
        } else {
          log.info(`${production.name}: status=${result.status} (prev=${previous}) — no alert`);
        }

        summary.push({ name: production.name, status: result.status, notified });
      } catch (error) {
        log.error(`Scrape failed for ${production.name}`, error.message || String(error));
        await updateProduction(production, 'unknown');
        summary.push({ name: production.name, status: 'error', notified: false });
      }
    }
  } finally {
    await browser.close().catch(() => {});
  }

  log.info('Run complete', summary);
  return summary;
};
