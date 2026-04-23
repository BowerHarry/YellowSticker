import { useEffect, useState, type CSSProperties } from 'react';
import {
  adminAuth,
  adminCreateProduction,
  adminPreviewCancel,
  adminTestFixture,
  getMonitorStatus,
  sendTestEmail,
  type AdminCreateProductionPayload,
  type AdminPreviewCancelResponse,
  type AdminPreviewCancelSelector,
  type TestEmailTemplate,
  type TestFixtureAction,
  type TestFixtureResponse,
} from '../lib/api';
import type { MonitorStatusResponse, ProductionStatus } from '../lib/types';
import { AdminLogin } from '../components/AdminLogin';

const EMAIL_TEMPLATES: { id: TestEmailTemplate; label: string }[] = [
  { id: 'availability', label: 'Standing tickets available' },
  { id: 'signup-subscription', label: 'Signup (auto-renew)' },
  { id: 'signup-one-time', label: 'Signup (one-off)' },
  { id: 'renewal', label: 'Renewal' },
  { id: 'cancel-refund', label: 'Cancellation + refund' },
  { id: 'cancel-period-end', label: 'Cancellation at period end' },
  { id: 'cancel-production-ended', label: 'Cancellation (production ended)' },
  { id: 'expiry', label: 'Expiry notice' },
];

const Dot = ({ status }: { status: 'healthy' | 'unhealthy' | 'paused' | boolean }) => {
  // Handle legacy boolean for services
  const actualStatus: 'healthy' | 'unhealthy' | 'paused' =
    typeof status === 'boolean' ? (status ? 'healthy' : 'unhealthy') : status;

  const colors = {
    healthy: '#4ade80',
    unhealthy: '#f87171',
    paused: '#9ca3af', // grey
  };

  const shadows = {
    healthy: '0 0 6px rgba(74, 222, 128, 0.6)',
    unhealthy: '0 0 6px rgba(248, 113, 113, 0.6)',
    paused: '0 0 6px rgba(156, 163, 175, 0.4)',
  };

  return (
    <span
      style={{
        display: 'inline-block',
        width: '0.75rem',
        height: '0.75rem',
        borderRadius: '50%',
        marginRight: '0.5rem',
        backgroundColor: colors[actualStatus],
        boxShadow: shadows[actualStatus],
      }}
    />
  );
};

const SectionCard = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <section className="glass-card" style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
    <h2 style={{ margin: 0 }}>{title}</h2>
    {children}
  </section>
);

const formInputStyle: CSSProperties = {
  width: '100%',
  padding: '0.5rem 0.75rem',
  background: 'rgba(255,255,255,0.05)',
  border: '1px solid rgba(255,255,255,0.2)',
  borderRadius: '0.5rem',
  color: 'inherit',
};

const StatusRow = ({
  label,
  healthy,
  status,
  detail,
}: {
  label: string;
  healthy?: boolean;
  status?: 'healthy' | 'unhealthy' | 'paused';
  detail?: string;
}) => {
  const dotStatus = status ?? (healthy !== undefined ? healthy : 'unhealthy');
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.75rem' }}>
      <div style={{ display: 'flex', alignItems: 'center' }}>
        <Dot status={dotStatus} />
        <span>{label}</span>
      </div>
      {detail && (
        <span style={{ color: 'var(--muted)', fontSize: '0.85rem', textAlign: 'right' }}>
          {detail}
        </span>
      )}
    </div>
  );
};

const formatTimestamp = (iso: string | null) => {
  if (!iso) return 'Never';
  const date = new Date(iso);
  return `${date.toLocaleDateString()} ${date.toLocaleTimeString()}`;
};

const formatHour = (hour: number): string => {
  const h = ((hour % 24) + 24) % 24;
  return `${h.toString().padStart(2, '0')}:00`;
};

const isAuthenticated = (): boolean => {
  const token = localStorage.getItem('admin_token');
  const expiresAt = localStorage.getItem('admin_token_expires');
  
  if (!token || !expiresAt) {
    return false;
  }

  // Check if token has expired
  const expirationDate = new Date(expiresAt);
  if (expirationDate < new Date()) {
    localStorage.removeItem('admin_token');
    localStorage.removeItem('admin_token_expires');
    return false;
  }

  return true;
};

