import nodemailer from 'nodemailer';

export async function sendEmail(lesMisAvailable, hamiltonAvailable) {
  let transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASSWORD,
    },
  });

  let info = await transporter.sendMail({
    from: `"Ticket Bot" <${process.env.EMAIL_USER}>`,
    to: `${process.env.EMAIL_RECIPIENT}`,
    subject: 'Standing Tickets Available!',
    html: `<p>Standing tickets are available today!</p>
           <p>Les Misérables: ${lesMisAvailable ? 'Yes' : 'No'}</p>
           <p>Hamilton: ${hamiltonAvailable ? 'Yes' : 'No'}</p>`,
  });

  console.log('Email sent:', info.messageId);
}