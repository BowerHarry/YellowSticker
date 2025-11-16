import { Link } from 'react-router-dom';

export const Header = () => (
  <header className="site-header">
    <div className="site-header__inner">
      <Link to="/" className="site-header__brand">
        <span className="site-header__mark">YS</span>
        <div className="site-header__text">
          <strong>Yellow Sticker</strong>
          <small>SAME-DAY THEATRE DROPS</small>
        </div>
      </Link>

      <div className="site-header__actions">
        <a href="#productions" className="btn btn--small">
          Get alerts
        </a>
      </div>
    </div>
  </header>
);

