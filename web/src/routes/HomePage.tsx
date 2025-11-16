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
  const [activeTab, setActiveTab] = useState<'now-showing' | 'coming-soon'>('now-showing');

  return (
    <div className="home">
      <section className="hero">
        <div className="hero__label">Standing tickets today</div>
        <h1 className="hero__title">Yellow Sticker Alerts</h1>
        <h2 className="hero__subheader">
          Never miss discounted standing tickets for London's hottest shows.
        </h2>
        <p className="hero__text">
          Get instant notifications when same-day standing tickets drop for your favourite productions.
        </p>
      </section>

      <section className="hero-cta-section">
        <div className="hero__cta">
          <a href="#productions" className="btn">
            Browse productions
          </a>
        </div>
        <p className="hero__meta">
          Just £4.99/month per show • Text or Email
        </p>
      </section>

      <section className="home-section">
        <div className="how-it-works">
          {howItWorks.map((card, index) => (
            <div key={card.title} className="how-it-works__item">
              <div className="how-it-works__number">{card.number}</div>
              <div className="how-it-works__content">
                <h3 className="how-it-works__title">{card.title}</h3>
                <p className="how-it-works__body">{card.body}</p>
              </div>
              {index < howItWorks.length - 1 && <div className="how-it-works__connector" />}
            </div>
          ))}
        </div>
      </section>

      <section className="home-section" id="productions">
        <div className="home-section__head">
          <div>
            <p style={{ textTransform: 'uppercase', letterSpacing: '0.08em', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
              Productions we cover
            </p>
            <h2 style={{ margin: '0.15rem 0' }}>Browse productions</h2>
            <p style={{ margin: 0, color: 'var(--text-muted)' }}>
              Subscribing adds you to our alert queue for that show only.
            </p>
          </div>
          <Link to="/faq" className="btn btn--ghost">
            FAQ
          </Link>
        </div>

        {/* Tabs */}
        <div className="tabs">
          <button
            className={`tab ${activeTab === 'now-showing' ? 'tab--active' : ''}`}
            onClick={() => setActiveTab('now-showing')}
          >
            Now Showing
            {productions.length > 0 && (
              <span className="tab__count">({productions.length})</span>
            )}
          </button>
          <button
            className={`tab ${activeTab === 'coming-soon' ? 'tab--active' : ''}`}
            onClick={() => setActiveTab('coming-soon')}
          >
            Coming Soon
            {comingSoon.length > 0 && (
              <span className="tab__count">({comingSoon.length})</span>
            )}
          </button>
        </div>

        {/* Tab Content */}
        {activeTab === 'now-showing' && (
          <>
            {loading && (
              <div className="banner">
                <p style={{ margin: 0 }}>Loading productions…</p>
              </div>
            )}

            {error && !loading && (
              <div className="banner banner--error">
                {error}
              </div>
            )}

            {!loading && productions.length === 0 && (
              <div className="banner">
                <p style={{ margin: 0 }}>No productions currently showing.</p>
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
                <p style={{ margin: 0 }}>Loading coming soon productions…</p>
              </div>
            )}

            {!comingSoonLoading && comingSoon.length === 0 && (
              <div className="banner">
                <p style={{ margin: 0 }}>No productions coming soon.</p>
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

