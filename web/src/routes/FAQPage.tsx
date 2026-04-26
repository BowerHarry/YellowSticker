import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { getMonitorStatus } from '../lib/api';

const formatHour = (hour: number): string => {
  const h = ((hour % 24) + 24) % 24;
  return `${h.toString().padStart(2, '0')}:00`;
};

export const FAQPage = () => {
  const [pollMinutes, setPollMinutes] = useState<number | null>(null);
  const [activeStart, setActiveStart] = useState<number | null>(null);
  const [activeEnd, setActiveEnd] = useState<number | null>(null);
  const [timezone, setTimezone] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const data = await getMonitorStatus();
      if (cancelled || !data) return;
      const s = data.services.scraper.settings;
      setPollMinutes(s.pollMinutes);
      setActiveStart(s.activeHoursStart);
      setActiveEnd(s.activeHoursEnd);
      setTimezone(s.timezone);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const pollPhrase =
    pollMinutes != null
      ? pollMinutes === 1
        ? 'every minute'
        : `every ${pollMinutes} minutes`
      : 'on a regular schedule';

  const windowPhrase =
    activeStart != null && activeEnd != null && timezone
      ? `${formatHour(activeStart)}–${formatHour(activeEnd)} ${timezone}`
      : 'a daily daytime window (London time)';

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
              Pick a show, subscribe for £2/month, and we email you when same-day standing tickets look
              available on the official box office site. You buy the tickets yourself — always from the theatre&apos;s
              real checkout, at the same prices everyone else sees.
            </p>
          </section>

          <section>
            <h2 style={{ marginTop: 0 }}>How much does it cost?</h2>
            <p style={{ color: 'var(--text-muted)', lineHeight: '1.6' }}>
              Each production subscription costs £2 per month. You can set up auto-renewal (subscription) or pay for
              one month at a time. You only pay for the shows you want to track.
            </p>
          </section>

          <section>
            <h2 style={{ marginTop: 0 }}>What are standing tickets?</h2>
            <p style={{ color: 'var(--text-muted)', lineHeight: '1.6' }}>
              Standing tickets are cheap tickets released on the day of the performance by some theatres. They usually
              only appear on days when a show is sold out or close to sold out. You&apos;ll stand for the performance
              (often at the back of the Grand Circle, but sometimes elsewhere) — so comfy shoes help on longer shows.
            </p>
            <p style={{ color: 'var(--text-muted)', lineHeight: '1.6' }}>
              They can be a brilliant way to see some of London&apos;s best productions for great value, but they&apos;re
              not for everyone — if you need a guaranteed seat, a standard ticket is the better fit.
            </p>
          </section>

          <section>
            <h2 style={{ marginTop: 0 }}>How often do you check for tickets?</h2>
            <p style={{ color: 'var(--text-muted)', lineHeight: '1.6' }}>
              We check the official box office {pollPhrase} during our daily active window ({windowPhrase}). Outside
              that window we pause checks — standing drops are a daytime game, and this keeps things efficient.
            </p>
            <p style={{ color: 'var(--text-muted)', lineHeight: '1.6', fontSize: '0.9rem' }}>
              The active window and interval update automatically when our checker&apos;s schedule changes — what you
              read here always reflects the latest saved schedule.
            </p>
          </section>

          <section>
            <h2 style={{ marginTop: 0 }}>Can I cancel my subscription?</h2>
            <p style={{ color: 'var(--text-muted)', lineHeight: '1.6' }}>
              Yes, you can cancel anytime. Your subscription will remain active until the end of your current billing
              period. Use the management link sent to your email to cancel.
            </p>
          </section>

          <section>
            <h2 style={{ marginTop: 0 }}>What happens when a production ends?</h2>
            <p style={{ color: 'var(--text-muted)', lineHeight: '1.6', marginBottom: '1rem' }}>
              When a production ends, your subscription will be automatically cancelled on the production&apos;s end date.
              No refund will be provided for any remaining time on your subscription.
            </p>
            <p
              id="refund-guarantee"
              style={{ color: 'var(--text-muted)', lineHeight: '1.6', marginBottom: '1rem' }}
            >
              <strong>However, as per our guarantee:</strong> If no standing tickets have been found since your last
              payment at the point of cancellation or renewal, you will receive a full refund. You are only charged if
              we find and alert you of tickets during that period.
            </p>
            <p style={{ color: 'var(--text-muted)', lineHeight: '1.6' }}>
              <strong>For auto-renew subscriptions:</strong> Your subscription will not be cancelled until 1 week after the
              production end date. However, renewals will not be processed after the production end date—if a renewal is
              attempted after the production ends, your subscription will be automatically cancelled and any charges will
              be refunded.
            </p>
          </section>

          <section>
            <h2 style={{ marginTop: 0 }}>What if I don&apos;t receive notifications?</h2>
            <p style={{ color: 'var(--text-muted)', lineHeight: '1.6' }}>
              Make sure to check your spam folder. If you&apos;re still not receiving emails, contact us and we&apos;ll
              help troubleshoot.
            </p>
          </section>
        </div>
      </article>
    </div>
  );
};
