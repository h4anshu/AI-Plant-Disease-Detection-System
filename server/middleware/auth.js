import jwt from 'jsonwebtoken';
import mongoose from 'mongoose';
import UserModel from '../models/User.js';
import { GUEST_ID } from './guestDevice.js';

// Sign-in is optional (docs/AUTH.md). No token = a guest, whose records are scoped by the browser's device id
// (middleware/guestDevice.js). A token that is bad, expired, or belongs to a deleted account is a 401, never a silent guest: the
// client then signs out and says so, instead of showing an empty log that looks like lost data.
const authMiddleware = async (req, res, next) => {
  const header = req.headers.authorization;
  if (!header) {
    req.user = { id: GUEST_ID };
    return next();
  }
  let claims;
  try {
    claims = jwt.verify(header.replace(/^Bearer\s+/i, ''), process.env.JWT_SECRET, { algorithms: ['HS256'] });
  } catch {
    return res.status(401).json({ message: 'Your session has ended. Please sign in again.', code: 'invalid_token' });
  }
  // a deleted account's token must stop working at once (not after its 7 days); one indexed read
  if (!mongoose.isValidObjectId(claims.id) || !(await UserModel.exists({ _id: claims.id }))) {
    return res.status(401).json({ message: 'Your session has ended. Please sign in again.', code: 'invalid_token' });
  }
  req.user = { id: String(claims.id), email: claims.email };
  next();
};

// for the routes that only make sense for an account (profile, delete account, claim guest records)
export const requireUser = (req, res, next) =>
  req.user?.id && req.user.id !== GUEST_ID ? next() : res.status(401).json({ message: 'Please sign in.', code: 'sign_in_required' });

export default authMiddleware;
