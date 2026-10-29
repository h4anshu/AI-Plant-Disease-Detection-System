import rateLimit, { ipKeyGenerator } from 'express-rate-limit';

// ponytail: in-memory counters, so each Cloud Run instance counts on its own (max-instances 3 => at
// most 3x the limit). Move to a shared store (Redis) if that ever matters.
// `byDevice`: count each browser (its x-device-id, a UUID) on its own instead of each IP address. On a mobile network hundreds of farmers can
// share one address, and one of them reading the alerts must not lock out the others. A made-up id only buys an attacker a fresh count for
// calls that are cheap and cached, so only those limiters use it; the ones that cost an ML call, an upload or an Earth Engine run stay per IP,
// and the global limiter (per IP, GLOBAL_RATE_LIMIT) is still the backstop for everything.
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const deviceKey = (req) => { const id = req.get('x-device-id'); return id && UUID.test(id) ? `device:${id.toLowerCase()}` : ipKeyGenerator(req.ip); };
const limiter = (limit, windowMinutes, message, { byDevice = false, ...more } = {}) => rateLimit({
  windowMs: windowMinutes * 60 * 1000,
  limit,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { message },
  ...(byDevice && { keyGenerator: deviceKey }),
  ...more,
});

// Password guessing: only the FAILED sign-ins count, per IP (a farmer who signs in correctly is never blocked by this). bcrypt makes each
// guess cost the attacker too. Behind mobile-network NAT many people share an IP, hence the generous default.
export const loginLimiter = limiter(Number(process.env.LOGIN_RATE_LIMIT) || 20, 15,
  'Too many failed sign-in attempts. Please wait a few minutes and try again.', { skipSuccessfulRequests: true });

// Each new account costs a bcrypt hash and a database row
export const registerLimiter = limiter(Number(process.env.REGISTER_RATE_LIMIT) || 10, 60,
  'Too many accounts created from this network. Please try again later.');

// Deleting an account asks for the password again, so it is guessable like a sign-in is
export const accountLimiter = limiter(Number(process.env.ACCOUNT_RATE_LIMIT) || 20, 15,
  'Too many requests. Please wait a few minutes and try again.', { skipSuccessfulRequests: true });

// Every prediction costs an ML call, a Cloudinary upload and a MongoDB write
export const predictLimiter = limiter(Number(process.env.PREDICT_RATE_LIMIT) || 20, 10,
  'Too many predictions from this device. Please wait a few minutes and try again.');

// Every uncached field-health view is an Earth Engine computation (monthly quota: docs/GEE_SETUP.md)
export const fieldLimiter = limiter(Number(process.env.FIELD_RATE_LIMIT) || 10, 10,
  'Too many satellite checks from this device. Please wait a few minutes.');

// a radar flood-extent check is an Earth Engine computation too (about 1.3 EECU-seconds, docs/FIELD_ALERTS.md section 8)
export const extentLimiter = limiter(Number(process.env.FLOOD_EXTENT_RATE_LIMIT) || 10, 10,
  'Too many satellite checks from this device. Please wait a few minutes.');

// the context card is loaded once per located result (weather + one geo-service call when not yet built)
export const contextLimiter = limiter(Number(process.env.CONTEXT_RATE_LIMIT) || 30, 10,
  'Too many context checks from this device. Please wait a few minutes.');

// weather-based risk: cheap (Open-Meteo, cached per hour) but keep one browser from walking the map
export const riskLimiter = limiter(Number(process.env.RISK_RATE_LIMIT) || 60, 10,
  'Too many risk checks from this device. Please wait a few minutes.');

// saved fields and their alerts: the alerts call may ask Open-Meteo for each field's grid cell (cached per hour)
export const alertLimiter = limiter(Number(process.env.ALERT_RATE_LIMIT) || 60, 10,
  'Too many alert checks from this device. Please wait a few minutes.', { byDevice: true });

// push subscriptions: the app syncs one on each visit, so this is generous; a test notification is a real send to the phone
export const pushLimiter = limiter(Number(process.env.PUSH_RATE_LIMIT) || 60, 10,
  'Too many notification requests from this device. Please wait a few minutes.', { byDevice: true });
export const pushTestLimiter = limiter(Number(process.env.PUSH_TEST_RATE_LIMIT) || 5, 10,
  'Too many test notifications. Please wait a few minutes.', { byDevice: true });

// a report fetches the photo, heatmap, map tiles and weather, and draws a PDF
export const reportLimiter = limiter(Number(process.env.REPORT_RATE_LIMIT) || 20, 10,
  'Too many reports from this device. Please wait a few minutes.');

export const globalLimiter = limiter(Number(process.env.GLOBAL_RATE_LIMIT) || 300, 15,
  'Too many requests. Please try again later.');
