import { Link, useSearchParams } from 'react-router-dom';

// Solid yellow hero + clear typographic hierarchy to match the rest of
// the site's "yellow-on-black" system. Previous version had `color: #111`
// on near-black, rendering the confirmation copy effectively invisible.
export const CheckoutSuccessPage = () => {
  const [params] = useSearchParams();
  const sessionId = params.get('session_id');

  return (
    <div className="grid" style={{ gap: '1.5rem', maxWidth: '640px', margin: '0 auto' }}>
      <div
        style={{
          background: 'var(--yellow)',
          color: '#000',
          borderRadius: '28px',
          padding: '2rem 2.25rem',
          boxShadow: 'var(--shadow)',
        }}
      >
        <div
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '0.5rem',
            padding: '0.35rem 0.75rem',
            borderRadius: '999px',
            background: 'rgba(0, 0, 0, 0.12)',
            fontSize: '0.75rem',
            fontWeight: 700,
            letterSpacing: '0.12em',
            textTransform: 'uppercase',
          }}
        >
          <CheckIcon /> Payment confirmed
        </div>
        <h1 style={{ margin: '1rem 0 0.5rem', fontSize: '2.25rem', lineHeight: 1.1 }}>
          You're on the list.
        </h1>
        <p style={{ margin: 0, fontSize: '1.05rem', lineHeight: 1.55, color: 'rgba(0, 0, 0, 0.8)' }}>
          Thanks for backing Yellow Sticker. We've emailed a receipt and your
          management link — check your inbox in the next few minutes.
        </p>
      </div>

      <div className="glass-card">
        <h2 style={{ marginTop: 0 }}>What happens now?</h2>
        <ol
          style={{
            margin: 0,
            paddingLeft: '1.25rem',
            lineHeight: 1.7,
            color: 'var(--text)',
          }}
        >
          <li>Your subscription starts immediately and runs for one month.</li>
          <li>When we detect standing tickets, we'll email you right away.</li>
          <li>
            Use the management link in your signup email to view or cancel at
            any time — no account needed.
          </li>
        </ol>

        <div
          style={{
            marginTop: '1.25rem',
            padding: '0.9rem 1rem',
            background: 'rgba(255, 211, 0, 0.08)',
            border: '1px solid rgba(255, 211, 0, 0.25)',
            borderRadius: '14px',
            color: 'var(--text-muted)',
            fontSize: '0.9rem',
            lineHeight: 1.55,
          }}
        >
          <strong style={{ color: 'var(--text)' }}>Our guarantee.</strong> If no
          standing tickets are found before you cancel or renew, we refund the
          charge in full — automatically.
        </div>

        {sessionId && (
          <div
            style={{
              marginTop: '1.25rem',
              padding: '0.75rem 0.9rem',
              background: 'rgba(255, 255, 255, 0.04)',
              border: '1px solid var(--border)',
              borderRadius: '12px',
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
                color: 'var(--text)',
                wordBreak: 'break-all',
              }}
            >
              {sessionId}
            </code>
          </div>
        )}

        <Link to="/" className="btn btn--full" style={{ marginTop: '1.5rem' }}>
          Back to productions
        </Link>
      </div>
    </div>
  );
};

const CheckIcon = () => (
  <svg
    width="14"
    height="14"
    viewBox="0 0 16 16"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    aria-hidden="true"
  >
    <path
      d="M13.5 4.5 6.5 11.5 2.5 7.5"
      stroke="currentColor"
      strokeWidth="2.25"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);
