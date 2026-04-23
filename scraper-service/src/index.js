import http from 'node:http';
import cron from 'node-cron';
import { config } from './config.js';
import { runScrape } from './scrape.js';
import { createLogger } from './logger.js';

const log = createLogger('main');

let lastRunAt = null;
let lastRunSummary = null;
let lastRunError = null;
let running = false;

const runSafely = async (trigger) => {
  if (running) {
    log.warn(`Skipping ${trigger} run — another run is already in progress`);
    return;
  }
  running = true;
  const startedAt = new Date();
  log.info(`Starting scrape (trigger=${trigger})`);
  try {
    const summary = await runScrape();
    lastRunAt = new Date().toISOString();
    lastRunSummary = summary;
    lastRunError = null;
    const elapsed = Date.now() - startedAt.getTime();
    log.info(`Scrape finished in ${(elapsed / 1000).toFixed(1)}s`, summary);
  } catch (error) {
    lastRunAt = new Date().toISOString();
    lastRunError = error.message || String(error);
    log.error('Scrape run threw', lastRunError);
  } finally {
    running = false;
  }
};

const startHealthServer = () => {
  const server = http.createServer((req, res) => {
    if (req.url === '/health') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          status: 'ok',
          running,
          lastRunAt,
          lastRunSummary,
          lastRunError,
        }),
      );
      return;
    }
    res.writeHead(404);
    res.end();
  });
  server.listen(config.server.healthPort, '0.0.0.0', () => {
    log.info(`Health server listening on :${config.server.healthPort}`);
  });
  return server;
};

const setupShutdown = (server) => {
  const shutdown = (signal) => {
    log.info(`Received ${signal}, shutting down`);
    server?.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 5000).unref();
  };
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
};

const main = async () => {
  const args = new Set(process.argv.slice(2));
  const onceMode = args.has('--once');

  log.info('Yellow Sticker scraper starting', {
    timezone: config.scrape.timezone,
    cron: config.scrape.cronSchedule,
    dryRun: config.scrape.dryRun,
    alertEmail: config.alertEmail,
    onceMode,
  });

  if (onceMode) {
    await runSafely('cli-once');
    process.exit(lastRunError ? 1 : 0);
  }

  const server = startHealthServer();
  setupShutdown(server);

  cron.schedule(config.scrape.cronSchedule, () => runSafely('cron'), {
    timezone: config.scrape.timezone,
  });
  log.info(`Scheduled cron "${config.scrape.cronSchedule}" in ${config.scrape.timezone}`);

  if (config.scrape.runOnBoot) {
    // Fire-and-forget initial run so the container surfaces errors quickly.
    runSafely('boot').catch((error) => log.error('Boot run failed', error));
  }
};

main().catch((error) => {
  log.error('Fatal startup error', error.stack || error.message || String(error));
  process.exit(1);
});
