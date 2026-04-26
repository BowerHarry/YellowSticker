// stripe-webhook: ingests Stripe events and keeps our `subscriptions` rows
// in sync + fires the appropriate customer-facing email.
//
// Events handled:
//   checkout.session.completed       → activate subscription, send signup email
//   invoice.payment_succeeded        → record renewal, send renewal email, or
//                                      block renewals that land after the
//                                      production has ended (refund + cancel).
//   customer.subscription.updated    → keep `subscription_end` aligned with
//                                      Stripe's current_period_end.
//   customer.subscription.deleted    → mark as cancelled, send cancel email
//                                      (no refund — those are issued by
//                                      `subscription-management` when the
//                                      guarantee is met).
//   checkout.session.expired / async_payment_failed → mark pending row failed.
//
// Refund guarantee is enforced here for *post-end-date* renewals. User-
// initiated cancellations with guarantee refunds live in
// `subscription-management` so the refund happens in the same request that
// the user clicks "Cancel".
import Stripe from 'npm:stripe';
import { adminClient } from '../_shared/db.ts';
import type { ProductionRecord, UserRecord } from '../_shared/types.ts';
import {
  cancellationEmail,
  renewalEmail,
  sendEmail,
  signupEmail,
  stripeMode,
} from '../_shared/emails.ts';
import { mintTelegramLinkToken, telegramBotStartUrl } from '../_shared/telegram.ts';

const stripeSecret = Deno.env.get('STRIPE_SECRET_KEY');
const webhookSecret = Deno.env.get('STRIPE_WEBHOOK_SECRET');

if (!stripeSecret || !webhookSecret) {
  throw new Error('Stripe secrets are missing');
}

const stripe = new Stripe(stripeSecret, {
  apiVersion: '2024-09-30.acacia',
});

console.log(`stripe-webhook: stripe mode = ${stripeMode()}`);

const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

const ensureUserExists = async (userId: string, email: string) => {
  const { data: userById } = await adminClient
    .from('users')
    .select('*')
    .eq('id', userId)
    .maybeSingle();

  if (userById) return userById;

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
    return userByEmail;
  }

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

  return newUser;
};

// Compute the unix timestamp 7 days after the production's final
// performance. Stripe's `cancel_at` on a subscription schedules an
// automatic cancellation at that moment — we use this to enforce
// "no renewals processed after production ends" without needing a
// nightly cron. Set from the webhook (not Checkout) because
// `subscription_data[cancel_at]` isn't a valid Checkout field.
const cancelAtFromEndDate = (endDate: string | null | undefined): number | null => {
  if (!endDate) return null;
  const d = new Date(endDate);
  if (Number.isNaN(d.getTime())) return null;
  const cancelAt = new Date(d);
  cancelAt.setUTCDate(cancelAt.getUTCDate() + 7);
  const seconds = Math.floor(cancelAt.getTime() / 1000);
  // Stripe rejects cancel_at values that aren't in the future. If the
  // production already ended >7 days ago we just return null and let
  // the post-end renewal guard in handleRenewalOrPostEnd refund the
  // stray invoice instead.
  const nowSeconds = Math.floor(Date.now() / 1000);
  return seconds > nowSeconds ? seconds : null;
};

const logEmailSent = async (params: {
  userId: string | null;
  productionId: string | null;
  messageId: string | null;
  reason: string;
  recipient: string | null;
  extras?: Record<string, unknown>;
}) => {
  if (!params.messageId) return;
  await adminClient.from('notification_logs').insert({
    user_id: params.userId,
    production_id: params.productionId,
    type: 'email',
    channel_message_id: params.messageId,
    payload: {
      reason: params.reason,
      recipient: params.recipient,
      ...(params.extras ?? {}),
    },
  });
};

