import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import UserModel from "../models/User.js";
import PredictionModel from "../models/Prediction.js";
import FieldModel, { MAX_FIELDS } from "../models/Field.js";
import AlertFeedback from "../models/AlertFeedback.js";
import PushSubscription from "../models/PushSubscription.js";
import { GUEST_ID, UUID } from "../middleware/guestDevice.js";
import { wipeOwner } from "./predictController.js";
import { logError } from "../utils/logger.js";

// Accounts (docs/AUTH.md): name + email + password, a 7-day token. Sign-in is optional; a guest keeps working with the browser's device id.

const MIN_PASSWORD = 8;
const MAX_PASSWORD_BYTES = 72;   // bcrypt reads no more than this
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
// compared against when the email is unknown, so that a wrong email and a wrong password take the same time
const DUMMY_HASH = bcrypt.hashSync('not-a-real-password', 10);

// Anything that is not a string is refused before it reaches the database: {"email": {"$ne": null}} must never become a query operator
const text = (v) => (typeof v === 'string' ? v.trim() : '');

const passwordProblem = (p) => {
    if (typeof p !== 'string' || p.length < MIN_PASSWORD) return `Password must be at least ${MIN_PASSWORD} characters`;
    if (Buffer.byteLength(p) > MAX_PASSWORD_BYTES) return `Password is too long (${MAX_PASSWORD_BYTES} bytes at most)`;
    return null;
};

// A token lasts 30 days and is renewed when the app is opened with less than half of that left (GET /api/auth/me), so a farmer who uses the
// app now and then stays signed in. There is no password reset yet, so being signed out by the calendar must be rare.
const LIFETIME_DAYS = 30;
const token = (user) => jwt.sign({ id: String(user._id), email: user.email }, process.env.JWT_SECRET, { algorithm: 'HS256', expiresIn: `${LIFETIME_DAYS}d` });
const session = (user) => ({ token: token(user), user: { id: String(user._id), name: user.name, email: user.email } });

// @route  POST /api/auth/register  { name, email, password }
const register = async (req, res) => {
    try {
        const name = text(req.body?.name);
        const email = text(req.body?.email).toLowerCase();
        const { password } = req.body ?? {};
        if (!name || name.length > 60) return res.status(400).json({ message: 'Please enter your name (60 characters at most)' });
        if (!EMAIL.test(email) || email.length > 254) return res.status(400).json({ message: 'Please enter a valid email address' });
        const problem = passwordProblem(password);
        if (problem) return res.status(400).json({ message: problem });

        const passwordHash = await bcrypt.hash(password, 10);
        let user;
        try {
            user = await UserModel.create({ name, email, passwordHash });
        } catch (error) {
            if (error.code === 11000) return res.status(409).json({ message: 'An account with this email already exists. Please sign in.' });
            throw error;
        }
        res.status(201).json(session(user));
    } catch (error) {
        logError(req, 'Auth failed', error);
        res.status(500).json({ message: 'Server error' });  // details stay in the server log
    }
};

// @route  POST /api/auth/login  { email, password }
const login = async (req, res) => {
    try {
        const email = text(req.body?.email).toLowerCase();
        const { password } = req.body ?? {};
        if (!email || typeof password !== 'string' || !password) return res.status(400).json({ message: 'Please provide email and password' });

        const user = email.length <= 254 ? await UserModel.findOne({ email }) : null;
        const isMatch = await bcrypt.compare(password.slice(0, 200), user?.passwordHash ?? DUMMY_HASH);
        if (!user || !isMatch) return res.status(401).json({ message: 'Invalid email or password' });

        res.status(200).json(session(user));
    } catch (error) {
        logError(req, 'Auth failed', error);
        res.status(500).json({ message: 'Server error' });
    }
};

// @route  GET /api/auth/me -> the signed-in user (the token was already checked, and the account still exists), with a fresh `token` when the old one is half used
const me = async (req, res) => {
    try {
        const user = await UserModel.findById(req.user.id).lean();
        if (!user) return res.status(401).json({ message: 'Your session has ended. Please sign in again.', code: 'invalid_token' });
        const renew = req.user.exp - Date.now() / 1000 < (LIFETIME_DAYS / 2) * 86400;
        res.json({ id: String(user._id), name: user.name, email: user.email, createdAt: user.createdAt, ...(renew && { token: token(user) }) });
    } catch (error) {
        logError(req, 'Auth failed', error);
        res.status(500).json({ message: 'Server error' });
    }
};

