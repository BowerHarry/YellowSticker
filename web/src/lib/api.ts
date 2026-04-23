import { callSupabaseFunction, supabase } from './supabaseClient';
import type { MonitorStatusResponse, Production, SubscriptionPayload } from './types';

// Get active productions (currently within their date range)
export const getProductions = async (): Promise<Production[]> => {
  if (!supabase) {
    console.warn('Supabase client not available');
    return [];
  }

  const now = new Date().toISOString();
  // Query: start_date <= now AND (end_date IS NULL OR end_date >= now)
  // `test-%` slugs are reserved for operator test fixtures (see
  // `admin-test-fixture` edge function) and must stay hidden from
  // public listings so real visitors never see or subscribe to them.
  const { data, error } = await supabase
    .from('productions')
    .select('*')
    .lte('start_date', now) // start_date <= now
    .or(`end_date.is.null,end_date.gte.${now}`) // end_date is null OR end_date >= now
    .not('slug', 'like', 'test-%')
    .order('name', { ascending: true });

  if (error || !data) {
    console.error('Failed to load productions', error);
    return [];
  }

  return data as Production[];
};

// Get coming soon productions (start_date in the future)
export const getComingSoonProductions = async (): Promise<Production[]> => {
  if (!supabase) {
    console.warn('Supabase client not available');
    return [];
  }

  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from('productions')
    .select('*')
    .gt('start_date', now) // start_date > now
    .not('slug', 'like', 'test-%')
    .order('start_date', { ascending: true });

  if (error || !data) {
    console.error('Failed to load coming soon productions', error);
    return [];
  }

  return data as Production[];
};

export const getProductionBySlug = async (slug: string): Promise<Production | null> => {
  if (!supabase) {
    console.warn('Supabase client not available');
    return null;
  }

  const { data, error } = await supabase.from('productions').select('*').eq('slug', slug).single();

  if (error || !data) {
    console.error('Failed to load production', error);
    return null;
  }

  return data as Production;
};

export const createCheckoutSession = async (
  payload: SubscriptionPayload,
): Promise<{ checkoutUrl?: string; error?: string }> => {
  const { data, error } = await callSupabaseFunction<{ checkoutUrl: string }>('create-checkout-session', {
    method: 'POST',
    body: JSON.stringify(payload),
  });

  if (error) {
    return { error };
  }

  return { checkoutUrl: data?.checkoutUrl };
};

export const requestManageLink = async (
  email: string,
): Promise<{ ok?: boolean; error?: string }> => {
  const { data, error } = await callSupabaseFunction<{ ok: boolean }>('request-manage-link', {
    method: 'POST',
    body: JSON.stringify({ email }),
  });
  if (error) return { error };
  return { ok: data?.ok ?? false };
};

export const getMonitorStatus = async (): Promise<MonitorStatusResponse | null> => {
  const { data, error } = await callSupabaseFunction<MonitorStatusResponse>('status-dashboard');
  if (error) {
    console.error('Failed to fetch monitor status', error);
    return null;
  }
  return data ?? null;
};

export const adminAuth = async (
  username: string,
  password: string,
): Promise<{ success?: boolean; token?: string; expiresAt?: string; error?: string }> => {
  const { data, error } = await callSupabaseFunction<{
    success: boolean;
    token: string;
    expiresAt: string;
  }>('admin-auth', {
    method: 'POST',
    body: JSON.stringify({ username, password }),
  });

  if (error) {
    return { error };
  }

  return {
    success: data?.success ?? false,
    token: data?.token,
    expiresAt: data?.expiresAt,
  };
};

export interface SubscriptionData {
  id: string;
  paymentStatus: string;
  subscriptionStart: string | null;
  subscriptionEnd: string | null;
  createdAt: string;
  isActive: boolean;
  user: {
    id: string;
    email: string | null;
    notificationPreference: string;
  };
  production: {
    id: string;
    name: string;
    slug: string;
    theatre: string;
    city?: string | null;
  };
}

export const getSubscriptionByToken = async (
  token: string,
): Promise<SubscriptionData | null> => {
  const { data, error } = await callSupabaseFunction<{
    subscription: {
      id: string;
      paymentStatus: string;
      subscriptionStart: string | null;
      subscriptionEnd: string | null;
      createdAt: string;
      isActive: boolean;
      user: {
        id: string;
        email: string | null;
        notificationPreference: string;
      };
      production: {
        id: string;
        name: string;
        slug: string;
        theatre: string;
        city?: string | null;
      };
    };
  }>('subscription-management', {
    method: 'GET',
    params: { token },
  });

  if (error) {
    throw new Error(error);
  }

  return data?.subscription || null;
};

export type TestEmailTemplate =
  | 'signup-subscription'
  | 'signup-one-time'
  | 'renewal'
  | 'cancel-refund'
  | 'cancel-period-end'
  | 'cancel-production-ended'
  | 'expiry'
  | 'availability';

