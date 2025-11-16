import { adminClient } from '../_shared/db.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, 405);
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    if (!supabaseUrl || !serviceRoleKey) {
      return jsonResponse({ error: 'Missing Supabase configuration' }, 500);
    }

    const functionUrl = `${supabaseUrl}/functions/v1/scrape-tickets`;

    console.log('Manually triggering scrape-tickets function...');

    const response = await fetch(functionUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${serviceRoleKey}`,
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Scrape-tickets function failed:', response.status, errorText);
      return jsonResponse(
        {
          error: 'Failed to trigger scraper',
          details: errorText,
          status: response.status,
        },
        500,
      );
    }

    const result = await response.json();
    console.log('Scrape-tickets completed:', result);

    return jsonResponse({
      success: true,
      message: 'Scraper triggered successfully',
      result,
    });
  } catch (error) {
    console.error('Error triggering scraper:', error);
    return jsonResponse(
      {
        error: 'Failed to trigger scraper',
        details: (error as Error).message,
      },
      500,
    );
  }
});

