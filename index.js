import { getTodayMinTicketPrice } from './scrapeTickets.js';
import { sendEmail } from './sendEmail.js';

const minPrice = await getTodayMinTicketPrice();
if (minPrice !== null) {
  await sendEmail(minPrice);
} else {
  console.log('No performances remaining today.');
}