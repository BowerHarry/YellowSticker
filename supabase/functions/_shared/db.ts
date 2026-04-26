import { createClient } from 'jsr:@supabase/supabase-js@2';

const url = Deno.env.get('SUPABASE_URL');
/**
 * Elevated key for `createClient` (sb_secret_… or legacy service_role JWT).
 * Custom secrets cannot be named `SUPABASE_*` on hosted Supabase — use BACKEND_API_SECRET_KEY
 * (or optional SERVICE_ROLE_KEY). SUPABASE_SERVICE_ROLE_KEY may still be auto-injected by the platform.
 */
const secretKey =
  Deno.env.get('BACKEND_API_SECRET_KEY') ??
  Deno.env.get('SERVICE_ROLE_KEY') ??
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

if (!url || !secretKey) {
  throw new Error(
    'Supabase service credentials are missing: set SUPABASE_URL and BACKEND_API_SECRET_KEY (sb_secret_… or legacy JWT), or SERVICE_ROLE_KEY, or rely on platform SUPABASE_SERVICE_ROLE_KEY.',
  );
}

export const adminClient = createClient(url, secretKey, {
  auth: { persistSession: false },
});

