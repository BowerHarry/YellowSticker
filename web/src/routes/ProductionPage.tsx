import { Link, useParams } from 'react-router-dom';
import { useProduction } from '../hooks/useProduction';
import { SubscriptionForm } from '../components/SubscriptionForm';
import { getStorageUrl } from '../lib/supabaseClient';

const formatDateTime = (value?: string | null) => {
  if (!value) return '—';
  const date = new Date(value);
  return `${date.toLocaleDateString('en-GB', { month: 'short', day: 'numeric' })} ${date.toLocaleTimeString('en-GB', {
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
        <p>Loading production details…</p>
      </div>
    );
  }

  if (error || !production) {
    return (
      <div className="banner banner--error">
        {error ?? 'We could not find that production.'}{' '}
        <Link to="/" style={{ color: 'inherit', textDecoration: 'underline' }}>
          Return home
        </Link>
      </div>
    );
  }

  const now = new Date();
  const startDate = production.start_date ? new Date(production.start_date) : null;
  const isComingSoon = !!(startDate && startDate > now);

  const posterUrl = production.poster_url
    ? production.poster_url.startsWith('http')
      ? production.poster_url
      : getStorageUrl('production-posters', production.poster_url)
    : null;

  return (
    <div className="grid" style={{ gap: '1.5rem' }}>
      <Link to="/" className="back-link">
        ← Back to productions
      </Link>

      <div className="detail-grid">
        <article className="glass-card glass-card--accent">
          {posterUrl && (
            <div
              style={{
                aspectRatio: '16 / 10',
                borderRadius: '12px',
                overflow: 'hidden',
                marginBottom: '1.25rem',
                border: '1px solid var(--border)',
              }}
            >
              <img
                src={posterUrl}
                alt={`${production.name} poster`}
                style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
              />
            </div>
          )}

          <span
            className="pill pill--muted"
            style={{ background: 'rgba(255, 214, 10, 0.1)', color: 'var(--yellow)', borderColor: 'var(--border-yellow)' }}
          >
            £2 / month
          </span>
          <h1 style={{ margin: '0.625rem 0 0.25rem' }}>{production.name}</h1>
          <p className="muted" style={{ margin: 0 }}>{production.theatre}</p>

          {production.description && (
            <p style={{ marginTop: '1rem', color: 'var(--text-secondary)' }}>{production.description}</p>
          )}

          <div className="stat-blocks">
            <div className="stat-block">
              <span className="stat-block__label">Last checked</span>
              <span className="stat-block__value">{formatDateTime(production.last_checked_at)}</span>
            </div>
            <div className="stat-block">
              <span className="stat-block__label">Last tickets found</span>
              <span className="stat-block__value">
                {formatDateTime(production.last_standing_tickets_found_at)}
              </span>
            </div>
          </div>
        </article>

        <article className="glass-card form-panel">
          <h2 style={{ marginBottom: '0.25rem' }}>Reserve your alerts</h2>
          {isComingSoon ? (
            <>
              <p className="muted" style={{ margin: '0 0 1rem' }}>
                Subscriptions open when the show starts.
              </p>
              <div className="banner banner--warning">
                <p>
                  This production opens{' '}
                  <strong>
                    {startDate?.toLocaleDateString('en-GB', { month: 'long', day: 'numeric', year: 'numeric' })}
                  </strong>
                  . Check back closer to the date.
                </p>
              </div>
            </>
          ) : (
            <>
              <p className="muted" style={{ margin: '0 0 1.25rem' }}>
                We watch the official box office and notify you the moment same-day standing tickets appear.
              </p>
              <SubscriptionForm production={production} />
            </>
          )}
        </article>
      </div>

      <article className="glass-card">
        <h2 style={{ marginBottom: '0.75rem' }}>How notifications work</h2>
        <ol style={{ margin: 0, paddingLeft: '1.25rem', color: 'var(--text-secondary)', lineHeight: 1.7 }}>
          <li>We poll the official availability for standing tickets at {production.theatre}.</li>
          <li>
            If standing tickets are released for today&apos;s performance, subscribed customers are notified
            immediately by email or Telegram.
          </li>
          <li>You buy directly from the theatre&apos;s real checkout — same prices, same protections.</li>
        </ol>
      </article>
    </div>
  );
};
