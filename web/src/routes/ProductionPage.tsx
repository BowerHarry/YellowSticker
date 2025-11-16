import { Link, useParams } from 'react-router-dom';
import { useProduction } from '../hooks/useProduction';
import { SubscriptionForm } from '../components/SubscriptionForm';

const formatDateTime = (value?: string | null) => {
  if (!value) return '—';
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
    return (
      <div className="banner">
        <p style={{ margin: 0 }}>Loading production details…</p>
      </div>
    );
  }

  if (error || !production) {
    return (
      <div className="banner banner--error">
        {error ?? 'We could not find that production.'}{' '}
        <Link to="/" style={{ color: '#fff', textDecoration: 'underline' }}>
          Return home
        </Link>
      </div>
    );
  }

  const now = new Date();
  const startDate = production.start_date ? new Date(production.start_date) : null;
  const isComingSoon = startDate && startDate > now;

  let scrapingHost = production.scraping_url;
  try {
    scrapingHost = new URL(production.scraping_url).hostname;
  } catch {
    // keep original string
  }

  return (
    <div className="grid" style={{ gap: '2rem' }}>
      <Link to="/" className="back-link">
        ← Back to productions
      </Link>

      <div className="detail-grid">
        <article className="glass-card glass-card--accent">
          <p style={{ textTransform: 'uppercase', letterSpacing: '0.08em', fontSize: '0.85rem', margin: 0 }}>
            £4.99 per month
          </p>
          <h1 style={{ margin: '0.35rem 0' }}>{production.name}</h1>
          <p style={{ color: 'var(--text-muted)', marginTop: 0 }}>
            {production.theatre}{production.city ? `, ${production.city}` : ''}
          </p>
          <p style={{ marginTop: '1rem', color: 'var(--text-muted)' }}>
            {production.description ??
              'Standing-room tickets are scarce. We poll the official seating map every few minutes so you never miss a drop.'}
          </p>

          <div className="stat-blocks">
            <div className="stat-block">
              <span>Last checked</span>
              <strong>{formatDateTime(production.last_checked_at)}</strong>
            </div>
            <div className="stat-block">
              <span>Last found</span>
              <strong>{formatDateTime(production.last_standing_tickets_found_at)}</strong>
            </div>
            <div className="stat-block">
              <span>Scraper URL</span>
              <strong style={{ fontSize: '0.8rem', wordBreak: 'break-word' }}>
                <a href={production.scraping_url} target="_blank" rel="noreferrer">
                  {scrapingHost}
                </a>
              </strong>
            </div>
          </div>
        </article>

        <article className="glass-card form-panel">
          <h2>Reserve your alert</h2>
          {isComingSoon ? (
            <div>
              <p style={{ color: 'var(--yellow)', marginTop: 0, fontWeight: 500 }}>
                This production is coming soon. Subscriptions will be available starting {startDate?.toLocaleDateString('en-GB', { 
                  month: 'long', 
                  day: 'numeric', 
                  year: 'numeric' 
                })}.
              </p>
            </div>
          ) : (
            <>
              <p style={{ color: 'var(--text-muted)', marginTop: 0 }}>
                One alert per show keeps scraping costs low. Cancel anytime with one click.
              </p>
              <SubscriptionForm production={production} />
            </>
          )}
        </article>
      </div>

      <article className="glass-card">
        <h2 style={{ marginTop: 0 }}>How notifications work</h2>
        <ol style={{ lineHeight: 1.8, color: 'var(--text-muted)' }}>
          <li>Our Supabase Edge Function scrapes {production.theatre} multiple times per hour.</li>
          <li>Standing tickets appear? We log it and email subscribers instantly.</li>
          <li>You click the official link and grab the seats before the queue forms.</li>
        </ol>
      </article>
    </div>
  );
};

