import { Link } from 'react-router-dom';
import type { Production } from '../lib/types';
import { getStorageUrl } from '../lib/supabaseClient';

type Props = {
  production: Production;
};

const formatDate = (date: Date) =>
  date.toLocaleDateString('en-GB', { month: 'short', day: 'numeric', year: 'numeric' });

const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((s) => s[0]?.toUpperCase() ?? '')
    .join('') || 'YS';

export const ProductionCard = ({ production }: Props) => {
  const now = new Date();
  const startDate = production.start_date ? new Date(production.start_date) : null;
  const endDate = production.end_date ? new Date(production.end_date) : null;
  const isComingSoon = !!(startDate && startDate > now);
  const isEndingSoon =
    !!(endDate && endDate > now && endDate.getTime() - now.getTime() < 30 * 24 * 60 * 60 * 1000);

  const posterUrl = production.poster_url
    ? production.poster_url.startsWith('http')
      ? production.poster_url
      : getStorageUrl('production-posters', production.poster_url)
    : null;

  return (
    <article className="production-card">
      <div className="production-card__media">
        {posterUrl ? (
          <img src={posterUrl} alt={`${production.name} poster`} loading="lazy" />
        ) : (
          <span className="production-card__media-placeholder">{initials(production.name)}</span>
        )}
        {isComingSoon && <span className="production-card__pin">Coming soon</span>}
        {!isComingSoon && isEndingSoon && <span className="production-card__pin">Ending soon</span>}
      </div>

      <div className="production-card__body">
        <h3 className="production-card__title">{production.name}</h3>
        <p className="production-card__venue">{production.theatre}</p>
        {production.description && (
          <p className="production-card__description">{production.description}</p>
        )}

        {(isComingSoon && startDate) || (!isComingSoon && isEndingSoon && endDate) ? (
          <p className="production-card__meta">
            {isComingSoon && startDate && `Opens ${formatDate(startDate)}`}
            {!isComingSoon && isEndingSoon && endDate && `Ends ${formatDate(endDate)}`}
          </p>
        ) : null}
      </div>

      <div className="production-card__actions">
        {isComingSoon ? (
          <button type="button" className="btn btn--ghost btn--full" disabled>
            Coming soon
          </button>
        ) : (
          <Link to={`/productions/${production.slug}`} className="btn btn--full">
            Subscribe <span className="btn__hint">· £2/mo</span>
          </Link>
        )}
      </div>
    </article>
  );
};
