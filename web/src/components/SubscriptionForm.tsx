import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import type { Production } from '../lib/types';
import { NotificationPreferenceSelector } from './NotificationPreferenceSelector';
import { createCheckoutSession } from '../lib/api';

const schema = z.object({
  email: z.string().email({ message: 'Enter a valid email' }),
  phone: z.string().optional(),
  preference: z.enum(['email', 'telegram', 'both']).default('email'),
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

  const now = new Date();
  const endDate = production.end_date ? new Date(production.end_date) : null;
  const hasLessThanOneMonth =
    !!(endDate && endDate > now && endDate.getTime() - now.getTime() < 30 * 24 * 60 * 60 * 1000);

  const formatDate = (date: Date) =>
    date.toLocaleDateString('en-GB', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });

  const onSubmit = async (values: FormValues) => {
    setSubmitError(null);
    const { checkoutUrl, error } = await createCheckoutSession({
      email: values.email,
      phone: undefined,
      preference: values.preference,
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
        <input id="email" type="email" placeholder="you@example.com" autoComplete="email" {...register('email')} />
        {errors.email && <span className="input-error">{errors.email.message}</span>}
      </div>

      <div className="form-field">
        <label>Notifications</label>
        <p className="form-field__hint">
          If you choose Telegram, your confirmation email includes a one-tap link to connect the bot.
        </p>
        <NotificationPreferenceSelector
          value={preference}
          onChange={(value) => setValue('preference', value, { shouldValidate: true })}
        />
        {errors.preference && <span className="input-error">{errors.preference.message}</span>}
      </div>

      <div className="form-field">
        <label>Billing</label>
        <div className="payment-type-selector">
          <label className="payment-type-option">
            <input type="radio" value="subscription" {...register('paymentType')} />
            <div>
              <strong>Auto-renew</strong>
              <span className="payment-type-hint">£2 / month, cancel anytime</span>
            </div>
          </label>
          <label className="payment-type-option">
            <input type="radio" value="one-time" {...register('paymentType')} />
            <div>
              <strong>One month</strong>
              <span className="payment-type-hint">£2 once, no auto-renew</span>
            </div>
          </label>
        </div>
        {errors.paymentType && <span className="input-error">{errors.paymentType.message}</span>}
      </div>

      {hasLessThanOneMonth && endDate && (
        <div className="banner banner--warning">
          <h3>Production ending soon</h3>
          <p>
            This show ends on <strong>{formatDate(endDate)}</strong>. Your subscription will be cancelled on the
            production&apos;s end date and no refund is given for unused time.
          </p>
          <p>
            <strong>Our guarantee still applies.</strong> If we never alert you to standing tickets in your billing period,
            you get a full refund.
          </p>
          {paymentType === 'subscription' && (
            <p className="muted">
              Auto-renew note: the subscription stays active up to one week after the run, but no renewals are taken
              once the show has finished.
            </p>
          )}
        </div>
      )}

      {submitError && <div className="banner banner--error">{submitError}</div>}

      <button type="submit" className="btn btn--full btn--large" disabled={isSubmitting}>
        {isSubmitting ? 'Preparing checkout…' : 'Continue to checkout'}
        {!isSubmitting && (
          <span className="btn__hint">
            · {paymentType === 'subscription' ? '£2 / month' : '£2 one-off'}
          </span>
        )}
      </button>
    </form>
  );
};
