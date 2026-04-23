import 'dotenv/config';

// Values from env.example that must be replaced before the worker will start.
// Prevents a silent run with DNS failures / auth errors when .env is still
// full of template values.
const PLACEHOLDERS = new Set([
  'https://your-project.supabase.co',
  'supabase-anon-key',
  'supabase-service-role-key',
  'eyJ...',
  're_...',
  'you@example.com',
  'your-db-password',
]);

const required = (name) => {
  const value = process.env[name];
  if (!value || value.trim() === '') {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  const trimmed = value.trim();
  if (PLACEHOLDERS.has(trimmed)) {
    throw new Error(
      `Environment variable ${name} is still set to the placeholder value "${trimmed}". Edit your .env file with real credentials.`,
    );
  }
  return trimmed;
};

const optional = (name, fallback) => {
  const value = process.env[name];
  return value && value.trim() !== '' ? value.trim() : fallback;
};

const bool = (name, fallback) => {
  const value = process.env[name];
  if (value === undefined) return fallback;
  return /^(1|true|yes|on)$/i.test(value.trim());
};

const int = (name, fallback) => {
  const value = process.env[name];
  if (value === undefined || value.trim() === '') return fallback;
  const n = Number.parseInt(value, 10);
  return Number.isFinite(n) ? n : fallback;
};

export const config = {
  supabase: {
    url: required('SUPABASE_URL'),
    serviceRoleKey: required('SUPABASE_SERVICE_ROLE_KEY'),
  },
  resend: {
    apiKey: required('RESEND_API_KEY'),
    fromEmail: optional('RESEND_FROM_EMAIL', 'onboarding@resend.dev'),
  },
  alertEmail: required('ALERT_EMAIL'),
  scrape: {
    // How long Puppeteer waits for JavaScript to run on each page load.
    waitMs: int('SCRAPE_WAIT_MS', 15000),
    // Base delay (in seconds) between productions; jittered ±20%.
    interProductionDelaySeconds: int('SCRAPE_INTER_PRODUCTION_DELAY_SEC', 30),
    // Cron schedule in the container's TZ. Default: every 15 min between 08:00-17:59.
    cronSchedule: optional('SCRAPE_CRON', '*/15 8-17 * * *'),
    // Timezone used for the cron schedule AND for "today" date comparisons.
    timezone: optional('TZ', 'Europe/London'),
    // If true, never send emails; still updates DB.
    dryRun: bool('DRY_RUN', false),
    // Run a single scrape immediately on boot (in addition to the cron schedule).
    runOnBoot: bool('RUN_ON_BOOT', true),
  },
  server: {
    healthPort: int('HEALTH_PORT', 3000),
  },
};
