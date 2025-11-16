import Stripe from 'npm:stripe';
import { adminClient } from '../_shared/db.ts';
import type { ProductionRecord, UserRecord } from '../_shared/types.ts';

const stripeSecret = Deno.env.get('STRIPE_SECRET_KEY');
const webhookSecret = Deno.env.get('STRIPE_WEBHOOK_SECRET');

if (!stripeSecret || !webhookSecret) {
  throw new Error('Stripe secrets are missing');
}

const stripe = new Stripe(stripeSecret, {
  apiVersion: '2024-09-30.acacia',
});

const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

const ensureUserExists = async (userId: string, email: string) => {
  // First check if user exists by ID
  const { data: userById } = await adminClient
    .from('users')
    .select('*')
    .eq('id', userId)
    .maybeSingle();

  if (userById) {
    return userById;
  }

  // If not found by ID, check by email (user might exist with different ID)
  const { data: userByEmail } = await adminClient
    .from('users')
    .select('*')
    .eq('email', email.toLowerCase())
    .maybeSingle();

  if (userByEmail) {
    console.log('User exists with different ID, using existing user', {
      metadataUserId: userId,
      existingUserId: userByEmail.id,
      email,
    });
    // Return the existing user - we'll need to handle the ID mismatch
    return userByEmail;
  }

  // User doesn't exist, create it with the ID from metadata
  console.log('User not found, creating new user', { userId, email });
  const { data: newUser, error: createError } = await adminClient
    .from('users')
    .insert({
      id: userId,
      email: email.toLowerCase(),
      notification_preference: 'email',
    })
    .select('*')
    .single();

  if (createError || !newUser) {
    throw createError ?? new Error('Failed to create user');
  }

  console.log('Created user:', newUser.id);
  return newUser;
};

const activateSubscription = async (session: Stripe.Checkout.Session) => {
  const userId = session.metadata?.user_id;
  const productionId = session.metadata?.production_id;
  const paymentType = session.metadata?.payment_type || 'subscription';
  if (!userId || !productionId) {
    throw new Error('Missing metadata');
  }

  // Ensure user exists (in case it was deleted or never created)
  const email = session.customer_details?.email || session.customer_email;
  if (!email) {
    throw new Error('Missing email in session');
  }

  const user = await ensureUserExists(userId, email);
  
  // Use the actual user ID (might be different from metadata if user existed with different ID)
  const actualUserId = user.id;

  const now = new Date();
  const end = new Date(now);
  end.setMonth(end.getMonth() + 1); // 1 month subscription

  // For subscription mode, get the subscription object to get the period end
  let subscriptionEnd = end;
  if (session.mode === 'subscription' && session.subscription && paymentType === 'subscription') {
    const subscriptionId = typeof session.subscription === 'string' 
      ? session.subscription 
      : session.subscription.id;
    try {
      const subscription = await stripe.subscriptions.retrieve(subscriptionId);
      subscriptionEnd = new Date(subscription.current_period_end * 1000);
    } catch (error) {
      console.error('Failed to retrieve subscription, using calculated end date:', error);
    }
  }
  // For one-time payments, subscription_end is already set to 1 month from now

  // Generate management token for email-based subscription management
  const managementToken = crypto.randomUUID();

  // Try to find subscription by stripe_session_id first (most reliable)
  let { data: subscription, error: sessionError } = await adminClient
    .from('subscriptions')
    .select('*')
    .eq('stripe_session_id', session.id)
    .maybeSingle();

  // If not found by session_id, try actual_user_id + production_id
  if (!subscription) {
    const result = await adminClient
      .from('subscriptions')
      .select('*')
      .eq('user_id', actualUserId)
      .eq('production_id', productionId)
      .maybeSingle();
    
    subscription = result.data;
    if (result.error && !sessionError) {
      sessionError = result.error;
    }
  }

  // If still not found, create it (shouldn't happen, but handle edge case)
  if (!subscription) {
    console.log('Subscription not found, creating new one', { actualUserId, productionId, sessionId: session.id, metadataUserId: userId });
    const { data: newSubscription, error: createError } = await adminClient
      .from('subscriptions')
      .insert({
        user_id: actualUserId,
        production_id: productionId,
        payment_status: 'paid',
        subscription_start: now.toISOString(),
        subscription_end: subscriptionEnd.toISOString(),
        stripe_session_id: session.id,
        management_token: managementToken,
      })
      .select('*')
      .single();

    if (createError || !newSubscription) {
      throw createError ?? new Error('Failed to create subscription');
    }
    
    console.log('Created subscription:', newSubscription.id);
    return;
  }

  // Update existing subscription
  const { error: updateError } = await adminClient
    .from('subscriptions')
      .update({
        payment_status: 'paid',
        subscription_start: now.toISOString(),
        subscription_end: subscriptionEnd.toISOString(),
        stripe_session_id: session.id,
        management_token: subscription.management_token || managementToken, // Keep existing token or generate new one
      })
    .eq('id', subscription.id);

  if (updateError) {
    throw updateError;
  }

  console.log('Updated subscription:', subscription.id);

  // Send confirmation email with management link
  try {
    const { data: production } = await adminClient
      .from('productions')
      .select('*')
      .eq('id', productionId)
      .single();
    
    if (production && user.email) {
      await sendConfirmationEmail(user, production as ProductionRecord, managementToken);
    }
  } catch (emailError) {
    console.error('Failed to send confirmation email:', emailError);
    // Don't fail the webhook if email fails
  }
};

