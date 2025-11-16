import { createClient } from '@supabase/supabase-js';
const supabaseUrl = import.meta.env.VITE_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_PUBLIC_SUPABASE_ANON_KEY;
if (!supabaseUrl || !supabaseAnonKey) {
    console.warn('Supabase credentials are missing. Set VITE_PUBLIC_SUPABASE_URL and VITE_PUBLIC_SUPABASE_ANON_KEY in your environment.');
}
export const supabase = supabaseUrl && supabaseAnonKey ? createClient(supabaseUrl, supabaseAnonKey) : null;
/**
 * Get the public URL for a file in Supabase Storage
 * @param bucketName - The storage bucket name (e.g., 'production-posters')
 * @param filePath - The path to the file within the bucket (e.g., 'hamilton-poster.jpg')
 * @returns The full public URL to the file, or null if Supabase is not configured
 */
export const getStorageUrl = (bucketName, filePath) => {
    if (!supabaseUrl)
        return null;
    // Remove leading slash from filePath if present
    const cleanPath = filePath.startsWith('/') ? filePath.slice(1) : filePath;
    return `${supabaseUrl}/storage/v1/object/public/${bucketName}/${cleanPath}`;
};
const functionsBase = import.meta.env.VITE_PUBLIC_SUPABASE_FUNCTIONS_URL ||
    (supabaseUrl ? `${supabaseUrl}/functions/v1` : undefined);
export const callSupabaseFunction = async (endpoint, init) => {
    if (!functionsBase) {
        return { error: 'Supabase functions URL is not configured.' };
    }
    const headers = {
        'Content-Type': 'application/json',
        ...init?.headers,
    };
    // Add Authorization header if anon key is available
    if (supabaseAnonKey) {
        headers['Authorization'] = `Bearer ${supabaseAnonKey}`;
    }
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
        }
        catch {
            // If JSON parsing fails, try to get text
            try {
                errorMessage = await response.text() || errorMessage;
            }
            catch {
                // If that also fails, use default message
            }
        }
        return { error: errorMessage };
    }
    const data = (await response.json());
    return { data };
};
