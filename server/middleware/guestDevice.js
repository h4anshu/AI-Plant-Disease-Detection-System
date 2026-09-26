// Login is disabled, so every visitor is the same guest user (middleware/auth.js). Without this, the
// history endpoint would show every guest's photos to everyone. Each browser sends a random UUID it
// keeps in localStorage (client/src/services/api.js), and guest records are scoped to it.
// TODO(auth): when login returns, drop this and scope history by the real user id only.
export const GUEST_ID = '000000000000000000000000'; // same placeholder as middleware/auth.js
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const guestDevice = (req, res, next) => {
  req.deviceId = null;
  if (req.user?.id !== GUEST_ID) return next();
  const id = req.get('x-device-id');
  if (id === undefined) return next(); // no id: guest can predict, but has no history
  if (!UUID.test(id)) return res.status(400).json({ message: 'Invalid device id' });
  req.deviceId = id.toLowerCase();
  next();
};

export default guestDevice;
