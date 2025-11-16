import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useProductions } from '../hooks/useProductions';
import { useComingSoonProductions } from '../hooks/useComingSoonProductions';
import { ProductionCard } from '../components/ProductionCard';
const howItWorks = [
    {
        number: '1',
        title: 'Choose',
        body: 'Select a production to track',
    },
    {
        number: '2',
        title: 'Subscribe',
        body: '£4.99/month per show for instant alerts',
    },
    {
        number: '3',
        title: 'Get Notified',
        body: 'Get alerts when cheap tickets drop',
    },
];
export const HomePage = () => {
    const { productions, loading, error } = useProductions();
    const { productions: comingSoon, loading: comingSoonLoading } = useComingSoonProductions();
    const [activeTab, setActiveTab] = useState('now-showing');
    return (_jsxs("div", { className: "home", children: [_jsxs("section", { className: "hero", children: [_jsx("div", { className: "hero__label", children: "Standing tickets today" }), _jsx("h1", { className: "hero__title", children: "Yellow Sticker Alerts" }), _jsx("h2", { className: "hero__subheader", children: "Never miss discounted standing tickets for London's hottest shows." }), _jsx("p", { className: "hero__text", children: "Get instant notifications when same-day standing tickets drop for your favourite productions." })] }), _jsxs("section", { className: "hero-cta-section", children: [_jsx("div", { className: "hero__cta", children: _jsx("a", { href: "#productions", className: "btn", children: "Browse productions" }) }), _jsx("p", { className: "hero__meta", children: "Just \u00A34.99/month per show \u2022 Text or Email" })] }), _jsx("section", { className: "home-section", children: _jsx("div", { className: "how-it-works", children: howItWorks.map((card, index) => (_jsxs("div", { className: "how-it-works__item", children: [_jsx("div", { className: "how-it-works__number", children: card.number }), _jsxs("div", { className: "how-it-works__content", children: [_jsx("h3", { className: "how-it-works__title", children: card.title }), _jsx("p", { className: "how-it-works__body", children: card.body })] }), index < howItWorks.length - 1 && _jsx("div", { className: "how-it-works__connector" })] }, card.title))) }) }), _jsxs("section", { className: "home-section", id: "productions", children: [_jsxs("div", { className: "home-section__head", children: [_jsxs("div", { children: [_jsx("p", { style: { textTransform: 'uppercase', letterSpacing: '0.08em', fontSize: '0.8rem', color: 'var(--text-muted)' }, children: "Productions we cover" }), _jsx("h2", { style: { margin: '0.15rem 0' }, children: "Browse productions" }), _jsx("p", { style: { margin: 0, color: 'var(--text-muted)' }, children: "Subscribing adds you to our alert queue for that show only." })] }), _jsx(Link, { to: "/faq", className: "btn btn--ghost", children: "FAQ" })] }), _jsxs("div", { className: "tabs", children: [_jsxs("button", { className: `tab ${activeTab === 'now-showing' ? 'tab--active' : ''}`, onClick: () => setActiveTab('now-showing'), children: ["Now Showing", productions.length > 0 && (_jsxs("span", { className: "tab__count", children: ["(", productions.length, ")"] }))] }), _jsxs("button", { className: `tab ${activeTab === 'coming-soon' ? 'tab--active' : ''}`, onClick: () => setActiveTab('coming-soon'), children: ["Coming Soon", comingSoon.length > 0 && (_jsxs("span", { className: "tab__count", children: ["(", comingSoon.length, ")"] }))] })] }), activeTab === 'now-showing' && (_jsxs(_Fragment, { children: [loading && (_jsx("div", { className: "banner", children: _jsx("p", { style: { margin: 0 }, children: "Loading productions\u2026" }) })), error && !loading && (_jsx("div", { className: "banner banner--error", children: error })), !loading && productions.length === 0 && (_jsx("div", { className: "banner", children: _jsx("p", { style: { margin: 0 }, children: "No productions currently showing." }) })), !loading && productions.length > 0 && (_jsx("div", { className: "grid grid--productions", children: productions.map((production) => (_jsx(ProductionCard, { production: production }, production.id))) }))] })), activeTab === 'coming-soon' && (_jsxs(_Fragment, { children: [comingSoonLoading && (_jsx("div", { className: "banner", children: _jsx("p", { style: { margin: 0 }, children: "Loading coming soon productions\u2026" }) })), !comingSoonLoading && comingSoon.length === 0 && (_jsx("div", { className: "banner", children: _jsx("p", { style: { margin: 0 }, children: "No productions coming soon." }) })), !comingSoonLoading && comingSoon.length > 0 && (_jsx("div", { className: "grid grid--productions", children: comingSoon.map((production) => (_jsx(ProductionCard, { production: production }, production.id))) }))] }))] })] }));
};
