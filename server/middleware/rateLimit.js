import rateLimit from 'express-rate-limit';

// ponytail: in-memory counters, so each Cloud Run instance counts on its own (max-instances 3 => at
// most 3x the limit). Move to a shared store (Redis) if that ever matters.
const limiter = (limit, windowMinutes, message) => rateLimit({
  windowMs: windowMinutes * 60 * 1000,
  limit,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { message },
});

// Every prediction costs an ML call, a Cloudinary upload and a MongoDB write
export const predictLimiter = limiter(Number(process.env.PREDICT_RATE_LIMIT) || 20, 10,
  'Too many predictions from this device. Please wait a few minutes and try again.');

// Every uncached field-health view is an Earth Engine computation (monthly quota: docs/GEE_SETUP.md)
export const fieldLimiter = limiter(Number(process.env.FIELD_RATE_LIMIT) || 10, 10,
  'Too many satellite checks from this device. Please wait a few minutes.');

// weather-based risk: cheap (Open-Meteo, cached per hour) but keep one browser from walking the map
export const riskLimiter = limiter(Number(process.env.RISK_RATE_LIMIT) || 60, 10,
  'Too many risk checks from this device. Please wait a few minutes.');

export const globalLimiter = limiter(Number(process.env.GLOBAL_RATE_LIMIT) || 300, 15,
  'Too many requests. Please try again later.');
