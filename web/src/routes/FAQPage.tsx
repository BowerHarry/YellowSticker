import { Link } from 'react-router-dom';

export const FAQPage = () => {
  return (
    <div className="grid" style={{ gap: '2rem' }}>
      <Link to="/" className="back-link">
        ← Back to home
      </Link>

      <article className="glass-card">
        <h1 style={{ marginTop: 0 }}>Frequently Asked Questions</h1>
        
        <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
          <section>
            <h2 style={{ marginTop: 0 }}>How does it work?</h2>
            <p style={{ color: 'var(--text-muted)', lineHeight: '1.6' }}>
              We continuously monitor official box office websites for standing tickets. When tickets become available, we send you an instant email notification with a direct link to purchase.
            </p>
          </section>

          <section>
            <h2 style={{ marginTop: 0 }}>How much does it cost?</h2>
            <p style={{ color: 'var(--text-muted)', lineHeight: '1.6' }}>
              Each production subscription costs £4.99 per month. You can choose to set up auto-renewal (subscription) or pay for one month at a time. You only pay for the shows you want to track.
            </p>
          </section>

          <section>
            <h2 style={{ marginTop: 0 }}>How often do you check for tickets?</h2>
            <p style={{ color: 'var(--text-muted)', lineHeight: '1.6' }}>
              We check for standing tickets every 15 minutes during business hours (8am-6pm UTC).
            </p>
          </section>

          <section>
            <h2 style={{ marginTop: 0 }}>Can I cancel my subscription?</h2>
            <p style={{ color: 'var(--text-muted)', lineHeight: '1.6' }}>
              Yes, you can cancel anytime. Your subscription will remain active until the end of your current billing period. Use the management link sent to your email to cancel.
            </p>
          </section>

          <section>
            <h2 style={{ marginTop: 0 }}>What happens when a production ends?</h2>
            <p style={{ color: 'var(--text-muted)', lineHeight: '1.6', marginBottom: '1rem' }}>
              When a production ends, your subscription will be automatically cancelled on the production's end date. No refund will be provided for any remaining time on your subscription.
            </p>
            <p style={{ color: 'var(--text-muted)', lineHeight: '1.6', marginBottom: '1rem' }}>
              <strong>However, as per our guarantee:</strong> If no standing tickets have been found since your last payment at the point of cancellation or renewal, you will receive a full refund. You are only charged if we find and alert you of tickets during that period.
            </p>
            <p style={{ color: 'var(--text-muted)', lineHeight: '1.6' }}>
              <strong>For auto-renew subscriptions:</strong> Your subscription will not be cancelled until 1 week after the production end date. However, renewals will not be processed after the production end date—if a renewal is attempted after the production ends, your subscription will be automatically cancelled and any charges will be refunded.
            </p>
          </section>

          <section>
            <h2 style={{ marginTop: 0 }}>What if I don't receive notifications?</h2>
            <p style={{ color: 'var(--text-muted)', lineHeight: '1.6' }}>
              Make sure to check your spam folder. If you're still not receiving emails, contact us and we'll help troubleshoot.
            </p>
          </section>
        </div>
      </article>
    </div>
  );
};

