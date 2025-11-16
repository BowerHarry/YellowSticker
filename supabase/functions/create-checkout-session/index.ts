import Stripe from 'npm:stripe';
import { adminClient } from '../_shared/db.ts';
import type { SubscriptionPayload } from '../_shared/types.ts';

const stripeKey = Deno.env.get('STRIPE_SECRET_KEY');
const siteUrl = Deno.env.get('PUBLIC_SITE_URL') ?? 'http://localhost:5173';

if (!stripeKey) {
  throw new Error('STRIPE_SECRET_KEY is required');
}

const stripe = new Stripe(stripeKey, {
  apiVersion: '2024-09-30.acacia',
});

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

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders, status: 204 });
  }

  try {
    const payload = (await req.json()) as SubscriptionPayload & { paymentType?: 'subscription' | 'one-time' };
    if (!payload?.email || !payload.productionId) {
      return jsonResponse({ error: 'Missing fields' }, 400);
    }

    const paymentType = payload.paymentType || 'subscription'; // Default to subscription

    const { data: production, error: productionError } = await adminClient
      .from('productions')
      .select('*')
      .eq('id', payload.productionId)
      .single();

    if (productionError || !production) {
      return jsonResponse({ error: 'Production not found' }, 404);
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

    // Create checkout session based on payment type
    const baseMetadata = {
      user_id: user.id,
      production_id: production.id,
      payment_type: paymentType,
    };

    const session = paymentType === 'subscription'
      ? await stripe.checkout.sessions.create({
          mode: 'subscription',
          currency: 'gbp',
          metadata: baseMetadata,
          subscription_data: {
            metadata: baseMetadata,
          },
          line_items: [
            {
              quantity: 1,
              price_data: {
                currency: 'gbp',
                unit_amount: 499,
                recurring: {
                  interval: 'month',
                },
                product_data: {
                  name: `${production.name} alerts`,
                  description: 'Yellow Sticker monthly standing ticket notifications (auto-renew)',
                },
              },
            },
          ],
          success_url: `${siteUrl}/checkout/success?session_id={CHECKOUT_SESSION_ID}`,
          cancel_url: `${siteUrl}/productions/${payload.productionSlug}?cancelled=true`,
        })
      : await stripe.checkout.sessions.create({
          mode: 'payment', // One-time payment
          currency: 'gbp',
          metadata: baseMetadata,
          line_items: [
            {
              quantity: 1,
              price_data: {
                currency: 'gbp',
                unit_amount: 499,
                product_data: {
                  name: `${production.name} alerts`,
                  description: 'Yellow Sticker 1-month standing ticket notifications',
                },
              },
            },
          ],
          success_url: `${siteUrl}/checkout/success?session_id={CHECKOUT_SESSION_ID}`,
          cancel_url: `${siteUrl}/productions/${payload.productionSlug}?cancelled=true`,
        });

    if (!session.url) {
      return jsonResponse({ error: 'Unable to start checkout' }, 500);
    }

    if (existingSubscription) {
      await adminClient
        .from('subscriptions')
        .update({
          payment_status: 'pending',
          subscription_start: null,
          subscription_end: null,
          stripe_session_id: session.id,
        })
        .eq('id', existingSubscription.id);
    } else {
      await adminClient.from('subscriptions').insert({
        user_id: user.id,
        production_id: production.id,
        payment_status: 'pending',
        stripe_session_id: session.id,
      });
    }

    return jsonResponse({ checkoutUrl: session.url });
  } catch (error) {
    console.error(error);
    return jsonResponse({ error: 'Unexpected server error' }, 500);
  }
});

