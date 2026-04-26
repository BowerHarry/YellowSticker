import { Link, useParams } from 'react-router-dom';
import { useProduction } from '../hooks/useProduction';
import { SubscriptionForm } from '../components/SubscriptionForm';
import { getStorageUrl } from '../lib/supabaseClient';

const formatDateTime = (value?: string | null) => {
  if (!value) return '—';
  const date = new Date(value);
  return `${date.toLocaleDateString('en-GB', { month: 'short', day: 'numeric' })} ${date.toLocaleTimeString(
    'en-GB',
    { hour: '2-digit', minute: '2-digit' },
  )}`;
};

const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((s) => s[0]?.toUpperCase() ?? '')
    .join('') || 'YS';

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
        <Link to="/" className="status-text--success">
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
    <div className="stack">
      <Link to="/" className="back-link">
        ← Back to productions
      </Link>

      <div className="prod-detail">
        <div className="prod-detail__media">
          {posterUrl ? (
            <img src={posterUrl} alt={`${production.name} poster`} />
          ) : (
            <span className="prod-detail__media-placeholder">{initials(production.name)}</span>
          )}
        </div>

        <header className="prod-detail__head">
          <span className="pill prod-detail__price">£2 / month</span>
          <h1 className="prod-detail__title">{production.name}</h1>
          <p className="prod-detail__theatre">{production.theatre}</p>
        </header>

        <article className="prod-detail__form-card">
          <h2>{isComingSoon ? 'Coming soon' : 'Reserve your alerts'}</h2>
          {isComingSoon ? (
            <>
              <p className="prod-detail__form-intro">
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
              <p className="prod-detail__form-intro">
                We watch the official box office and notify you the second same-day standing tickets appear.
              </p>
              <SubscriptionForm production={production} />
            </>
          )}
        </article>

        <div className="prod-detail__about">
          {production.description && (
            <p className="prod-detail__description">{production.description}</p>
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
        </div>

        <div className="prod-detail__how">
          <h3>How notifications work</h3>
          <ol>
            <li>We poll the official availability for standing tickets at {production.theatre}.</li>
            <li>
              If standing tickets are released for today&apos;s performance, subscribed customers are notified
              immediately by email or Telegram.
            </li>
            <li>You buy directly from the theatre&apos;s real checkout — same prices, same protections.</li>
          </ol>
        </div>
      </div>
    </div>
  );
};
