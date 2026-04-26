import { useState, useEffect } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { getSubscriptionByToken, cancelSubscription, updateNotificationPreference } from '../lib/api';
import type { NotificationPreference } from '../lib/types';
import { NotificationPreferenceSelector } from '../components/NotificationPreferenceSelector';

interface SubscriptionData {
  id: string;
  paymentStatus: string;
  cancellationReason?: string | null;
  paymentType?: 'subscription' | 'one-time';
  subscriptionStart: string | null;
  subscriptionEnd: string | null;
  currentPeriodStart?: string | null;
  lastChargeAmountPence?: number | null;
  createdAt: string;
  isActive: boolean;
  notificationPreference: string;
  user: {
    id: string;
    email: string | null;
    telegramConnected?: boolean;
  };
  production: {
    id: string;
    name: string;
    slug: string;
    theatre: string;
    city?: string | null;
  };
  refundGuarantee?: {
    applies: boolean;
    since: string | null;
    lastTicketsFoundAt: string | null;
  };
}

export const SubscriptionManagementPage = () => {
  const [params] = useSearchParams();
  const token = params.get('token');
  const [subscription, setSubscription] = useState<SubscriptionData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [cancelling, setCancelling] = useState(false);
  const [cancelSuccess, setCancelSuccess] = useState(false);
  const [cancelMessage, setCancelMessage] = useState<string | null>(null);
  const [notifBusy, setNotifBusy] = useState(false);

  useEffect(() => {
    if (!token) {
      setError('Missing management token. Request a fresh magic link to continue.');
      setLoading(false);
      return;
    }

    const fetchSubscription = async () => {
      try {
        const data = await getSubscriptionByToken(token);
        if (data) setSubscription(data);
        else setError('Subscription not found. The link may have expired or is invalid.');
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load subscription');
      } finally {
        setLoading(false);
      }
    };

    fetchSubscription();
  }, [token]);

  const handleCancel = async (cancelMode: 'refund_now' | 'period_end' = 'period_end') => {
    if (!token || !subscription) return;
    const prompt =
      cancelMode === 'refund_now'
        ? 'Cancel now and issue a full refund? Your access will end immediately.'
        : 'Cancel at period end? You will keep alerts until the current period ends, but no refund will be issued.';
    if (!confirm(prompt)) return;

    setCancelling(true);
    try {
      const result = await cancelSubscription(token, { cancelMode });
      if (result.success) {
        setCancelSuccess(true);
        setCancelMessage(result.message ?? 'Subscription cancelled.');
        const updated = await getSubscriptionByToken(token);
        if (updated) setSubscription(updated);
      } else {
        setError(result.error || 'Failed to cancel subscription');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to cancel subscription');
    } finally {
      setCancelling(false);
    }
  };

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return '—';
    return new Date(dateStr).toLocaleDateString('en-GB', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  };

  if (loading) {
    return (
      <div className="banner">
        <p>Loading subscription details…</p>
      </div>
    );
  }

  if (error && !subscription) {
    return (
      <div className="grid" style={{ gap: '1rem', maxWidth: '520px', margin: '2rem auto 0' }}>
        <div className="banner banner--error">
          <p>{error}</p>
        </div>
        <Link to="/login" className="btn btn--ghost btn--full">
          Email me a new magic link
        </Link>
        <Link to="/" className="btn btn--full">
          Back to home
        </Link>
      </div>
    );
  }

  if (!subscription) return null;

  const pendingCancellation = subscription.cancellationReason === 'user_cancel_period_end';
  const usesTelegram =
    subscription.notificationPreference === 'telegram' || subscription.notificationPreference === 'both';

  return (
    <div className="grid" style={{ gap: '1.25rem', maxWidth: '640px', margin: '0 auto' }}>
      <Link to="/" className="back-link">
        ← Back to home
      </Link>

      <div className="glass-card glass-card--accent">
        <p className="section__eyebrow" style={{ color: 'var(--yellow)' }}>
          Subscription
        </p>
        <h1 style={{ margin: '0.125rem 0 0.25rem' }}>{subscription.production.name}</h1>
        <p className="muted" style={{ margin: 0 }}>{subscription.production.theatre}</p>
        <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap', marginTop: '0.875rem' }}>
          <span className={`pill ${subscription.isActive ? 'pill--success' : 'pill--warning'}`}>
            <span className="pill__dot" />
            {subscription.isActive ? 'Active' : 'Inactive'}
          </span>
          {pendingCancellation && subscription.isActive && (
            <span className="pill pill--warning">Pending cancellation</span>
          )}
        </div>
      </div>

      <div className="glass-card">
        <h2 style={{ marginBottom: '1rem' }}>Subscription details</h2>
        <div className="def-list">
          <div className="def-list__row">
            <span className="def-list__label">Email</span>
            <span className="def-list__value">{subscription.user.email || '—'}</span>
          </div>
          <div className="def-list__row">
            <span className="def-list__label">Started</span>
            <span className="def-list__value">{formatDate(subscription.subscriptionStart)}</span>
          </div>
          <div className="def-list__row">
            <span className="def-list__label">Ends / renews</span>
            <span className="def-list__value">{formatDate(subscription.subscriptionEnd)}</span>
          </div>
        </div>
      </div>

      <div className="glass-card">
        <h2 style={{ marginBottom: '0.5rem' }}>Notifications</h2>
        <p className="form-field__hint" style={{ marginBottom: '0.75rem' }}>
          Email, Telegram, or both. To use Telegram, open the <strong>Connect Telegram</strong> link in your
          confirmation email and tap <strong>Start</strong> in the bot chat.
        </p>
        <NotificationPreferenceSelector
          value={(subscription.notificationPreference as NotificationPreference) || 'email'}
          disabled={notifBusy || !subscription.isActive}
          onChange={(value) => {
            if (!token) return;
            void (async () => {
              setNotifBusy(true);
              setError(null);
              try {
                const res = await updateNotificationPreference(token, value);
                if (res.error) setError(res.error);
                else {
                  const u = await getSubscriptionByToken(token);
                  if (u) setSubscription(u);
                }
              } finally {
                setNotifBusy(false);
              }
            })();
          }}
        />
        {subscription.isActive && usesTelegram && (
          <p className="form-field__hint" style={{ marginTop: '0.875rem' }}>
            Telegram status:{' '}
            {subscription.user.telegramConnected ? (
              <span className="status-text--success">Connected</span>
            ) : (
              <span>
                <strong>Not connected yet</strong> — open the link from your email, then refresh this page.
              </span>
            )}
          </p>
        )}
      </div>

      {pendingCancellation && subscription.isActive && !cancelSuccess && (
        <div className="glass-card">
          <h2 style={{ marginBottom: '0.5rem' }}>Cancellation scheduled</h2>
          <p className="muted" style={{ margin: 0 }}>
            Your subscription is set to end on <strong>{formatDate(subscription.subscriptionEnd)}</strong>. You&apos;ll
            keep receiving alerts until then, and no further renewals will be taken.
          </p>
        </div>
      )}

      {subscription.isActive && !cancelSuccess && !pendingCancellation && (
        <div className="glass-card">
          <h2 style={{ marginBottom: '0.5rem' }}>Cancel subscription</h2>
          {subscription.refundGuarantee?.applies ? (
            <p className="muted">
              <strong style={{ color: 'var(--text)' }}>You&apos;re covered by our guarantee.</strong> No standing
              tickets have been found since your last payment. Choose to refund now (ends immediately) or keep access
              to period end (no refund).
            </p>
          ) : (
            <p className="muted">
              Standing tickets have been found during this billing period, so we cannot refund. Cancelling stops future
              charges; you&apos;ll keep receiving alerts until {formatDate(subscription.subscriptionEnd)}.
            </p>
          )}
          {error && (
            <div className="banner banner--error" style={{ marginTop: '0.75rem' }}>
              {error}
            </div>
          )}
          <div style={{ display: 'grid', gap: '0.625rem', marginTop: '1rem' }}>
            {subscription.refundGuarantee?.applies ? (
              <>
                <button
                  onClick={() => handleCancel('refund_now')}
                  disabled={cancelling}
                  className="btn btn--full"
                >
                  {cancelling ? 'Processing…' : 'Cancel now & refund in full'}
                </button>
                <button
                  onClick={() => handleCancel('period_end')}
                  disabled={cancelling}
                  className="btn btn--ghost btn--full"
                >
                  {cancelling ? 'Processing…' : 'Cancel at period end (no refund)'}
                </button>
              </>
            ) : (
              <button
                onClick={() => handleCancel('period_end')}
                disabled={cancelling}
                className="btn btn--full"
              >
                {cancelling ? 'Cancelling…' : 'Cancel subscription'}
              </button>
            )}
          </div>
        </div>
      )}

      {cancelSuccess && (
        <div className="glass-card glass-card--accent">
          <h2 style={{ marginBottom: '0.5rem' }}>Subscription cancelled</h2>
          <p className="muted" style={{ margin: 0 }}>
            {cancelMessage ??
              `Your subscription has been cancelled. You will continue to receive alerts until ${formatDate(subscription.subscriptionEnd)}.`}
          </p>
        </div>
      )}

      <div className="glass-card">
        <p className="muted" style={{ margin: 0, fontSize: '0.875rem' }}>
          <strong style={{ color: 'var(--text)' }}>Need help?</strong> Reply to any alert email and we&apos;ll get
          back to you.
        </p>
      </div>
    </div>
  );
};
