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

// Default to the Cloudflare Pages deployment so emails sent from a
// misconfigured Supabase project still link somewhere useful rather than
// to the developer's localhost. Override via `PUBLIC_SITE_URL` for
// custom domains.
export const siteUrl = (): string =>
  Deno.env.get('PUBLIC_SITE_URL') ?? 'https://yellowsticker.pages.dev';

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
  /** Present when the user should open Telegram once to link alerts (signup / renewal / magic link). */
  telegramConnectUrl?: string | null;
};

type TemplateOutput = { subject: string; html: string };

const telegramConnectSection = (url: string): string => `
  <div style="padding:18px;background:#fefce8;border-radius:10px;margin:20px 0;border:1px solid rgba(234,179,8,0.45);">
    <p style="margin:0 0 8px 0;font-weight:700;color:#713f12;font-size:16px;">Connect Telegram for drop alerts</p>
    <p style="margin:0 0 14px 0;font-size:14px;color:#422006;line-height:1.55;">
      Open the link on the device where you use Telegram, then tap <strong>Start</strong>. You only need to do this once per account.
    </p>
    <a href="${escapeHtml(url)}" style="display:inline-block;padding:10px 18px;background:#24A1DE;color:#fff;border-radius:8px;text-decoration:none;font-weight:600;font-size:14px;">Open Telegram and connect</a>
    <p style="margin:14px 0 0 0;font-size:12px;color:#667085;line-height:1.45;">If the button does not work, copy this link into your browser:<br><span style="word-break:break-all;">${escapeHtml(url)}</span></p>
  </div>
`;

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
  const tg =
    sub.telegramConnectUrl && sub.telegramConnectUrl.trim().length > 0
      ? telegramConnectSection(sub.telegramConnectUrl.trim())
      : '';
  const body = `
    <p>You're now subscribed to standing-ticket alerts for <strong>${escapeHtml(production.name)}</strong> at ${escapeHtml(production.theatre)}${production.city ? `, ${escapeHtml(production.city)}` : ''}.</p>
    ${renewBlurb}
    <p>Current period: <strong>${escapeHtml(formatDate(sub.currentPeriodStart ?? null))}</strong> → <strong>${escapeHtml(formatDate(sub.currentPeriodEnd ?? null))}</strong>.</p>
    ${tg}
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
  const tg =
    sub.telegramConnectUrl && sub.telegramConnectUrl.trim().length > 0
      ? telegramConnectSection(sub.telegramConnectUrl.trim())
      : '';
  const body = `
    <p>We just renewed your alert subscription for <strong>${escapeHtml(production.name)}</strong>.</p>
    <p>Charged ${escapeHtml(formatGbp(sub.amountPence))} for the period <strong>${escapeHtml(formatDate(sub.currentPeriodStart ?? null))}</strong> → <strong>${escapeHtml(formatDate(sub.currentPeriodEnd ?? null))}</strong>.</p>
    ${tg}
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

// The Delfont box-office URL always has the form
//   https://buytickets.delfontmackintosh.co.uk/tickets/series/<SERIES_CODE>/
// and the `series_code` on each production is the canonical source of
// truth. Prefer rebuilding from the code rather than using
// `scraping_url`, which can drift (trailing slashes, query strings,
// legacy paths). Fall back to `scraping_url` only when we have no
// series code (e.g. future non-Delfont adapters).
const DELFONT_SERIES_BASE = 'https://buytickets.delfontmackintosh.co.uk/tickets/series';

const boxOfficeUrl = (
  seriesCode: string | null | undefined,
  fallback: string,
): string => {
  if (seriesCode && seriesCode.trim()) {
    return `${DELFONT_SERIES_BASE}/${encodeURIComponent(seriesCode.trim())}/`;
  }
  return fallback;
};

export const availabilityEmail = (
  production: ProductionInfo & {
    scrapingUrl: string;
    seriesCode?: string | null;
  },
  sub: SubscriptionInfo,
  counts: { standCount: number | null; performanceCount: number | null },
): TemplateOutput => {
  const href = boxOfficeUrl(production.seriesCode ?? null, production.scrapingUrl);
  const countLine =
    counts.standCount != null
      ? `<p style="margin: 0 0 12px 0;">Found <strong>${counts.standCount}</strong> standing ticket${counts.standCount === 1 ? '' : 's'}${counts.performanceCount != null ? ` across <strong>${counts.performanceCount}</strong> performance${counts.performanceCount === 1 ? '' : 's'} today` : ''}.</p>`
      : '';
  const body = `
    <p style="margin: 0 0 12px 0; font-size: 16px;">Standing tickets appear to be available at <strong>${escapeHtml(production.theatre)}</strong> right now.</p>
    ${countLine}
    <p style="margin: 16px 0;">
      <a href="${escapeHtml(href)}" style="display: inline-block; padding: 10px 16px; background: #eab308; color: #0b0b0c; border-radius: 8px; text-decoration: none; font-weight: 600;">Open the box office page</a>
    </p>
    <p style="font-size: 13px; color: #667085;">These drops go fast. Click through, sign in if needed, and grab a ticket before the queue forms.</p>
  `;
  return {
    subject: `🎟️ Standing tickets: ${production.name}`,
    html: wrap(`Standing tickets spotted: ${production.name}`, body, manageLink(sub.managementToken ?? null)),
  };
};

