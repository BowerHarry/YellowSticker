import { Link, useRouteError } from 'react-router-dom';

export const NotFoundPage = () => {
  const error = useRouteError();
  if (error) console.error(error);

  return (
    <div className="grid text-center" style={{ gap: '1rem', maxWidth: '480px', margin: '4rem auto' }}>
      <h1>Page not found</h1>
      <p className="muted">We couldn&apos;t find that view. Head back home and try again.</p>
      <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'center', flexWrap: 'wrap' }}>
        <Link to="/" className="btn">
          Back to home
        </Link>
        <Link to="/faq" className="btn btn--ghost">
          Visit FAQ
        </Link>
      </div>
    </div>
  );
};
