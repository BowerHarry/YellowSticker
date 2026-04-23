// Shared email plumbing for the subscription lifecycle (sign-up,
// renewal, cancellation, expiry). Availability + stuck alerts still live in
// `report-scrape` because they carry extra scraper-specific context.
//
// Every template returns a `{ subject, html }` pair; `sendEmail()` wraps the
// actual Resend call. All templates are plain inline-styled HTML — users'
// inboxes handle what they want to render. Links back to the SPA use
// `PUBLIC_SITE_URL` (already a required env var for the web build).

const RESEND_ENDPOINT = 'https://api.resend.com/emails';

const escapeHtml = (value: string): string =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const formatGbp = (pence: number | null | undefined): string => {
  if (pence == null || !Number.isFinite(pence)) return '—';
  return `£${(pence / 100).toFixed(2)}`;
};

const formatDate = (iso: string | Date | null | undefined): string => {
  if (!iso) return '—';
  const d = iso instanceof Date ? iso : new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('en-GB', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
};

export const siteUrl = (): string =>
  Deno.env.get('PUBLIC_SITE_URL') ?? 'http://localhost:5173';

export const manageLink = (token: string | null): string | null =>
  token ? `${siteUrl()}/manage?token=${encodeURIComponent(token)}` : null;

// Small wrapper so every email sent from this module has a consistent look
// + footer without copy-pasting the same chrome into every template.
const wrap = (title: string, bodyHtml: string, managementUrl: string | null): string => {
  const manageBlock = managementUrl
    ? `
      <tr><td style="padding: 24px 32px 0 32px; font-size: 13px; color: #667085;">
        <strong>Manage your subscription</strong><br>
        <a href="${escapeHtml(managementUrl)}" style="color: #eab308;">View details or cancel</a>
      </td></tr>`
    : '';
  return `<!doctype html>
<html>
  <body style="margin: 0; background: #0b0b0c; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; color: #1a1a1a;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background: #0b0b0c; padding: 32px 0;">
      <tr><td align="center">
        <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="background: #ffffff; border-radius: 12px; overflow: hidden;">
          <tr><td style="background: #eab308; padding: 20px 32px; color: #0b0b0c; font-weight: 700; letter-spacing: 0.02em;">Yellow Sticker</td></tr>
          <tr><td style="padding: 32px;">
            <h1 style="margin: 0 0 16px 0; font-size: 20px;">${escapeHtml(title)}</h1>
            ${bodyHtml}
          </td></tr>
          ${manageBlock}
          <tr><td style="padding: 24px 32px 32px 32px; font-size: 12px; color: #98a2b3; border-top: 1px solid #eee; margin-top: 24px;">
            You're receiving this because you subscribed to standing-ticket alerts at <a href="${escapeHtml(siteUrl())}" style="color: #98a2b3;">${escapeHtml(siteUrl())}</a>.
          </td></tr>
        </table>
      </td></tr>
    </table>
  </body>
</html>`;
};

// Reusable "no-tickets-no-charge" guarantee paragraph. Kept here (rather
// than in every template) so the exact wording is identical across
// signup/renewal/cancel emails and matches the FAQ.
const guaranteeHtml = `
<p style="font-size: 13px; color: #667085; line-height: 1.6;">
  <strong>Our guarantee:</strong> if no standing tickets have been found
  since your last payment at the point of cancellation or renewal, you
  receive a full refund — you're only charged when we actually alert you.
</p>`;

export type ProductionInfo = {
  name: string;
  theatre: string;
  city?: string | null;
  slug: string;
  endDate?: string | null;
};

export type SubscriptionInfo = {
  paymentType: 'subscription' | 'one-time';
  currentPeriodStart?: string | null;
  currentPeriodEnd?: string | null;
  amountPence?: number | null;
  managementToken?: string | null;
};

type TemplateOutput = { subject: string; html: string };

export const signupEmail = (
  production: ProductionInfo,
  sub: SubscriptionInfo,
): TemplateOutput => {
  const endNote = production.endDate
    ? `<p style="font-size: 13px; color: #667085;">Production ends: ${escapeHtml(formatDate(production.endDate))}.</p>`
    : '';
  const renewBlurb =
    sub.paymentType === 'subscription'
      ? `<p>We'll charge ${escapeHtml(formatGbp(sub.amountPence))} every month until you cancel or the production ends. Renewals stop automatically once the production finishes.</p>`
      : `<p>You've paid ${escapeHtml(formatGbp(sub.amountPence))} for one month of alerts. No auto-renew.</p>`;
  const body = `
    <p>You're now subscribed to standing-ticket alerts for <strong>${escapeHtml(production.name)}</strong> at ${escapeHtml(production.theatre)}${production.city ? `, ${escapeHtml(production.city)}` : ''}.</p>
    ${renewBlurb}
    <p>Current period: <strong>${escapeHtml(formatDate(sub.currentPeriodStart ?? null))}</strong> → <strong>${escapeHtml(formatDate(sub.currentPeriodEnd ?? null))}</strong>.</p>
    ${endNote}
    ${guaranteeHtml}
  `;
  return {
    subject: `Subscription confirmed: ${production.name}`,
    html: wrap(`You're subscribed to ${production.name}`, body, manageLink(sub.managementToken ?? null)),
  };
};

export const renewalEmail = (
  production: ProductionInfo,
  sub: SubscriptionInfo,
): TemplateOutput => {
  const body = `
    <p>We just renewed your alert subscription for <strong>${escapeHtml(production.name)}</strong>.</p>
    <p>Charged ${escapeHtml(formatGbp(sub.amountPence))} for the period <strong>${escapeHtml(formatDate(sub.currentPeriodStart ?? null))}</strong> → <strong>${escapeHtml(formatDate(sub.currentPeriodEnd ?? null))}</strong>.</p>
    ${guaranteeHtml}
  `;
  return {
    subject: `Renewal: ${production.name} (${formatGbp(sub.amountPence)})`,
    html: wrap(`Renewal confirmed: ${production.name}`, body, manageLink(sub.managementToken ?? null)),
  };
};

export const cancellationEmail = (
  production: ProductionInfo,
  sub: SubscriptionInfo,
  outcome: {
    refunded: boolean;
    refundAmountPence?: number | null;
    effective: 'immediately' | 'period_end';
    endsAt?: string | null;
    reason?: string;
  },
): TemplateOutput => {
  const header =
    outcome.effective === 'immediately'
      ? `Subscription cancelled: ${production.name}`
      : `Cancellation scheduled: ${production.name}`;
  const refundPara = outcome.refunded
    ? `<p style="padding: 12px 16px; background: #ecfdf5; border-radius: 8px; color: #065f46;">Because we didn't alert you to standing tickets during this billing period, we've issued a full refund of ${escapeHtml(formatGbp(outcome.refundAmountPence ?? sub.amountPence ?? null))}. It should land back on your card within 5–10 business days.</p>`
    : sub.paymentType === 'subscription' && outcome.effective === 'period_end'
      ? `<p>You'll keep receiving alerts until <strong>${escapeHtml(formatDate(outcome.endsAt ?? sub.currentPeriodEnd ?? null))}</strong>, then the subscription will end automatically.</p>`
      : `<p>We've stopped the subscription. No further charges will be taken.</p>`;
  const reasonPara = outcome.reason
    ? `<p style="font-size: 12px; color: #98a2b3;">Cancellation reason: ${escapeHtml(outcome.reason)}.</p>`
    : '';
  const body = `
    <p>This confirms that your subscription to <strong>${escapeHtml(production.name)}</strong> has been cancelled.</p>
    ${refundPara}
    ${reasonPara}
    ${guaranteeHtml}
  `;
  return {
    subject: header,
    html: wrap(header, body, manageLink(sub.managementToken ?? null)),
  };
};

export const expiryNoticeEmail = (
  production: ProductionInfo,
  sub: SubscriptionInfo,
  endsAt: string | null,
): TemplateOutput => {
  const body = `
    <p><strong>${escapeHtml(production.name)}</strong> has finished its run${production.endDate ? ` on <strong>${escapeHtml(formatDate(production.endDate))}</strong>` : ''}, so we're winding down your alert subscription.</p>
    <p>Your subscription will end on <strong>${escapeHtml(formatDate(endsAt))}</strong> (one week after the production's final performance). No more charges will be taken.</p>
    ${guaranteeHtml}
  `;
  return {
    subject: `${production.name} has ended — subscription closing soon`,
    html: wrap(`${production.name} has ended`, body, manageLink(sub.managementToken ?? null)),
  };
};

// Low-level send. Returns the Resend message id or null on failure; never
// throws, so callers can treat email sending as best-effort.
export const sendEmail = async ({
  to,
  subject,
  html,
}: {
  to: string;
  subject: string;
  html: string;
}): Promise<string | null> => {
  const apiKey = Deno.env.get('RESEND_API_KEY');
  if (!apiKey) {
    console.warn('RESEND_API_KEY missing — skipping email send');
    return null;
  }
  const fromEmail = Deno.env.get('RESEND_FROM_EMAIL') ?? 'onboarding@resend.dev';
  const resp = await fetch(RESEND_ENDPOINT, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: `Yellow Sticker <${fromEmail}>`,
      to: [to],
      subject,
      html,
    }),
  });
  if (!resp.ok) {
    const text = await resp.text().catch(() => '');
    console.error(`Resend failed: ${resp.status} ${text}`);
    return null;
  }
  const body = await resp.json().catch(() => ({}));
  return (body?.id as string | undefined) ?? null;
};

// Shared helper: read the per-production price in pence, with a sane
// default that matches the current launch price. Override per-environment
// via the `PRICE_PER_PRODUCTION_GBP_PENCE` secret.
export const priceGbpPence = (): number => {
  const raw = Deno.env.get('PRICE_PER_PRODUCTION_GBP_PENCE');
  if (!raw) return 200;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 200;
};

// Detect Stripe test vs live mode purely from the secret key prefix so we
// can log it once at startup. Never use the returned string to gate
// business logic — it's just for operator visibility.
export const stripeMode = (): 'test' | 'live' | 'unknown' => {
  const key = Deno.env.get('STRIPE_SECRET_KEY') ?? '';
  if (key.startsWith('sk_test_')) return 'test';
  if (key.startsWith('sk_live_')) return 'live';
  return 'unknown';
};
