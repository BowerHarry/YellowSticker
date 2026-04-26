import { Link } from 'react-router-dom';

export const Footer = () => (
  <footer className="footer">
    <div className="footer__inner">
      <span>© {new Date().getFullYear()} Yellow Sticker · Standing-ticket alerts</span>
      <div className="footer__links">
        <Link to="/faq">FAQ</Link>
        <Link to="/login">Log in</Link>
        <span className="muted">Secure checkout via Stripe</span>
      </div>
    </div>
  </footer>
);
