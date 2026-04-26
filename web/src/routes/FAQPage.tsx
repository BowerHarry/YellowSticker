import { useEffect, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { getMonitorStatus } from '../lib/api';

const formatHour = (hour: number): string => {
  const h = ((hour % 24) + 24) % 24;
  return `${h.toString().padStart(2, '0')}:00`;
};

type FAQ = {
  q: string;
  id?: string;
  a: ReactNode;
};

type FAQGroup = {
  title: string;
  items: FAQ[];
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

  const groups: FAQGroup[] = [
    {
      title: 'The basics',
      items: [
        {
          q: 'How does it work?',
          a: (
            <p className="faq-card__a">
              Pick a show, subscribe for £2 a month, and we email or message you on Telegram when same-day standing
              tickets look available on the official box office. You always buy from the theatre&apos;s real checkout,
              at the same prices everyone else sees.
            </p>
          ),
        },
        {
          q: 'What are standing tickets?',
          a: (
            <>
              <p className="faq-card__a">
                Standing tickets are cheap tickets some theatres release on the day of the performance. They tend to
                appear when a show is sold out or close to it, and you stand for the performance (often at the back of
                the Grand Circle).
              </p>
              <p className="faq-card__a">
                They&apos;re a brilliant way to see top productions for a fraction of the price — but if you need a
                guaranteed seat, a regular ticket is the better fit.
              </p>
            </>
          ),
        },
        {
          q: 'How often do you check?',
          a: (
            <>
              <p className="faq-card__a">
                We check the official box office {pollPhrase} during our daily active window ({windowPhrase}). Outside
                that window we pause checks — standing drops are a daytime game, and this keeps things efficient.
              </p>
              <p className="faq-card__a" style={{ fontSize: '0.875rem' }}>
                The active window and interval update automatically as the schedule changes, so what you read here
                always reflects the latest saved settings.
              </p>
            </>
          ),
        },
      ],
    },
    {
      title: 'Pricing & guarantee',
      items: [
        {
          q: 'How much does it cost?',
          a: (
            <p className="faq-card__a">
              £2 per production per month. You can auto-renew or pay for one month at a time, and you only pay for the
              shows you actually want to track.
            </p>
          ),
        },
        {
          id: 'refund-guarantee',
          q: 'What is the money-back guarantee?',
          a: (
            <>
              <p className="faq-card__a">
                <strong style={{ color: 'var(--text)' }}>No tickets found, no charge.</strong> If no standing tickets
                have been found since your last payment at the point you cancel or when a renewal is due, you receive a
                full refund for that period. We only expect you to pay when we&apos;ve actually found and alerted you to
                standing-ticket availability in the billing window you paid for.
              </p>
              <p className="faq-card__a">
                Refunds are applied automatically where our records show no ticket finds since your last charge. Use the
                management link in any of our emails to cancel or check status. If something looks wrong, reply to any
                alert and we&apos;ll fix it.
              </p>
            </>
          ),
        },
        {
          q: 'Can I cancel anytime?',
          a: (
            <p className="faq-card__a">
              Yes. Your subscription stays active until the end of the current billing period. Use the management link
              in any of our emails to cancel.
            </p>
          ),
        },
      ],
    },
    {
      title: 'Productions & alerts',
      items: [
        {
          q: 'What happens when a production ends?',
          a: (
            <>
              <p className="faq-card__a">
                Subscriptions automatically wind down on a production&apos;s end date. No refund is provided for unused
                time, but our money-back guarantee still applies for any billing period in which we found no standing
                tickets.
              </p>
              <p className="faq-card__a">
                <strong style={{ color: 'var(--text)' }}>Auto-renew note:</strong> the subscription stays active up to
                one week after the run, but renewals will not be processed after the production has ended. If a renewal
                is attempted, the subscription is automatically cancelled and any charge is refunded.
              </p>
            </>
          ),
        },
        {
          q: 'I’m not getting notifications',
          a: (
            <p className="faq-card__a">
              First, check your spam folder. If you&apos;re still not seeing emails, reply to any of our messages and
              we&apos;ll help troubleshoot.
            </p>
          ),
        },
      ],
    },
  ];

  let counter = 0;

  return (
    <div className="stack center-wide">
      <Link to="/" className="back-link">
        ← Back to home
      </Link>

      <div className="glass-card glass-card--accent">
        <h1 style={{ marginBottom: '0.375rem' }}>Frequently asked</h1>
        <p className="muted" style={{ margin: 0 }}>
          Short answers to the questions we get the most.
        </p>
      </div>

      {groups.map((group) => (
        <div key={group.title} className="faq-group">
          <div className="faq-group__head">
            <span className="faq-group__eyebrow">{group.title}</span>
            <span className="faq-group__rule" />
          </div>

          {group.items.map((item) => {
            counter += 1;
            return (
              <article key={item.q} id={item.id} className="faq-card">
                <span className="faq-card__num">{counter.toString().padStart(2, '0')}</span>
                <h2 className="faq-card__q">{item.q}</h2>
                {item.a}
              </article>
            );
          })}
        </div>
      ))}
    </div>
  );
};