/** Compact HTML for Telegram (<b>, <a>, <i> only) — mirrors {@link availabilityEmail} content. */
/** Short Telegram HTML after checkout when alerts include Telegram. */
export const signupTelegramWelcomeHtml = (productionName: string, managementToken?: string | null): string => {
  const manage = manageLink(managementToken ?? null);
  let body = `<b>Yellow Sticker</b>\n\nYou're subscribed for standing-ticket alerts for <b>${escapeHtml(productionName)}</b>. We'll message you here when tickets look available.`;
  if (manage) {
    body += `\n\n<a href="${escapeHtml(manage)}">Manage subscription</a>`;
  }
  return body;
};

export const cancellationTelegramHtml = (
  productionName: string,
  reason?: string | null,
  managementToken?: string | null,
): string => {
  const manage = manageLink(managementToken ?? null);
  let body = `<b>Yellow Sticker</b>\n\nYour subscription for <b>${escapeHtml(productionName)}</b> has ended.`;
  if (reason && reason.trim().length > 0) {
    body += `\n\nReason: ${escapeHtml(reason.trim())}.`;
  }
  if (manage) {
    body += `\n\n<a href="${escapeHtml(manage)}">Manage subscription</a>`;
  }
  return body;
};

export const availabilityTelegramHtml = (
  production: ProductionInfo & {
    scrapingUrl: string;
    seriesCode?: string | null;
  },
  sub: SubscriptionInfo,
  counts: { standCount: number | null; performanceCount: number | null },
): string => {
  const href = boxOfficeUrl(production.seriesCode ?? null, production.scrapingUrl);
  const manage = manageLink(sub.managementToken ?? null);
  let body = `<b>${escapeHtml(production.name)}</b>\n\n`;
  body += `Standing tickets look available at <b>${escapeHtml(production.theatre)}</b> right now.`;
  if (counts.standCount != null) {
    body += `\n\nFound <b>${counts.standCount}</b> standing ticket${counts.standCount === 1 ? '' : 's'}`;
    if (counts.performanceCount != null) {
      body += ` across <b>${counts.performanceCount}</b> performance${counts.performanceCount === 1 ? '' : 's'} today.`;
    } else {
      body += '.';
    }
  }
  body += `\n\n<a href="${escapeHtml(href)}">Open the box office page</a>`;
  if (manage) {
    body += `\n\n<a href="${escapeHtml(manage)}">Manage subscription</a>`;
  }
  body += `\n\n<i>Yellow Sticker</i>`;
  return body;
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

export const accountAccessEmail = (
  entries: Array<{
    productionName: string;
    theatre: string;
    city?: string | null;
    managementToken: string;
    isActive: boolean;
    subscriptionEnd?: string | null;
  }>,
  options?: { telegramConnectUrl?: string | null },
): TemplateOutput => {
  const intro =
    entries.length === 1
      ? `<p>Use the secure link below to manage your Yellow Sticker subscription.</p>`
      : `<p>Use the secure links below to manage your Yellow Sticker subscriptions.</p>`;
  const tg =
    options?.telegramConnectUrl && options.telegramConnectUrl.trim().length > 0
      ? telegramConnectSection(options.telegramConnectUrl.trim())
      : '';
  const rows = entries
    .map((entry) => {
      const href = manageLink(entry.managementToken) ?? siteUrl();
      const status = entry.isActive
        ? `<span style="color:#065f46;background:#ecfdf5;border-radius:999px;padding:2px 8px;font-size:11px;">Active</span>`
        : `<span style="color:#92400e;background:#fffbeb;border-radius:999px;padding:2px 8px;font-size:11px;">Inactive</span>`;
      const endLine =
        entry.subscriptionEnd && !entry.isActive
          ? `<div style="font-size:12px;color:#98a2b3;margin-top:4px;">Ended ${escapeHtml(formatDate(entry.subscriptionEnd))}</div>`
          : '';
      return `
        <tr>
          <td style="padding: 12px 0; border-top: 1px solid #eee;">
            <div style="font-weight: 600; margin-bottom: 4px;">${escapeHtml(entry.productionName)} ${status}</div>
            <div style="font-size: 13px; color: #667085;">${escapeHtml(entry.theatre)}${entry.city ? `, ${escapeHtml(entry.city)}` : ''}</div>
            ${endLine}
            <div style="margin-top: 8px;">
              <a href="${escapeHtml(href)}" style="display:inline-block;padding:8px 12px;background:#eab308;color:#0b0b0c;border-radius:8px;text-decoration:none;font-weight:600;font-size:13px;">Manage this subscription</a>
            </div>
          </td>
        </tr>`;
    })
    .join('');
  const body = `
    ${intro}
    ${tg}
    <p style="font-size: 13px; color: #667085;">If you didn't request this email, you can safely ignore it.</p>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top: 12px;">
      ${rows}
    </table>
  `;
  return {
    subject: 'Your Yellow Sticker login links',
    html: wrap('Manage your subscriptions', body, null),
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
