// A visitor who has not signed in is the shared guest user (middleware/auth.js). Without this, the
// history endpoint would show every guest's photos to everyone. Each browser sends a random UUID it
// keeps in localStorage (client/src/services/api.js), and guest records are scoped to it. A signed-in
// user is scoped by their account instead (ownerFilter), and can move this browser's records into it
// (POST /api/auth/claim-guest).
export const GUEST_ID = '000000000000000000000000'; // the guest placeholder; no account can have this id
export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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
