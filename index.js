import { getTodayMinTicketPrice } from './scrapeTickets.js';
import { sendEmail } from './sendEmail.js';

const minPrice = await getTodayMinTicketPrice();
if (minPrice !== null && minPrice < 20) {
  console.log(`There is a standing ticket available today for £${minPrice}!`);
  await sendEmail(minPrice);
} else {
  console.log('No performances remaining today.');
}
