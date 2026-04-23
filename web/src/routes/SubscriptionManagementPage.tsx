import { useState, useEffect } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { getSubscriptionByToken, cancelSubscription } from '../lib/api';

interface SubscriptionData {
  id: string;
  paymentStatus: string;
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

  useEffect(() => {
    if (!token) {
      setError('Missing management token');
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

  const handleCancel = async () => {
    if (!token || !subscription) return;
    const willRefund = subscription.refundGuarantee?.applies;
    const prompt = willRefund
      ? 'Cancel now? Because no standing tickets have been found since your last payment, we\'ll refund it in full per our guarantee.'
      : 'Cancel your subscription? You\'ll keep receiving alerts until the end of the current billing period.';
    if (!confirm(prompt)) {
      return;
    }

    setCancelling(true);
    try {
      const result = await cancelSubscription(token);
      if (result.success) {
        setCancelSuccess(true);
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
        <Link to="/" className="btn btn--full">
          Back to home
        </Link>
      </div>
    );
  }

  if (!subscription) {
    return null;
  }

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

          <div>
            <strong style={{ color: 'var(--text-muted)', fontSize: '0.85rem', display: 'block', marginBottom: '0.25rem' }}>
              Notification Preference
            </strong>
            <span style={{ textTransform: 'capitalize' }}>
              {subscription.user.notificationPreference || 'email'}
            </span>
          </div>
        </div>
      </div>

      {subscription.isActive && !cancelSuccess && (
        <div className="glass-card">
          <h2 style={{ marginTop: 0 }}>Cancel Subscription</h2>
          {subscription.refundGuarantee?.applies ? (
            <p style={{ color: 'var(--text-muted)' }}>
              <strong>You're covered by our guarantee.</strong> No standing tickets have been found since your last payment, so cancelling now will refund your last charge in full.
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
          <button
            onClick={handleCancel}
            disabled={cancelling}
            className="btn btn--full"
            style={{ marginTop: '1rem' }}
          >
            {cancelling
              ? 'Cancelling…'
              : subscription.refundGuarantee?.applies
                ? 'Cancel & get refund'
                : 'Cancel Subscription'}
          </button>
        </div>
      )}

      {cancelSuccess && (
        <div className="glass-card glass-card--accent">
          <h2 style={{ marginTop: 0 }}>Subscription Cancelled</h2>
          <p style={{ color: 'var(--text-muted)' }}>
            Your subscription has been cancelled. You will continue to receive alerts until {formatDate(subscription.subscriptionEnd)}.
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

