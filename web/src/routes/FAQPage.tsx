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
            <p className="faq-item__a">
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
              <p className="faq-item__a">
                Standing tickets are cheap tickets some theatres release on the day of the performance. They tend to
                appear when a show is sold out or close to it, and you stand for the performance (often at the back of
                the Grand Circle).
              </p>
              <p className="faq-item__a">
                They&apos;re a brilliant way to see top productions for a fraction of the price — but if you need a
                guaranteed seat, a regular ticket is the better fit.
              </p>
            </>
          ),
        },
        {
          q: 'How often do you check?',
          a: (
            <p className="faq-item__a">
              We check the official box office {pollPhrase} during our daily active window ({windowPhrase}). Outside
              that window we pause checks — standing drops are a daytime game, and this keeps things efficient.
            </p>
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
            <p className="faq-item__a">
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
              <p className="faq-item__a">
                No alerts, no charge. If no standing tickets have been found since your last payment at the point
                you cancel or when a renewal is due, you receive a full refund for that period. We only expect you
                to pay when we&apos;ve actually found and alerted you to standing-ticket availability.
              </p>
              <p className="faq-item__a">
                Refunds are applied automatically where our records show no ticket finds since your last charge. Use
                the management link in any of our emails to cancel or check status. If something looks wrong, reply
                to any alert and we&apos;ll fix it.
              </p>
            </>
          ),
        },
        {
          q: 'Can I cancel anytime?',
          a: (
            <p className="faq-item__a">
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
              <p className="faq-item__a">
                Subscriptions automatically wind down on a production&apos;s end date. No refund is provided for unused
                time, but our money-back guarantee still applies for any billing period in which we found no standing
                tickets.
              </p>
              <p className="faq-item__a">
                Auto-renew note: the subscription stays active up to one week after the run, but renewals will not be
                processed after the production has ended. If a renewal is attempted, the subscription is automatically
                cancelled and any charge is refunded.
              </p>
            </>
          ),
        },
        {
          q: "I'm not getting notifications",
          a: (
            <p className="faq-item__a">
              First, check your spam folder. If you&apos;re still not seeing emails, reply to any of our messages and
              we&apos;ll help troubleshoot.
            </p>
          ),
        },
      ],
    },
  ];

  return (
    <div className="faq-page">
      <Link to="/" className="faq-page__back">
        ← Back to home
      </Link>

      <header className="faq-page__hero">
        <h1>FAQs</h1>
        <p>Got questions? We&apos;ve got answers.</p>
      </header>

      {groups.map((group) => (
        <section key={group.title} className="faq-section">
          <h2 className="faq-section__title">{group.title}</h2>
          {group.items.map((item) => (
            <article key={item.q} id={item.id} className="faq-item">
              <h3 className="faq-item__q">{item.q}</h3>
              {item.a}
            </article>
          ))}
        </section>
      ))}
    </div>
  );
};
