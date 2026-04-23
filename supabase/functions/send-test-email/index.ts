// send-test-email: operator-only endpoint for smoke-testing each email
// template with realistic stub data. Intentionally simple — it takes
// `template` + optional `to` on the body, renders the chosen template,
// sends via Resend, and returns the message id.
//
// Auth: basic-auth against ADMIN_USERNAME / ADMIN_PASSWORD (the same
// credentials used by `/monitor`). We don't verify the admin-auth session
// token here because that token is random per-login and not persisted;
// basic-auth is the cheapest way to gate this safely.
import {
  cancellationEmail,
  expiryNoticeEmail,
  renewalEmail,
  sendEmail,
  signupEmail,
} from '../_shared/emails.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, x-admin-authorization',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const jsonResponse = (body: unknown, init: ResponseInit = {}) =>
  new Response(JSON.stringify(body), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    ...init,
  });

type Template =
  | 'signup-subscription'
  | 'signup-one-time'
  | 'renewal'
  | 'cancel-refund'
  | 'cancel-period-end'
  | 'cancel-production-ended'
  | 'expiry';

const TEMPLATES: readonly Template[] = [
  'signup-subscription',
  'signup-one-time',
  'renewal',
  'cancel-refund',
  'cancel-period-end',
  'cancel-production-ended',
  'expiry',
];

const stubProduction = {
  name: 'Hamilton',
  theatre: 'Victoria Palace Theatre',
  city: 'London',
  slug: 'hamilton',
  endDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
};

const stubSub = {
  paymentType: 'subscription' as const,
  currentPeriodStart: new Date(Date.now() - 15 * 24 * 60 * 60 * 1000).toISOString(),
  currentPeriodEnd: new Date(Date.now() + 15 * 24 * 60 * 60 * 1000).toISOString(),
  amountPence: 200,
  managementToken: '00000000-0000-0000-0000-000000000000',
};

const render = (template: Template) => {
  switch (template) {
    case 'signup-subscription':
      return signupEmail(stubProduction, stubSub);
    case 'signup-one-time':
      return signupEmail(stubProduction, { ...stubSub, paymentType: 'one-time' });
    case 'renewal':
      return renewalEmail(stubProduction, stubSub);
    case 'cancel-refund':
      return cancellationEmail(stubProduction, stubSub, {
        refunded: true,
        refundAmountPence: 200,
        effective: 'immediately',
        reason: 'Cancelled at your request',
      });
    case 'cancel-period-end':
      return cancellationEmail(stubProduction, stubSub, {
        refunded: false,
        effective: 'period_end',
        endsAt: stubSub.currentPeriodEnd,
        reason: 'Cancelled at your request',
      });
    case 'cancel-production-ended':
      return cancellationEmail(stubProduction, stubSub, {
        refunded: true,
        refundAmountPence: 200,
        effective: 'immediately',
        reason: 'Production has ended',
      });
    case 'expiry': {
      const endsAt = new Date(
        new Date(stubProduction.endDate).getTime() + 7 * 24 * 60 * 60 * 1000,
      ).toISOString();
      return expiryNoticeEmail(stubProduction, stubSub, endsAt);
    }
  }
};

// We can't rely on the standard `Authorization` header because Supabase
// consumes it for JWT verification on edge functions. Instead the admin
// basic-auth credential rides on `X-Admin-Authorization`.
const verifyBasicAuth = (req: Request): boolean => {
  const adminUsername = Deno.env.get('ADMIN_USERNAME');
  const adminPassword = Deno.env.get('ADMIN_PASSWORD');
  if (!adminUsername || !adminPassword) return false;
  const header = req.headers.get('x-admin-authorization') ?? '';
  if (!header.startsWith('Basic ')) return false;
  try {
    const decoded = atob(header.slice('Basic '.length));
    const [u, ...rest] = decoded.split(':');
    return u === adminUsername && rest.join(':') === adminPassword;
  } catch {
    return false;
  }
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }
  if (req.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, { status: 405 });
  }
  if (!verifyBasicAuth(req)) {
    return jsonResponse({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: { template?: string; to?: string } = {};
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: 'Invalid JSON' }, { status: 400 });
  }

  const template = body.template as Template | undefined;
  if (!template || !TEMPLATES.includes(template)) {
    return jsonResponse({ error: 'Unknown template', available: TEMPLATES }, { status: 400 });
  }

  const to = body.to ?? Deno.env.get('ALERT_EMAIL');
  if (!to) {
    return jsonResponse({ error: 'No recipient (set `to` in body or ALERT_EMAIL secret)' }, { status: 400 });
  }

  const { subject, html } = render(template);
  const messageId = await sendEmail({ to, subject, html });
  return jsonResponse({
    ok: messageId !== null,
    messageId,
    template,
    to,
    subject,
  });
});