const activateSubscription = async (session: Stripe.Checkout.Session) => {
  const userId = session.metadata?.user_id;
  const productionId = session.metadata?.production_id;
  const paymentType = (session.metadata?.payment_type as 'subscription' | 'one-time' | undefined) ?? 'subscription';
  if (!userId || !productionId) {
    throw new Error('Missing metadata');
  }

  const email = session.customer_details?.email || session.customer_email;
  if (!email) {
    throw new Error('Missing email in session');
  }

  const user = await ensureUserExists(userId, email);
  const actualUserId = user.id;

  const metaPref = session.metadata?.notification_preference;
  if (metaPref === 'email' || metaPref === 'telegram' || metaPref === 'both') {
    await adminClient.from('users').update({ notification_preference: metaPref }).eq('id', actualUserId);
  }

  const now = new Date();

  // Figure out the billing window + the PaymentIntent we'd refund, which
  // differ between one-off and recurring sessions.
  let currentPeriodStart: Date = now;
  let currentPeriodEnd: Date = new Date(now.getFullYear(), now.getMonth() + 1, now.getDate());
  let stripeSubscriptionId: string | null = null;
  let stripeCustomerId: string | null =
    typeof session.customer === 'string' ? session.customer : session.customer?.id ?? null;
  let lastPaymentIntentId: string | null = null;
  let lastChargeAmountPence: number | null = session.amount_total ?? null;

  if (paymentType === 'subscription' && session.mode === 'subscription' && session.subscription) {
    const subscriptionId =
      typeof session.subscription === 'string' ? session.subscription : session.subscription.id;
    stripeSubscriptionId = subscriptionId;
    try {
      const subscription = await stripe.subscriptions.retrieve(subscriptionId, {
        expand: ['latest_invoice.payment_intent'],
      });
      currentPeriodStart = new Date(subscription.current_period_start * 1000);
      currentPeriodEnd = new Date(subscription.current_period_end * 1000);
      stripeCustomerId =
        typeof subscription.customer === 'string' ? subscription.customer : subscription.customer.id;
      const invoice = subscription.latest_invoice as Stripe.Invoice | null;
      const intent = invoice?.payment_intent as Stripe.PaymentIntent | string | null | undefined;
      lastPaymentIntentId = typeof intent === 'string' ? intent : intent?.id ?? null;
      if (invoice?.amount_paid != null) lastChargeAmountPence = invoice.amount_paid;
    } catch (error) {
      console.error('Failed to retrieve subscription, falling back to session values:', error);
    }
  } else if (session.payment_intent) {
    lastPaymentIntentId =
      typeof session.payment_intent === 'string' ? session.payment_intent : session.payment_intent.id;
  }

  const managementToken = crypto.randomUUID();

  let { data: subscription } = await adminClient
    .from('subscriptions')
    .select('*')
    .eq('stripe_session_id', session.id)
    .maybeSingle();

  if (!subscription) {
    const result = await adminClient
      .from('subscriptions')
      .select('*')
      .eq('user_id', actualUserId)
      .eq('production_id', productionId)
      .maybeSingle();
    subscription = result.data;
  }

  const patch = {
    payment_status: 'paid',
    payment_type: paymentType,
    subscription_start: now.toISOString(),
    subscription_end: currentPeriodEnd.toISOString(),
    current_period_start: currentPeriodStart.toISOString(),
    stripe_session_id: session.id,
    stripe_subscription_id: stripeSubscriptionId,
    stripe_customer_id: stripeCustomerId,
    last_payment_intent_id: lastPaymentIntentId,
    last_charge_amount_pence: lastChargeAmountPence,
    cancellation_reason: null,
    // Re-stamp on activation in case a row created in one mode is
    // activated after a key swap — whichever mode owns the actual
    // Stripe IDs wins, which is always the mode we're running in now.
    is_test_mode: stripeMode() === 'test',
  } as const;

  if (!subscription) {
    console.log('Subscription not found, creating new one', { actualUserId, productionId, sessionId: session.id });
    const { data: newSubscription, error: createError } = await adminClient
      .from('subscriptions')
      .insert({
        user_id: actualUserId,
        production_id: productionId,
        ...patch,
        management_token: managementToken,
      })
      .select('*')
      .single();
    if (createError || !newSubscription) {
      throw createError ?? new Error('Failed to create subscription');
    }
    subscription = newSubscription;
  } else {
    const { error: updateError } = await adminClient
      .from('subscriptions')
      .update({
        ...patch,
        management_token: subscription.management_token || managementToken,
      })
      .eq('id', subscription.id);
    if (updateError) throw updateError;
    subscription = {
      ...subscription,
      ...patch,
      management_token: subscription.management_token || managementToken,
    };
  }

  const { data: production } = await adminClient
    .from('productions')
    .select('*')
    .eq('id', productionId)
    .single();

  // Schedule auto-cancellation 7 days after the production's end
  // date so auto-renew subscriptions stop themselves and we never
  // charge the user for a run that's already finished. Only applies
  // to real recurring subscriptions — one-off payments have no
  // subscription object to schedule against.
  if (
    paymentType === 'subscription' &&
    stripeSubscriptionId &&
    production &&
    (production as ProductionRecord).end_date
  ) {
    const cancelAt = cancelAtFromEndDate((production as ProductionRecord).end_date ?? null);
    if (cancelAt) {
      try {
        await stripe.subscriptions.update(stripeSubscriptionId, { cancel_at: cancelAt });
      } catch (cancelAtError) {
        console.error('Failed to set Stripe subscription cancel_at', {
          stripeSubscriptionId,
          productionId,
          error: cancelAtError instanceof Error ? cancelAtError.message : cancelAtError,
        });
      }
    }
  }

  try {
    if (production && user.email) {
      const prefForAlerts =
        metaPref === 'email' || metaPref === 'telegram' || metaPref === 'both'
          ? metaPref
          : ((user as UserRecord).notification_preference ?? 'email');

      let telegramConnectUrl: string | null = null;
      if (prefForAlerts === 'telegram' || prefForAlerts === 'both') {
        const linkToken = mintTelegramLinkToken();
        const { error: tokErr } = await adminClient
          .from('users')
          .update({ telegram_link_token: linkToken })
          .eq('id', actualUserId);
        if (!tokErr) {
          telegramConnectUrl = telegramBotStartUrl(linkToken);
        }
      }

      const { subject, html } = signupEmail(
        {
          name: (production as ProductionRecord).name,
          theatre: (production as ProductionRecord).theatre,
          city: (production as ProductionRecord).city ?? null,
          slug: (production as ProductionRecord).slug,
          endDate: (production as ProductionRecord).end_date ?? null,
        },
        {
          paymentType,
          currentPeriodStart: currentPeriodStart.toISOString(),
          currentPeriodEnd: currentPeriodEnd.toISOString(),
          amountPence: lastChargeAmountPence,
          managementToken: subscription.management_token,
          telegramConnectUrl,
        },
      );
      const messageId = await sendEmail({ to: user.email, subject, html });
      await logEmailSent({
        userId: actualUserId,
        productionId,
        messageId,
        reason: 'subscription_signup',
        recipient: user.email,
        extras: { paymentType, amountPence: lastChargeAmountPence },
      });
    }
  } catch (emailError) {
    console.error('Failed to send signup email:', emailError);
  }
};