const sendConfirmationEmail = async (
  user: UserRecord,
  production: ProductionRecord,
  managementToken: string,
) => {
  const resendKey = Deno.env.get('RESEND_API_KEY');
  const siteUrl = Deno.env.get('PUBLIC_SITE_URL') || 'http://localhost:5173';
  
  if (!resendKey || !user.email) {
    return;
  }

  const managementLink = `${siteUrl}/manage?token=${managementToken}`;
  const fromEmail = Deno.env.get('RESEND_FROM_EMAIL') || 'onboarding@resend.dev';

  const subject = `Subscription confirmed: ${production.name}`;
  const html = `
    <h2>Your subscription is active!</h2>
    <p>You're now subscribed to alerts for <strong>${production.name}</strong> at ${production.theatre}.</p>
    <p>We'll email you immediately when standing tickets become available.</p>
    <hr style="margin: 2rem 0; border: none; border-top: 1px solid #ddd;">
    <p style="font-size: 0.9rem; color: #666;">
      <strong>Manage your subscription:</strong><br>
      <a href="${managementLink}">View subscription details or cancel</a>
    </p>
    <p style="font-size: 0.85rem; color: #999; margin-top: 1rem;">
      No account needed—just use the link above to manage your subscription anytime.
    </p>
  `;

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
    console.error('Failed to send confirmation email:', await response.text());
  }
};

const markFailed = async (session: Stripe.Checkout.Session, status: 'failed' | 'cancelled') => {
  const userId = session.metadata?.user_id;
  const productionId = session.metadata?.production_id;
  if (!userId || !productionId) return;

  await adminClient
    .from('subscriptions')
    .update({
      payment_status: status,
    })
    .eq('user_id', userId)
    .eq('production_id', productionId);
};

