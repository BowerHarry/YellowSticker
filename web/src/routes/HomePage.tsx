import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useProductions } from '../hooks/useProductions';
import { useComingSoonProductions } from '../hooks/useComingSoonProductions';
import { ProductionCard } from '../components/ProductionCard';
import { getStorageUrl } from '../lib/supabaseClient';

const matchesProduction = (name: string | undefined | null, needle: string) =>
  Boolean(name && name.toLowerCase().includes(needle));

export const HomePage = () => {
  const { productions, loading, error } = useProductions();
  const { productions: comingSoon, loading: comingSoonLoading } = useComingSoonProductions();
  const [activeTab, setActiveTab] = useState<'now-showing' | 'coming-soon'>('now-showing');

  const allKnown = [...productions, ...comingSoon];
  const featured =
    allKnown.find((p) => matchesProduction(p.name, 'hamilton')) ??
    allKnown.find(
      (p) =>
        matchesProduction(p.name, 'les mis') ||
        matchesProduction(p.name, 'misérables') ||
        matchesProduction(p.name, 'miserables'),
    ) ??
    productions[0] ??
    comingSoon[0];
  const featuredPoster = featured?.poster_url
    ? featured.poster_url.startsWith('http')
      ? featured.poster_url
      : getStorageUrl('production-posters', featured.poster_url)
    : null;

  return (
    <div className="home-flow">
      <section className="home-flow__panel home-flow__panel--hero">
        <div className="hero">
          <div className="hero__copy">
            <span className="hero__eyebrow">
              <span className="hero__eyebrow-dot" />
              Watching now · West End
            </span>
            <h1 className="hero__title">
              Be first when <em>standing tickets</em> drop.
            </h1>
            <p className="hero__subtitle">
              Yellow Sticker quietly watches official box offices and pings you the second same-day
              standing tickets appear for the shows you care about.
            </p>
            <div className="hero__cta">
              <a href="#productions" className="btn btn--large">
                Browse productions
              </a>
              <a href="#how-it-works" className="btn btn--ghost btn--large">
                How it works
              </a>
            </div>
            <div className="hero__meta">
              <span>Email or Telegram alerts</span>
              <span className="hero__meta-sep" />
              <span>Cancel anytime</span>
              <span className="hero__meta-sep" />
              <span>No alerts, no charge</span>
            </div>
          </div>

          <div className="hero__visual" aria-hidden="true">
            <div className="alert-preview">
              <div className="alert-preview__floater alert-preview__floater--top">
                <span className="pill__dot" />
                Live · checking every 5 min
              </div>
              <div className="alert-preview__head">
                <div className="alert-preview__avatar">YS</div>
                <div className="alert-preview__sender">
                  <strong>Yellow Sticker</strong>
                  <span>via Telegram</span>
                </div>
                <span className="alert-preview__time">14:02</span>
              </div>
              <div className="alert-preview__body">
                <p className="alert-preview__title">Standing tickets just dropped</p>
                <p className="alert-preview__msg">
                  <b>3 standing tickets</b> released for tonight at the Sondheim Theatre. Buy now from
                  the official box office before they go.
                </p>
                <a href="#productions" className="alert-preview__cta">
                  Open box office →
                </a>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="section home-flow__panel" id="how-it-works">
        <div className="how-it-works-wrap">
          <div className="steps">
            <article className="step-card">
              <span className="step-card__num">1</span>
              <div className="step-card__visual" aria-hidden="true">
                <div className="mock-tile">
                  <div className="mock-tile__poster">
                    {featuredPoster ? (
                      <img src={featuredPoster} alt="" />
                    ) : (
                      <span>YS</span>
                    )}
                  </div>
                  <div className="mock-tile__text">
                    <strong>{featured?.name ?? 'The show you love'}</strong>
                    <span>{featured?.theatre ?? 'West End'}</span>
                  </div>
                </div>
              </div>
              <h3 className="step-card__title">Pick a show</h3>
              <p className="step-card__body">
                Choose a production we cover and we&apos;ll start watching its box office.
              </p>
            </article>

            <article className="step-card">
              <span className="step-card__num">2</span>
              <div className="step-card__visual" aria-hidden="true">
                <div className="mock-tag">
                  <div className="mock-tag__amount">
                    <span className="mock-tag__currency">£</span>
                    <span className="mock-tag__value">2</span>
                    <span className="mock-tag__period">/mo</span>
                  </div>
                  <span className="mock-tag__label">Per show · cancel anytime</span>
                </div>
              </div>
              <h3 className="step-card__title">Subscribe</h3>
              <p className="step-card__body">
                £2 a month per show. Cancel anytime — full refund if we don&apos;t find tickets.
              </p>
            </article>

            <article className="step-card">
              <span className="step-card__num">3</span>
              <div className="step-card__visual" aria-hidden="true">
                <div className="mock-alert">
                  <div className="mock-alert__head">
                    <span className="pill__dot" />
                    Yellow Sticker · 14:02
                  </div>
                  <p className="mock-alert__title">
                    <b>3 standing tickets</b> just dropped
                  </p>
                  <p className="mock-alert__msg">Tonight at the Sondheim — buy now from the box office.</p>
                </div>
              </div>
              <h3 className="step-card__title">Get notified</h3>
              <p className="step-card__body">
                Email or Telegram the moment same-day standing tickets appear.
              </p>
            </article>
          </div>

          <Link
            to="/faq#refund-guarantee"
            className="guarantee"
            aria-label="Money-back guarantee — read the terms"
          >
            <div className="guarantee__copy">
              <span className="guarantee__eyebrow">Money-back guarantee</span>
              <h3 className="guarantee__title">No alerts, no charge.</h3>
              <p className="guarantee__text">
                If we don&apos;t spot any standing tickets before your next renewal, your subscription
                is refunded automatically — no email, no form.
              </p>
              <span className="guarantee__cta" aria-hidden="true">
                See the full guarantee →
              </span>
            </div>

            <div className="guarantee__receipt" aria-hidden="true">
              <div className="guarantee__receipt-head">
                <span>Recent activity</span>
                <strong>● Auto-issued</strong>
              </div>
              <div className="guarantee__txn">
                <div className="guarantee__txn-icon">YS</div>
                <div className="guarantee__txn-body">
                  <span className="guarantee__txn-name">Yellow Sticker · refund</span>
                  <span className="guarantee__txn-meta">No standing tickets found this month</span>
                </div>
                <span className="guarantee__txn-amount guarantee__txn-amount--in">+£2.00</span>
              </div>
              <div className="guarantee__txn">
                <div className="guarantee__txn-icon">YS</div>
                <div className="guarantee__txn-body">
                  <span className="guarantee__txn-name">Yellow Sticker · monthly</span>
                  <span className="guarantee__txn-meta">Standing-ticket alerts</span>
                </div>
                <span className="guarantee__txn-amount guarantee__txn-amount--out">−£2.00</span>
              </div>
            </div>
          </Link>
        </div>
      </section>

      <section className="section home-flow__panel" id="productions">
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