const setAuthenticated = (token: string, expiresAt: string) => {
  localStorage.setItem('admin_token', token);
  localStorage.setItem('admin_token_expires', expiresAt);
};

const clearAuthentication = () => {
  localStorage.removeItem('admin_token');
  localStorage.removeItem('admin_token_expires');
};

export const MonitorPage = () => {
  const [authenticated, setAuthenticatedState] = useState(isAuthenticated());
  const [status, setStatus] = useState<MonitorStatusResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const handleLogin = async (username: string, password: string): Promise<boolean> => {
    const result = await adminAuth(username, password);

    if (result.success && result.token && result.expiresAt) {
      setAuthenticated(result.token, result.expiresAt);
      // Stash creds in sessionStorage (cleared on tab close / logout) so the
      // email-test panel can sign its own basic-auth calls without asking
      // the admin to type their password again.
      sessionStorage.setItem('admin_username', username);
      sessionStorage.setItem('admin_password', password);
      setAuthenticatedState(true);
      return true;
    }

    return false;
  };

  const handleLogout = () => {
    clearAuthentication();
    sessionStorage.removeItem('admin_username');
    sessionStorage.removeItem('admin_password');
    setAuthenticatedState(false);
  };

  const loadStatus = async () => {
    setLoading(true);
    setError(null);
    const data = await getMonitorStatus();
    if (!data) {
      setError('Unable to load monitoring data');
    }
    setStatus(data);
    setLoading(false);
  };

  useEffect(() => {
    if (authenticated) {
      loadStatus();
    }
  }, [authenticated]);

  if (!authenticated) {
    return <AdminLogin onLogin={handleLogin} />;
  }

  if (loading || !status) {
    return (
      <div className="glass-card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
          <p style={{ margin: 0 }}>{error ?? 'Loading status…'}</p>
          <button onClick={handleLogout} className="btn btn--ghost btn--small">
            Logout
          </button>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="glass-card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <p style={{ margin: 0, color: '#f87171' }}>{error}</p>
          <button onClick={handleLogout} className="btn btn--ghost btn--small">
            Logout
          </button>
        </div>
      </div>
    );
  }

  return (
    <MonitorContent
      status={status}
      services={status.services}
      handleLogout={handleLogout}
    />
  );
};

