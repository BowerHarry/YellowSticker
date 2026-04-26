import { useState, useEffect } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import {
  getSubscriptionByToken,
  cancelSubscription,
  updateNotificationPreference,
  requestTelegramLink,
} from '../lib/api';
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
  user: {
    id: string;
    email: string | null;
    notificationPreference: string;
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
  const [tgBusy, setTgBusy] = useState(false);

  useEffect(() => {
    if (!token) {
      setError('Missing management token. Request a fresh magic link to continue.');
      setLoading(false);
      return;
    }

    const fetchSubscription = async () => {
      try {
        const data = await getSubscriptionByToken(token);
        if (data) {
          setSubscription(data);
        } else {
          setError('Subscription not found. The link may have expired or is invalid.');
        }
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
    if (!confirm(prompt)) {
      return;
    }

    setCancelling(true);
    try {
      const result = await cancelSubscription(token, { cancelMode });
      if (result.success) {
        setCancelSuccess(true);
        setCancelMessage(result.message ?? 'Subscription cancelled.');
        // Refresh subscription data
        const updated = await getSubscriptionByToken(token);
        if (updated) {
          setSubscription(updated);
        }
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
        <p style={{ margin: 0 }}>Loading subscription details…</p>
      </div>
    );
  }

  if (error && !subscription) {
    return (
      <div className="grid" style={{ gap: '2rem' }}>
        <div className="banner banner--error">
          <p style={{ margin: 0 }}>{error}</p>
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

  if (!subscription) {
    return null;
  }

  const pendingCancellation = subscription.cancellationReason === 'user_cancel_period_end';

  return (
    <div className="grid" style={{ gap: '2rem', maxWidth: '640px', margin: '0 auto' }}>
      <Link to="/" className="back-link">
        ← Back to home
      </Link>

      <div className="glass-card glass-card--accent">
        <h1 style={{ marginTop: 0 }}>Manage Your Subscription</h1>
        <p style={{ color: 'var(--text-muted)', marginTop: 0 }}>
          {subscription.production.name}
        </p>
      </div>

      <div className="glass-card">
        <h2 style={{ marginTop: 0 }}>Subscription Details</h2>
        
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div>
            <strong style={{ color: 'var(--text-muted)', fontSize: '0.85rem', display: 'block', marginBottom: '0.25rem' }}>
              Status
            </strong>
            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
              <span style={{ 
                display: 'inline-block',
                padding: '0.25rem 0.75rem',
                borderRadius: '999px',
                fontSize: '0.85rem',
                fontWeight: 500,
                background: subscription.isActive 
                  ? 'rgba(76, 175, 80, 0.2)' 
                  : 'rgba(255, 152, 0, 0.2)',
                color: subscription.isActive ? '#4caf50' : '#ff9800',
              }}>
                {subscription.isActive ? 'Active' : 'Inactive'}
              </span>
              {pendingCancellation && subscription.isActive && (
                <span
                  style={{
                    display: 'inline-block',
                    padding: '0.25rem 0.75rem',
                    borderRadius: '999px',
                    fontSize: '0.85rem',
                    fontWeight: 500,
                    background: 'rgba(255, 211, 0, 0.2)',
                    color: '#ffd300',
                    border: '1px solid rgba(255, 211, 0, 0.35)',
                  }}
                >
                  Pending cancellation
                </span>
              )}
            </div>
          </div>

          <div>
            <strong style={{ color: 'var(--text-muted)', fontSize: '0.85rem', display: 'block', marginBottom: '0.25rem' }}>
              Email
            </strong>
            <span>{subscription.user.email || '—'}</span>
          </div>

          <div>
            <strong style={{ color: 'var(--text-muted)', fontSize: '0.85rem', display: 'block', marginBottom: '0.25rem' }}>
              Subscription Start
            </strong>
            <span>{formatDate(subscription.subscriptionStart)}</span>
          </div>

          <div>
            <strong style={{ color: 'var(--text-muted)', fontSize: '0.85rem', display: 'block', marginBottom: '0.25rem' }}>
              Subscription End
            </strong>
            <span>{formatDate(subscription.subscriptionEnd)}</span>
          </div>

        </div>
      </div>

      <div className="glass-card">
        <h2 style={{ marginTop: 0 }}>Notifications</h2>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginTop: 0 }}>
          Choose email, Telegram, or both. For Telegram, open the link and tap Start in the chat with our bot.
        </p>
        <div style={{ marginTop: '1rem' }}>
          <NotificationPreferenceSelector
            value={(subscription.user.notificationPreference as NotificationPreference) || 'email'}
            disabled={notifBusy || tgBusy || !subscription.isActive}
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
          {subscription.isActive &&
            (subscription.user.notificationPreference === 'telegram' ||
              subscription.user.notificationPreference === 'both') && (
              <div style={{ marginTop: '1.25rem' }}>
                <p style={{ margin: '0 0 0.5rem', fontSize: '0.9rem', color: 'var(--text-muted)' }}>
                  Telegram status:{' '}
                  {subscription.user.telegramConnected ? (
                    <strong style={{ color: '#4caf50' }}>Connected</strong>
                  ) : (
                    <strong>Not connected yet</strong>
                  )}
                </p>
                <button
                  type="button"
                  className="btn btn--ghost"
                  disabled={tgBusy || notifBusy}
                  onClick={() => {
                    if (!token) return;
                    void (async () => {
                      setTgBusy(true);
                      setError(null);
                      try {
                        const res = await requestTelegramLink(token);
                        if (res.telegramUrl) {
                          window.open(res.telegramUrl, '_blank', 'noopener,noreferrer');
                        } else {
                          setError(res.error ?? 'Could not open Telegram link');
                        }
                      } finally {
                        setTgBusy(false);
                      }
                    })();
                  }}
                >
                  {tgBusy ? 'Opening…' : 'Connect Telegram'}
                </button>
                <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '0.5rem', marginBottom: 0 }}>
                  After you message the bot, refresh this page to see Connected.
                </p>
              </div>
            )}
        </div>
      </div>

      {pendingCancellation && subscription.isActive && !cancelSuccess && (
        <div className="glass-card">
          <h2 style={{ marginTop: 0 }}>Cancellation scheduled</h2>
          <p style={{ color: 'var(--text-muted)', marginBottom: 0 }}>
            Your subscription is set to end on <strong>{formatDate(subscription.subscriptionEnd)}</strong>.
            You&apos;ll keep receiving alerts until then, and no further renewals will be taken.
          </p>
        </div>
      )}

      {subscription.isActive && !cancelSuccess && !pendingCancellation && (
        <div className="glass-card">
          <h2 style={{ marginTop: 0 }}>Cancel Subscription</h2>
          {subscription.refundGuarantee?.applies ? (
            <p style={{ color: 'var(--text-muted)' }}>
              <strong>You&apos;re covered by our guarantee.</strong> No standing tickets have been found since your last payment. Choose whether to refund now (ends immediately) or keep access to period end (no refund).
            </p>
          ) : (
            <p style={{ color: 'var(--text-muted)' }}>
              Standing tickets have been found during this billing period, so we cannot refund. Cancelling will stop future charges; you'll keep receiving alerts until {formatDate(subscription.subscriptionEnd)}.
            </p>
          )}
          {error && (
            <div className="banner banner--error" style={{ marginBottom: '1rem' }}>
              {error}
            </div>
          )}
          {subscription.refundGuarantee?.applies ? (
            <div style={{ display: 'grid', gap: '0.75rem', marginTop: '1rem' }}>
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
            </div>
          ) : (
            <button
              onClick={() => handleCancel('period_end')}
              disabled={cancelling}
              className="btn btn--full"
              style={{ marginTop: '1rem' }}
            >
              {cancelling ? 'Cancelling…' : 'Cancel Subscription'}
            </button>
          )}
        </div>
      )}

      {cancelSuccess && (
        <div className="glass-card glass-card--accent">
          <h2 style={{ marginTop: 0 }}>Subscription Cancelled</h2>
          <p style={{ color: 'var(--text-muted)' }}>
            {cancelMessage ?? `Your subscription has been cancelled. You will continue to receive alerts until ${formatDate(subscription.subscriptionEnd)}.`}
          </p>
        </div>
      )}

      <div className="glass-card">
        <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', margin: 0 }}>
          <strong>Need help?</strong> Reply to any alert email and we'll help you out.
        </p>
      </div>
    </div>
  );
};

