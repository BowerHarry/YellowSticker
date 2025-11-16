import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { Link } from 'react-router-dom';
import { getStorageUrl } from '../lib/supabaseClient';
const formatTime = (value) => {
    if (!value)
        return '—';
    return new Date(value).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
};
export const ProductionCard = ({ production }) => {
    const now = new Date();
    const startDate = production.start_date ? new Date(production.start_date) : null;
    const endDate = production.end_date ? new Date(production.end_date) : null;
    const isComingSoon = startDate && startDate > now;
    // Check if production is ending soon (within next 30 days)
    const isEndingSoon = endDate && endDate > now && (endDate.getTime() - now.getTime()) < 30 * 24 * 60 * 60 * 1000;
    return (_jsxs("article", { className: "production-card", children: [_jsxs("div", { className: "production-card__header", children: [_jsxs("div", { children: [_jsx("h3", { className: "production-card__title", children: production.name }), _jsxs("div", { className: "production-card__location", children: [_jsx("span", { className: "production-card__venue", children: production.theatre }), production.city && (_jsxs("span", { className: "production-card__city", children: [", ", production.city] }))] })] }), production.poster_url && (() => {
                        // If poster_url is already a full URL, use it; otherwise treat it as a storage path
                        const imageUrl = production.poster_url.startsWith('http')
                            ? production.poster_url
                            : getStorageUrl('production-posters', production.poster_url);
                        return imageUrl ? (_jsx("img", { src: imageUrl, alt: `${production.name} poster`, className: "production-card__poster" })) : null;
                    })()] }), _jsxs("div", { style: { flex: 1, display: 'flex', flexDirection: 'column' }, children: [production.description && (_jsx("p", { className: "production-card__description", children: production.description })), _jsxs("div", { style: { marginTop: 'auto', paddingTop: '0.5rem' }, children: [isComingSoon && startDate && (_jsxs("p", { style: {
                                    color: 'var(--yellow)',
                                    fontSize: '0.85rem',
                                    margin: 0,
                                    fontWeight: 500
                                }, children: ["Coming ", startDate.toLocaleDateString('en-GB', {
                                        month: 'long',
                                        day: 'numeric',
                                        year: 'numeric'
                                    })] })), !isComingSoon && isEndingSoon && endDate && (_jsxs("p", { style: {
                                    color: 'var(--yellow)',
                                    fontSize: '0.85rem',
                                    margin: 0,
                                    fontWeight: 500
                                }, children: ["Ending ", endDate.toLocaleDateString('en-GB', {
                                        month: 'long',
                                        day: 'numeric',
                                        year: 'numeric'
                                    })] }))] })] }), _jsx("div", { className: "production-card__actions", children: isComingSoon ? (_jsxs("div", { className: "btn btn--full", style: {
                        opacity: 0.6,
                        cursor: 'not-allowed',
                        pointerEvents: 'none'
                    }, children: ["Coming Soon", _jsx("span", { className: "btn__price", children: "Subscription unavailable" })] })) : (_jsxs(Link, { to: `/productions/${production.slug}`, className: "btn btn--full", children: ["Subscribe", _jsx("span", { className: "btn__price", children: "\u00A34.99/month" })] })) })] }));
};
