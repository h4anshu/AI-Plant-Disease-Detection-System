import { timingSafeEqual } from "node:crypto";

// The operator's shared secret (ALERTS_ADMIN_TOKEN) in the x-alerts-token header: guards the operator routes (docs/ADMIN.md, docs/MONITORING.md).
// Without the setting they answer 503; a wrong token is a 401 (and counts against the IP's failed-attempt limit, middleware/rateLimit.js).
const adminGuard = (req, res, next) => {
  const token = process.env.ALERTS_ADMIN_TOKEN;
  if (!token) return res.status(503).json({ message: 'Alerts admin is not configured' });
  const got = Buffer.from(req.get('x-alerts-token') ?? '');
  const want = Buffer.from(token);
  if (got.length !== want.length || !timingSafeEqual(got, want)) return res.status(401).json({ message: 'Unauthorized' });
  next();
};

export default adminGuard;
