import { Link, useSearchParams } from 'react-router-dom';

export const CheckoutSuccessPage = () => {
  const [params] = useSearchParams();
  const sessionId = params.get('session_id');

  return (
    <div className="grid" style={{ gap: '1.25rem', maxWidth: '600px', margin: '2rem auto 0' }}>
      <div
        className="glass-card glass-card--accent"
        style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}
      >
        <span
          className="pill pill--success"
          style={{ alignSelf: 'flex-start' }}
        >
          <span className="pill__dot" />
          Payment confirmed
        </span>
        <h1 style={{ marginTop: '0.25rem' }}>You&apos;re on the list.</h1>
        <p className="muted">
          Thanks for backing Yellow Sticker. We&apos;ve emailed a receipt and your management link — check your inbox in
          the next few minutes.
        </p>
      </div>

      <div className="glass-card">
        <h2 style={{ marginBottom: '0.75rem' }}>What happens now?</h2>
        <ol
          style={{
            margin: 0,
            paddingLeft: '1.25rem',
            lineHeight: 1.7,
            color: 'var(--text-secondary)',
          }}
        >
          <li>Your subscription starts immediately and runs for one month.</li>
          <li>When standing tickets are detected, we notify you by email or Telegram (depending on your choice).</li>
          <li>Use the management link in your signup email to view or cancel anytime — no account needed.</li>
        </ol>

        <div className="banner banner--success" style={{ marginTop: '1.25rem' }}>
          <p>
            <strong>Our guarantee.</strong> If no standing tickets are found before you cancel or renew, we refund the
            charge in full — automatically.
          </p>
        </div>

        {sessionId && (
          <div
            style={{
              marginTop: '1.25rem',
              padding: '0.75rem 0.9rem',
              background: 'var(--bg-elev-1)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius-md)',
            }}
          >
            <div
              style={{
                fontSize: '0.7rem',
                textTransform: 'uppercase',
                letterSpacing: '0.1em',
                color: 'var(--text-muted)',
                marginBottom: '0.25rem',
              }}
            >
              Stripe reference
            </div>
            <code
              style={{
                display: 'block',
                fontSize: '0.8rem',
                fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
                color: 'var(--text-secondary)',
                wordBreak: 'break-all',
              }}
            >
              {sessionId}
            </code>
          </div>
        )}

        <Link to="/" className="btn btn--full btn--large" style={{ marginTop: '1.25rem' }}>
          Back to productions
        </Link>
      </div>
    </div>
  );
};
