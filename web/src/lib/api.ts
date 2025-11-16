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
  const { data, error } = await supabase
    .from('productions')
    .select('*')
    .lte('start_date', now) // start_date <= now
    .or(`end_date.is.null,end_date.gte.${now}`) // end_date is null OR end_date >= now
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

export const getMonitorStatus = async (): Promise<MonitorStatusResponse | null> => {
  const { data, error } = await callSupabaseFunction<MonitorStatusResponse>('status-dashboard');
  if (error) {
    console.error('Failed to fetch monitor status', error);
    return null;
  }
  return data ?? null;
};

export const triggerScrape = async (): Promise<{ success?: boolean; error?: string }> => {
  const { data, error } = await callSupabaseFunction<{ success: boolean; message: string }>(
    'trigger-scrape',
    {
      method: 'POST',
    },
  );

  if (error) {
    return { error };
  }

  return { success: data?.success ?? false };
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

