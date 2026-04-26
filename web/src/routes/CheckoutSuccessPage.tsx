import { Link, useSearchParams } from 'react-router-dom';

export const CheckoutSuccessPage = () => {
  const [params] = useSearchParams();
  const sessionId = params.get('session_id');

  return (
    <div className="stack center-medium" style={{ marginTop: '2rem' }}>
      <div className="glass-card glass-card--accent stack--tight">
        <span className="pill pill--success" style={{ alignSelf: 'flex-start' }}>
          <span className="pill__dot" />
          Payment confirmed
        </span>
        <h1 className="mt-sm">You&apos;re on the list.</h1>
        <p className="muted">
          Thanks for backing Yellow Sticker. We&apos;ve emailed a receipt and your management link — check your inbox in
          the next few minutes.
        </p>
      </div>

      <div className="glass-card">
        <h2 style={{ marginBottom: '0.75rem' }}>What happens now?</h2>
        <ol className="muted" style={{ margin: 0, paddingLeft: '1.25rem', lineHeight: 1.7 }}>
          <li>Your subscription starts immediately and runs for one month.</li>
          <li>When standing tickets are detected, we notify you by email or Telegram (depending on your choice).</li>
          <li>Use the management link in your signup email to view or cancel anytime — no account needed.</li>
        </ol>

        <div className="banner banner--success mt-lg">
          <p>
            <strong>Our guarantee.</strong> If no standing tickets are found before you cancel or renew, we refund the
            charge in full — automatically.
          </p>
        </div>

        {sessionId && (
          <div className="code-block">
            <span className="code-block__label">Stripe reference</span>
            <code className="code-block__value">{sessionId}</code>
          </div>
        )}

        <Link to="/" className="btn btn--full btn--large mt-lg">
          Back to productions
        </Link>
      </div>
    </div>
  );
};
