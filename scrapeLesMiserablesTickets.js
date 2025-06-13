import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import { delay } from './utils.js';

puppeteer.use(StealthPlugin());

export async function areStandingTicketsAvailable() {
  const browser = await puppeteer.launch({
    headless: true,
    args: [
      `--no-sandbox`,
      `--disable-setuid-sandbox`
    ]
  });
  console.log('Les Misérables ticket scraper started');
  const dayOfMonth = new Date().getDate();
  const page = await browser.newPage();

  await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36');
  await page.setViewport({ width: 1280, height: 800 });
  await page.goto('https://buytickets.delfontmackintosh.co.uk/tickets/series/SONLMSEPT25/');

  await delay(5000);
  await page.waitForSelector('button.day:not(.no-hover)'); // Wait for at least one button to appear

  await page.evaluate((dayOfMonth) => {
    const calendarButtons = [...document.querySelectorAll('button.day:not(.no-hover)')];
    const targetElement = calendarButtons.find(e => e.id === 'calendarDay' + dayOfMonth);
    targetElement && targetElement.click();
  }, dayOfMonth);

  const todaysPerformanceIds = JSON.parse(await page.evaluate(() => {
    const numberSuffixes = [];
    document.querySelectorAll('button').forEach(button => {
      const match = button.id.match(/^calendar-event-(\d+)$/);
      const isVisible = window.getComputedStyle(button).visibility !== 'hidden';
      if (match && isVisible) numberSuffixes.push(Number(match[1]));
    });
    return JSON.stringify(numberSuffixes);
  }));

  console.log(todaysPerformanceIds);

  if (todaysPerformanceIds.length === 0) {
    console.log('No performances found!');
  }
  let availableCircles = [];
  for (const performanceId of todaysPerformanceIds) {
    await page.goto(`https://buytickets.delfontmackintosh.co.uk/tickets/series/SONLMSEPT25/les-misrables-${performanceId}`);
    await delay(1500);
    availableCircles = await page.evaluate(() => {
      const circles = [];
      for (let i = 1; i <= 10; i++) {
        const el = document.getElementById(`GRAND CIRCLE-STAND-${i}`);
        if (el && !el.classList.contains('na')) {
          circles.push(el.id);
        }
      }
      return circles;
    });
    console.log(`Available standing tickets for performance ${performanceId}:`, availableCircles.length);
  }
  await browser.close();
  console.log('Les Misérables ticket scraper finished');
  return availableCircles.length > 0;
}
