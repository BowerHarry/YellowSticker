import { Link, useRouteError } from 'react-router-dom';

export const NotFoundPage = () => {
  const error = useRouteError();
  console.error(error);

  return (
    <div className="banner" style={{ borderColor: '#ff5f5f', color: '#ffbfbf' }}>
      <h1>Something went sideways</h1>
      <p>We couldn’t find that view. Head back home and try again.</p>
      <Link to="/" className="btn">
        Go home
      </Link>
    </div>
  );
};