const MonitorContent = ({
  status,
  services,
  handleLogout,
}: {
  status: MonitorStatusResponse;
  services: MonitorStatusResponse['services'];
  handleLogout: () => void;
}) => {
  const [emailTo, setEmailTo] = useState('');
  const [sending, setSending] = useState<TestEmailTemplate | null>(null);
  const [emailFeedback, setEmailFeedback] = useState<string | null>(null);

  // Preview cancel panel state.
  type PreviewSelectorKind = 'subscriptionId' | 'managementToken' | 'emailSlug';
  const [previewKind, setPreviewKind] = useState<PreviewSelectorKind>('emailSlug');
  const [previewSubscriptionId, setPreviewSubscriptionId] = useState('');
  const [previewManagementToken, setPreviewManagementToken] = useState('');
  const [previewEmail, setPreviewEmail] = useState('');
  const [previewProductionSlug, setPreviewProductionSlug] = useState('');
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [previewResult, setPreviewResult] = useState<AdminPreviewCancelResponse | null>(null);

  // Test fixture panel state.
  const [fixtureBusy, setFixtureBusy] = useState<string | null>(null);
  const [fixtureError, setFixtureError] = useState<string | null>(null);
  const [fixtureResult, setFixtureResult] = useState<TestFixtureResponse | null>(null);

  // Add production panel state.
  const [prodSlug, setProdSlug] = useState('');
  const [prodName, setProdName] = useState('');
  const [prodTheatre, setProdTheatre] = useState('');
  const [prodCity, setProdCity] = useState('London');
  const [prodScrapingUrl, setProdScrapingUrl] = useState('');
  const [prodSeriesCode, setProdSeriesCode] = useState('');
  const [prodAdapter, setProdAdapter] = useState<'delfont' | 'none'>('delfont');
  const [prodScrapeDisabled, setProdScrapeDisabled] = useState(false);
  const [prodScrapeDisabledReason, setProdScrapeDisabledReason] = useState('');
  const [prodDescription, setProdDescription] = useState('');
  const [prodStart, setProdStart] = useState('');
  const [prodEnd, setProdEnd] = useState('');
  const [prodPosterName, setProdPosterName] = useState<string | null>(null);
  const [prodPosterMime, setProdPosterMime] = useState<string | null>(null);
  const [prodPosterBase64, setProdPosterBase64] = useState<string | null>(null);
  const [prodSaving, setProdSaving] = useState(false);
  const [prodError, setProdError] = useState<string | null>(null);
  const [prodResult, setProdResult] = useState<string | null>(null);

  const runFixtureAction = async (payload: TestFixtureAction) => {
    const username = sessionStorage.getItem('admin_username');
    const password = sessionStorage.getItem('admin_password');
    if (!username || !password) {
      setFixtureError('Session expired — log out and back in.');
      return;
    }
    setFixtureBusy(payload.action);
    setFixtureError(null);
    const { data, error } = await adminTestFixture(payload, { username, password });
    setFixtureBusy(null);
    if (error) {
      setFixtureError(error);
      return;
    }
    setFixtureResult(data ?? null);
  };

  const handlePosterChange = (fileList: FileList | null) => {
    const file = fileList?.[0];
    if (!file) {
      setProdPosterName(null);
      setProdPosterMime(null);
      setProdPosterBase64(null);
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result;
      if (typeof result === 'string') {
        setProdPosterBase64(result);
        setProdPosterName(file.name);
        setProdPosterMime(file.type || null);
      }
    };
    reader.readAsDataURL(file);
  };

  const handleCreateProduction = async () => {
    const username = sessionStorage.getItem('admin_username');
    const password = sessionStorage.getItem('admin_password');
    if (!username || !password) {
      setProdError('Session expired — log out and back in.');
      return;
    }
    if (!prodSlug.trim() || !prodName.trim() || !prodTheatre.trim() || !prodScrapingUrl.trim()) {
      setProdError('Slug, name, theatre, and scraping URL are required.');
      return;
    }
    if (!prodStart) {
      setProdError('Start date/time is required.');
      return;
    }
    const startIso = new Date(prodStart);
    if (Number.isNaN(startIso.getTime())) {
      setProdError('Start date/time is invalid.');
      return;
    }
    let endIso: string | undefined;
    if (prodEnd) {
      const end = new Date(prodEnd);
      if (Number.isNaN(end.getTime())) {
        setProdError('End date/time is invalid.');
        return;
      }
      endIso = end.toISOString();
    }

    const payload: AdminCreateProductionPayload = {
      slug: prodSlug.trim(),
      name: prodName.trim(),
      theatre: prodTheatre.trim(),
      city: prodCity.trim() || null,
      scrapingUrl: prodScrapingUrl.trim(),
      seriesCode: prodSeriesCode.trim() || null,
      adapter: prodAdapter,
      scrapeDisabled: prodScrapeDisabled,
      scrapeDisabledReason: prodScrapeDisabledReason.trim() || null,
      description: prodDescription.trim() || null,
      startDate: startIso.toISOString(),
      endDate: endIso,
      posterBase64: prodPosterBase64,
      posterContentType: prodPosterMime,
      posterFileName: prodPosterName,
    };

    setProdSaving(true);
    setProdError(null);
    setProdResult(null);
    const { data, error } = await adminCreateProduction(payload, { username, password });
    setProdSaving(false);
    if (error) {
      setProdError(error);
      return;
    }
    setProdResult(JSON.stringify(data, null, 2));
  };

  const handlePreviewCancel = async () => {
    const username = sessionStorage.getItem('admin_username');
    const password = sessionStorage.getItem('admin_password');
    if (!username || !password) {
      setPreviewError('Session expired — log out and back in.');
      return;
    }

    let selector: AdminPreviewCancelSelector | null = null;
    if (previewKind === 'subscriptionId' && previewSubscriptionId.trim()) {
      selector = { subscriptionId: previewSubscriptionId.trim() };
    } else if (previewKind === 'managementToken' && previewManagementToken.trim()) {
      selector = { managementToken: previewManagementToken.trim() };
    } else if (
      previewKind === 'emailSlug' &&
      previewEmail.trim() &&
      previewProductionSlug.trim()
    ) {
      selector = {
        email: previewEmail.trim(),
        productionSlug: previewProductionSlug.trim(),
      };
    }
    if (!selector) {
      setPreviewError('Fill in the selector fields above.');
      return;
    }

    setPreviewLoading(true);
    setPreviewError(null);
    setPreviewResult(null);
    const { data, error } = await adminPreviewCancel(selector, { username, password });
    setPreviewLoading(false);
    if (error) {
      setPreviewError(error);
      return;
    }
    setPreviewResult(data ?? null);
  };

  const handleSendTestEmail = async (template: TestEmailTemplate) => {
    const username = sessionStorage.getItem('admin_username');
    const password = sessionStorage.getItem('admin_password');
    if (!username || !password) {
      setEmailFeedback('Session expired — log out and back in to send test emails.');
      return;
    }
    setSending(template);
    setEmailFeedback(null);
    const { ok, messageId, error } = await sendTestEmail(
      template,
      { username, password },
      emailTo || undefined,
    );
    setSending(null);
    if (error) {
      setEmailFeedback(`Failed: ${error}`);
    } else if (ok) {
      setEmailFeedback(`Sent ${template} → ${emailTo || 'ALERT_EMAIL'} (id ${messageId ?? 'n/a'})`);
    } else {
      setEmailFeedback('Resend reported failure — check server logs.');
    }
  };

  const renderProduction = (production: ProductionStatus) => {
    const lastCheckedText = production.lastCheckedAt ? formatTimestamp(production.lastCheckedAt) : 'Never';
    const lastFoundText = production.lastStandingTicketsFoundAt
      ? formatTimestamp(production.lastStandingTicketsFoundAt)
      : 'Never';
    return (
      <div key={production.id} style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
        <StatusRow
          label={production.name}
          status={production.status}
          detail={lastCheckedText}
        />
        {production.lastStandingTicketsFoundAt && (
          <div style={{ marginLeft: '1.5rem', fontSize: '0.85rem', color: 'var(--muted)' }}>
            Last found: {lastFoundText}
          </div>
        )}
      </div>
    );
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '1rem' }}>
        <button onClick={handleLogout} className="btn btn--ghost btn--small">
          Logout
        </button>
      </div>
      <div className="grid" style={{ gap: '1.5rem', padding: '2rem 0' }}>
        <SectionCard title="Active productions">
        <div className="grid" style={{ gap: '0.75rem' }}>
          {status.productions.length === 0 ? (
            <p style={{ margin: 0, color: 'var(--muted)' }}>No active productions today.</p>
          ) : (
            status.productions.map(renderProduction)
          )}
        </div>
      </SectionCard>

      <SectionCard title="Add production">
        <p style={{ margin: 0, color: 'var(--muted)', fontSize: '0.85rem' }}>
          Upserts <code>public.productions</code> on <code>slug</code> and uploads an optional poster to the{' '}
          <code>production-posters</code> bucket. For Delfont shows, paste the full series page URL — we&apos;ll infer{' '}
          <code>series_code</code> from <code>/tickets/series/&lt;CODE&gt;/</code> unless you override it. The Firefox
          extension only scrapes rows where <code>adapter != 'none'</code>, <code>scrape_disabled_reason IS NULL</code>,
          and today falls between <code>start_date</code> and <code>end_date</code>.
        </p>

        <div className="grid" style={{ gap: '0.65rem' }}>
          <label style={{ fontSize: '0.8rem', color: 'var(--muted)' }}>Slug (URL-safe, not test-*)</label>
          <input value={prodSlug} onChange={(e) => setProdSlug(e.target.value)} style={formInputStyle} />

          <label style={{ fontSize: '0.8rem', color: 'var(--muted)' }}>Display name</label>
          <input value={prodName} onChange={(e) => setProdName(e.target.value)} style={formInputStyle} />

          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
            <div style={{ flex: '1 1 14rem' }}>
              <label style={{ fontSize: '0.8rem', color: 'var(--muted)' }}>Theatre</label>
              <input value={prodTheatre} onChange={(e) => setProdTheatre(e.target.value)} style={formInputStyle} />
            </div>
            <div style={{ flex: '1 1 10rem' }}>
              <label style={{ fontSize: '0.8rem', color: 'var(--muted)' }}>City</label>
              <input value={prodCity} onChange={(e) => setProdCity(e.target.value)} style={formInputStyle} />
            </div>
          </div>

          <label style={{ fontSize: '0.8rem', color: 'var(--muted)' }}>
            Scraping URL (Delfont series page — used as CF healing referer base)
          </label>
          <input
            value={prodScrapingUrl}
            onChange={(e) => setProdScrapingUrl(e.target.value)}
            placeholder="https://buytickets.delfontmackintosh.co.uk/tickets/series/GIEOLI/"
            style={formInputStyle}
          />

          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'flex-end' }}>
            <div style={{ flex: '1 1 12rem' }}>
              <label style={{ fontSize: '0.8rem', color: 'var(--muted)' }}>Series code (optional override)</label>
              <input
                value={prodSeriesCode}
                onChange={(e) => setProdSeriesCode(e.target.value)}
                placeholder="Infer from URL if left blank"
                disabled={prodAdapter === 'none'}
                style={formInputStyle}
              />
            </div>
            <div style={{ flex: '0 0 10rem' }}>
              <label style={{ fontSize: '0.8rem', color: 'var(--muted)' }}>Adapter</label>
              <select
                value={prodAdapter}
                onChange={(e) => setProdAdapter(e.target.value as 'delfont' | 'none')}
                style={formInputStyle}
              >
                <option value="delfont">delfont (default)</option>
                <option value="none">none (fixture / manual only)</option>
              </select>
            </div>
          </div>

          <label style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', fontSize: '0.85rem' }}>
            <input
              type="checkbox"
              checked={prodScrapeDisabled}
              onChange={(e) => setProdScrapeDisabled(e.target.checked)}
            />
            Pause scraping (sets <code>scrape_disabled_reason</code>)
          </label>
          {prodScrapeDisabled && (
            <>
              <label style={{ fontSize: '0.8rem', color: 'var(--muted)' }}>Disable reason</label>
              <input
                value={prodScrapeDisabledReason}
                onChange={(e) => setProdScrapeDisabledReason(e.target.value)}
                placeholder="operator_disabled"
                style={formInputStyle}
              />
            </>
          )}

          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
            <div style={{ flex: '1 1 14rem' }}>
              <label style={{ fontSize: '0.8rem', color: 'var(--muted)' }}>Start (local)</label>
              <input type="datetime-local" value={prodStart} onChange={(e) => setProdStart(e.target.value)} style={formInputStyle} />
            </div>
            <div style={{ flex: '1 1 14rem' }}>
              <label style={{ fontSize: '0.8rem', color: 'var(--muted)' }}>End (local, optional)</label>
              <input type="datetime-local" value={prodEnd} onChange={(e) => setProdEnd(e.target.value)} style={formInputStyle} />
            </div>
          </div>

          <label style={{ fontSize: '0.8rem', color: 'var(--muted)' }}>Description (optional)</label>
          <textarea
            value={prodDescription}
            onChange={(e) => setProdDescription(e.target.value)}
            rows={3}
            style={{ ...formInputStyle, resize: 'vertical' }}
          />

          <label style={{ fontSize: '0.8rem', color: 'var(--muted)' }}>Poster image (optional)</label>
          <input type="file" accept="image/*" onChange={(e) => handlePosterChange(e.target.files)} style={formInputStyle} />
          {prodPosterName && (
            <span style={{ fontSize: '0.8rem', color: 'var(--muted)' }}>Selected: {prodPosterName}</span>
          )}

          <button className="btn btn--primary btn--small" disabled={prodSaving} onClick={handleCreateProduction}>
            {prodSaving ? 'Saving…' : 'Save production'}
          </button>
        </div>

        {prodError && <p style={{ margin: 0, fontSize: '0.85rem', color: '#f87171' }}>{prodError}</p>}
        {prodResult && (
          <pre
            style={{
              margin: 0,
              padding: '0.75rem',
              background: 'rgba(255,255,255,0.03)',
              border: '1px solid rgba(255,255,255,0.1)',
              borderRadius: '0.5rem',
              fontSize: '0.78rem',
              overflow: 'auto',
            }}
          >
            {prodResult}
          </pre>
        )}
      </SectionCard>

      <SectionCard title="Services">
        <div className="grid" style={{ gap: '0.75rem' }}>
          <StatusRow
            label="Firefox scraper extension"
            status={services.scraper.status}
            detail={(() => {
              const s = services.scraper;
              const window = `${formatHour(s.settings.activeHoursStart)}–${formatHour(s.settings.activeHoursEnd)} ${s.settings.timezone}`;
              if (s.recentStuck) {
                return 'Reported stuck — visit the box office site once on the Mac mini';
              }
              if (!s.withinActiveWindow) {
                return `Paused until ${formatHour(s.settings.activeHoursStart)} (${window})`;
              }
              if (!s.lastHeartbeatAt) {
                return `No heartbeat yet — expected every ${s.settings.pollMinutes}m within ${window}`;
              }
              return `Last heartbeat ${formatTimestamp(s.lastHeartbeatAt)} · every ${s.settings.pollMinutes}m, ${window}`;
            })()}
          />
          <StatusRow
            label="Database"
            healthy={services.database.healthy}
            detail={`${services.database.monthlyUsers}/${services.database.monthlyUserLimit} MAU · ${(services.database.sizeBytes / (1024 * 1024)).toFixed(1)} / ${(services.database.sizeLimitBytes / (1024 * 1024)).toFixed(0)} MB`}
          />
          <StatusRow
            label="Email provider"
            healthy={services.email.healthy}
            detail={`${services.email.dailyUsage}/${services.email.dailyLimit} today · ${services.email.monthlyUsage}/${services.email.monthlyLimit} this month`}
          />
          <StatusRow
            label="Payment provider"
            healthy={services.payment.healthy}
            detail={services.payment.lastPaidAt ? `Last paid ${formatTimestamp(services.payment.lastPaidAt)}` : `No payments in ${services.payment.lookbackDays}d`}
          />
        </div>
      </SectionCard>

      <SectionCard title="Email templates">
        <p style={{ margin: 0, color: 'var(--muted)', fontSize: '0.85rem' }}>
          Fire a stubbed copy of each email via Resend. Leave the recipient blank to send to <code>ALERT_EMAIL</code>.
        </p>
        <input
          type="email"
          placeholder="Override recipient (optional)"
          value={emailTo}
          onChange={(e) => setEmailTo(e.target.value)}
          style={{
            width: '100%',
            padding: '0.5rem 0.75rem',
            background: 'rgba(255,255,255,0.05)',
            border: '1px solid rgba(255,255,255,0.2)',
            borderRadius: '0.5rem',
            color: 'inherit',
          }}
        />
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
          {EMAIL_TEMPLATES.map((t) => (
            <button
              key={t.id}
              className="btn btn--ghost btn--small"
              disabled={sending !== null}
              onClick={() => handleSendTestEmail(t.id)}
            >
              {sending === t.id ? 'Sending…' : t.label}
            </button>
          ))}
        </div>
        {emailFeedback && (
          <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--muted)' }}>{emailFeedback}</p>
        )}
      </SectionCard>

      <SectionCard title="Preview cancel">
        <p style={{ margin: 0, color: 'var(--muted)', fontSize: '0.85rem' }}>
          Inspect what a cancel would do for any subscription — refund eligibility, Stripe actions,
          recent alerts. Read-only.
        </p>

        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
          {(
            [
              { id: 'emailSlug', label: 'Email + slug' },
              { id: 'subscriptionId', label: 'Subscription ID' },
              { id: 'managementToken', label: 'Management token' },
            ] as const
          ).map((opt) => (
            <button
              key={opt.id}
              className={`btn btn--small ${previewKind === opt.id ? 'btn--primary' : 'btn--ghost'}`}
              onClick={() => setPreviewKind(opt.id)}
            >
              {opt.label}
            </button>
          ))}
        </div>

        {previewKind === 'subscriptionId' && (
          <input
            type="text"
            placeholder="Subscription UUID"
            value={previewSubscriptionId}
            onChange={(e) => setPreviewSubscriptionId(e.target.value)}
            style={formInputStyle}
          />
        )}
        {previewKind === 'managementToken' && (
          <input
            type="text"
            placeholder="Management token"
            value={previewManagementToken}
            onChange={(e) => setPreviewManagementToken(e.target.value)}
            style={formInputStyle}
          />
        )}
        {previewKind === 'emailSlug' && (
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
            <input
              type="email"
              placeholder="user@example.com"
              value={previewEmail}
              onChange={(e) => setPreviewEmail(e.target.value)}
              style={{ ...formInputStyle, flex: 1, minWidth: '14rem' }}
            />
            <input
              type="text"
              placeholder="production-slug"
              value={previewProductionSlug}
              onChange={(e) => setPreviewProductionSlug(e.target.value)}
              style={{ ...formInputStyle, flex: 1, minWidth: '10rem' }}
            />
          </div>
        )}

        <div>
          <button
            className="btn btn--primary btn--small"
            disabled={previewLoading}
            onClick={handlePreviewCancel}
          >
            {previewLoading ? 'Previewing…' : 'Preview cancel'}
          </button>
        </div>

        {previewError && (
          <p style={{ margin: 0, fontSize: '0.85rem', color: '#f87171' }}>{previewError}</p>
        )}

        {previewResult && <PreviewCancelResult result={previewResult} />}
      </SectionCard>

      <SectionCard title="Test fixture">
        <p style={{ margin: 0, color: 'var(--muted)', fontSize: '0.85rem' }}>
          Seeds a hidden <code>test-fixture</code> production you can subscribe to at{' '}
          <code>/productions/test-fixture</code>. Use the buttons below to drive the end-to-end
          flow without touching real shows. The fixture is filtered out of the public listings.
        </p>
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
          <button
            className="btn btn--primary btn--small"
            disabled={fixtureBusy !== null}
            onClick={() => runFixtureAction({ action: 'reset' })}
          >
            {fixtureBusy === 'reset' ? 'Resetting…' : 'Reset fixture'}
          </button>
          <button
            className="btn btn--ghost btn--small"
            disabled={fixtureBusy !== null}
            onClick={() =>
              runFixtureAction({
                action: 'simulate-available',
                standCount: 3,
                performanceCount: 2,
              })
            }
          >
            {fixtureBusy === 'simulate-available' ? 'Firing…' : 'Simulate availability'}
          </button>
          <button
            className="btn btn--ghost btn--small"
            disabled={fixtureBusy !== null}
            onClick={() => runFixtureAction({ action: 'simulate-tickets-found' })}
          >
            {fixtureBusy === 'simulate-tickets-found'
              ? 'Marking…'
              : 'Mark tickets found (disables refund)'}
          </button>
          <button
            className="btn btn--ghost btn--small"
            disabled={fixtureBusy !== null}
            onClick={() => runFixtureAction({ action: 'clear-alert-state' })}
          >
            {fixtureBusy === 'clear-alert-state' ? 'Clearing…' : 'Clear alert state'}
          </button>
          <button
            className="btn btn--ghost btn--small"
            disabled={fixtureBusy !== null}
            onClick={() => {
              if (window.confirm('Delete the test fixture and ALL its subscriptions?')) {
                runFixtureAction({ action: 'delete' });
              }
            }}
          >
            {fixtureBusy === 'delete' ? 'Deleting…' : 'Delete fixture'}
          </button>
        </div>
        {fixtureError && (
          <p style={{ margin: 0, fontSize: '0.85rem', color: '#f87171' }}>{fixtureError}</p>
        )}
        {fixtureResult && (
          <div
            style={{
              padding: '0.75rem',
              background: 'rgba(255,255,255,0.03)',
              border: '1px solid rgba(255,255,255,0.1)',
              borderRadius: '0.5rem',
              fontSize: '0.8rem',
              fontFamily: 'ui-monospace, SFMono-Regular, monospace',
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
            }}
          >
            {JSON.stringify(fixtureResult, null, 2)}
          </div>
        )}
      </SectionCard>
      </div>
    </div>
  );
};

