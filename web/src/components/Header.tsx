import { Link, useLocation } from 'react-router-dom';

export const Header = () => {
  const { pathname } = useLocation();
  const onHome = pathname === '/';

  return (
    <header className="site-header">
      <div className="site-header__inner">
        <Link to="/" className="site-header__brand" aria-label="Yellow Sticker home">
          <span className="site-header__mark">YS</span>
          <span className="site-header__text">
            <strong>Yellow Sticker</strong>
            <small>Same-day theatre drops</small>
          </span>
        </Link>

        <nav className="site-header__actions" aria-label="Primary">
          <Link to="/faq" className="site-header__link">
            FAQ
          </Link>
          <Link to="/login" className="site-header__link">
            Log in
          </Link>
          {onHome ? (
            <a href="#productions" className="btn btn--small">
              Get alerts
            </a>
          ) : (
            <Link to="/" className="btn btn--small">
              Get alerts
            </Link>
          )}
        </nav>
      </div>
    </header>
  );
};
