// admin-create-production: operator utility to upsert a `productions` row
// and optionally upload a poster image into the `production-posters`
// bucket. Auth: X-Admin-Authorization basic-auth (same as other admin
// endpoints).
import { adminClient } from '../_shared/db.ts';

const POSTER_BUCKET = 'production-posters';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, x-admin-authorization',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const jsonResponse = (body: unknown, init: ResponseInit = {}) =>
  new Response(JSON.stringify(body), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    ...init,
  });

const verifyBasicAuth = (req: Request): boolean => {
  const adminUsername = Deno.env.get('ADMIN_USERNAME');
  const adminPassword = Deno.env.get('ADMIN_PASSWORD');
  if (!adminUsername || !adminPassword) return false;
  const header = req.headers.get('x-admin-authorization') ?? '';
  if (!header.startsWith('Basic ')) return false;
  try {
    const decoded = atob(header.slice('Basic '.length));
    const [u, ...rest] = decoded.split(':');
    return u === adminUsername && rest.join(':') === adminPassword;
  } catch {
    return false;
  }
};

const normalizeSlug = (raw: string): string =>
  raw
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '');

const isHttpUrl = (value: string): boolean => {
  try {
    const u = new URL(value);
    return u.protocol === 'https:' || u.protocol === 'http:';
  } catch {
    return false;
  }
};

// Pull a Delfont series code from a full series URL, e.g.
//   https://buytickets.delfontmackintosh.co.uk/tickets/series/GIEOLI/
const seriesCodeFromScrapingUrl = (url: string): string | null => {
  const m = url.match(/\/tickets\/series\/([^/?#]+)\/?/i);
  return m ? decodeURIComponent(m[1]).trim() : null;
};

type Body = {
  slug: string;
  name: string;
  theatre: string;
  city?: string | null;
  scrapingUrl: string;
  seriesCode?: string | null;
  adapter?: 'delfont' | 'none';
  scrapeDisabled?: boolean;
  scrapeDisabledReason?: string | null;
  description?: string | null;
  startDate: string;
  endDate?: string | null;
  posterBase64?: string | null;
  posterContentType?: string | null;
  posterFileName?: string | null;
};

const MAX_POSTER_BYTES = 2_500_000; // ~2.5 MB

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }
  if (req.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, { status: 405 });
  }
  if (!verifyBasicAuth(req)) {
    return jsonResponse({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return jsonResponse({ error: 'Invalid JSON' }, { status: 400 });
  }

  const slug = normalizeSlug(body.slug ?? '');
  if (!slug || slug.startsWith('test-')) {
    return jsonResponse(
      { error: 'Invalid slug. Use lowercase letters, numbers, hyphens. Reserved prefix: test-' },
      { status: 400 },
    );
  }
  const name = body.name?.trim();
  const theatre = body.theatre?.trim();
  const scrapingUrl = body.scrapingUrl?.trim();
  if (!name || !theatre || !scrapingUrl || !isHttpUrl(scrapingUrl)) {
    return jsonResponse({ error: 'name, theatre, and a valid scrapingUrl are required' }, { status: 400 });
  }

  const adapter = body.adapter === 'none' ? 'none' : 'delfont';
  const seriesFromUrl = seriesCodeFromScrapingUrl(scrapingUrl);
  const seriesCode = (body.seriesCode?.trim() || seriesFromUrl || '').trim();
  if (adapter === 'delfont' && !seriesCode) {
    return jsonResponse(
      {
        error:
          'seriesCode is required for adapter=delfont (or use a scrapingUrl that contains /tickets/series/<CODE>/)',
      },
      { status: 400 },
    );
  }

  if (!body.startDate) {
    return jsonResponse({ error: 'startDate is required (ISO-8601)' }, { status: 400 });
  }
  const startDate = new Date(body.startDate);
  if (Number.isNaN(startDate.getTime())) {
    return jsonResponse({ error: 'startDate is not a valid date' }, { status: 400 });
  }
  let endDate: Date | null = null;
  if (body.endDate) {
    endDate = new Date(body.endDate);
    if (Number.isNaN(endDate.getTime())) {
      return jsonResponse({ error: 'endDate is not a valid date' }, { status: 400 });
    }
  }
  if (endDate && endDate < startDate) {
    return jsonResponse({ error: 'endDate must be on or after startDate' }, { status: 400 });
  }

  const scrapeDisabled = !!body.scrapeDisabled;
  const scrapeDisabledReason = scrapeDisabled
    ? (body.scrapeDisabledReason?.trim() || 'operator_disabled')
    : null;

  let posterPath: string | null = null;
  if (body.posterBase64) {
    const raw = body.posterBase64.includes(',')
      ? body.posterBase64.split(',', 2)[1]!
      : body.posterBase64;
    let bytes: Uint8Array;
    try {
      const binary = atob(raw);
      bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    } catch {
      return jsonResponse({ error: 'posterBase64 is not valid base64' }, { status: 400 });
    }
    if (bytes.byteLength > MAX_POSTER_BYTES) {
      return jsonResponse({ error: `Poster too large (max ${MAX_POSTER_BYTES} bytes)` }, { status: 400 });
    }

    const extFromName = (() => {
      const n = body.posterFileName?.toLowerCase() ?? '';
      if (n.endsWith('.png')) return 'png';
      if (n.endsWith('.webp')) return 'webp';
      if (n.endsWith('.jpg') || n.endsWith('.jpeg')) return 'jpg';
      return null;
    })();
    const ct = (body.posterContentType ?? '').toLowerCase();
    const extFromCt = ct.includes('png')
      ? 'png'
      : ct.includes('webp')
        ? 'webp'
        : ct.includes('jpeg') || ct.includes('jpg')
          ? 'jpg'
          : null;
    const ext = extFromName ?? extFromCt ?? 'jpg';
    posterPath = `${slug}-poster.${ext}`;

    const { error: uploadError } = await adminClient.storage.from(POSTER_BUCKET).upload(posterPath, bytes, {
      contentType: body.posterContentType ?? `image/${ext === 'jpg' ? 'jpeg' : ext}`,
      upsert: true,
    });
    if (uploadError) {
      console.error('Poster upload failed', uploadError);
      return jsonResponse(
        { error: `Poster upload failed: ${uploadError.message}. Is bucket "${POSTER_BUCKET}" created?` },
        { status: 500 },
      );
    }
  }

  const row = {
    slug,
    name,
    theatre,
    city: body.city?.trim() || null,
    scraping_url: scrapingUrl,
    series_code: adapter === 'delfont' ? seriesCode : null,
    adapter,
    scrape_disabled_reason: scrapeDisabledReason,
    description: body.description?.trim() || null,
    poster_url: posterPath,
    start_date: startDate.toISOString(),
    end_date: endDate ? endDate.toISOString() : null,
    // Fresh row semantics — let the extension / report-scrape repopulate.
    last_seen_status: 'unknown',
    last_checked_at: null,
    last_standing_tickets_found_at: null,
    last_availability_transition_at: null,
  };

  const { data, error } = await adminClient
    .from('productions')
    .upsert(row, { onConflict: 'slug' })
    .select('id,slug,name,poster_url,adapter,series_code,start_date,end_date,scrape_disabled_reason')
    .single();

  if (error) {
    console.error('admin-create-production upsert failed', error);
    return jsonResponse({ error: error.message }, { status: 500 });
  }

  return jsonResponse({ ok: true, production: data });
});