// Sends a stubbed copy of the given template via the admin-only
// `send-test-email` edge function. Auth is basic-auth against
// ADMIN_USERNAME / ADMIN_PASSWORD — the caller must pass the admin's
// password so we can sign the request.
export const sendTestEmail = async (
  template: TestEmailTemplate,
  credentials: { username: string; password: string },
  to?: string,
): Promise<{ ok?: boolean; messageId?: string | null; error?: string }> => {
  const basic = btoa(`${credentials.username}:${credentials.password}`);
  const { data, error } = await callSupabaseFunction<{
    ok: boolean;
    messageId: string | null;
  }>('send-test-email', {
    method: 'POST',
    headers: { 'X-Admin-Authorization': `Basic ${basic}` },
    body: JSON.stringify({ template, to }),
  });
  if (error) return { error };
  return { ok: data?.ok ?? false, messageId: data?.messageId ?? null };
};

export type AdminPreviewCancelSelector =
  | { subscriptionId: string }
  | { managementToken: string }
  | { email: string; productionSlug: string };

export interface AdminPreviewCancelResponse {
  subscription: {
    id: string;
    userId: string;
    userEmail: string | null;
    productionId: string;
    paymentStatus: string;
    paymentType: 'subscription' | 'one-time' | null;
    subscriptionStart: string | null;
    subscriptionEnd: string | null;
    currentPeriodStart: string | null;
    lastChargeAmountPence: number | null;
    lastPaymentIntentId: string | null;
    lastAlertedAt: string | null;
    stripeSubscriptionId: string | null;
    stripeSessionId: string | null;
    managementToken: string | null;
    cancellationReason: string | null;
    isTestMode: boolean;
    createdAt: string;
  };
  production: {
    id: string;
    name: string;
    slug: string;
    theatre: string;
    endDate: string | null;
    lastStandingTicketsFoundAt: string | null;
    lastAvailabilityTransitionAt: string | null;
  } | null;
  recentAlerts: Array<{
    sentAt: string;
    channelMessageId: string | null;
    reason: string | null;
  }>;
  preview: {
    refundEligible: boolean;
    reason: string;
    refundAmountPence: number;
    effective: 'immediately' | 'period_end' | 'n/a';
    newPaymentStatus: string;
    stripeActions: string[];
    guarantee: {
      applies: boolean;
      since: string | null;
      lastFoundAt: string | null;
      explanation: string;
    };
    mode: {
      runtime: 'test' | 'live' | 'unknown';
      row: 'test' | 'live';
      mismatch: boolean;
    };
  };
}

// Admin-only: inspect what a cancel would do for any subscription. No
// DB writes, no Stripe calls — purely a dry-run.
export const adminPreviewCancel = async (
  selector: AdminPreviewCancelSelector,
  credentials: { username: string; password: string },
): Promise<{ data?: AdminPreviewCancelResponse; error?: string }> => {
  const basic = btoa(`${credentials.username}:${credentials.password}`);
  const { data, error } = await callSupabaseFunction<AdminPreviewCancelResponse>(
    'admin-preview-cancel',
    {
      method: 'POST',
      headers: { 'X-Admin-Authorization': `Basic ${basic}` },
      body: JSON.stringify(selector),
    },
  );
  if (error) return { error };
  return { data: data ?? undefined };
};

export type TestFixtureAction =
  | { action: 'reset' }
  | { action: 'simulate-available'; standCount?: number; performanceCount?: number }
  | { action: 'simulate-tickets-found' }
  | { action: 'clear-alert-state' }
  | { action: 'delete' };

export interface TestFixtureResponse {
  ok: boolean;
  action: string;
  fixture?: {
    id: string;
    slug: string;
    name: string;
    theatre: string;
    end_date: string | null;
    last_seen_status: string | null;
    last_checked_at: string | null;
    last_standing_tickets_found_at: string | null;
    last_availability_transition_at: string | null;
    scrape_disabled_reason: string | null;
    adapter: string | null;
  } | null;
  markedAt?: string;
  deleted?: boolean;
  reportScrape?: unknown;
  status?: number;
}

// Admin-only helper for test-fixture lifecycle. Hits admin-test-fixture.
export const adminTestFixture = async (
  payload: TestFixtureAction,
  credentials: { username: string; password: string },
): Promise<{ data?: TestFixtureResponse; error?: string }> => {
  const basic = btoa(`${credentials.username}:${credentials.password}`);
  const { data, error } = await callSupabaseFunction<TestFixtureResponse>(
    'admin-test-fixture',
    {
      method: 'POST',
      headers: { 'X-Admin-Authorization': `Basic ${basic}` },
      body: JSON.stringify(payload),
    },
  );
  if (error) return { error };
  return { data: data ?? undefined };
};

export const cancelSubscription = async (
  token: string,
): Promise<{ success?: boolean; message?: string; error?: string }> => {
  const { data, error } = await callSupabaseFunction<{
    success: boolean;
    message: string;
  }>('subscription-management', {
    method: 'POST',
    body: JSON.stringify({ action: 'cancel' }),
    params: { token },
  });

  if (error) {
    return { error };
  }

  return {
    success: data?.success ?? false,
    message: data?.message,
  };
};

