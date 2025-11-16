# Scraping Solution: ScrapingBee

Yellow Sticker uses **ScrapingBee** for web scraping. ScrapingBee handles Cloudflare protection and JavaScript rendering automatically.

## Current Implementation

- **Service**: ScrapingBee
- **Features**: 
  - ✅ Cloudflare bypass (premium proxies)
  - ✅ JavaScript rendering (`render_js=true`)
  - ✅ Premium proxy support (`premium_proxy=true`)
  - ✅ Configurable wait time for slow-loading content

## Pricing

| Plan | Monthly Cost | API Credits | Best For |
|------|-------------|-------------|----------|
| **Free** | $0 | 1,000 | Testing |
| **Starter** | $49 | 100,000 | Production |
| **Business** | $149 | 500,000 | High volume |

**Note**: Each request with `render_js=true` and `premium_proxy=true` costs 25 credits.

## Configuration

Set the following environment variables in Supabase:

```bash
SCRAPINGBEE_API_KEY="your_api_key"
SCRAPINGBEE_WAIT="5000"  # Milliseconds to wait for JS execution (default: 5000)
SCRAPINGBEE_DAILY_LIMIT="1000"  # Daily request limit
SCRAPINGBEE_MONTHLY_LIMIT="10000"  # Monthly request limit
```

## Cost Optimization Tips

1. **Reduce scraping frequency**: Only scrape during business hours (8am-6pm UTC)
2. **Cache performance IDs**: Reuse cached IDs for the same day
3. **Monitor usage**: Track API calls via the monitor dashboard
4. **Start with free tier**: Test with 1,000 free credits before upgrading

## Fallback Options (If ScrapingBee is Blocked)

The scraper now includes automatic fallback logic:

1. **Primary**: ScrapingBee with `stealth_proxy=true` (best Cloudflare bypass)
2. **Fallback 1**: ScrapingBee with `premium_proxy=true` (if stealth fails)
3. **Fallback 2**: ScraperAPI (if all ScrapingBee options fail)

### ScraperAPI Setup

ScraperAPI is automatically used as a fallback if ScrapingBee fails. To enable it:

1. Sign up at https://www.scraperapi.com/
2. Get your API key from the dashboard
3. Set `SCRAPERAPI_API_KEY` in Supabase Edge Function secrets

**ScraperAPI Pricing:**
- **Free**: 5,000 requests/month
- **Starter**: $49/month for 25,000 requests
- **Business**: $149/month for 100,000 requests

### Other Alternatives

If both ScrapingBee and ScraperAPI are blocked:

- **Self-hosted VPS** (€4-5/month): Use Puppeteer/Playwright on a VPS with residential IP
- **Bright Data** (more expensive): Enterprise-grade residential proxies
- **Oxylabs** (more expensive): Premium proxy service

For most use cases, ScrapingBee's Starter plan ($49/month) with ScraperAPI as fallback should be sufficient.
