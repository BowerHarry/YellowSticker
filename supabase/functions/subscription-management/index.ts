// subscription-management: token-gated endpoint used by the web's
// `/manage?token=…` page. Supports:
//
//   GET  ?token=…  → subscription summary + refund guarantee snapshot.
//   POST ?token=…  → one of:
//     { action: 'cancel', cancelMode?: 'refund_now' | 'period_end' }
//     { action: 'update_preference', preference: 'email'|'telegram'|'both' }
//   Telegram deep links are minted in lifecycle emails (stripe-webhook,
//   request-manage-link), not from this endpoint.
//
// Cancel: if the refund guarantee applies, refund the last PaymentIntent
// and cancel immediately when requested; otherwise schedule cancel at
// period end (legacy path).
//
// The refund guarantee is:
//   "no standing tickets have been found since your last payment"
// which, in DB terms, is:
//   productions.last_standing_tickets_found_at IS NULL
//   OR productions.last_standing_tickets_found_at <= subscription.current_period_start
import Stripe from 'npm:stripe';
import { adminClient } from '../_shared/db.ts';
import type { ProductionRecord, UserRecord } from '../_shared/types.ts';
import { cancellationEmail, sendEmail, stripeMode } from '../_shared/emails.ts';

const stripeKey = Deno.env.get('STRIPE_SECRET_KEY');

if (!stripeKey) {
  throw new Error('STRIPE_SECRET_KEY is required');
}

const stripe = new Stripe(stripeKey, {
  apiVersion: '2024-09-30.acacia',
});

console.log(`subscription-management: stripe mode = ${stripeMode()}`);

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};

const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });

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
  stripe_session_id: string | null;
  stripe_subscription_id: string | null;
  management_token: string | null;
  cancellation_reason: string | null;
  created_at: string;
};

type CancelMode = 'refund_now' | 'period_end';

// Decide whether the "no tickets found since last payment" guarantee
// applies *right now* for this subscription. Returns a boolean + the data
// used to reach the decision so we can show it to the user on the manage
// page.
const computeRefundGuarantee = (
  subscription: SubscriptionRow,
  production: { last_standing_tickets_found_at: string | null } | null,
): { applies: boolean; since: string | null; lastFoundAt: string | null } => {
  const since = subscription.current_period_start ?? subscription.subscription_start;
  const lastFoundAt = production?.last_standing_tickets_found_at ?? null;
  if (!since) {
    // No period anchor means we've never recorded a charge → don't auto
    // refund, operator can handle it manually.
    return { applies: false, since: null, lastFoundAt };
  }
  if (!lastFoundAt) return { applies: true, since, lastFoundAt };
  return { applies: new Date(lastFoundAt) <= new Date(since), since, lastFoundAt };
};

const cancelStripeSide = async (
  subscription: SubscriptionRow,
  options: { immediate: boolean },
) => {
  let stripeSubscriptionId = subscription.stripe_subscription_id;

  // Legacy rows may not have `stripe_subscription_id` populated; fall back
  // to reading it off the original Checkout Session.
  if (!stripeSubscriptionId && subscription.stripe_session_id) {
    try {
      const session = await stripe.checkout.sessions.retrieve(subscription.stripe_session_id);
      if (session.mode === 'subscription' && session.subscription) {
        stripeSubscriptionId =
          typeof session.subscription === 'string' ? session.subscription : session.subscription.id;
      }
    } catch (error) {
      console.error('Could not resolve stripe_subscription_id from session:', error);
    }
  }

  if (!stripeSubscriptionId) return { cancelledImmediately: options.immediate };

  try {
    if (options.immediate) {
      await stripe.subscriptions.cancel(stripeSubscriptionId);
    } else {
      await stripe.subscriptions.update(stripeSubscriptionId, {
        cancel_at_period_end: true,
      });
    }
    return { cancelledImmediately: options.immediate };
  } catch (error) {
    console.error('Stripe cancellation failed:', error);
    throw error;
  }
};

const issueRefund = async (paymentIntentId: string): Promise<number | null> => {
  try {
    const refund = await stripe.refunds.create({
      payment_intent: paymentIntentId,
      reason: 'requested_by_customer',
    });
    return refund.amount ?? null;
  } catch (error) {
    console.error('Refund failed:', error);
    return null;
  }
};

