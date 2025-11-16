import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { Link, useParams } from 'react-router-dom';
import { useProduction } from '../hooks/useProduction';
import { SubscriptionForm } from '../components/SubscriptionForm';
const formatDateTime = (value) => {
    if (!value)
        return '—';
    const date = new Date(value);
    return `${date.toLocaleDateString()} ${date.toLocaleTimeString('en-GB', {
        hour: '2-digit',
        minute: '2-digit',
    })}`;
};
export const ProductionPage = () => {
    const { slug } = useParams();
    const { production, loading, error } = useProduction(slug);
    if (loading) {
        return (_jsx("div", { className: "banner", children: _jsx("p", { style: { margin: 0 }, children: "Loading production details\u2026" }) }));
    }
    if (error || !production) {
        return (_jsxs("div", { className: "banner banner--error", children: [error ?? 'We could not find that production.', ' ', _jsx(Link, { to: "/", style: { color: '#fff', textDecoration: 'underline' }, children: "Return home" })] }));
    }
    const now = new Date();
    const startDate = production.start_date ? new Date(production.start_date) : null;
    const isComingSoon = startDate && startDate > now;
    let scrapingHost = production.scraping_url;
    try {
        scrapingHost = new URL(production.scraping_url).hostname;
    }
    catch {
        // keep original string
    }
    return (_jsxs("div", { className: "grid", style: { gap: '2rem' }, children: [_jsx(Link, { to: "/", className: "back-link", children: "\u2190 Back to productions" }), _jsxs("div", { className: "detail-grid", children: [_jsxs("article", { className: "glass-card glass-card--accent", children: [_jsx("p", { style: { textTransform: 'uppercase', letterSpacing: '0.08em', fontSize: '0.85rem', margin: 0 }, children: "\u00A34.99 per month" }), _jsx("h1", { style: { margin: '0.35rem 0' }, children: production.name }), _jsxs("p", { style: { color: 'var(--text-muted)', marginTop: 0 }, children: [production.theatre, production.city ? `, ${production.city}` : ''] }), _jsx("p", { style: { marginTop: '1rem', color: 'var(--text-muted)' }, children: production.description ??
                                    'Standing-room tickets are scarce. We poll the official seating map every few minutes so you never miss a drop.' }), _jsxs("div", { className: "stat-blocks", children: [_jsxs("div", { className: "stat-block", children: [_jsx("span", { children: "Last checked" }), _jsx("strong", { children: formatDateTime(production.last_checked_at) })] }), _jsxs("div", { className: "stat-block", children: [_jsx("span", { children: "Last found" }), _jsx("strong", { children: formatDateTime(production.last_standing_tickets_found_at) })] }), _jsxs("div", { className: "stat-block", children: [_jsx("span", { children: "Scraper URL" }), _jsx("strong", { style: { fontSize: '0.8rem', wordBreak: 'break-word' }, children: _jsx("a", { href: production.scraping_url, target: "_blank", rel: "noreferrer", children: scrapingHost }) })] })] })] }), _jsxs("article", { className: "glass-card form-panel", children: [_jsx("h2", { children: "Reserve your alert" }), isComingSoon ? (_jsx("div", { children: _jsxs("p", { style: { color: 'var(--yellow)', marginTop: 0, fontWeight: 500 }, children: ["This production is coming soon. Subscriptions will be available starting ", startDate?.toLocaleDateString('en-GB', {
                                            month: 'long',
                                            day: 'numeric',
                                            year: 'numeric'
                                        }), "."] }) })) : (_jsxs(_Fragment, { children: [_jsx("p", { style: { color: 'var(--text-muted)', marginTop: 0 }, children: "One alert per show keeps scraping costs low. Cancel anytime with one click." }), _jsx(SubscriptionForm, { production: production })] }))] })] }), _jsxs("article", { className: "glass-card", children: [_jsx("h2", { style: { marginTop: 0 }, children: "How notifications work" }), _jsxs("ol", { style: { lineHeight: 1.8, color: 'var(--text-muted)' }, children: [_jsxs("li", { children: ["Our Supabase Edge Function scrapes ", production.theatre, " multiple times per hour."] }), _jsx("li", { children: "Standing tickets appear? We log it and email subscribers instantly." }), _jsx("li", { children: "You click the official link and grab the seats before the queue forms." })] })] })] }));
};
