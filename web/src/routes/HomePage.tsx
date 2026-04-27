import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useProductions } from '../hooks/useProductions';
import { useComingSoonProductions } from '../hooks/useComingSoonProductions';
import { ProductionCard } from '../components/ProductionCard';
import { getStorageUrl } from '../lib/supabaseClient';

const matchesProduction = (name: string | undefined | null, needle: string) =>
  Boolean(name && name.toLowerCase().includes(needle));

export const HomePage = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const productionsSectionRef = useRef<HTMLElement>(null);
  const howItWorksSectionRef = useRef<HTMLElement>(null);
  const { productions, loading, error } = useProductions();
  const { productions: comingSoon, loading: comingSoonLoading } = useComingSoonProductions();
  const [activeTab, setActiveTab] = useState<'now-showing' | 'coming-soon'>('now-showing');

  useLayoutEffect(() => {
    if (location.pathname !== '/') return;
    const nav = performance.getEntriesByType?.('navigation')?.[0] as PerformanceNavigationTiming | undefined;
    if (nav?.type !== 'reload') return;
    navigate({ pathname: location.pathname, search: location.search, hash: '' }, { replace: true });
    window.scrollTo(0, 0);
  }, [location.pathname, location.search, navigate]);

  useEffect(() => {
    if (location.hash) return;
    const nav = performance.getEntriesByType?.('navigation')?.[0] as PerformanceNavigationTiming | undefined;
    if (nav?.type === 'reload') return;
    window.scrollTo({ top: 0, behavior: 'auto' });
  }, [location.hash]);

  useLayoutEffect(() => {
    const nav = performance.getEntriesByType?.('navigation')?.[0] as PerformanceNavigationTiming | undefined;
    if (nav?.type === 'reload') return;
    const mq = window.matchMedia('(max-width: 720px)');
    if (!mq.matches) return;
    const header = document.querySelector('.site-header') as HTMLElement | null;
    const headerH = header?.getBoundingClientRect().height ?? 64;

    const align = (el: HTMLElement) => {
      const y = el.getBoundingClientRect().top + window.scrollY;
      window.scrollTo({ top: Math.max(0, y - headerH), behavior: 'auto' });
    };

    if (location.hash === '#how-it-works') {
      const section = howItWorksSectionRef.current;
      if (!section) return;
      const run = () => {
        if (!howItWorksSectionRef.current) return;
        align(howItWorksSectionRef.current);
      };
      run();
      requestAnimationFrame(run);
      setTimeout(run, 120);
      return;
    }

    if (location.hash === '#productions') {
      if (!productionsSectionRef.current) return;
      const run = () => {
        const sec = productionsSectionRef.current;
        if (!sec) return;
        const target =
          (sec.querySelector('.section__eyebrow') as HTMLElement | null) ?? sec;
        align(target);
      };
      run();
      requestAnimationFrame(run);
      setTimeout(run, 120);
    }
  }, [location.hash]);

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
              <span>Email or Telegram</span>
              <span className="hero__meta-sep" aria-hidden="true" />
              <span>Cancel anytime</span>
              <span className="hero__meta-sep" aria-hidden="true" />
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

      <section ref={howItWorksSectionRef} className="section home-flow__panel" id="how-it-works">
        <div className="how-it-works-wrap">
          <div className="section__head">
            <div>
              <p className="section__eyebrow">Three simple steps</p>
              <h2 className="section__title">How it works</h2>
              <p className="section__subtitle">
                Pick a show, subscribe for £2 a month, and we&apos;ll alert you the moment same-day
                standing tickets appear.
              </p>
            </div>
          </div>

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
                <span className="step-card__copy-desktop">
                  Choose a production we cover and we&apos;ll start watching its box office.
                </span>
                <span className="step-card__copy-mobile">Choose a production we cover</span>
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
                <span className="step-card__copy-desktop">
                  £2 a month per show. Cancel anytime — full refund if we don&apos;t find tickets.
                </span>
                <span className="step-card__copy-mobile">£2 a month per show</span>
              </p>
            </article>

            <article className="step-card">
              <span className="step-card__num">3</span>
              <div className="step-card__visual" aria-hidden="true">
                <div className="step-mock step-mock--desktop">
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
                <div className="step-mock step-mock--mobile">
                  <div className="phone-push">
                    <div className="phone-push__top">
                      <span className="phone-push__icon">YS</span>
                      <div className="phone-push__meta">
                        <span className="phone-push__app">Yellow Sticker</span>
                        <span className="phone-push__time">now</span>
                      </div>
                    </div>
                    <p className="phone-push__title">
                      <strong>Standing tickets</strong> just dropped
                    </p>
                    <p className="phone-push__sub">Tap to open · tonight</p>
                    <svg
                      className="phone-push__glyph"
                      width={28}
                      height={14}
                      viewBox="0 0 28 14"
                      aria-hidden="true"
                      focusable="false"
                    >
                      <path
                        fill="rgba(255,214,10,0.35)"
                        d="M14 1c3 2 6 5 6 9v3H8v-3c0-4 3-7 6-9z"
                      />
                      <circle cx={14} cy={12} r={1.5} fill="rgba(255,214,10,0.9)" />
                    </svg>
                  </div>
                </div>
              </div>
              <h3 className="step-card__title">Get notified</h3>
              <p className="step-card__body">
                <span className="step-card__copy-desktop">
                  Email or Telegram the moment same-day standing tickets appear.
                </span>
                <span className="step-card__copy-mobile">Alerted when tickets available</span>
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
              <h3 className="guarantee__title">
                No alerts{' '}
                <span className="guarantee__title-sep" aria-hidden="true" />
                {' '}
                no charge.
              </h3>
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

      <section ref={productionsSectionRef} className="section home-flow__panel" id="productions">
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
