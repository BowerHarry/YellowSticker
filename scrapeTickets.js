import puppeteer from 'puppeteer';
import { delay } from './utils.js';

export async function getTodayMinTicketPrice() {
  const browser = await puppeteer.launch({headless: true, args: [
        `--no-sandbox`,
        `--disable-setuid-sandbox`]});
  const page = await browser.newPage();
  await page.goto('https://hamiltonmusical.com/london/');
  await delay(1500);

  const thisMonthPerformanceIds = JSON.parse(await page.evaluate(() => {
    const numberSuffixes = [];
    document.querySelectorAll('button').forEach(button => {
      button.classList.forEach(className => {
        const match = className.match(/^txui-calendar-event--(\d+)$/);
        if (match) numberSuffixes.push(Number(match[1]));
      });
    });
    return JSON.stringify(numberSuffixes);
  }));

  console.log(thisMonthPerformanceIds);

  if (thisMonthPerformanceIds.length === 0) {
    console.log('No performances found!');
  }

  const today = new Date().toLocaleDateString('en-CA');
  let todayCheapestTickets = [];
  for (const performanceId of thisMonthPerformanceIds) {
    await page.goto(`https://hamiltonmusical.com/london/#/seats/${performanceId}?qty=1`);
    await delay(1500);
    const sessionStorage = JSON.parse(await page.evaluate(
      () => JSON.stringify(window.sessionStorage)
    ));
    if (JSON.parse(sessionStorage.whitelabel_bo_wrap)['event'].date.slice(0, 10) === today) {
      const priceBands = JSON.parse(sessionStorage.seatdata)['data'].priceBands;
      const minValues = Object.values(priceBands)
        .map(band => band.min)
        .sort((a, b) => a - b);
      todayCheapestTickets.push(minValues[0]);
      console.log(`Cheap ticket today: ${minValues[0]}`);
    }
  }
  await browser.close();
  return todayCheapestTickets.length > 0 ? Math.min(...todayCheapestTickets) : null;
}
