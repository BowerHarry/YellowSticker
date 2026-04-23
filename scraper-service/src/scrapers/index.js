import { createCalendarStandingScraper, createKeywordScraper } from './calendarStanding.js';
import { config } from '../config.js';

const { timezone } = config.scrape;

/**
 * Known Delfont Mackintosh series that we explicitly want to scrape.
 * The `seatPrefixes` here override whatever is configured on the `theatres`
 * row in the DB for these specific productions (because we originally
 * discovered these patterns manually and know they are correct).
 *
 * Any production whose theatre name is NOT in this map will fall back to
 * the dynamic scraper (which uses theatre.standing_ticket_prefixes from DB).
 */
const HARDCODED_BY_THEATRE = {
  'Victoria Palace Theatre': {
    name: 'Hamilton',
    calendarUrl: 'https://buytickets.delfontmackintosh.co.uk/tickets/series/vpham',
    buildPerformanceUrl: (id, d) =>
      `https://buytickets.delfontmackintosh.co.uk/tickets/series/VPHAM/hamilton-${id}?startDate=${d}`,
    seatPrefixes: ['GRAND CIRCLE-STAND-'],
    cacheKey: 'hamilton',
  },
  'Sondheim Theatre': {
    name: 'Les Miserables',
    calendarUrl: 'https://buytickets.delfontmackintosh.co.uk/tickets/series/SONLMSEPT25',
    buildPerformanceUrl: (id, d) =>
      `https://buytickets.delfontmackintosh.co.uk/tickets/series/SONLMSEPT25/les-miserables-${id}?startDate=${d}`,
    seatPrefixes: ['GRAND CIRCLE-STAND-'],
    cacheKey: 'lesmis',
  },
  'London Palladium': {
    name: 'Oliver!',
    calendarUrl: 'https://buytickets.delfontmackintosh.co.uk/tickets/series/GIEOLI',
    buildPerformanceUrl: (id, d) =>
      `https://buytickets.delfontmackintosh.co.uk/tickets/series/GIEOLI/oliver-${id}?startDate=${d}`,
    seatPrefixes: ['STALLS-STAND-'],
    cacheKey: 'oliver',
  },
  "Wyndham's Theatre": {
    name: 'All My Sons',
    calendarUrl: 'https://buytickets.delfontmackintosh.co.uk/tickets/series/WYNAMS',
    buildPerformanceUrl: (id, d) =>
      `https://buytickets.delfontmackintosh.co.uk/tickets/series/WYNAMS/all-my-sons-${id}?startDate=${d}`,
    seatPrefixes: ['STALLS-STAND-', 'GRAND CIRCLE-STAND-'],
    cacheKey: 'allmysons',
  },
  'Noël Coward Theatre': {
    name: 'The Importance of Being Earnest',
    calendarUrl: 'https://buytickets.delfontmackintosh.co.uk/tickets/series/COWIBE',
    buildPerformanceUrl: (id, d) =>
      `https://buytickets.delfontmackintosh.co.uk/tickets/series/COWIBE/importance-of-being-earnest-${id}?startDate=${d}`,
    seatPrefixes: ['GRAND CIRCLE-STAND-', 'STALLS-STAND-'],
    cacheKey: 'importance',
  },
};

const extractSeriesCode = (scrapingUrl) => {
  const match = scrapingUrl?.match(/\/series\/([A-Z0-9]+)/i);
  return match ? match[1].toUpperCase() : null;
};

const createDynamicDelfontScraper = (production, seatPrefixes) => {
  const seriesCode = extractSeriesCode(production.scraping_url);
  if (!seriesCode) return null;
  const calendarUrl = `https://buytickets.delfontmackintosh.co.uk/tickets/series/${seriesCode}`;
  const buildPerformanceUrl = (id, d) =>
    `https://buytickets.delfontmackintosh.co.uk/tickets/series/${seriesCode}/${production.slug}-${id}?startDate=${d}`;
  return createCalendarStandingScraper({
    name: production.name,
    calendarUrl,
    buildPerformanceUrl,
    seatPrefixes,
    cacheKey: production.slug,
    timezone,
  });
};

const DEFAULT_KEYWORD_SCRAPER = createKeywordScraper([
  'standing',
  'rush',
  'day seats',
  'dayseats',
  'standing tickets',
]);

/**
 * Picks the correct scraper for a production row.
 *
 * Priority:
 *   1. Hardcoded per-theatre scraper (known-correct URLs + prefixes).
 *   2. Dynamic Delfont scraper using theatre.standing_ticket_prefixes.
 *   3. Keyword-in-page fallback on the production's scraping_url.
 *
 * @param {object} production  productions row joined with `theatre`.
 * @returns {{ run: (browser) => Promise<ScrapeResult> }}
 */
export const selectScraper = (production) => {
  const theatreName = production.theatre?.name ?? production.theatre;
  const theatrePrefixes = production.theatre?.standing_ticket_prefixes ?? [];

  const hardcoded = HARDCODED_BY_THEATRE[theatreName];
  if (hardcoded) {
    const scraper = createCalendarStandingScraper({ ...hardcoded, timezone });
    return { run: (browser) => scraper(browser) };
  }

  const dynamic = createDynamicDelfontScraper(production, theatrePrefixes);
  if (dynamic) {
    return { run: (browser) => dynamic(browser) };
  }

  return {
    run: (browser) => DEFAULT_KEYWORD_SCRAPER(browser, production.scraping_url),
  };
};
