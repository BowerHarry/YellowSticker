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
    <div className="grid" style={{ gap: '1.5rem', maxWidth: '760px', margin: '0 auto' }}>
      <Link to="/" className="back-link">
        ← Back to home
      </Link>

      <div className="glass-card glass-card--accent">
        <h1 style={{ marginBottom: '0.375rem' }}>Frequently asked</h1>
        <p className="muted" style={{ margin: 0 }}>
          Short answers to the questions we get the most.
        </p>
      </div>

      <article className="glass-card">
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.75rem' }}>
          <section>
            <h2>How does it work?</h2>
            <p className="muted">
              Pick a show, subscribe for £2 a month, and we email or message you on Telegram when same-day standing
              tickets look available on the official box office. You always buy from the theatre&apos;s real
              checkout, at the same prices everyone else sees.
            </p>
          </section>

          <section>
            <h2>How much does it cost?</h2>
            <p className="muted">
              £2 per production per month. You can auto-renew or pay for one month at a time, and you only pay for
              the shows you actually want to track.
            </p>
          </section>

          <section id="refund-guarantee">
            <h2>Money-back guarantee</h2>
            <p className="muted">
              <strong style={{ color: 'var(--text)' }}>No tickets found, no charge.</strong> If no standing tickets
              have been found since your last payment at the point you cancel or when a renewal is due, you receive a
              full refund for that period. We only expect you to pay when we&apos;ve actually found and alerted you to
              standing-ticket availability in the billing window you paid for.
            </p>
            <p className="muted">
              Refunds are applied automatically where our records show no ticket finds since your last charge. Use the
              management link in any of our emails to cancel or check status. If something looks wrong, reply to any
              alert and we&apos;ll fix it.
            </p>
          </section>

          <section>
            <h2>What are standing tickets?</h2>
            <p className="muted">
              Standing tickets are cheap tickets some theatres release on the day of the performance. They tend to
              appear when a show is sold out or close to it, and you stand for the performance (often at the back of
              the Grand Circle).
            </p>
            <p className="muted">
              They&apos;re a brilliant way to see top productions for a fraction of the price — but if you need a
              guaranteed seat, a regular ticket is the better fit.
            </p>
          </section>

          <section>
            <h2>How often do you check?</h2>
            <p className="muted">
              We check the official box office {pollPhrase} during our daily active window ({windowPhrase}). Outside
              that window we pause checks — standing drops are a daytime game, and this keeps things efficient.
            </p>
            <p className="muted" style={{ fontSize: '0.875rem' }}>
              The active window and interval update automatically as the schedule changes, so what you read here
              always reflects the latest saved settings.
            </p>
          </section>

          <section>
            <h2>Can I cancel anytime?</h2>
            <p className="muted">
              Yes. Your subscription stays active until the end of the current billing period. Use the management link
              in any of our emails to cancel.
            </p>
          </section>

          <section>
            <h2>What happens when a production ends?</h2>
            <p className="muted">
              Subscriptions automatically wind down on a production&apos;s end date. No refund is provided for unused
              time, but our{' '}
              <Link to="/faq#refund-guarantee" style={{ color: 'var(--yellow)', fontWeight: 600 }}>
                money-back guarantee
              </Link>{' '}
              still applies for any billing period in which we found no standing tickets.
            </p>
            <p className="muted">
              <strong style={{ color: 'var(--text)' }}>Auto-renew note:</strong> the subscription stays active up to
              one week after the run, but renewals will not be processed after the production has ended. If a renewal
              is attempted, the subscription is automatically cancelled and any charge is refunded.
            </p>
          </section>

          <section>
            <h2>I&apos;m not getting notifications</h2>
            <p className="muted">
              First, check your spam folder. If you&apos;re still not seeing emails, reply to any of our messages and
              we&apos;ll help troubleshoot.
            </p>
          </section>
        </div>
      </article>
    </div>
  );
};
