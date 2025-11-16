import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import type { Production } from '../lib/types';
import { NotificationPreferenceSelector } from './NotificationPreferenceSelector';
import { createCheckoutSession } from '../lib/api';

const schema = z.object({
  email: z.string().email({ message: 'Enter a valid email' }),
  phone: z.string().optional(), // Keep for API compatibility but don't show in UI
  preference: z.enum(['email', 'sms', 'both']).default('email'),
  paymentType: z.enum(['subscription', 'one-time']).default('subscription'),
});

type FormValues = z.infer<typeof schema>;

type Props = {
  production: Production;
};

export const SubscriptionForm = ({ production }: Props) => {
  const [submitError, setSubmitError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      preference: 'email',
      paymentType: 'subscription',
    },
  });

  const preference = watch('preference');
  const paymentType = watch('paymentType');

  // Check if production has less than 1 month remaining
  const now = new Date();
  const endDate = production.end_date ? new Date(production.end_date) : null;
  const hasLessThanOneMonth = endDate && endDate > now && (endDate.getTime() - now.getTime()) < 30 * 24 * 60 * 60 * 1000; // 30 days in milliseconds

  const formatDate = (date: Date) => {
    return date.toLocaleDateString('en-GB', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  };

  const onSubmit = async (values: FormValues) => {
    setSubmitError(null);

    const { checkoutUrl, error } = await createCheckoutSession({
      email: values.email,
      phone: undefined, // Not collecting phone for now
      preference: 'email' as const, // Always email for now
      productionId: production.id,
      productionSlug: production.slug,
      paymentType: values.paymentType,
    });

    if (error || !checkoutUrl) {
      setSubmitError(error ?? 'Unable to start checkout right now.');
      return;
    }

    window.location.href = checkoutUrl;
  };

  return (
    <form className="grid" style={{ gap: '1.25rem' }} onSubmit={handleSubmit(onSubmit)} noValidate>
      <div className="form-field">
        <label htmlFor="email">Email address</label>
        <input id="email" type="email" placeholder="you@example.com" {...register('email')} />
        {errors.email && <span className="input-error">{errors.email.message}</span>}
      </div>

      <div className="form-field">
        <label>Notification method</label>
        <NotificationPreferenceSelector
          value={preference}
          onChange={(value) => {
            setValue('preference', value, { shouldValidate: true });
          }}
        />
        {errors.preference && <span className="input-error">{errors.preference.message}</span>}
      </div>

      <div className="form-field">
        <label>Payment option</label>
        <div className="payment-type-selector">
          <label className="payment-type-option">
            <input
              type="radio"
              value="subscription"
              {...register('paymentType')}
            />
            <div>
              <strong>Auto-renew monthly</strong>
              <span className="payment-type-hint">£4.99/month, renews automatically</span>
            </div>
          </label>
          <label className="payment-type-option">
            <input
              type="radio"
              value="one-time"
              {...register('paymentType')}
            />
            <div>
              <strong>One month only</strong>
              <span className="payment-type-hint">£4.99 one-time payment</span>
            </div>
          </label>
        </div>
        {errors.paymentType && <span className="input-error">{errors.paymentType.message}</span>}
      </div>

      {hasLessThanOneMonth && endDate && (
        <div className="banner banner--warning">
          <h3 style={{ margin: '0 0 0.75rem 0', fontSize: '1rem', fontWeight: 600 }}>
            ⚠️ Production Ending Soon
          </h3>
          <p style={{ margin: '0 0 0.75rem 0', fontSize: '0.9rem', lineHeight: 1.6 }}>
            This production ends on <strong>{formatDate(endDate)}</strong>. Upon the production ending, your subscription will be automatically cancelled on this date. No refund will be provided for any remaining time on your subscription.
          </p>
          <p style={{ margin: '0 0 0.75rem 0', fontSize: '0.9rem', lineHeight: 1.6 }}>
            <strong>However,</strong> as per our guarantee: if no standing tickets have been found since your last payment at the point of cancellation or renewal, you will receive a full refund. You are only charged if we find and alert you of tickets during that period.
          </p>
          {paymentType === 'subscription' && (
            <p style={{ margin: 0, fontSize: '0.85rem', lineHeight: 1.6, color: 'rgba(255, 255, 255, 0.8)' }}>
              <strong>Note for auto-renew subscriptions:</strong> Your subscription will not be cancelled until 1 week after the production end date. However, renewals will not be processed after the production end date—your subscription will be automatically cancelled if a renewal is attempted after the production ends.
            </p>
          )}
        </div>
      )}

      {submitError && (
        <div className="banner banner--error">
          {submitError}
        </div>
      )}

      <button type="submit" className="btn btn--full" disabled={isSubmitting}>
        {isSubmitting 
          ? 'Preparing checkout…' 
          : paymentType === 'subscription'
            ? `Continue (£4.99/month / ${production.name})`
            : `Continue (£4.99 one-time / ${production.name})`
        }
      </button>
    </form>
  );
};

