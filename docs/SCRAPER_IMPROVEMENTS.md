# Scraper Implementation

## Current Implementation

Yellow Sticker uses **ScrapingBee** for web scraping with the following features:

- ✅ **JavaScript rendering**: Fully renders dynamic content
- ✅ **Cloudflare bypass**: Premium proxies handle Cloudflare protection
- ✅ **Performance ID caching**: Caches performance IDs per production per day
- ✅ **Error handling**: Retry logic for rate limits and server errors
- ✅ **HTML parsing**: Uses `cheerio` for reliable DOM parsing

## Theatre-Specific Scrapers

### Hamilton (Victoria Palace Theatre)
- Calendar URL: `https://buytickets.delfontmackintosh.co.uk/tickets/series/vpham`
- Checks for `<circle>` elements with `id` starting with `GRAND CIRCLE-STAND-`
- Filters out circles with `class="na"` (not available)

### Les Misérables (Sondheim Theatre)
- Calendar URL: `https://buytickets.delfontmackintosh.co.uk/tickets/series/SONLMSEPT25`
- Same standing ticket detection logic as Hamilton

### Other Productions
- Uses keyword-based scraping for productions without specific scrapers

## How It Works

1. **Fetch calendar page** via ScrapingBee
2. **Find today's event tray** using aria-label matching
3. **Extract performance IDs** from `<calendar-event>` elements
4. **Cache performance IDs** for the day (avoids re-fetching calendar)
5. **Check each performance** for standing tickets
6. **Parse seat map** for available standing circles
7. **Notify subscribers** if tickets become available

## Monitoring

- **Monitor dashboard**: `/monitor` page shows scraper health
- **Usage tracking**: Daily and monthly request counts
- **Error logging**: Failed scrapes logged with details

## Future Improvements

- Add more theatre-specific scrapers as needed
- Optimize wait times based on site performance
- Add more sophisticated error recovery
- Consider rate limit optimization
