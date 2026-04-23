import { config } from './config.js';
import { supabase } from './supabase.js';
import { createLogger } from './logger.js';

const log = createLogger('notify');

/**
 * MVP notification path: email the configured ALERT_EMAIL whenever a
 * production transitions to "available". Does NOT query paid subscribers.
 *
 * When we re-enable per-subscriber notifications we'll:
 *   - query `subscriptions` where payment_status='paid' joined with users
 *   - send one email per subscriber via Resend
 *   - log each one in `notification_logs`
 *
 * For now we also write a single row to `notification_logs` with a null
 * user_id so we can audit runs from the DB.
 */
export const sendAlert = async (production, result) => {
  if (config.scrape.dryRun) {
    log.warn(`DRY_RUN=true — would email ${config.alertEmail} for ${production.name}`);
    return;
  }

  const subject = `Standing tickets spotted: ${production.name}`;
  const priceLine = result.price ? ` · approx ${result.price}` : '';
  const countLine = result.standCount ? ` (${result.standCount} circle(s))` : '';
  const html = `
    <h2>${escapeHtml(production.name)}</h2>
    <p>Standing tickets appear to be available at <strong>${escapeHtml(production.theatre?.name ?? production.theatre ?? 'the theatre')}</strong>.</p>
    <p>Reason: ${escapeHtml(result.reason ?? 'n/a')}${escapeHtml(priceLine)}${escapeHtml(countLine)}</p>
    <p><a href="${escapeHtml(production.scraping_url)}">Open the box office page</a></p>
    <hr>
    <p style="font-size: 0.85rem; color: #666;">Sent by Yellow Sticker scraper · production id <code>${escapeHtml(production.id)}</code></p>
  `;

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.resend.apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: `Yellow Sticker <${config.resend.fromEmail}>`,
      to: [config.alertEmail],
      subject,
      html,
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    log.error(`Resend request failed (${response.status})`, text);
    throw new Error(`Resend failed: ${response.status}`);
  }

  const data = await response.json().catch(() => ({}));
  const providerId = data?.id ?? null;
  log.info(`Email sent to ${config.alertEmail} (id=${providerId})`);

  try {
    await supabase.from('notification_logs').insert({
      user_id: null,
      production_id: production.id,
      type: 'email',
      payload: {
        providerId,
        recipient: config.alertEmail,
        reason: result.reason ?? null,
        standCount: result.standCount ?? null,
      },
    });
  } catch (error) {
    log.warn('Failed to log notification (non-fatal)', error.message || String(error));
  }
};

const escapeHtml = (value) => {
  if (value === null || value === undefined) return '';
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
};