Deno.serve(async (req) => {
  const signature = req.headers.get('stripe-signature');
  
  if (!signature) {
    console.error('Missing stripe-signature header');
    return jsonResponse({ error: 'Missing signature' }, 400);
  }

  // Get raw body as text - this is critical for signature verification
  // We must use the raw request body, not parsed JSON
  const payload = await req.text();
  
  console.log('Webhook received:', {
    hasSignature: !!signature,
    payloadLength: payload.length,
    contentType: req.headers.get('content-type'),
  });

  try {
    // Verify the webhook secret is set
    if (!webhookSecret) {
      console.error('STRIPE_WEBHOOK_SECRET is not set');
      return jsonResponse({ error: 'Webhook secret not configured' }, 500);
    }
    
    console.log('Attempting to verify webhook signature...', {
      secretPrefix: webhookSecret.substring(0, 10) + '...',
      signaturePrefix: signature.substring(0, 20) + '...',
    });
    
    const event = await stripe.webhooks.constructEventAsync(payload, signature, webhookSecret);
    console.log('Received webhook event:', event.type, event.id);

    switch (event.type) {
      case 'checkout.session.completed':
        const session = event.data.object as Stripe.Checkout.Session;
        console.log('Processing checkout.session.completed', {
          sessionId: session.id,
          userId: session.metadata?.user_id,
          productionId: session.metadata?.production_id,
          paymentStatus: session.payment_status,
          mode: session.mode,
        });
        
        if (session.payment_status === 'paid') {
          await activateSubscription(session);
          console.log('Subscription activated successfully');
        } else {
          console.log('Session completed but payment not paid yet:', session.payment_status);
        }
        break;
      case 'customer.subscription.updated':
        // Handle subscription updates (only for auto-renew subscriptions)
        const subscription = event.data.object as Stripe.Subscription;
        if (subscription.status === 'active' && 
            subscription.metadata?.user_id && 
            subscription.metadata?.production_id &&
            subscription.metadata?.payment_type === 'subscription') {
          const userId = subscription.metadata.user_id;
          const productionId = subscription.metadata.production_id;
          
          // Check if production has ended
          const { data: production } = await adminClient
            .from('productions')
            .select('end_date')
            .eq('id', productionId)
            .maybeSingle();
          
          const now = new Date();
          const productionEndDate = production?.end_date ? new Date(production.end_date) : null;
          
          // If production has ended, cancel the Stripe subscription immediately and mark ours as cancelled
          if (productionEndDate && productionEndDate <= now) {
            console.log('Production has ended, cancelling subscription immediately', { 
              userId, 
              productionId, 
              productionEndDate,
              subscriptionId: subscription.id 
            });
            
            try {
              // Cancel the Stripe subscription immediately
              await stripe.subscriptions.cancel(subscription.id);
              
              // Mark our subscription as cancelled
              await adminClient
                .from('subscriptions')
                .update({
                  payment_status: 'cancelled',
                })
                .eq('user_id', userId)
                .eq('production_id', productionId);
              
              console.log('Subscription cancelled immediately due to production end');
            } catch (error) {
              console.error('Failed to cancel subscription after production end:', error);
            }
            break;
          }
          
          const currentPeriodEnd = new Date(subscription.current_period_end * 1000);
          
          const { error: updateError } = await adminClient
            .from('subscriptions')
            .update({
              payment_status: 'paid',
              subscription_end: currentPeriodEnd.toISOString(),
            })
            .eq('user_id', userId)
            .eq('production_id', productionId);
          
          if (updateError) {
            console.error('Failed to update subscription on renewal:', updateError);
          } else {
            console.log('Subscription renewed:', { userId, productionId, endDate: currentPeriodEnd });
          }
        }
        break;
      case 'invoice.payment_succeeded':
        // Handle subscription renewals via invoice (only for auto-renew subscriptions)
        const invoice = event.data.object as Stripe.Invoice;
        if (invoice.subscription && typeof invoice.subscription === 'string') {
          try {
            const subscription = await stripe.subscriptions.retrieve(invoice.subscription);
            if (subscription.status === 'active' && 
                subscription.metadata?.user_id && 
                subscription.metadata?.production_id &&
                subscription.metadata?.payment_type === 'subscription') {
              const userId = subscription.metadata.user_id;
              const productionId = subscription.metadata.production_id;
              
              // Check if production has ended
              const { data: production } = await adminClient
                .from('productions')
                .select('end_date')
                .eq('id', productionId)
                .maybeSingle();
              
              const now = new Date();
              const productionEndDate = production?.end_date ? new Date(production.end_date) : null;
              
              // If production has ended, cancel the Stripe subscription, refund the invoice, and mark ours as cancelled
              if (productionEndDate && productionEndDate <= now) {
                console.log('Production has ended, cancelling subscription renewal via invoice', { 
                  userId, 
                  productionId, 
                  productionEndDate,
                  subscriptionId: subscription.id,
                  invoiceId: invoice.id
                });
                
                try {
                  // Refund the invoice since production has ended
                  if (invoice.payment_intent && typeof invoice.payment_intent === 'string') {
                    try {
                      await stripe.refunds.create({
                        payment_intent: invoice.payment_intent,
                        reason: 'requested_by_customer',
                      });
                      console.log('Refunded invoice payment due to production end');
                    } catch (refundError) {
                      console.error('Failed to refund invoice:', refundError);
                      // Continue with cancellation even if refund fails
                    }
                  }
                  
                  // Cancel the Stripe subscription immediately
                  await stripe.subscriptions.cancel(subscription.id);
                  
                  // Mark our subscription as cancelled
                  await adminClient
                    .from('subscriptions')
                    .update({
                      payment_status: 'cancelled',
                    })
                    .eq('user_id', userId)
                    .eq('production_id', productionId);
                  
                  console.log('Subscription cancelled and refunded due to production end (invoice payment)');
                } catch (error) {
                  console.error('Failed to cancel subscription after production end:', error);
                }
                break;
              }
              
              const currentPeriodEnd = new Date(subscription.current_period_end * 1000);
              
              const { error: updateError } = await adminClient
                .from('subscriptions')
                .update({
                  payment_status: 'paid',
                  subscription_end: currentPeriodEnd.toISOString(),
                })
                .eq('user_id', userId)
                .eq('production_id', productionId);
              
              if (updateError) {
                console.error('Failed to update subscription on invoice payment:', updateError);
              } else {
                console.log('Subscription renewed via invoice:', { userId, productionId, endDate: currentPeriodEnd });
              }
            }
          } catch (error) {
            console.error('Failed to retrieve subscription from invoice:', error);
          }
        }
        break;
      case 'checkout.session.expired':
        await markFailed(event.data.object as Stripe.Checkout.Session, 'cancelled');
        break;
      case 'checkout.session.async_payment_failed':
        await markFailed(event.data.object as Stripe.Checkout.Session, 'failed');
        break;
      default:
        console.log('Unhandled event type:', event.type);
        break;
    }

    return jsonResponse({ received: true });
  } catch (error) {
    const err = error as Error;
    console.error('Webhook verification failed:', {
      message: err.message,
      name: err.name,
      stack: err.stack,
    });
    
    // Provide more helpful error message
    if (err.message.includes('signature')) {
      return jsonResponse({ 
        error: 'Signature verification failed. Please verify STRIPE_WEBHOOK_SECRET matches the signing secret in Stripe Dashboard.',
        hint: 'Check Stripe Dashboard → Webhooks → Your endpoint → Signing secret'
      }, 400);
    }
    
    return jsonResponse({ error: err.message }, 400);
  }
});

