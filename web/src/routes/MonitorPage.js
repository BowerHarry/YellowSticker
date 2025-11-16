import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useState } from 'react';
import { getMonitorStatus, triggerScrape, adminAuth } from '../lib/api';
import { AdminLogin } from '../components/AdminLogin';
const Dot = ({ status }) => {
    // Handle legacy boolean for services
    const actualStatus = typeof status === 'boolean' ? (status ? 'healthy' : 'unhealthy') : status;
    const colors = {
        healthy: '#4ade80',
        unhealthy: '#f87171',
        paused: '#9ca3af', // grey
    };
    const shadows = {
        healthy: '0 0 6px rgba(74, 222, 128, 0.6)',
        unhealthy: '0 0 6px rgba(248, 113, 113, 0.6)',
        paused: '0 0 6px rgba(156, 163, 175, 0.4)',
    };
    return (_jsx("span", { style: {
            display: 'inline-block',
            width: '0.75rem',
            height: '0.75rem',
            borderRadius: '50%',
            marginRight: '0.5rem',
            backgroundColor: colors[actualStatus],
            boxShadow: shadows[actualStatus],
        } }));
};
const SectionCard = ({ title, children }) => (_jsxs("section", { className: "glass-card", style: { display: 'flex', flexDirection: 'column', gap: '0.75rem' }, children: [_jsx("h2", { style: { margin: 0 }, children: title }), children] }));
const StatusRow = ({ label, healthy, status, detail, }) => {
    const dotStatus = status ?? (healthy !== undefined ? healthy : 'unhealthy');
    return (_jsxs("div", { style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.75rem' }, children: [_jsxs("div", { style: { display: 'flex', alignItems: 'center' }, children: [_jsx(Dot, { status: dotStatus }), _jsx("span", { children: label })] }), detail && (_jsx("span", { style: { color: 'var(--muted)', fontSize: '0.85rem', textAlign: 'right' }, children: detail }))] }));
};
const formatTimestamp = (iso) => {
    if (!iso)
        return 'Never';
    const date = new Date(iso);
    return `${date.toLocaleDateString()} ${date.toLocaleTimeString()}`;
};
const isAuthenticated = () => {
    const token = localStorage.getItem('admin_token');
    const expiresAt = localStorage.getItem('admin_token_expires');
    if (!token || !expiresAt) {
        return false;
    }
    // Check if token has expired
    const expirationDate = new Date(expiresAt);
    if (expirationDate < new Date()) {
        localStorage.removeItem('admin_token');
        localStorage.removeItem('admin_token_expires');
        return false;
    }
    return true;
};
const setAuthenticated = (token, expiresAt) => {
    localStorage.setItem('admin_token', token);
    localStorage.setItem('admin_token_expires', expiresAt);
};
const clearAuthentication = () => {
    localStorage.removeItem('admin_token');
    localStorage.removeItem('admin_token_expires');
};
export const MonitorPage = () => {
    const [authenticated, setAuthenticatedState] = useState(isAuthenticated());
    const [status, setStatus] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [triggering, setTriggering] = useState(false);
    const [triggerError, setTriggerError] = useState(null);
    const [triggerSuccess, setTriggerSuccess] = useState(false);
    const handleLogin = async (username, password) => {
        const result = await adminAuth(username, password);
        if (result.success && result.token && result.expiresAt) {
            setAuthenticated(result.token, result.expiresAt);
            setAuthenticatedState(true);
            return true;
        }
        return false;
    };
    const handleLogout = () => {
        clearAuthentication();
        setAuthenticatedState(false);
    };
    const loadStatus = async () => {
        setLoading(true);
        setError(null);
        const data = await getMonitorStatus();
        if (!data) {
            setError('Unable to load monitoring data');
        }
        setStatus(data);
        setLoading(false);
    };
    useEffect(() => {
        if (authenticated) {
            loadStatus();
        }
    }, [authenticated]);
    const handleTriggerScrape = async () => {
        setTriggering(true);
        setTriggerError(null);
        setTriggerSuccess(false);
        const result = await triggerScrape();
        if (result.error) {
            setTriggerError(result.error);
        }
        else {
            setTriggerSuccess(true);
            // Reload status after a short delay to see updated timestamps
            setTimeout(() => {
                loadStatus();
                setTriggerSuccess(false);
            }, 2000);
        }
        setTriggering(false);
    };
    if (!authenticated) {
        return _jsx(AdminLogin, { onLogin: handleLogin });
    }
    if (loading || !status) {
        return (_jsx("div", { className: "glass-card", children: _jsxs("div", { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }, children: [_jsx("p", { style: { margin: 0 }, children: error ?? 'Loading status…' }), _jsx("button", { onClick: handleLogout, className: "btn btn--ghost btn--small", children: "Logout" })] }) }));
    }
    if (error) {
        return (_jsx("div", { className: "glass-card", children: _jsxs("div", { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' }, children: [_jsx("p", { style: { margin: 0, color: '#f87171' }, children: error }), _jsx("button", { onClick: handleLogout, className: "btn btn--ghost btn--small", children: "Logout" })] }) }));
    }
    const renderProduction = (production) => {
        const lastCheckedText = production.lastCheckedAt ? formatTimestamp(production.lastCheckedAt) : 'Never';
        const lastFoundText = production.lastStandingTicketsFoundAt
            ? formatTimestamp(production.lastStandingTicketsFoundAt)
            : 'Never';
        return (_jsxs("div", { style: { display: 'flex', flexDirection: 'column', gap: '0.25rem' }, children: [_jsx(StatusRow, { label: production.name, status: production.status, detail: lastCheckedText }), production.lastStandingTicketsFoundAt && (_jsxs("div", { style: { marginLeft: '1.5rem', fontSize: '0.85rem', color: 'var(--muted)' }, children: ["Last found: ", lastFoundText] }))] }, production.id));
    };
    const { services } = status;
    return (_jsxs("div", { children: [_jsx("div", { style: { display: 'flex', justifyContent: 'flex-end', marginBottom: '1rem' }, children: _jsx("button", { onClick: handleLogout, className: "btn btn--ghost btn--small", children: "Logout" }) }), _jsxs("div", { className: "grid", style: { gap: '1.5rem', padding: '2rem 0' }, children: [_jsx(SectionCard, { title: "Productions", children: _jsx("div", { className: "grid", style: { gap: '0.75rem' }, children: status.productions.map(renderProduction) }) }), _jsxs(SectionCard, { title: "Services", children: [_jsxs("div", { className: "grid", style: { gap: '0.75rem' }, children: [_jsx(StatusRow, { label: "Web scraper", healthy: services.scraper.healthy, detail: services.scraper.monthlyUsed !== undefined && services.scraper.monthlyLimit !== undefined
                                            ? `${services.scraper.used}/${services.scraper.limit} today · ${services.scraper.monthlyUsed}/${services.scraper.monthlyLimit} this month`
                                            : `${services.scraper.used}/${services.scraper.limit} req today` }), _jsx(StatusRow, { label: "Database", healthy: services.database.healthy, detail: `${services.database.monthlyUsers}/${services.database.monthlyUserLimit} MAU · ${(services.database.sizeBytes / (1024 * 1024)).toFixed(1)} / ${(services.database.sizeLimitBytes / (1024 * 1024)).toFixed(0)} MB` }), _jsx(StatusRow, { label: "Email provider", healthy: services.email.healthy, detail: `${services.email.dailyUsage}/${services.email.dailyLimit} today · ${services.email.monthlyUsage}/${services.email.monthlyLimit} this month` }), _jsx(StatusRow, { label: "Payment provider", healthy: services.payment.healthy, detail: services.payment.lastPaidAt ? `Last paid ${formatTimestamp(services.payment.lastPaidAt)}` : `No payments in ${services.payment.lookbackDays}d` })] }), _jsxs("div", { style: { marginTop: '1rem', paddingTop: '1rem', borderTop: '1px solid #222' }, children: [_jsx("button", { onClick: handleTriggerScrape, disabled: triggering, style: {
                                            padding: '0.75rem 1.5rem',
                                            backgroundColor: triggering ? '#666' : 'var(--yellow)',
                                            color: '#000',
                                            border: 'none',
                                            borderRadius: '0.5rem',
                                            fontWeight: '600',
                                            cursor: triggering ? 'not-allowed' : 'pointer',
                                            fontSize: '0.9rem',
                                            width: '100%',
                                        }, children: triggering ? 'Triggering...' : triggerSuccess ? '✓ Triggered successfully' : 'Run Scraper Now' }), triggerError && (_jsxs("p", { style: { margin: '0.5rem 0 0 0', color: '#f87171', fontSize: '0.85rem' }, children: ["Error: ", triggerError] }))] })] })] })] }));
};
