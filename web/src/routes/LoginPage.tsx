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
    <div className="grid" style={{ gap: '1.5rem', maxWidth: '560px', margin: '0 auto' }}>
      <div className="glass-card glass-card--accent">
        <h1 style={{ marginTop: 0, marginBottom: '0.5rem' }}>Log in to manage alerts</h1>
        <p style={{ margin: 0, color: 'var(--text-muted)' }}>
          Enter your email and we&apos;ll send a secure magic link to manage your subscriptions.
        </p>
      </div>

      <div className="glass-card">
        <form onSubmit={handleSubmit} className="grid" style={{ gap: '1rem' }}>
          <label htmlFor="login-email" style={{ fontWeight: 600 }}>
            Email address
          </label>
          <input
            id="login-email"
            type="email"
            required
            autoComplete="email"
            placeholder="you@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            style={{
              width: '100%',
              padding: '0.75rem 0.9rem',
              background: 'rgba(255,255,255,0.05)',
              border: '1px solid rgba(255,255,255,0.2)',
              borderRadius: '0.6rem',
              color: 'inherit',
              fontSize: '1rem',
            }}
          />
          <button type="submit" className="btn btn--full" disabled={loading}>
            {loading ? 'Sending link…' : 'Email me a magic link'}
          </button>
        </form>

        {error && (
          <p style={{ marginTop: '1rem', color: '#f87171', fontSize: '0.9rem' }}>{error}</p>
        )}

        {success && (
          <div
            style={{
              marginTop: '1rem',
              background: 'rgba(255, 211, 0, 0.12)',
              border: '1px solid rgba(255, 211, 0, 0.3)',
              borderRadius: '12px',
              padding: '0.85rem 1rem',
              color: 'var(--text)',
              fontSize: '0.92rem',
            }}
          >
            If we found subscriptions for that email, we&apos;ve sent your manage links.
            Check inbox/spam in the next couple of minutes.
          </div>
        )}
      </div>
    </div>
  );
};
