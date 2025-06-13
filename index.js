import * as lesMis from './scrapeLesMiserablesTickets.js';
import * as hamilton from './scrapeHamiltonTickets.js';
import { sendEmail } from './sendEmail.js';

const lesMisStandingTickets = await lesMis.areStandingTicketsAvailable();
const hamiltonStandingTickets = await hamilton.areStandingTicketsAvailable();
if (lesMisStandingTickets || hamiltonStandingTickets) {
  console.log(`There are standing tickets available today for Les Misérables: ${lesMisStandingTickets}, Hamilton: ${hamiltonStandingTickets}`);
  // await sendEmail(lesMisStandingTickets, hamiltonStandingTickets);
} else {
  console.log('No standing tickets available.');
}