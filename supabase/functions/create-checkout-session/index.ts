// create-checkout-session: builds a Stripe Checkout Session for a single
// production's alerts, for either a recurring subscription or a one-off
// single-month payment. The Checkout URL is returned; Stripe posts back to
// `stripe-webhook` when payment completes.
//
// The `STRIPE_SECRET_KEY` env var decides whether we're in Stripe test or
// live mode (`sk_test_*` vs `sk_live_*`). We log the detected mode on
// startup so operators can tell at a glance which side of the wall a given
// edge function deployment is talking to.
import Stripe from 'npm:stripe';
import { adminClient } from '../_shared/db.ts';
import type { SubscriptionPayload } from '../_shared/types.ts';
import { priceGbpPence, stripeMode, siteUrl } from '../_shared/emails.ts';

const stripeKey = Deno.env.get('STRIPE_SECRET_KEY');

if (!stripeKey) {
  throw new Error('STRIPE_SECRET_KEY is required');
}

const stripe = new Stripe(stripeKey, {
  apiVersion: '2024-09-30.acacia',
});

console.log(`create-checkout-session: stripe mode = ${stripeMode()}`);

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });

const ensureUser = async (payload: SubscriptionPayload) => {
  const { data: existingUser } = await adminClient
    .from('users')
    .select('*')
    .eq('email', payload.email.toLowerCase())
    .maybeSingle();

  if (existingUser) {
    await adminClient
      .from('users')
      .update({
        phone: payload.phone ?? existingUser.phone,
        notification_preference: payload.preference,
      })
      .eq('id', existingUser.id);
    return existingUser;
  }

  const { data, error } = await adminClient
    .from('users')
    .insert({
      email: payload.email.toLowerCase(),
      phone: payload.phone,
      notification_preference: payload.preference,
    })
    .select('*')
    .single();

  if (error || !data) {
    throw error ?? new Error('Failed to create user');
  }

  return data;
};

// Stripe's subscription model lets us schedule an automatic cancellation
// at a specific future timestamp via `cancel_at`. Using this we implement
// the guarantee: auto-renew subscriptions keep alerting the user until
// 7 days after the production's final performance, then stop themselves.
const cancelAtFromEndDate = (endDate: string | null | undefined): number | null => {
  if (!endDate) return null;
  const d = new Date(endDate);
  if (Number.isNaN(d.getTime())) return null;
  const cancelAt = new Date(d);
  cancelAt.setUTCDate(cancelAt.getUTCDate() + 7);
  return Math.floor(cancelAt.getTime() / 1000);
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders, status: 204 });
  }

  try {
    const payload = (await req.json()) as SubscriptionPayload & { paymentType?: 'subscription' | 'one-time' };
    if (!payload?.email || !payload.productionId) {
      return jsonResponse({ error: 'Missing fields' }, 400);
    }

    const paymentType = payload.paymentType || 'subscription';

    const { data: production, error: productionError } = await adminClient
      .from('productions')
      .select('*')
      .eq('id', payload.productionId)
      .single();

    if (productionError || !production) {
      return jsonResponse({ error: 'Production not found' }, 404);
    }

    // Belt-and-braces: if the production has already ended, refuse to take
    // a new payment — the user's money would just be refunded immediately
    // by the webhook, which makes for a worse UX than blocking upfront.
    if (production.end_date) {
      const endMs = new Date(production.end_date).getTime();
      if (Number.isFinite(endMs) && endMs < Date.now()) {
        return jsonResponse(
          { error: 'This production has already finished its run — no new subscriptions can be taken.' },
          410,
        );
      }
    }

    const user = await ensureUser(payload);

    const { data: existingSubscription } = await adminClient
      .from('subscriptions')
      .select('*')
      .eq('user_id', user.id)
      .eq('production_id', production.id)
      .maybeSingle();

    if (existingSubscription && existingSubscription.payment_status === 'paid') {
      const stillActive =
        existingSubscription.subscription_end && new Date(existingSubscription.subscription_end) > new Date();
      if (stillActive) {
        return jsonResponse({ error: 'You already have an active subscription for this production.' }, 409);
      }
    }

    const unitAmount = priceGbpPence();

    const baseMetadata = {
      user_id: user.id,
      production_id: production.id,
      payment_type: paymentType,
    };

    const productDescription =
      paymentType === 'subscription'
        ? 'Yellow Sticker monthly standing-ticket alerts (auto-renew, cancel any time)'
        : 'Yellow Sticker 1-month standing-ticket alerts';

    const cancelAt = paymentType === 'subscription' ? cancelAtFromEndDate(production.end_date) : null;

    const commonLineItems = [
      {
        quantity: 1,
        price_data: {
          currency: 'gbp',
          unit_amount: unitAmount,
          ...(paymentType === 'subscription' ? { recurring: { interval: 'month' as const } } : {}),
          product_data: {
            name: `${production.name} alerts`,
            description: productDescription,
          },
        },
      },
    ];

    const session = paymentType === 'subscription'
      ? await stripe.checkout.sessions.create({
          mode: 'subscription',
          currency: 'gbp',
          customer_email: user.email ?? undefined,
          metadata: baseMetadata,
          subscription_data: {
            metadata: baseMetadata,
            ...(cancelAt ? { cancel_at: cancelAt } : {}),
          },
          line_items: commonLineItems,
          success_url: `${siteUrl()}/checkout/success?session_id={CHECKOUT_SESSION_ID}`,
          cancel_url: `${siteUrl()}/productions/${payload.productionSlug}?cancelled=true`,
        })
      : await stripe.checkout.sessions.create({
          mode: 'payment',
          currency: 'gbp',
          customer_email: user.email ?? undefined,
          metadata: baseMetadata,
          payment_intent_data: {
            metadata: baseMetadata,
          },
          line_items: commonLineItems,
          success_url: `${siteUrl()}/checkout/success?session_id={CHECKOUT_SESSION_ID}`,
          cancel_url: `${siteUrl()}/productions/${payload.productionSlug}?cancelled=true`,
        });

    if (!session.url) {
      return jsonResponse({ error: 'Unable to start checkout' }, 500);
    }

    // Stamp the Stripe runtime mode onto the row so admins can later
    // tell test rows from live rows without calling Stripe. This is the
    // canonical source of truth for which environment the row belongs
    // to — Stripe IDs themselves don't carry that signal.
    const isTestMode = stripeMode() === 'test';

    if (existingSubscription) {
      await adminClient
        .from('subscriptions')
        .update({
          payment_status: 'pending',
          subscription_start: null,
          subscription_end: null,
          current_period_start: null,
          last_payment_intent_id: null,
          last_charge_amount_pence: null,
          payment_type: paymentType,
          cancellation_reason: null,
          stripe_session_id: session.id,
          is_test_mode: isTestMode,
        })
        .eq('id', existingSubscription.id);
    } else {
      await adminClient.from('subscriptions').insert({
        user_id: user.id,
        production_id: production.id,
        payment_status: 'pending',
        payment_type: paymentType,
        stripe_session_id: session.id,
        is_test_mode: isTestMode,
      });
    }

    return jsonResponse({ checkoutUrl: session.url });
  } catch (error) {
    console.error(error);
    return jsonResponse({ error: 'Unexpected server error' }, 500);
  }
});