const handleRenewalOrPostEnd = async (invoice: Stripe.Invoice) => {
  if (!invoice.subscription) return;
  const subscriptionId = typeof invoice.subscription === 'string' ? invoice.subscription : invoice.subscription.id;

  // We may be called for the very first invoice (signup), which is already
  // handled by `checkout.session.completed`. The `billing_reason` tells us
  // which flavour we're dealing with.
  const isRenewal = invoice.billing_reason === 'subscription_cycle' || invoice.billing_reason === 'subscription_update';
  const isSignup = invoice.billing_reason === 'subscription_create';
  if (!isRenewal && !isSignup) return;

  const stripeSub = await stripe.subscriptions.retrieve(subscriptionId);
  const userId = stripeSub.metadata?.user_id;
  const productionId = stripeSub.metadata?.production_id;
  const paymentType = stripeSub.metadata?.payment_type;
  if (!userId || !productionId || paymentType !== 'subscription') return;

  const { data: production } = await adminClient
    .from('productions')
    .select('*')
    .eq('id', productionId)
    .maybeSingle();

  const { data: dbSub } = await adminClient
    .from('subscriptions')
    .select('*')
    .eq('user_id', userId)
    .eq('production_id', productionId)
    .maybeSingle();

  const { data: user } = await adminClient
    .from('users')
    .select('*')
    .eq('id', userId)
    .maybeSingle();

  const now = new Date();
  const productionEnd = production?.end_date ? new Date(production.end_date) : null;

  // Post-end-date renewal: refund + cancel. This is the backstop for the
  // rule "renewals will not be processed after the production end date".
  // The Stripe `cancel_at` we set in `activateSubscription` normally prevents us
  // ever getting here, but key times (production end_date moved, clock
  // skew) can slip one through.
  if (isRenewal && productionEnd && productionEnd <= now) {
    console.log('Blocking post-end renewal', { productionId, invoiceId: invoice.id });
    try {
      if (invoice.payment_intent) {
        const intentId = typeof invoice.payment_intent === 'string' ? invoice.payment_intent : invoice.payment_intent.id;
        try {
          await stripe.refunds.create({ payment_intent: intentId, reason: 'requested_by_customer' });
        } catch (err) {
          console.error('Refund failed', err);
        }
      }
      await stripe.subscriptions.cancel(subscriptionId).catch((err) => {
        console.error('Stripe cancel after post-end renewal failed', err);
      });
      await adminClient
        .from('subscriptions')
        .update({
          payment_status: 'refunded',
          cancellation_reason: 'production_ended',
        })
        .eq('user_id', userId)
        .eq('production_id', productionId);
      if (user?.email && production) {
        const { subject, html } = cancellationEmail(
          {
            name: (production as ProductionRecord).name,
            theatre: (production as ProductionRecord).theatre,
            city: (production as ProductionRecord).city ?? null,
            slug: (production as ProductionRecord).slug,
            endDate: (production as ProductionRecord).end_date ?? null,
          },
          {
            paymentType: 'subscription',
            currentPeriodStart: dbSub?.current_period_start ?? null,
            currentPeriodEnd: dbSub?.subscription_end ?? null,
            amountPence: invoice.amount_paid ?? null,
            managementToken: dbSub?.management_token ?? null,
          },
          {
            refunded: true,
            refundAmountPence: invoice.amount_paid ?? null,
            effective: 'immediately',
            reason: 'Production has ended',
          },
        );
        const messageId = await sendEmail({ to: user.email, subject, html });
        await logEmailSent({
          userId,
          productionId,
          messageId,
          reason: 'post_end_refund',
          recipient: user.email,
          extras: { invoiceId: invoice.id ?? null },
        });
      }
    } catch (error) {
      console.error('Failed to process post-end renewal block', error);
    }
    return;
  }

  // Normal renewal path: move our period markers forward, record the new
  // PaymentIntent (so if the user cancels mid-period we know what to
  // refund), and email a receipt.
  const currentPeriodStart = new Date(stripeSub.current_period_start * 1000);
  const currentPeriodEnd = new Date(stripeSub.current_period_end * 1000);
  const intent = invoice.payment_intent;
  const paymentIntentId = typeof intent === 'string' ? intent : intent?.id ?? null;

  const { error: updateError } = await adminClient
    .from('subscriptions')
    .update({
      payment_status: 'paid',
      subscription_end: currentPeriodEnd.toISOString(),
      current_period_start: currentPeriodStart.toISOString(),
      last_payment_intent_id: paymentIntentId,
      last_charge_amount_pence: invoice.amount_paid ?? null,
      cancellation_reason: null,
    })
    .eq('user_id', userId)
    .eq('production_id', productionId);
  if (updateError) {
    console.error('Failed to update subscription on renewal:', updateError);
  }

  if (isRenewal && user?.email && production) {
    let telegramConnectUrl: string | null = null;
    const u = user as UserRecord;
    const pref = u.notification_preference;
    const chatId = u.telegram_chat_id;
    if ((pref === 'telegram' || pref === 'both') && chatId == null) {
      const linkToken = mintTelegramLinkToken();
      const { error: tokErr } = await adminClient
        .from('users')
        .update({ telegram_link_token: linkToken })
        .eq('id', userId);
      if (!tokErr) {
        telegramConnectUrl = telegramBotStartUrl(linkToken);
      }
    }

    const { subject, html } = renewalEmail(
      {
        name: (production as ProductionRecord).name,
        theatre: (production as ProductionRecord).theatre,
        city: (production as ProductionRecord).city ?? null,
        slug: (production as ProductionRecord).slug,
        endDate: (production as ProductionRecord).end_date ?? null,
      },
      {
        paymentType: 'subscription',
        currentPeriodStart: currentPeriodStart.toISOString(),
        currentPeriodEnd: currentPeriodEnd.toISOString(),
        amountPence: invoice.amount_paid ?? null,
        managementToken: dbSub?.management_token ?? null,
        telegramConnectUrl,
      },
    );
    const messageId = await sendEmail({ to: user.email, subject, html });
    await logEmailSent({
      userId,
      productionId,
      messageId,
      reason: 'subscription_renewal',
      recipient: user.email,
      extras: { invoiceId: invoice.id ?? null, amountPence: invoice.amount_paid ?? null },
    });
  }
};

