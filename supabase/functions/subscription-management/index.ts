import { adminClient } from '../_shared/db.ts';
import Stripe from 'npm:stripe';

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
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};

const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });

// Generate a secure random token
const generateManagementToken = () => {
  // Use crypto.randomUUID() for secure token generation
  return crypto.randomUUID();
};

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders, status: 204 });
  }

  const url = new URL(req.url);
  const token = url.searchParams.get('token');

  if (!token) {
    return jsonResponse({ error: 'Missing management token' }, 400);
  }

  try {
    // GET: View subscription details
    if (req.method === 'GET') {
      const { data: subscription, error } = await adminClient
        .from('subscriptions')
        .select(`
          id,
          payment_status,
          subscription_start,
          subscription_end,
          created_at,
          user:users (
            id,
            email,
            notification_preference
          ),
          production:productions (
            id,
            name,
            slug,
            theatre,
            city
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

      // Check if subscription is still active
      const now = new Date();
      const endDate = subscription.subscription_end ? new Date(subscription.subscription_end) : null;
      const isActive = subscription.payment_status === 'paid' && 
                       endDate && 
                       endDate > now;

      return jsonResponse({
        subscription: {
          id: subscription.id,
          paymentStatus: subscription.payment_status,
          subscriptionStart: subscription.subscription_start,
          subscriptionEnd: subscription.subscription_end,
          createdAt: subscription.created_at,
          isActive,
          user: subscription.user,
          production: subscription.production,
        },
      });
    }

    // POST: Cancel subscription
    if (req.method === 'POST') {
      const { action } = await req.json() as { action?: string };

      if (action !== 'cancel') {
        return jsonResponse({ error: 'Invalid action' }, 400);
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

      // If it's a Stripe subscription (auto-renew), cancel it in Stripe
      if (subscription.stripe_session_id) {
        try {
          const session = await stripe.checkout.sessions.retrieve(subscription.stripe_session_id);
          if (session.mode === 'subscription' && session.subscription) {
            const subscriptionId = typeof session.subscription === 'string' 
              ? session.subscription 
              : session.subscription.id;
            
            // Cancel the Stripe subscription (at period end to avoid immediate cancellation)
            await stripe.subscriptions.update(subscriptionId, {
              cancel_at_period_end: true,
            });
            console.log('Stripe subscription set to cancel at period end:', subscriptionId);
          }
        } catch (stripeError) {
          console.error('Error cancelling Stripe subscription:', stripeError);
          // Continue with database update even if Stripe cancellation fails
        }
      }

      // Update subscription status in database
      const { error: updateError } = await adminClient
        .from('subscriptions')
        .update({
          payment_status: 'cancelled',
        })
        .eq('id', subscription.id);

      if (updateError) {
        console.error('Error updating subscription:', updateError);
        return jsonResponse({ error: 'Failed to cancel subscription' }, 500);
      }

      return jsonResponse({ 
        success: true, 
        message: 'Subscription cancelled successfully. You will continue to receive alerts until the end of your current billing period.' 
      });
    }

    return jsonResponse({ error: 'Method not allowed' }, 405);
  } catch (error) {
    console.error('Subscription management error:', error);
    return jsonResponse({ error: 'Unexpected server error' }, 500);
  }
});

