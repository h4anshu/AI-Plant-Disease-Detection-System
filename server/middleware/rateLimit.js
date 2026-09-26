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

export const globalLimiter = limiter(Number(process.env.GLOBAL_RATE_LIMIT) || 300, 15,
  'Too many requests. Please try again later.');
