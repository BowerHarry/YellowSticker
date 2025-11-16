import type { ProductionRecord } from '../../_shared/types.ts';
import { createCalendarStandingScraper } from './index.ts';

// Helper to extract series code from scraping URL
// Supports URLs like: https://buytickets.delfontmackintosh.co.uk/tickets/series/WYNIA
const extractSeriesCode = (scrapingUrl: string): string | null => {
  const match = scrapingUrl.match(/\/series\/([A-Z0-9]+)/i);
  return match ? match[1].toUpperCase() : null;
};

// Helper to extract production-specific URL patterns dynamically
const getProductionScraperConfig = (
  production: ProductionRecord,
): {
  calendarUrl: string;
  buildPerformanceUrl: (performanceId: string, startDateParam: string) => string;
  cacheKey: string;
} | null => {
  const slug = production.slug;
  const scrapingUrl = production.scraping_url;

  // Extract series code from URL (e.g., WYNIA, COWDRA, VPHAM)
  const seriesCode = extractSeriesCode(scrapingUrl);
  
  if (!seriesCode) {
    console.warn(`Could not extract series code from scraping URL: ${scrapingUrl}`);
    return null;
  }

  // Build calendar URL
  const calendarUrl = `https://buytickets.delfontmackintosh.co.uk/tickets/series/${seriesCode}`;

  // Build performance URL using slug and series code
  const buildPerformanceUrl = (performanceId: string, startDateParam: string) =>
    `https://buytickets.delfontmackintosh.co.uk/tickets/series/${seriesCode}/${slug}-${performanceId}?startDate=${startDateParam}`;

  // Use slug as cache key (unique per production)
  const cacheKey = slug;

  return {
    calendarUrl,
    buildPerformanceUrl,
    cacheKey,
  };
};

// Create a scraper dynamically using production config and theatre prefixes
export const createDynamicScraper = (
  production: ProductionRecord,
  theatrePrefixes: string[],
) => {
  const config = getProductionScraperConfig(production);
  if (!config) {
    return null;
  }

  return createCalendarStandingScraper({
    name: production.name,
    ...config,
    seatCircleIdPrefix: theatrePrefixes,
  });
};

