import { Link } from 'react-router-dom';
import type { Production } from '../lib/types';
import { getStorageUrl } from '../lib/supabaseClient';

type Props = {
  production: Production;
};

const formatTime = (value?: string | null) => {
  if (!value) return '—';
  return new Date(value).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
};

export const ProductionCard = ({ production }: Props) => {
  const now = new Date();
  const startDate = production.start_date ? new Date(production.start_date) : null;
  const endDate = production.end_date ? new Date(production.end_date) : null;
  const isComingSoon = startDate && startDate > now;
  
  // Check if production is ending soon (within next 30 days)
  const isEndingSoon = endDate && endDate > now && (endDate.getTime() - now.getTime()) < 30 * 24 * 60 * 60 * 1000;

  return (
    <article className="production-card">
      <div className="production-card__header">
        <div>
          <h3 className="production-card__title">{production.name}</h3>
          <div className="production-card__location">
            <span className="production-card__venue">{production.theatre}</span>
            {production.city && (
              <span className="production-card__city">, {production.city}</span>
            )}
          </div>
        </div>
        {production.poster_url && (() => {
          // If poster_url is already a full URL, use it; otherwise treat it as a storage path
          const imageUrl = production.poster_url.startsWith('http') 
            ? production.poster_url 
            : getStorageUrl('production-posters', production.poster_url);
          return imageUrl ? (
            <img 
              src={imageUrl} 
              alt={`${production.name} poster`}
              className="production-card__poster"
            />
          ) : null;
        })()}
      </div>

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
        {production.description && (
          <p className="production-card__description">{production.description}</p>
        )}

        <div style={{ marginTop: 'auto', paddingTop: '0.5rem' }}>
          {isComingSoon && startDate && (
            <p style={{ 
              color: 'var(--yellow)', 
              fontSize: '0.85rem', 
              margin: 0,
              fontWeight: 500 
            }}>
              Coming {startDate.toLocaleDateString('en-GB', { 
                month: 'long', 
                day: 'numeric', 
                year: 'numeric' 
              })}
            </p>
          )}

          {!isComingSoon && isEndingSoon && endDate && (
            <p style={{ 
              color: 'var(--yellow)', 
              fontSize: '0.85rem', 
              margin: 0,
              fontWeight: 500 
            }}>
              Ending {endDate.toLocaleDateString('en-GB', { 
                month: 'long', 
                day: 'numeric', 
                year: 'numeric' 
              })}
            </p>
          )}
        </div>
      </div>

      <div className="production-card__actions">
        {isComingSoon ? (
          <div className="btn btn--full" style={{ 
            opacity: 0.6, 
            cursor: 'not-allowed',
            pointerEvents: 'none' 
          }}>
            Coming Soon
            <span className="btn__price">Subscription unavailable</span>
          </div>
        ) : (
          <Link to={`/productions/${production.slug}`} className="btn btn--full">
            Subscribe
            <span className="btn__price">£4.99/month</span>
          </Link>
        )}
      </div>
    </article>
  );
};

