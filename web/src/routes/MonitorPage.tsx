import { useEffect, useState } from 'react';
import { getMonitorStatus, triggerScrape, adminAuth } from '../lib/api';
import type { MonitorStatusResponse, ProductionStatus } from '../lib/types';
import { AdminLogin } from '../components/AdminLogin';

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
  const [triggering, setTriggering] = useState(false);
  const [triggerError, setTriggerError] = useState<string | null>(null);
  const [triggerSuccess, setTriggerSuccess] = useState(false);

  const handleLogin = async (username: string, password: string): Promise<boolean> => {
    const result = await adminAuth(username, password);
    
    if (result.success && result.token && result.expiresAt) {
      setAuthenticated(result.token, result.expiresAt);
      setAuthenticatedState(true);
      return true;
    }
    
    return false;
  };

  const handleLogout = () => {
    clearAuthentication();
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

  const handleTriggerScrape = async () => {
    setTriggering(true);
    setTriggerError(null);
    setTriggerSuccess(false);

    const result = await triggerScrape();
    if (result.error) {
      setTriggerError(result.error);
    } else {
      setTriggerSuccess(true);
      // Reload status after a short delay to see updated timestamps
      setTimeout(() => {
        loadStatus();
        setTriggerSuccess(false);
      }, 2000);
    }
    setTriggering(false);
  };

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

  const { services } = status;

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '1rem' }}>
        <button onClick={handleLogout} className="btn btn--ghost btn--small">
          Logout
        </button>
      </div>
      <div className="grid" style={{ gap: '1.5rem', padding: '2rem 0' }}>
        <SectionCard title="Productions">
        <div className="grid" style={{ gap: '0.75rem' }}>
          {status.productions.map(renderProduction)}
        </div>
      </SectionCard>

      <SectionCard title="Services">
        <div className="grid" style={{ gap: '0.75rem' }}>
          <StatusRow
            label="Web scraper"
            healthy={services.scraper.healthy}
            detail={
              services.scraper.monthlyUsed !== undefined && services.scraper.monthlyLimit !== undefined
                ? `${services.scraper.used}/${services.scraper.limit} today · ${services.scraper.monthlyUsed}/${services.scraper.monthlyLimit} this month`
                : `${services.scraper.used}/${services.scraper.limit} req today`
            }
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
        <div style={{ marginTop: '1rem', paddingTop: '1rem', borderTop: '1px solid #222' }}>
          <button
            onClick={handleTriggerScrape}
            disabled={triggering}
            style={{
              padding: '0.75rem 1.5rem',
              backgroundColor: triggering ? '#666' : 'var(--yellow)',
              color: '#000',
              border: 'none',
              borderRadius: '0.5rem',
              fontWeight: '600',
              cursor: triggering ? 'not-allowed' : 'pointer',
              fontSize: '0.9rem',
              width: '100%',
            }}
          >
            {triggering ? 'Triggering...' : triggerSuccess ? '✓ Triggered successfully' : 'Run Scraper Now'}
          </button>
          {triggerError && (
            <p style={{ margin: '0.5rem 0 0 0', color: '#f87171', fontSize: '0.85rem' }}>
              Error: {triggerError}
            </p>
          )}
        </div>
      </SectionCard>
      </div>
    </div>
  );
};