const runSubscriptionCancel = async (
  sub: SubscriptionRow,
  cancelMode: CancelMode | undefined,
): Promise<Response> => {
  const { data: production } = await adminClient
    .from('productions')
    .select('*')
    .eq('id', sub.production_id)
    .maybeSingle();

  const guarantee = computeRefundGuarantee(sub, production);
  const refundEligible = guarantee.applies && !!sub.last_payment_intent_id;
  const selectedMode: CancelMode = cancelMode === 'period_end' ? 'period_end' : 'refund_now';
  const shouldRefund = selectedMode === 'refund_now' && refundEligible;
  const keepUntilPeriodEnd = selectedMode === 'period_end';

  // Cancel Stripe side first — either immediately (refund path) or at
  // period end (normal path for auto-renew subs that received value).
  const isAutoRenew = sub.payment_type === 'subscription';
  try {
    if (isAutoRenew) {
      await cancelStripeSide(sub, { immediate: shouldRefund });
    } else if (shouldRefund) {
      await cancelStripeSide(sub, { immediate: true });
    }
  } catch (error) {
    console.error('Error cancelling Stripe subscription:', error);
    // Continue — we still want to reflect user intent in our DB.
  }

  let refundedAmountPence: number | null = null;
  let refundStatus: 'refunded' | 'refund_failed' | 'skipped' = 'skipped';

  if (shouldRefund && sub.last_payment_intent_id) {
    const amount = await issueRefund(sub.last_payment_intent_id);
    if (amount != null) {
      refundedAmountPence = amount;
      refundStatus = 'refunded';
    } else {
      refundStatus = 'refund_failed';
    }
  }

  const newPaymentStatus = (() => {
    if (refundStatus === 'refunded') return 'refunded';
    if (refundStatus === 'refund_failed') return 'refund_failed';
    // Period-end choice keeps access alive (and alert-eligible) until
    // subscription_end, while preventing further renewal via Stripe
    // cancel_at_period_end.
    if (keepUntilPeriodEnd) return 'paid';
    // Legacy immediate-cancel path (e.g. one-time with no refund).
    return 'cancelled';
  })();

  const cancellationReason = (() => {
    if (refundStatus === 'refunded' || refundStatus === 'refund_failed') {
      return 'user_cancel_refund_now';
    }
    if (keepUntilPeriodEnd) return 'user_cancel_period_end';
    return 'user_cancel';
  })();

  const { error: updateError } = await adminClient
    .from('subscriptions')
    .update({
      payment_status: newPaymentStatus,
      cancellation_reason: cancellationReason,
    })
    .eq('id', sub.id);

  if (updateError) {
    console.error('Error updating subscription:', updateError);
    return jsonResponse({ error: 'Failed to cancel subscription' }, 500);
  }

  // Fire cancellation email (best-effort).
  try {
    const { data: user } = await adminClient
      .from('users')
      .select('*')
      .eq('id', sub.user_id)
      .maybeSingle();
    if (user?.email && production) {
      const effective = shouldRefund
        ? ('immediately' as const)
        : keepUntilPeriodEnd && isAutoRenew
          ? ('period_end' as const)
          : ('immediately' as const);
      const { subject, html } = cancellationEmail(
        {
          name: (production as ProductionRecord).name,
          theatre: (production as ProductionRecord).theatre,
          city: (production as ProductionRecord).city ?? null,
          slug: (production as ProductionRecord).slug,
          endDate: (production as ProductionRecord).end_date ?? null,
        },
        {
          paymentType: sub.payment_type ?? 'subscription',
          currentPeriodStart: sub.current_period_start,
          currentPeriodEnd: sub.subscription_end,
          amountPence: sub.last_charge_amount_pence,
          managementToken: sub.management_token,
        },
        {
          refunded: refundStatus === 'refunded',
          refundAmountPence: refundedAmountPence,
          effective,
          endsAt: sub.subscription_end,
          reason: 'Cancelled at your request',
        },
      );
      const messageId = await sendEmail({ to: (user as UserRecord).email ?? '', subject, html });
      if (messageId) {
        await adminClient.from('notification_logs').insert({
          user_id: sub.user_id,
          production_id: sub.production_id,
          type: 'email',
          channel_message_id: messageId,
          payload: {
            reason: 'subscription_cancelled',
            refunded: refundStatus === 'refunded',
            refundAmountPence: refundedAmountPence,
          },
        });
      }
    }
  } catch (emailError) {
    console.error('Failed to send cancellation email:', emailError);
  }

  const message = (() => {
    if (refundStatus === 'refunded') {
      return `Subscription cancelled and your most recent payment has been refunded in full (${(refundedAmountPence ?? 0) / 100} GBP). It may take 5–10 business days to land on your card.`;
    }
    if (refundStatus === 'refund_failed') {
      return 'Subscription cancelled. We tried to refund your last payment per our guarantee but the refund failed — we\'ll follow up manually shortly.';
    }
    if (keepUntilPeriodEnd) {
      return 'Subscription cancelled. You\'ll continue to receive alerts until the end of the current billing period.';
    }
    return 'Subscription cancelled.';
  })();

  return jsonResponse({
    success: true,
    message,
    refunded: refundStatus === 'refunded',
    refundAmountPence: refundedAmountPence,
    paymentStatus: newPaymentStatus,
  });
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders, status: 204 });
  }

  const url = new URL(req.url);
  const token = url.searchParams.get('token');

  if (!token) {
    return jsonResponse({ error: 'Missing management token' }, 400);
  }

  try {
    if (req.method === 'GET') {
      const { data: subscription, error } = await adminClient
        .from('subscriptions')
        .select(`
          id,
          payment_status,
          payment_type,
          cancellation_reason,
          subscription_start,
          subscription_end,
          current_period_start,
          last_charge_amount_pence,
          created_at,
          notification_preference,
          user:users (
            id,
            email,
            telegram_chat_id
          ),
          production:productions (
            id,
            name,
            slug,
            theatre,
            city,
            last_standing_tickets_found_at,
            end_date
          )
        `)
        .eq('management_token', token)
        .maybeSingle();

      if (error) {
        console.error('Error fetching subscription:', error);
        return jsonResponse({ error: 'Failed to load subscription' }, 500);
      }
      if (!subscription) {
        return jsonResponse({ error: 'Subscription not found' }, 404);
      }

      const now = new Date();
      const endDate = subscription.subscription_end ? new Date(subscription.subscription_end) : null;
      const isActive = subscription.payment_status === 'paid' && endDate && endDate > now;

      const guarantee = computeRefundGuarantee(
        subscription as unknown as SubscriptionRow,
        (subscription.production as { last_standing_tickets_found_at: string | null } | null) ?? null,
      );

      type UserJoin = {
        id: string;
        email: string | null;
        telegram_chat_id: number | string | null;
      };
      const rawUser = subscription.user as UserJoin | UserJoin[] | null;
      const userRow = Array.isArray(rawUser) ? rawUser[0] : rawUser;
      const subPref = (subscription as { notification_preference?: string }).notification_preference ?? 'email';
      const userPayload = userRow
        ? {
            id: userRow.id,
            email: userRow.email,
            telegramConnected: userRow.telegram_chat_id != null && userRow.telegram_chat_id !== '',
          }
        : null;

      return jsonResponse({
        subscription: {
          id: subscription.id,
          paymentStatus: subscription.payment_status,
          paymentType: subscription.payment_type ?? 'subscription',
          cancellationReason: subscription.cancellation_reason,
          subscriptionStart: subscription.subscription_start,
          subscriptionEnd: subscription.subscription_end,
          currentPeriodStart: subscription.current_period_start,
          lastChargeAmountPence: subscription.last_charge_amount_pence,
          createdAt: subscription.created_at,
          isActive,
          notificationPreference: subPref,
          user: userPayload,
          production: subscription.production,
          refundGuarantee: {
            applies: guarantee.applies,
            since: guarantee.since,
            lastTicketsFoundAt: guarantee.lastFoundAt,
          },
        },
      });
    }

    if (req.method === 'POST') {
      let bodyJson: { action?: string; cancelMode?: CancelMode; preference?: string };
      try {
        bodyJson = (await req.json()) as typeof bodyJson;
      } catch {
        return jsonResponse({ error: 'Invalid JSON' }, 400);
      }

      const { data: subscription, error: fetchError } = await adminClient
        .from('subscriptions')
        .select('*')
        .eq('management_token', token)
        .maybeSingle();

      if (fetchError) {
        console.error('Error fetching subscription:', fetchError);
        return jsonResponse({ error: 'Failed to load subscription' }, 500);
      }
      if (!subscription) {
        return jsonResponse({ error: 'Subscription not found' }, 404);
      }

      const sub = subscription as unknown as SubscriptionRow;
      const action = bodyJson.action;

      if (action === 'update_preference') {
        const pref = bodyJson.preference;
        if (pref !== 'email' && pref !== 'telegram' && pref !== 'both') {
          return jsonResponse({ error: 'Invalid preference' }, 400);
        }
        const { error: upErr } = await adminClient
          .from('subscriptions')
          .update({ notification_preference: pref })
          .eq('id', sub.id);
        if (upErr) {
          console.error(upErr);
          return jsonResponse({ error: 'Failed to update preference' }, 500);
        }
        return jsonResponse({ success: true });
      }

      if (action === 'cancel') {
        return runSubscriptionCancel(sub, bodyJson.cancelMode);
      }

      return jsonResponse({ error: 'Invalid action' }, 400);
    }

    return jsonResponse({ error: 'Method not allowed' }, 405);
  } catch (error) {
    console.error('Subscription management error:', error);
    return jsonResponse({ error: 'Unexpected server error' }, 500);
  }
});
