// admin-preview-cancel: operator-only, read-only "what would happen if
// this subscription were cancelled right now?" endpoint. Mirrors the
// exact guarantee logic used by `subscription-management` so the admin
// panel and the user-facing manage page always agree.
//
// Lookup flexibility: accept `subscriptionId`, `managementToken`, OR
// `{ email, productionSlug }`. Returns a normalized preview object with
// no DB writes and no Stripe API calls.
//
// Auth: X-Admin-Authorization basic-auth, same pattern as
// `send-test-email`.
import { adminClient } from '../_shared/db.ts';
import { priceGbpPence, stripeMode } from '../_shared/emails.ts';

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

type SubscriptionRow = {
  id: string;
  user_id: string;
  production_id: string;
  payment_status: string;
  payment_type: 'subscription' | 'one-time' | null;
  subscription_start: string | null;
  subscription_end: string | null;
  current_period_start: string | null;
  last_payment_intent_id: string | null;
  last_charge_amount_pence: number | null;
  last_alerted_at: string | null;
  stripe_subscription_id: string | null;
  stripe_session_id: string | null;
  management_token: string | null;
  cancellation_reason: string | null;
  is_test_mode: boolean | null;
  created_at: string;
};

type ProductionRow = {
  id: string;
  name: string;
  slug: string;
  theatre: string;
  end_date: string | null;
  last_standing_tickets_found_at: string | null;
  last_availability_transition_at: string | null;
};

type UserRow = { id: string; email: string | null };

const SUB_COLUMNS =
  'id,user_id,production_id,payment_status,payment_type,subscription_start,subscription_end,current_period_start,last_payment_intent_id,last_charge_amount_pence,last_alerted_at,stripe_subscription_id,stripe_session_id,management_token,cancellation_reason,is_test_mode,created_at';

const PROD_COLUMNS =
  'id,name,slug,theatre,end_date,last_standing_tickets_found_at,last_availability_transition_at';

// Look up exactly one subscription given flexible selector inputs.
// Returns null + an `error` message if the selector is ambiguous or
// unresolved.
const findSubscription = async (selector: {
  subscriptionId?: string;
  managementToken?: string;
  email?: string;
  productionSlug?: string;
}): Promise<{ sub: SubscriptionRow | null; error?: string }> => {
  if (selector.subscriptionId) {
    const { data, error } = await adminClient
      .from('subscriptions')
      .select(SUB_COLUMNS)
      .eq('id', selector.subscriptionId)
      .maybeSingle();
    if (error) return { sub: null, error: error.message };
    return { sub: (data as SubscriptionRow | null) ?? null };
  }
  if (selector.managementToken) {
    const { data, error } = await adminClient
      .from('subscriptions')
      .select(SUB_COLUMNS)
      .eq('management_token', selector.managementToken)
      .maybeSingle();
    if (error) return { sub: null, error: error.message };
    return { sub: (data as SubscriptionRow | null) ?? null };
  }
  if (selector.email && selector.productionSlug) {
    const { data: user, error: userError } = await adminClient
      .from('users')
      .select('id')
      .eq('email', selector.email)
      .maybeSingle();
    if (userError) return { sub: null, error: userError.message };
    if (!user) return { sub: null, error: 'No user with that email' };

    const { data: production, error: prodError } = await adminClient
      .from('productions')
      .select('id')
      .eq('slug', selector.productionSlug)
      .maybeSingle();
    if (prodError) return { sub: null, error: prodError.message };
    if (!production) return { sub: null, error: 'No production with that slug' };

    // Prefer the most recently created subscription so reruns pick up the
    // currently-active one rather than an old cancelled record.
    const { data, error } = await adminClient
      .from('subscriptions')
      .select(SUB_COLUMNS)
      .eq('user_id', (user as { id: string }).id)
      .eq('production_id', (production as { id: string }).id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) return { sub: null, error: error.message };
    return { sub: (data as SubscriptionRow | null) ?? null };
  }
  return {
    sub: null,
    error: 'Provide subscriptionId, managementToken, or (email + productionSlug).',
  };
};