const handleSubscriptionDeleted = async (subscription: Stripe.Subscription) => {
  const userId = subscription.metadata?.user_id;
  const productionId = subscription.metadata?.production_id;
  if (!userId || !productionId) return;

  const { data: dbSub } = await adminClient
    .from('subscriptions')
    .select('*')
    .eq('user_id', userId)
    .eq('production_id', productionId)
    .maybeSingle();

  // If we already marked this row as refunded/cancelled, don't overwrite —
  // we don't want "subscription.deleted" (the natural trailing event after
  // `stripe.subscriptions.cancel`) to clobber the more specific state we
  // recorded when we issued the refund.
  if (dbSub && (dbSub.payment_status === 'refunded' || dbSub.payment_status === 'cancelled')) {
    return;
  }

  await adminClient
    .from('subscriptions')
    .update({
      payment_status: 'cancelled',
      cancellation_reason: dbSub?.cancellation_reason ?? 'stripe_deleted',
    })
    .eq('user_id', userId)
    .eq('production_id', productionId);

  const { data: production } = await adminClient
    .from('productions')
    .select('*')
    .eq('id', productionId)
    .maybeSingle();
  const { data: user } = await adminClient
    .from('users')
    .select('*')
    .eq('id', userId)
    .maybeSingle();

  if (user?.email && production) {
    const { subject, html } = cancellationEmail(
      {
        name: (production as ProductionRecord).name,
        theatre: (production as ProductionRecord).theatre,
        city: (production as ProductionRecord).city ?? null,
        slug: (production as ProductionRecord).slug,
        endDate: (production as ProductionRecord).end_date ?? null,
      },
      {
        paymentType: 'subscription',
        currentPeriodStart: dbSub?.current_period_start ?? null,
        currentPeriodEnd: dbSub?.subscription_end ?? null,
        amountPence: dbSub?.last_charge_amount_pence ?? null,
        managementToken: dbSub?.management_token ?? null,
      },
      {
        refunded: false,
        effective: 'immediately',
        reason: dbSub?.cancellation_reason ?? undefined,
      },
    );
    const messageId = await sendEmail({ to: (user as UserRecord).email ?? '', subject, html });
    await logEmailSent({
      userId,
      productionId,
      messageId,
      reason: 'subscription_deleted',
      recipient: (user as UserRecord).email ?? null,
    });
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

  const payload = await req.text();

  try {
    const event = await stripe.webhooks.constructEventAsync(payload, signature, webhookSecret);
    console.log('Received webhook event:', event.type, event.id);

    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session;
        if (session.payment_status === 'paid') {
          await activateSubscription(session);
        }
        break;
      }
      case 'customer.subscription.updated': {
        const subscription = event.data.object as Stripe.Subscription;
        const userId = subscription.metadata?.user_id;
        const productionId = subscription.metadata?.production_id;
        if (userId && productionId) {
          await adminClient
            .from('subscriptions')
            .update({
              subscription_end: new Date(subscription.current_period_end * 1000).toISOString(),
            })
            .eq('user_id', userId)
            .eq('production_id', productionId);
        }
        break;
      }
      case 'invoice.payment_succeeded':
        await handleRenewalOrPostEnd(event.data.object as Stripe.Invoice);
        break;
      case 'customer.subscription.deleted':
        await handleSubscriptionDeleted(event.data.object as Stripe.Subscription);
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
    console.error('Webhook handling failed:', {
      message: err.message,
      name: err.name,
    });

    if (err.message.includes('signature')) {
      return jsonResponse({
        error: 'Signature verification failed. Please verify STRIPE_WEBHOOK_SECRET matches the signing secret in Stripe Dashboard.',
        hint: 'Check Stripe Dashboard → Webhooks → Your endpoint → Signing secret',
      }, 400);
    }

    return jsonResponse({ error: err.message }, 400);
  }
});
