const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const jsonResponse = (data: unknown, init?: ResponseInit) =>
  new Response(JSON.stringify(data), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    ...init,
  });

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, { status: 405 });
  }

  try {
    const { username, password } = await req.json();

    if (!username || !password) {
      return jsonResponse({ error: 'Username and password required' }, { status: 400 });
    }

    // Get admin credentials from Supabase secrets
    const adminUsername = Deno.env.get('ADMIN_USERNAME');
    const adminPassword = Deno.env.get('ADMIN_PASSWORD');

    if (!adminUsername || !adminPassword) {
      console.error('Admin credentials not configured in Supabase secrets');
      return jsonResponse({ error: 'Admin authentication not configured' }, { status: 500 });
    }

    // Verify credentials
    if (username === adminUsername && password === adminPassword) {
      // Generate a simple session token (in production, use JWT)
      const sessionToken = crypto.randomUUID();
      const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

      return jsonResponse({
        success: true,
        token: sessionToken,
        expiresAt: expiresAt.toISOString(),
      });
    }

    return jsonResponse({ error: 'Invalid credentials' }, { status: 401 });
  } catch (error) {
    console.error('Admin auth error:', error);
    return jsonResponse({ error: 'Internal server error' }, { status: 500 });
  }
});

