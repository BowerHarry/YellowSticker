/**
 * Gmail SMTP email sender for Supabase Edge Functions
 * 
 * Setup:
 * 1. Enable 2-Step Verification on your Google account
 * 2. Generate an App Password: https://myaccount.google.com/apppasswords
 * 3. Set environment variables:
 *    - GMAIL_USER: your-email@gmail.com
 *    - GMAIL_APP_PASSWORD: your 16-character app password
 */

interface EmailOptions {
  to: string | string[];
  subject: string;
  html: string;
  from?: string;
}

/**
 * Send email via Gmail SMTP using OAuth2 or App Password
 * 
 * Note: For production, consider using OAuth2 tokens instead of app passwords
 * for better security. This implementation uses SMTP with app passwords.
 */
export const sendEmailViaGmail = async (options: EmailOptions): Promise<string | null> => {
  const gmailUser = Deno.env.get('GMAIL_USER');
  const gmailPassword = Deno.env.get('GMAIL_APP_PASSWORD');

  if (!gmailUser || !gmailPassword) {
    console.error('Gmail credentials not configured. Set GMAIL_USER and GMAIL_APP_PASSWORD.');
    return null;
  }

  const to = Array.isArray(options.to) ? options.to.join(', ') : options.to;
  const from = options.from || `Yellow Sticker <${gmailUser}>`;

  // Create email message in RFC 2822 format
  const message = [
    `From: ${from}`,
    `To: ${to}`,
    `Subject: ${options.subject}`,
    'MIME-Version: 1.0',
    'Content-Type: text/html; charset=utf-8',
    '',
    options.html,
  ].join('\r\n');

  // Encode message in base64url format (required by Gmail API or SMTP)
  // For SMTP, we'll use a simpler approach with a library or direct SMTP connection
  // Since Deno doesn't have built-in SMTP, we'll use a fetch-based approach or a library

  // Option 1: Use Gmail API (requires OAuth2 token)
  // Option 2: Use SMTP via a service like SendGrid's SMTP relay
  // Option 3: Use a Deno SMTP library

  // For now, let's use a simple SMTP approach with fetch to a relay service
  // OR use nodemailer-style approach if available in Deno

  // Actually, the best approach for Deno is to use the Gmail API directly
  // But that requires OAuth2 setup which is more complex

  // Let's provide a simpler SMTP solution using a third-party service
  // OR use a Deno-compatible SMTP library

  // For simplicity, let's use a service that provides SMTP over HTTP
  // Or we can use the Gmail API with OAuth2

  console.warn('Gmail SMTP implementation needs a Deno SMTP library or Gmail API OAuth2 setup');
  console.warn('Consider using: https://deno.land/x/denomailer or Gmail API');
  
  // Placeholder - you'll need to implement actual SMTP sending
  // See alternative implementation below
  return null;
};

/**
 * Alternative: Send email via Gmail API (requires OAuth2)
 * This is more secure but requires OAuth2 token setup
 */
export const sendEmailViaGmailAPI = async (
  options: EmailOptions,
  accessToken: string,
): Promise<string | null> => {
  const gmailUser = Deno.env.get('GMAIL_USER') || '';
  const to = Array.isArray(options.to) ? options.to : [options.to];

  const email = [
    `From: ${gmailUser}`,
    `To: ${to.join(', ')}`,
    `Subject: ${options.subject}`,
    'MIME-Version: 1.0',
    'Content-Type: text/html; charset=utf-8',
    '',
    options.html,
  ].join('\r\n');

  // Encode in base64url format
  const encodedEmail = btoa(email)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');

  const response = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      raw: encodedEmail,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    console.error('Gmail API failed:', error);
    return null;
  }

  const data = await response.json();
  return data.id || null;
};

