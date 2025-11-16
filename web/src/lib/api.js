import { callSupabaseFunction, supabase } from './supabaseClient';
// Get active productions (currently within their date range)
export const getProductions = async () => {
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
    return data;
};
// Get coming soon productions (start_date in the future)
export const getComingSoonProductions = async () => {
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
    return data;
};
export const getProductionBySlug = async (slug) => {
    if (!supabase) {
        console.warn('Supabase client not available');
        return null;
    }
    const { data, error } = await supabase.from('productions').select('*').eq('slug', slug).single();
    if (error || !data) {
        console.error('Failed to load production', error);
        return null;
    }
    return data;
};
export const createCheckoutSession = async (payload) => {
    const { data, error } = await callSupabaseFunction('create-checkout-session', {
        method: 'POST',
        body: JSON.stringify(payload),
    });
    if (error) {
        return { error };
    }
    return { checkoutUrl: data?.checkoutUrl };
};
export const getMonitorStatus = async () => {
    const { data, error } = await callSupabaseFunction('status-dashboard');
    if (error) {
        console.error('Failed to fetch monitor status', error);
        return null;
    }
    return data ?? null;
};
export const triggerScrape = async () => {
    const { data, error } = await callSupabaseFunction('trigger-scrape', {
        method: 'POST',
    });
    if (error) {
        return { error };
    }
    return { success: data?.success ?? false };
};
export const adminAuth = async (username, password) => {
    const { data, error } = await callSupabaseFunction('admin-auth', {
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
export const getSubscriptionByToken = async (token) => {
    const { data, error } = await callSupabaseFunction('subscription-management', {
        method: 'GET',
        params: { token },
    });
    if (error) {
        throw new Error(error);
    }
    return data?.subscription || null;
};
export const cancelSubscription = async (token) => {
    const { data, error } = await callSupabaseFunction('subscription-management', {
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
