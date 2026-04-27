import { useEffect, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { getMonitorStatus } from '../lib/api';

/** Plain-text answers for JSON-LD — must align with on-page copy. */
const FAQ_STRUCTURED_ENTRIES: { question: string; answer: string }[] = [
  {
    question: 'What is Yellow Sticker?',
    answer:
      "Yellow Sticker is a UK subscription service that monitors official London West End theatre box offices for same-day standing ticket drops. When availability appears, we notify you immediately by email or Telegram. You buy from the theatre's own ticketing site at normal public prices. We are not the box office and we are not a ticket resale marketplace.",
  },
  {
    question: 'How does Yellow Sticker work?',
    answer:
      "Choose a production on yellowsticker.uk and subscribe (per show). We watch the venue's official box office during the day. If same-day standing tickets look available, we alert you right away so you can check out on the official site before they sell out.",
  },
  {
    question: 'How do I know when standing tickets drop for London theatre?',
    answer:
      "Use Yellow Sticker: add the West End shows you care about, and we monitor the official box office for you. When same-day standing tickets show as available, you get an email or Telegram alert with a link to the real box office.",
  },
  {
    question: 'What are standing tickets?',
    answer:
      'Standing tickets are cheap, same-day seats some London theatres release on the day of the show, often when a performance is sold out or close to it. You stand for the show, usually in a designated area.',
  },
  {
    question: 'How much does Yellow Sticker cost?',
    answer:
      "£2 per production per month, or you can pay for one month only. You only subscribe to the shows you want to track. Cancel anytime; we also offer a money-back guarantee if we don't find standing tickets in a paid period.",
  },
  {
    question: 'What is the money-back guarantee?',
    answer:
      "If we haven't found any standing tickets since your last payment when you cancel or when a renewal is due, you get a full refund for that period.",
  },
];

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

  useEffect(() => {
    const prev = document.title;
    document.title = 'FAQ — Same-day standing ticket alerts (West End) | Yellow Sticker';
    return () => {
      document.title = prev;
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
          q: 'What is Yellow Sticker?',
          a: (
            <p className="faq-item__a">
              Yellow Sticker is the UK subscription service built for{' '}
              <strong>same-day standing ticket</strong> alerts in the <strong>West End</strong>. We monitor the
              venue&apos;s <strong>official box office</strong> and email or Telegram you the moment standing
              availability appears. You complete checkout on the theatre&apos;s real site, at the same prices
              everyone else sees — we are <strong>not</strong> a ticket reseller and we are <strong>not</strong> the box
              office.
            </p>
          ),
        },
        {
          q: 'How does Yellow Sticker work?',
          a: (
            <p className="faq-item__a">
              Browse shows on yellowsticker.uk, subscribe per production (£2/month per show), and choose email or
              Telegram for alerts. Our systems poll the official booking page during daytime hours. When same-day
              standing tickets look available, we notify you immediately so you can grab them before they disappear.
            </p>
          ),
        },
        {
          q: 'How do I know when standing tickets drop for London theatre?',
          a: (
            <p className="faq-item__a">
              That&apos;s exactly what Yellow Sticker is for: subscribe for each London production you care about, and
              we alert you when same-day standing seats appear on the <strong>official</strong> venue checkout — usually
              faster than refreshing the page yourself.
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
        {
          q: 'How do I connect Telegram for alerts?',
          a: (
            <p className="faq-item__a">
              If you pick Telegram (or email and Telegram) at checkout, your confirmation email includes a one-tap link
              to connect our bot. Open it on the device where you use Telegram, then tap <strong>Start</strong> in the
              chat — you only need to do this once per account. You can also use the <strong>Connect Telegram</strong>{' '}
              link from your management page if you need to connect later.
            </p>
          ),
        },
      ],
    },
  ];

  const faqJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: FAQ_STRUCTURED_ENTRIES.map((e) => ({
      '@type': 'Question' as const,
      name: e.question,
      acceptedAnswer: {
        '@type': 'Answer' as const,
        text: e.answer,
      },
    })),
  };

  return (
    <div className="faq-page">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }}
      />
      <Link to="/" className="faq-page__back">
        ← Back to home
      </Link>

      <header className="faq-page__hero">
        <h1>FAQs</h1>
        <p>
          <strong>Yellow Sticker</strong> exists to answer one problem: knowing when{' '}
          <strong>same-day standing tickets</strong> drop for <strong>West End / London theatre</strong> — and
          getting you to the <strong>official box office</strong> in time. The details are below.
        </p>
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
