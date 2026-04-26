import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useProductions } from '../hooks/useProductions';
import { useComingSoonProductions } from '../hooks/useComingSoonProductions';
import { ProductionCard } from '../components/ProductionCard';

const howItWorks = [
  {
    number: '1',
    title: 'Choose a show',
    body: 'Pick a production we cover and add it to your watchlist.',
  },
  {
    number: '2',
    title: 'Subscribe',
    body: '£2 a month per show. Cancel anytime, refund if no tickets are found.',
  },
  {
    number: '3',
    title: 'Get notified',
    body: 'Email or Telegram the moment same-day standing tickets drop.',
  },
];

export const HomePage = () => {
  const { productions, loading, error } = useProductions();
  const { productions: comingSoon, loading: comingSoonLoading } = useComingSoonProductions();
  const [activeTab, setActiveTab] = useState<'now-showing' | 'coming-soon'>('now-showing');

  return (
    <div>
      <section className="hero">
        <span className="hero__eyebrow">
          <span className="hero__eyebrow-dot" />
          Standing tickets, same day
        </span>
        <h1 className="hero__title">Be first when standing tickets drop.</h1>
        <p className="hero__subtitle">
          Yellow Sticker quietly watches official box offices and pings you the second same-day
          standing tickets appear for the shows you care about. £2 a month per show.
        </p>
        <div className="hero__cta">
          <a href="#productions" className="btn btn--large">
            Browse productions
          </a>
          <Link to="/faq" className="btn btn--ghost btn--large">
            How it works
          </Link>
        </div>
        <p className="hero__meta">Email or Telegram alerts · Cancel anytime · No-tickets-no-charge</p>
      </section>

      <section className="section">
        <div className="how-it-works-wrap">
          <div className="how-it-works">
            {howItWorks.map((card) => (
              <div key={card.title} className="how-it-works__item">
                <div className="how-it-works__number">{card.number}</div>
                <h3 className="how-it-works__title">{card.title}</h3>
                <p className="how-it-works__body">{card.body}</p>
              </div>
            ))}
          </div>

          <Link
            to="/faq#refund-guarantee"
            className="guarantee-link"
            aria-label="Money-back guarantee — read the terms"
          >
            <span className="guarantee-link__icon" aria-hidden="true">
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                <path
                  d="M13.5 4.5 6.5 11.5 2.5 7.5"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </span>
            <span className="guarantee-link__text">
              <strong>Money-back guarantee.</strong>{' '}
              No standing tickets found before your renewal? Get a full refund.
            </span>
            <span className="guarantee-link__chev" aria-hidden="true">→</span>
          </Link>
        </div>
      </section>

      <section className="section" id="productions">
        <div className="section__head">
          <div>
            <p className="section__eyebrow">Productions we cover</p>
            <h2 className="section__title">Browse productions</h2>
            <p className="section__subtitle">
              Each subscription tracks a single show. Add as many as you like.
            </p>
          </div>
        </div>

        <div className="tabs" role="tablist" aria-label="Productions">
          <button
            role="tab"
            aria-selected={activeTab === 'now-showing'}
            className={`tab ${activeTab === 'now-showing' ? 'tab--active' : ''}`}
            onClick={() => setActiveTab('now-showing')}
          >
            Now showing
            {productions.length > 0 && <span className="tab__count">{productions.length}</span>}
          </button>
          <button
            role="tab"
            aria-selected={activeTab === 'coming-soon'}
            className={`tab ${activeTab === 'coming-soon' ? 'tab--active' : ''}`}
            onClick={() => setActiveTab('coming-soon')}
          >
            Coming soon
            {comingSoon.length > 0 && <span className="tab__count">{comingSoon.length}</span>}
          </button>
        </div>

        {activeTab === 'now-showing' && (
          <>
            {loading && (
              <div className="banner">
                <p>Loading productions…</p>
              </div>
            )}
            {error && !loading && <div className="banner banner--error">{error}</div>}
            {!loading && productions.length === 0 && (
              <div className="banner">
                <p>No productions currently showing.</p>
              </div>
            )}
            {!loading && productions.length > 0 && (
              <div className="grid grid--productions">
                {productions.map((production) => (
                  <ProductionCard key={production.id} production={production} />
                ))}
              </div>
            )}
          </>
        )}

        {activeTab === 'coming-soon' && (
          <>
            {comingSoonLoading && (
              <div className="banner">
                <p>Loading coming soon productions…</p>
              </div>
            )}
            {!comingSoonLoading && comingSoon.length === 0 && (
              <div className="banner">
                <p>No productions coming soon.</p>
              </div>
            )}
            {!comingSoonLoading && comingSoon.length > 0 && (
              <div className="grid grid--productions">
                {comingSoon.map((production) => (
                  <ProductionCard key={production.id} production={production} />
                ))}
              </div>
            )}
          </>
        )}
      </section>
    </div>
  );
};