const ModeBadge = ({ mode }: { mode: 'test' | 'live' }) => (
  <span
    style={{
      display: 'inline-block',
      padding: '0.15rem 0.5rem',
      borderRadius: '0.35rem',
      fontSize: '0.7rem',
      fontWeight: 600,
      textTransform: 'uppercase',
      letterSpacing: '0.04em',
      background: mode === 'test' ? 'rgba(234, 179, 8, 0.2)' : 'rgba(74, 222, 128, 0.15)',
      color: mode === 'test' ? '#fbbf24' : '#4ade80',
      border:
        mode === 'test'
          ? '1px solid rgba(234, 179, 8, 0.4)'
          : '1px solid rgba(74, 222, 128, 0.35)',
    }}
  >
    {mode}
  </span>
);

const PreviewCancelResult = ({ result }: { result: AdminPreviewCancelResponse }) => {
  const { subscription, production, preview, recentAlerts } = result;
  const amountLabel =
    preview.refundEligible && preview.refundAmountPence > 0
      ? `£${(preview.refundAmountPence / 100).toFixed(2)}`
      : '£0.00';
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '0.75rem',
        padding: '0.75rem',
        background: 'rgba(255,255,255,0.03)',
        border: '1px solid rgba(255,255,255,0.1)',
        borderRadius: '0.5rem',
        fontSize: '0.85rem',
      }}
    >
      {preview.mode.mismatch && (
        <div
          style={{
            padding: '0.5rem 0.75rem',
            borderRadius: '0.5rem',
            background: 'rgba(248, 113, 113, 0.15)',
            border: '1px solid rgba(248, 113, 113, 0.5)',
          }}
        >
          <strong>Stripe mode mismatch.</strong> This row was created in{' '}
          <code>{preview.mode.row}</code> mode, but the server is currently running in{' '}
          <code>{preview.mode.runtime}</code> mode. A real cancel would hit Stripe with IDs it
          doesn't know about — swap <code>STRIPE_SECRET_KEY</code> /{' '}
          <code>STRIPE_WEBHOOK_SECRET</code> back, or clean up this row manually.
        </div>
      )}
      <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '0.25rem 0.75rem' }}>
        <strong>User</strong>
        <span>{subscription.userEmail ?? subscription.userId}</span>
        <strong>Mode</strong>
        <span>
          <ModeBadge mode={subscription.isTestMode ? 'test' : 'live'} />
          {' '}
          <span style={{ color: 'var(--muted)' }}>
            (server runtime: <code>{preview.mode.runtime}</code>)
          </span>
        </span>
        <strong>Production</strong>
        <span>{production?.name ?? subscription.productionId}</span>
        <strong>Status</strong>
        <span>
          {subscription.paymentStatus}
          {subscription.paymentType ? ` · ${subscription.paymentType}` : ''}
        </span>
        <strong>Period</strong>
        <span>
          {subscription.currentPeriodStart
            ? formatTimestamp(subscription.currentPeriodStart)
            : '—'}
          {' → '}
          {subscription.subscriptionEnd ? formatTimestamp(subscription.subscriptionEnd) : '—'}
        </span>
        <strong>Last alerted</strong>
        <span>{formatTimestamp(subscription.lastAlertedAt)}</span>
        <strong>Last tickets found</strong>
        <span>{formatTimestamp(production?.lastStandingTicketsFoundAt ?? null)}</span>
      </div>

      <div
        style={{
          padding: '0.5rem 0.75rem',
          borderRadius: '0.5rem',
          background: preview.refundEligible
            ? 'rgba(74, 222, 128, 0.12)'
            : 'rgba(156, 163, 175, 0.12)',
          border: preview.refundEligible
            ? '1px solid rgba(74, 222, 128, 0.4)'
            : '1px solid rgba(156, 163, 175, 0.3)',
        }}
      >
        <div style={{ fontWeight: 600, marginBottom: '0.25rem' }}>
          {preview.refundEligible
            ? `Refund owed: ${amountLabel}`
            : 'No refund — cancel at period end'}
        </div>
        <div style={{ color: 'var(--muted)' }}>{preview.reason}</div>
      </div>

      <div>
        <strong>Stripe actions</strong>
        <ul style={{ margin: '0.25rem 0 0 1.25rem', padding: 0 }}>
          {preview.stripeActions.map((action, idx) => (
            <li key={idx}>{action}</li>
          ))}
        </ul>
      </div>

      {recentAlerts.length > 0 && (
        <details>
          <summary style={{ cursor: 'pointer' }}>
            Recent alerts ({recentAlerts.length})
          </summary>
          <ul style={{ margin: '0.5rem 0 0 1.25rem', padding: 0, color: 'var(--muted)' }}>
            {recentAlerts.map((a, idx) => (
              <li key={idx}>
                {formatTimestamp(a.sentAt)} · {a.reason ?? 'unknown'}
                {a.channelMessageId ? ` · ${a.channelMessageId}` : ''}
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
};
