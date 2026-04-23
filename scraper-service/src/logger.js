const format = (level, scope, message, extra) => {
  const time = new Date().toISOString();
  const base = `${time} ${level.padEnd(5)} [${scope}] ${message}`;
  if (extra === undefined) return base;
  try {
    return `${base} ${typeof extra === 'string' ? extra : JSON.stringify(extra)}`;
  } catch {
    return `${base} [unserialisable]`;
  }
};

export const createLogger = (scope) => ({
  info: (msg, extra) => console.log(format('INFO', scope, msg, extra)),
  warn: (msg, extra) => console.warn(format('WARN', scope, msg, extra)),
  error: (msg, extra) => console.error(format('ERROR', scope, msg, extra)),
  debug: (msg, extra) => {
    if (process.env.LOG_LEVEL === 'debug') {
      console.log(format('DEBUG', scope, msg, extra));
    }
  },
});
