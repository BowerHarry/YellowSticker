import { adminClient } from './db.ts';
import type { ProductionRecord, ScrapeResult, UserRecord } from './types.ts';

const sendEmailNotification = async (
  user: UserRecord,
  production: ProductionRecord,
  result: ScrapeResult,
  managementToken?: string | null,
): Promise<string | null> => {
  const resendKey = Deno.env.get('RESEND_API_KEY');
  if (!resendKey || !user.email) {
    console.log('Cannot send email - missing key or email', { hasKey: !!resendKey, hasEmail: !!user.email });
    return null;
  }

  const siteUrl = Deno.env.get('PUBLIC_SITE_URL') || 'http://localhost:5173';
  const managementLink = managementToken 
    ? `${siteUrl}/manage?token=${managementToken}`
    : null;

  const subject = `Standing tickets spotted for ${production.name}`;
  const html = `
    <h2>${production.name}</h2>
    <p>We just saw new standing tickets appear for ${production.theatre}.</p>
    <p>Status: <strong>${result.status}</strong>${result.price ? ` · approx ${result.price}` : ''}</p>
    <p><a href="${production.scraping_url}">Go to the official box office</a></p>
    <hr style="margin: 2rem 0; border: none; border-top: 1px solid #ddd;">
    <p style="font-size: 0.9rem; color: #666;">
      You're receiving this because you subscribed to Yellow Sticker alerts.
      ${managementLink ? `<br><a href="${managementLink}">Manage your subscription</a> or <a href="${managementLink}">unsubscribe</a>.` : ''}
    </p>
  `;

  // Use Resend's default domain for unverified domains, or set RESEND_FROM_EMAIL secret
  const fromEmail = Deno.env.get('RESEND_FROM_EMAIL') || 'onboarding@resend.dev';
  
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${resendKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: `Yellow Sticker <${fromEmail}>`,
      to: [user.email],
      subject,
      html,
    }),
  });

  if (!response.ok) {
    console.error('Resend failed', await response.text());
    return null;
  }

  const data = await response.json();
  return data?.id ?? null;
};

const logNotification = async (userId: string, productionId: string, type: 'email', payload: Record<string, unknown>) =>
  adminClient.from('notification_logs').insert({
    user_id: userId,
    production_id: productionId,
    type,
    payload,
  });

export const notifySubscribers = async (production: ProductionRecord, result: ScrapeResult) => {
  console.log('Notifying subscribers for production:', production.name, production.id);
  
  const siteUrl = Deno.env.get('PUBLIC_SITE_URL') || 'http://localhost:5173';
  
  const { data: subscriptions, error } = await adminClient
    .from('subscriptions')
    .select(
      `
      id,
      management_token,
      user:users (
        id,
        email,
        phone,
        notification_preference
      )
    `,
    )
    .eq('production_id', production.id)
    .eq('payment_status', 'paid');

  if (error) {
    console.error('Unable to load subscriptions', error);
    return;
  }

  if (!subscriptions || subscriptions.length === 0) {
    console.log('No paid subscriptions found for production:', production.name);
    return;
  }

  console.log(`Found ${subscriptions.length} paid subscription(s) for ${production.name}`);

  const resendKey = Deno.env.get('RESEND_API_KEY');
  if (!resendKey) {
    console.error('RESEND_API_KEY is not set - cannot send emails');
    return;
  }

  let sentCount = 0;
  let failedCount = 0;

  for (const subscription of subscriptions) {
    const user = subscription.user as UserRecord;
    if (!user || !user.email) {
      console.log('Skipping subscription - user missing or no email', subscription.id);
      continue;
    }

    console.log('Sending notification to:', user.email);
    
    // Only send email notifications for now (SMS coming soon)
    const subscriptionWithToken = subscription as { id: string; management_token?: string | null };
    const messageId = await sendEmailNotification(user, production, result, subscriptionWithToken.management_token);
    if (messageId) {
      await logNotification(user.id, production.id, 'email', { providerId: messageId });
      console.log('Email sent successfully, message ID:', messageId);
      sentCount++;
    } else {
      console.error('Failed to send email to:', user.email);
      failedCount++;
    }
  }

  console.log(`Notification summary: ${sentCount} sent, ${failedCount} failed`);
};

