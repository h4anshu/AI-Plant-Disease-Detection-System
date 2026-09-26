import { randomUUID } from 'node:crypto';
import pino from 'pino';

// One JSON object per line on stdout. Cloud Logging reads `severity`, `message` and `time`, and Cloud
// Error Reporting groups entries that carry a `stack_trace` (docs/MONITORING.md).
// Never log images, image URLs, IP addresses, tokens or device ids.
const logger = pino({
  level: process.env.LOG_LEVEL || (process.env.NODE_ENV === 'test' ? 'silent' : 'info'),
  messageKey: 'message',
  base: undefined, // no pid / hostname
  timestamp: pino.stdTimeFunctions.isoTime,
  formatters: { level: (label) => ({ severity: label.toUpperCase() }) },
});

const REQUEST_ID = /^[\w-]{1,64}$/;

// Reuses the browser's x-request-id (client/src/services/api.js) so one id follows a request through
// client -> server -> ML service; logs method, path, status and latency when the response is sent.
export const requestLogger = (req, res, next) => {
  const incoming = req.get('x-request-id');
  req.id = incoming && REQUEST_ID.test(incoming) ? incoming : randomUUID();
  res.set('x-request-id', req.id);
  const start = performance.now();
  res.on('finish', () => {
    const entry = { requestId: req.id, method: req.method, path: req.originalUrl.split('?')[0],
      status: res.statusCode, latencyMs: Math.round(performance.now() - start) };
    if (res.statusCode >= 500) logger.error(entry, 'request');
    else logger.info(entry, 'request');
  });
  next();
};

// For caught exceptions that are our bug: the stack lets Error Reporting group them
export const logError = (req, what, err) =>
  logger.error({ requestId: req?.id, error: err.message, stack_trace: err.stack }, what);

export default logger;
