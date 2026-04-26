import { FormEvent, useState } from 'react';
import { Link } from 'react-router-dom';
import { requestManageLink } from '../lib/api';

export const LoginPage = () => {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(false);
    setLoading(true);

    const { ok, error: apiError } = await requestManageLink(email);
    setLoading(false);
    if (apiError) {
      setError(apiError);
      return;
    }
    if (!ok) {
      setError('Could not send link right now. Please try again.');
      return;
    }
    setSuccess(true);
  };

  return (
    <div className="login-page">
      <Link to="/" className="login-page__back">
        ← Back to home
      </Link>

      <header className="login-page__hero">
        <div className="login-page__brand" aria-hidden="true">
          YS
        </div>
        <h1>Manage your alerts.</h1>
        <p>
          Pop in your email and we&apos;ll send a secure magic link to view, pause, or cancel
          your subscriptions.
        </p>
      </header>

      <div className="login-page__card">
        <form onSubmit={handleSubmit} className="stack">
          <div className="form-field">
            <label htmlFor="login-email">Email address</label>
            <input
              id="login-email"
              type="email"
              required
              autoComplete="email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>

          <button type="submit" className="btn btn--full btn--large" disabled={loading}>
            {loading ? 'Sending link…' : 'Email me a magic link'}
          </button>
        </form>

        {error && <p className="input-error mt-sm">{error}</p>}

        {success && (
          <div className="banner banner--success mt-md">
            <p>
              If we found subscriptions for that email, we&apos;ve just sent your manage links.
              Check your inbox or spam folder in the next few minutes.
            </p>
          </div>
        )}
      </div>

      <p className="login-page__footnote">
        First time here? <Link to="/">Browse productions</Link> to set up alerts.
      </p>
    </div>
  );
};
