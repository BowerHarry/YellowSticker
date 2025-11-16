import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState, useEffect } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { getSubscriptionByToken, cancelSubscription } from '../lib/api';
export const SubscriptionManagementPage = () => {
    const [params] = useSearchParams();
    const token = params.get('token');
    const [subscription, setSubscription] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
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
                }
                else {
                    setError('Subscription not found. The link may have expired or is invalid.');
                }
            }
            catch (err) {
                setError(err instanceof Error ? err.message : 'Failed to load subscription');
            }
            finally {
                setLoading(false);
            }
        };
        fetchSubscription();
    }, [token]);
    const handleCancel = async () => {
        if (!token || !subscription)
            return;
        if (!confirm('Are you sure you want to cancel your subscription? You will continue to receive alerts until the end of your current billing period.')) {
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
            }
            else {
                setError(result.error || 'Failed to cancel subscription');
            }
        }
        catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to cancel subscription');
        }
        finally {
            setCancelling(false);
        }
    };
    const formatDate = (dateStr) => {
        if (!dateStr)
            return '—';
        return new Date(dateStr).toLocaleDateString('en-GB', {
            year: 'numeric',
            month: 'long',
            day: 'numeric',
        });
    };
    if (loading) {
        return (_jsx("div", { className: "banner", children: _jsx("p", { style: { margin: 0 }, children: "Loading subscription details\u2026" }) }));
    }
    if (error && !subscription) {
        return (_jsxs("div", { className: "grid", style: { gap: '2rem' }, children: [_jsx("div", { className: "banner banner--error", children: _jsx("p", { style: { margin: 0 }, children: error }) }), _jsx(Link, { to: "/", className: "btn btn--full", children: "Back to home" })] }));
    }
    if (!subscription) {
        return null;
    }
    return (_jsxs("div", { className: "grid", style: { gap: '2rem', maxWidth: '640px', margin: '0 auto' }, children: [_jsx(Link, { to: "/", className: "back-link", children: "\u2190 Back to home" }), _jsxs("div", { className: "glass-card glass-card--accent", children: [_jsx("h1", { style: { marginTop: 0 }, children: "Manage Your Subscription" }), _jsx("p", { style: { color: 'var(--text-muted)', marginTop: 0 }, children: subscription.production.name })] }), _jsxs("div", { className: "glass-card", children: [_jsx("h2", { style: { marginTop: 0 }, children: "Subscription Details" }), _jsxs("div", { style: { display: 'flex', flexDirection: 'column', gap: '1rem' }, children: [_jsxs("div", { children: [_jsx("strong", { style: { color: 'var(--text-muted)', fontSize: '0.85rem', display: 'block', marginBottom: '0.25rem' }, children: "Status" }), _jsx("span", { style: {
                                            display: 'inline-block',
                                            padding: '0.25rem 0.75rem',
                                            borderRadius: '999px',
                                            fontSize: '0.85rem',
                                            fontWeight: 500,
                                            background: subscription.isActive
                                                ? 'rgba(76, 175, 80, 0.2)'
                                                : 'rgba(255, 152, 0, 0.2)',
                                            color: subscription.isActive ? '#4caf50' : '#ff9800',
                                        }, children: subscription.isActive ? 'Active' : 'Inactive' })] }), _jsxs("div", { children: [_jsx("strong", { style: { color: 'var(--text-muted)', fontSize: '0.85rem', display: 'block', marginBottom: '0.25rem' }, children: "Email" }), _jsx("span", { children: subscription.user.email || '—' })] }), _jsxs("div", { children: [_jsx("strong", { style: { color: 'var(--text-muted)', fontSize: '0.85rem', display: 'block', marginBottom: '0.25rem' }, children: "Subscription Start" }), _jsx("span", { children: formatDate(subscription.subscriptionStart) })] }), _jsxs("div", { children: [_jsx("strong", { style: { color: 'var(--text-muted)', fontSize: '0.85rem', display: 'block', marginBottom: '0.25rem' }, children: "Subscription End" }), _jsx("span", { children: formatDate(subscription.subscriptionEnd) })] }), _jsxs("div", { children: [_jsx("strong", { style: { color: 'var(--text-muted)', fontSize: '0.85rem', display: 'block', marginBottom: '0.25rem' }, children: "Notification Preference" }), _jsx("span", { style: { textTransform: 'capitalize' }, children: subscription.user.notificationPreference || 'email' })] })] })] }), subscription.isActive && !cancelSuccess && (_jsxs("div", { className: "glass-card", children: [_jsx("h2", { style: { marginTop: 0 }, children: "Cancel Subscription" }), _jsxs("p", { style: { color: 'var(--text-muted)' }, children: ["Cancel your subscription to stop receiving alerts. You will continue to receive alerts until the end of your current billing period (", formatDate(subscription.subscriptionEnd), ")."] }), error && (_jsx("div", { className: "banner banner--error", style: { marginBottom: '1rem' }, children: error })), _jsx("button", { onClick: handleCancel, disabled: cancelling, className: "btn btn--full", style: { marginTop: '1rem' }, children: cancelling ? 'Cancelling…' : 'Cancel Subscription' })] })), cancelSuccess && (_jsxs("div", { className: "glass-card glass-card--accent", children: [_jsx("h2", { style: { marginTop: 0 }, children: "Subscription Cancelled" }), _jsxs("p", { style: { color: 'var(--text-muted)' }, children: ["Your subscription has been cancelled. You will continue to receive alerts until ", formatDate(subscription.subscriptionEnd), "."] })] })), _jsx("div", { className: "glass-card", children: _jsxs("p", { style: { color: 'var(--text-muted)', fontSize: '0.85rem', margin: 0 }, children: [_jsx("strong", { children: "Need help?" }), " Reply to any alert email and we'll help you out."] }) })] }));
};