// @route  DELETE /api/auth/me  { password } -> deletes the account and everything of it (checkups with photos, fields, answers).
// The password is asked again: a token left on a borrowed phone must not be enough to erase an account.
const deleteAccount = async (req, res) => {
    try {
        const { password } = req.body ?? {};
        const user = await UserModel.findById(req.user.id);
        if (!user) return res.status(401).json({ message: 'Your session has ended. Please sign in again.', code: 'invalid_token' });
        if (typeof password !== 'string' || !(await bcrypt.compare(password.slice(0, 200), user.passwordHash))) {
            return res.status(401).json({ message: 'Wrong password', code: 'wrong_password' });
        }
        const deleted = await wipeOwner({ userId: user._id }, req.id);   // first the records, so a failure leaves the account to retry with
        await UserModel.deleteOne({ _id: user._id });
        res.json({ deleted });
    } catch (error) {
        logError(req, 'Delete account failed', error);
        res.status(500).json({ message: 'Server error' });
    }
};

// The records this browser made as a guest (x-device-id), if any
const guestOwner = (req) => {
    const id = req.get('x-device-id');
    return id && UUID.test(id) ? { userId: GUEST_ID, deviceId: id.toLowerCase() } : null;
};

// @route  GET /api/auth/guest-data -> { predictions, fields }: what this browser holds as a guest, to offer adding it to the account
const guestData = async (req, res) => {
    try {
        const guest = guestOwner(req);
        if (!guest) return res.json({ predictions: 0, fields: 0 });
        const [predictions, fields] = await Promise.all([PredictionModel.countDocuments(guest), FieldModel.countDocuments(guest)]);
        res.json({ predictions, fields });
    } catch (error) {
        logError(req, 'Guest data failed', error);
        res.status(500).json({ message: 'Server error' });
    }
};

// @route  POST /api/auth/claim-guest -> moves this browser's guest checkups, fields and answers into the account.
// Only when asked for (the client asks the user first): on a shared phone, whoever signs in must not absorb another person's records.
// An account holds MAX_FIELDS fields, so only as many fields move as there is room for; the rest stay with the browser (fieldsLeft).
const claimGuest = async (req, res) => {
    try {
        const guest = guestOwner(req);
        if (!guest) return res.json({ predictions: 0, fields: 0, fieldsLeft: 0 });
        const mine = { userId: req.user.id, deviceId: null };
        const predictions = (await PredictionModel.updateMany(guest, { $set: mine })).modifiedCount;

        const room = Math.max(0, MAX_FIELDS - await FieldModel.countDocuments({ userId: req.user.id }));
        const ids = (await FieldModel.find(guest).sort({ createdAt: 1 }).limit(room).select('_id').lean()).map((f) => f._id);
        const fields = ids.length ? (await FieldModel.updateMany({ _id: { $in: ids } }, { $set: mine })).modifiedCount : 0;

        // this browser's notifications follow its fields into the account
        await PushSubscription.updateMany(guest, { $set: mine });

        // answers to "Did this help?" are unique per owner and alert: one the account already gave wins, the guest's copy is dropped
        const answers = await AlertFeedback.find(guest).select('_id').lean();
        for (const { _id } of answers) {
            try { await AlertFeedback.updateOne({ _id }, { $set: { userId: req.user.id, deviceId: `user:${req.user.id}` } }); }
            catch (error) { if (error.code !== 11000) throw error; await AlertFeedback.deleteOne({ _id }); }
        }
        res.json({ predictions, fields, fieldsLeft: await FieldModel.countDocuments(guest) });
    } catch (error) {
        logError(req, 'Claim guest failed', error);
        res.status(500).json({ message: 'Server error' });
    }
};

export { register, login, me, deleteAccount, guestData, claimGuest };
