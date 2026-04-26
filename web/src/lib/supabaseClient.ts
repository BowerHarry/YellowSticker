import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_PUBLIC_SUPABASE_URL;
/** Prefer `sb_publishable_...`; legacy `anon` JWT still works until you disable it in the dashboard. */
const supabasePublishableKey =
  import.meta.env.VITE_PUBLIC_SUPABASE_PUBLISHABLE_KEY || import.meta.env.VITE_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabasePublishableKey) {
  console.warn(
    'Supabase credentials are missing. Set VITE_PUBLIC_SUPABASE_URL and VITE_PUBLIC_SUPABASE_PUBLISHABLE_KEY (or legacy VITE_PUBLIC_SUPABASE_ANON_KEY).',
  );
}

export const supabase =
  supabaseUrl && supabasePublishableKey ? createClient(supabaseUrl, supabasePublishableKey) : null;

/**
 * Get the public URL for a file in Supabase Storage
 * @param bucketName - The storage bucket name (e.g., 'production-posters')
 * @param filePath - The path to the file within the bucket (e.g., 'hamilton-poster.jpg')
 * @returns The full public URL to the file, or null if Supabase is not configured
 */
export const getStorageUrl = (bucketName: string, filePath: string): string | null => {
  if (!supabaseUrl) return null;
  // Remove leading slash from filePath if present
  const cleanPath = filePath.startsWith('/') ? filePath.slice(1) : filePath;
  return `${supabaseUrl}/storage/v1/object/public/${bucketName}/${cleanPath}`;
};

const functionsBase =
  import.meta.env.VITE_PUBLIC_SUPABASE_FUNCTIONS_URL ||
  (supabaseUrl ? `${supabaseUrl}/functions/v1` : undefined);

export const callSupabaseFunction = async <T>(
  endpoint: string,
  init?: RequestInit & { params?: Record<string, string> },
): Promise<{ data?: T; error?: string }> => {
  if (!functionsBase) {
    return { error: 'Supabase functions URL is not configured.' };
  }

  // Caller-provided headers win, so callers can override the default publishable
  // key (e.g. basic-auth for admin-only functions).
  const incomingHeaders = (init?.headers as Record<string, string> | undefined) ?? {};
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(supabasePublishableKey
      ? {
          apikey: supabasePublishableKey,
          Authorization: `Bearer ${supabasePublishableKey}`,
        }
      : {}),
    ...incomingHeaders,
  };

  // Build URL with query parameters
  let url = `${functionsBase}/${endpoint}`;
  if (init?.params) {
    const searchParams = new URLSearchParams(init.params);
    url += `?${searchParams.toString()}`;
  }

  const response = await fetch(url, {
    ...init,
    headers,
  });

  if (!response.ok) {
    let errorMessage = 'Unexpected error from Supabase function.';
    try {
      const errorData = await response.json();
      errorMessage = errorData.error || errorData.message || errorMessage;
    } catch {
      // If JSON parsing fails, try to get text
      try {
        errorMessage = await response.text() || errorMessage;
      } catch {
        // If that also fails, use default message
      }
    }
    return { error: errorMessage };
  }

  const data = (await response.json()) as T;
  return { data };
};

