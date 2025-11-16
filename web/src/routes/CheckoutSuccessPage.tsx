import { Link, useSearchParams } from 'react-router-dom';

export const CheckoutSuccessPage = () => {
  const [params] = useSearchParams();
  const sessionId = params.get('session_id');

  return (
    <div className="grid" style={{ gap: '1.5rem', maxWidth: '640px', margin: '0 auto' }}>
      <div className="glass-card glass-card--accent">
        <p style={{ margin: 0, textTransform: 'uppercase', letterSpacing: '0.08em', fontSize: '0.85rem' }}>
          Payment confirmed
        </p>
        <h1 style={{ margin: '0.5rem 0' }}>You’re on the list</h1>
        <p style={{ color: '#111' }}>
          Thanks for backing Yellow Sticker. We’ll log your subscription and email a receipt in the next few minutes.
        </p>
      </div>

      <div className="glass-card">
        <h2 style={{ marginTop: 0 }}>What happens now?</h2>
        <ul style={{ lineHeight: 1.8, color: 'var(--text-muted)' }}>
          <li>Your subscription starts immediately and will last for one month.</li>
          <li>When the scraper detects standing tickets, we email you right away.</li>
          <li>Check your email for a receipt and a link to manage your subscription.</li>
        </ul>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginTop: '1rem', padding: '1rem', background: 'rgba(255, 211, 0, 0.1)', borderRadius: '12px' }}>
          <strong>Manage your subscription:</strong> You'll receive a management link in your confirmation email. Use it to view your subscription details or cancel anytime—no account needed.
        </p>
        {sessionId && (
          <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>
            Stripe reference:&nbsp;
            <code>{sessionId}</code>
          </p>
        )}
        <Link to="/" className="btn btn--full" style={{ marginTop: '1rem' }}>
          Back to productions
        </Link>
      </div>
    </div>
  );
};