const computeRefundGuarantee = (
  sub: SubscriptionRow,
  production: ProductionRow | null,
) => {
  const since = sub.current_period_start ?? sub.subscription_start;
  const lastFoundAt = production?.last_standing_tickets_found_at ?? null;
  if (!since) {
    return { applies: false, since: null, lastFoundAt, explanation: 'No period anchor on subscription; operator must decide manually.' };
  }
  if (!lastFoundAt) {
    return {
      applies: true,
      since,
      lastFoundAt,
      explanation: `No standing tickets have ever been found for this production; full refund owed since ${since}.`,
    };
  }
  const applies = new Date(lastFoundAt) <= new Date(since);
  return {
    applies,
    since,
    lastFoundAt,
    explanation: applies
      ? `Last standing tickets found at ${lastFoundAt} was on or before period start ${since} — guarantee applies.`
      : `Standing tickets were found at ${lastFoundAt}, after period start ${since} — guarantee does not apply.`,
  };
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

  let body: {
    subscriptionId?: string;
    managementToken?: string;
    email?: string;
    productionSlug?: string;
  } = {};
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { sub, error } = await findSubscription(body);
  if (error) return jsonResponse({ error }, { status: 400 });
  if (!sub) return jsonResponse({ error: 'Subscription not found' }, { status: 404 });

  const [prodRes, userRes, alertsRes] = await Promise.all([
    adminClient
      .from('productions')
      .select(PROD_COLUMNS)
      .eq('id', sub.production_id)
      .maybeSingle(),
    adminClient.from('users').select('id,email').eq('id', sub.user_id).maybeSingle(),
    adminClient
      .from('notification_logs')
      .select('sent_at,channel_message_id,payload')
      .eq('user_id', sub.user_id)
      .eq('production_id', sub.production_id)
      .order('sent_at', { ascending: false })
      .limit(10),
  ]);

  const production = (prodRes.data as ProductionRow | null) ?? null;
  const user = (userRes.data as UserRow | null) ?? null;
  const recentAlerts = (alertsRes.data ?? []).map((row) => ({
    sentAt: (row as { sent_at: string }).sent_at,
    channelMessageId: (row as { channel_message_id: string | null }).channel_message_id,
    reason: ((row as { payload: Record<string, unknown> | null }).payload?.reason as string | null) ?? null,
  }));

  const guarantee = computeRefundGuarantee(sub, production);
  const canRefund = guarantee.applies && !!sub.last_payment_intent_id;

  // If the runtime Stripe mode doesn't match the row's recorded mode,
  // any cancel/refund call would hit Stripe with an ID that doesn't
  // exist in the current namespace. Surface this loudly so admins
  // don't debug the resulting "No such subscription" errors from
  // scratch each time.
  const runtimeMode = stripeMode();
  const rowMode: 'test' | 'live' = sub.is_test_mode ? 'test' : 'live';
  const modeMismatch =
    runtimeMode !== 'unknown' && runtimeMode !== rowMode;

  // Describe the exact Stripe + DB actions that would happen. Keep this
  // text human-readable — it's rendered verbatim in the admin UI.
  const stripeActions: string[] = [];
  if (sub.payment_status !== 'paid') {
    stripeActions.push(
      `No-op: payment_status is "${sub.payment_status}", already inactive.`,
    );
  } else if (canRefund) {
    stripeActions.push(
      `Refund PaymentIntent ${sub.last_payment_intent_id} (~£${((sub.last_charge_amount_pence ?? priceGbpPence()) / 100).toFixed(2)})`,
    );
    if (sub.payment_type === 'subscription') {
      stripeActions.push(
        sub.stripe_subscription_id
          ? `Cancel Stripe subscription ${sub.stripe_subscription_id} immediately`
          : 'Cancel Stripe subscription immediately (id will be resolved from Checkout Session)',
      );
    }
  } else if (sub.payment_type === 'subscription') {
    stripeActions.push(
      sub.stripe_subscription_id
        ? `Set cancel_at_period_end=true on Stripe subscription ${sub.stripe_subscription_id}`
        : 'Set cancel_at_period_end=true on Stripe subscription (id will be resolved from Checkout Session)',
    );
  } else {
    stripeActions.push('No Stripe action (one-time payment, no refund owed).');
  }

  const effective: 'immediately' | 'period_end' | 'n/a' =
    sub.payment_status !== 'paid'
      ? 'n/a'
      : canRefund
        ? 'immediately'
        : sub.payment_type === 'subscription'
          ? 'period_end'
          : 'immediately';

  const newPaymentStatus: string =
    sub.payment_status !== 'paid'
      ? sub.payment_status
      : canRefund
        ? 'refunded'
        : 'cancelled';

  return jsonResponse({
    subscription: {
      id: sub.id,
      userId: sub.user_id,
      userEmail: user?.email ?? null,
      productionId: sub.production_id,
      paymentStatus: sub.payment_status,
      paymentType: sub.payment_type,
      subscriptionStart: sub.subscription_start,
      subscriptionEnd: sub.subscription_end,
      currentPeriodStart: sub.current_period_start,
      lastChargeAmountPence: sub.last_charge_amount_pence,
      lastPaymentIntentId: sub.last_payment_intent_id,
      lastAlertedAt: sub.last_alerted_at,
      stripeSubscriptionId: sub.stripe_subscription_id,
      stripeSessionId: sub.stripe_session_id,
      managementToken: sub.management_token,
      cancellationReason: sub.cancellation_reason,
      isTestMode: !!sub.is_test_mode,
      createdAt: sub.created_at,
    },
    production: production
      ? {
          id: production.id,
          name: production.name,
          slug: production.slug,
          theatre: production.theatre,
          endDate: production.end_date,
          lastStandingTicketsFoundAt: production.last_standing_tickets_found_at,
          lastAvailabilityTransitionAt: production.last_availability_transition_at,
        }
      : null,
    recentAlerts,
    preview: {
      refundEligible: canRefund,
      reason: guarantee.explanation,
      refundAmountPence: canRefund
        ? (sub.last_charge_amount_pence ?? priceGbpPence())
        : 0,
      effective,
      newPaymentStatus,
      stripeActions,
      guarantee,
      mode: {
        runtime: runtimeMode,
        row: rowMode,
        mismatch: modeMismatch,
      },
    },
  });
});
