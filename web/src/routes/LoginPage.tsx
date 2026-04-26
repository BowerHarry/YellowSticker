import { FormEvent, useState } from 'react';
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
    <div className="grid" style={{ gap: '1.25rem', maxWidth: '520px', margin: '2rem auto 0' }}>
      <div className="glass-card glass-card--accent">
        <h1 style={{ marginBottom: '0.375rem' }}>Manage your alerts</h1>
        <p className="muted" style={{ margin: 0 }}>
          Enter your email and we&apos;ll send a secure magic link to view or cancel your subscriptions.
        </p>
      </div>

      <div className="glass-card">
        <form onSubmit={handleSubmit} className="grid" style={{ gap: '1rem' }}>
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

        {error && (
          <p className="input-error" style={{ marginTop: '0.875rem' }}>{error}</p>
        )}

        {success && (
          <div className="banner banner--success" style={{ marginTop: '1rem' }}>
            <p>
              If we found subscriptions for that email, we&apos;ve just sent your manage links. Check your inbox or
              spam folder in the next few minutes.
            </p>
          </div>
        )}
      </div>
    </div>
  );
};
