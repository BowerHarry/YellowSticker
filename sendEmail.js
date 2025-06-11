import nodemailer from 'nodemailer';

export async function sendEmail(minPrice) {
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
    subject: 'Cheapest Hamilton Ticket Today',
    text: `The cheapest ticket today is £${minPrice}!`,
  });

  console.log('Email sent:', info.messageId);
}