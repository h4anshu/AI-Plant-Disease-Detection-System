import { afterAll, afterEach, beforeAll, describe, expect, test } from '@jest/globals';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import jwt from 'jsonwebtoken';
import request from 'supertest';
import app from '../app.js';
import User from '../models/User.js';
import Field from '../models/Field.js';
import Prediction from '../models/Prediction.js';
import AlertFeedback from '../models/AlertFeedback.js';
import { nearbyDisease } from '../services/nearbyDisease.js';

// Accounts (docs/AUTH.md): register, sign in, the token, ownership (an account's records are its own, a guest's are its browser's),
// delete account, and moving a browser's guest records into an account.
const DEVICE = '3f2b8c1e-9d4a-4e7b-8a6c-2f1e0d9c8b7a';
const PASSWORD = 'correct horse battery';
const FIELD = { crop: 'wheat', stage: 'flowering', lat: 30.85, lon: 75.66 };
const GUEST = '000000000000000000000000';

let mongod;
beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());
  await Promise.all([User, AlertFeedback].map((m) => m.init()));
});
afterEach(async () => { await Promise.all([User, Field, Prediction, AlertFeedback].map((m) => m.deleteMany({}))); });
afterAll(async () => { await mongoose.disconnect(); await mongod.stop(); });

const signUp = (o = {}) => request(app).post('/api/auth/register').send({ name: 'Asha Devi', email: 'asha@example.com', password: PASSWORD, ...o });
const signIn = (o = {}) => request(app).post('/api/auth/login').send({ email: 'asha@example.com', password: PASSWORD, ...o });
// -> the Authorization header of a new account
const account = async (email = 'asha@example.com') => `Bearer ${(await signUp({ email })).body.token}`;
const as = (token, device) => (req) => { if (token) req.set('authorization', token); if (device) req.set('x-device-id', device); return req; };
const saveField = (token, device, o = {}) => as(token, device)(request(app).post('/api/fields')).send({ ...FIELD, ...o });
const photo = (o = {}) => ({ userId: new mongoose.Types.ObjectId(GUEST), imageUrl: 'https://img.test/a.jpg', crop: 'wheat', status: 'ok', disease: 'Yellow_Rust', confidence: 0.9,
  severity: 'moderate', treatment: 'Spray', yieldLossPercent: 10, ...o });

describe('register', () => {
  test('creates the account and returns a token that names it; the password is stored only as a bcrypt hash', async () => {
    const res = await signUp({ name: '  Asha Devi ', email: 'Asha@Example.COM' });
    expect(res.status).toBe(201);
    expect(res.body.user).toMatchObject({ name: 'Asha Devi', email: 'asha@example.com' });
    const claims = jwt.verify(res.body.token, process.env.JWT_SECRET);
    expect(claims.id).toBe(res.body.user.id);
    expect(claims.exp - claims.iat).toBe(7 * 86400);
    const stored = await User.findOne({}).lean();
    expect(stored.passwordHash).toMatch(/^\$2[aby]\$10\$/);
    expect(JSON.stringify(stored)).not.toContain(PASSWORD);
    expect(JSON.stringify(res.body)).not.toMatch(/passwordHash|\$2[aby]\$/);
  });

  test.each([
    [{ name: '' }, /name/i], [{ name: 'x'.repeat(61) }, /name/i], [{ email: 'not-an-email' }, /email/i],
    [{ password: 'short' }, /at least 8/], [{ password: 'é'.repeat(40) }, /too long/], [{ password: undefined }, /at least 8/],
  ])('refuses %j', async (bad, message) => {
    const res = await signUp(bad);
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(message);
    expect(await User.countDocuments()).toBe(0);
  });

  test('the same email twice (any letter case) is refused with 409', async () => {
    await signUp();
    const again = await signUp({ email: 'ASHA@example.com', name: 'Someone else' });
    expect(again.status).toBe(409);
    expect(await User.countDocuments()).toBe(1);
  });

  test('operators in place of strings are refused, not run as a query', async () => {
    await signUp();
    for (const body of [{ email: { $ne: null }, password: PASSWORD }, { email: 'asha@example.com', password: { $ne: null } }, { email: { $gt: '' }, password: 'x'.repeat(10) }]) {
      const res = await request(app).post('/api/auth/login').send(body);
      expect([400, 401]).toContain(res.status);
      expect(res.body.token).toBeUndefined();
    }
    expect((await signUp({ email: { $ne: null } })).status).toBe(400);
  });
});

describe('sign in', () => {
  test('the right password gives a token that works on /me', async () => {
    await signUp();
    const res = await signIn({ email: ' ASHA@example.com ' });
    expect(res.status).toBe(200);
    const me = await request(app).get('/api/auth/me').set('authorization', `Bearer ${res.body.token}`);
    expect(me.status).toBe(200);
    expect(me.body).toMatchObject({ name: 'Asha Devi', email: 'asha@example.com' });
    expect(me.body.passwordHash).toBeUndefined();
  });

  test('a wrong password and an unknown email look the same', async () => {
    await signUp();
    const wrong = await signIn({ password: 'wrong password!' });
    const unknown = await signIn({ email: 'nobody@example.com' });
    expect(wrong.status).toBe(401);
    expect(unknown.status).toBe(401);
    expect(unknown.body).toEqual(wrong.body);
  });

  test('missing fields are a 400', async () => {
    expect((await request(app).post('/api/auth/login').send({})).status).toBe(400);
    expect((await signIn({ password: '' })).status).toBe(400);
  });
});

describe('the token', () => {
  test.each([
    ['garbage', () => 'Bearer not.a.token'],
    ['signed with another secret', () => `Bearer ${jwt.sign({ id: new mongoose.Types.ObjectId().toString() }, 'another secret entirely, long enough')}`],
    ['expired', async () => { await signUp(); const u = await User.findOne({}); return `Bearer ${jwt.sign({ id: String(u._id) }, process.env.JWT_SECRET, { expiresIn: -10 })}`; }],
    ['unsigned (alg none)', () => `Bearer ${Buffer.from('{"alg":"none"}').toString('base64url')}.${Buffer.from(`{"id":"${new mongoose.Types.ObjectId()}"}`).toString('base64url')}.`],
    ['of an account that does not exist', () => `Bearer ${jwt.sign({ id: new mongoose.Types.ObjectId().toString() }, process.env.JWT_SECRET)}`],
    ['naming the guest placeholder', () => `Bearer ${jwt.sign({ id: GUEST }, process.env.JWT_SECRET)}`],
  ])('%s is a 401 on any route, never a silent guest', async (_, token) => {
    const auth = await token();
    for (const path of ['/api/auth/me', '/api/predict', '/api/fields']) {
      const res = await request(app).get(path).set('authorization', auth).set('x-device-id', DEVICE);
      expect(res.status).toBe(401);
      expect(res.body.code).toBe('invalid_token');
    }
  });

  test('the bare token (as the older client sent it) still works', async () => {
    const token = (await signUp()).body.token;
    expect((await request(app).get('/api/auth/me').set('authorization', token)).status).toBe(200);
  });

  test('no token: a guest, who cannot use the account routes', async () => {
    expect((await request(app).get('/api/auth/me')).status).toBe(401);
    expect((await request(app).get('/api/auth/me')).body.code).toBe('sign_in_required');
    expect((await request(app).get('/api/predict').set('x-device-id', DEVICE)).status).toBe(200);
  });
});

describe('every account has its own records', () => {
  test('fields: an account needs no device id, sees only its own, and cannot touch another account\'s or a guest\'s', async () => {
    const [a, b] = [await account('a@example.com'), await account('b@example.com')];
    const mine = (await saveField(a)).body;
    expect(mine._id).toBeDefined();
    const guest = (await saveField(null, DEVICE)).body;

    expect((await as(a)(request(app).get('/api/fields'))).body.map((f) => f._id)).toEqual([mine._id]);
    expect((await as(b)(request(app).get('/api/fields'))).body).toEqual([]);
    expect((await as(null, DEVICE)(request(app).get('/api/fields'))).body.map((f) => f._id)).toEqual([guest._id]);
    for (const [token, device, id] of [[b, null, mine._id], [null, DEVICE, mine._id], [a, null, guest._id], [a, DEVICE, guest._id]]) {
      expect((await as(token, device)(request(app).patch(`/api/fields/${id}`)).send({ stage: 'sowing' })).status).toBe(404);
      expect((await as(token, device)(request(app).delete(`/api/fields/${id}`))).status).toBe(404);
    }
    expect(await Field.countDocuments()).toBe(2);
  });

  test('an account\'s device id header does not widen what it sees: a guest\'s records stay out of reach', async () => {
    const a = await account();
    await Prediction.create(photo({ deviceId: DEVICE }));
    expect((await as(a, DEVICE)(request(app).get('/api/predict'))).body).toEqual([]);
    expect((await as(null, DEVICE)(request(app).get('/api/predict'))).body).toHaveLength(1);
  });

  test('checkups: history and a single checkup belong to the account only', async () => {
    const [a, b] = [await account('a@example.com'), await account('b@example.com')];
    const idA = (await User.findOne({ email: 'a@example.com' }))._id;
    const mine = await Prediction.create(photo({ userId: idA }));
    expect((await as(a)(request(app).get('/api/predict'))).body.map((p) => p._id)).toEqual([String(mine._id)]);
    expect((await as(b)(request(app).get('/api/predict'))).body).toEqual([]);
    expect((await as(a)(request(app).get(`/api/predict/${mine._id}`))).status).toBe(200);
    expect((await as(b)(request(app).get(`/api/predict/${mine._id}`))).status).toBe(404);
    expect((await as(null, DEVICE)(request(app).get(`/api/predict/${mine._id}`))).status).toBe(404);
    expect((await as(b)(request(app).patch(`/api/predict/${mine._id}/feedback`)).send({ feedback: 'correct' })).status).toBe(404);
    expect((await as(b)(request(app).get(`/api/predict/${mine._id}/report.pdf`))).status).toBe(404);
  });

  test('"Did this help?" works for an account, and two accounts answering the same alert are two rows', async () => {
    const [a, b] = [await account('a@example.com'), await account('b@example.com')];
    const body = { alertId: 'FROST-WHEAT-1|2027-02-25', level: 'warn', answer: 'acted' };
    const fa = (await saveField(a)).body._id;
    const fb = (await saveField(b)).body._id;
    expect((await as(a)(request(app).post(`/api/fields/${fa}/alerts/feedback`)).send(body)).status).toBe(200);
    expect((await as(b)(request(app).post(`/api/fields/${fb}/alerts/feedback`)).send(body)).status).toBe(200);
    expect((await as(a)(request(app).post(`/api/fields/${fa}/alerts/feedback`)).send({ ...body, answer: 'wrong' })).status).toBe(200);
    expect((await AlertFeedback.find({}).lean()).map((d) => d.answer).sort()).toEqual(['acted', 'wrong']);
  });

  test('an account holds at most 3 fields', async () => {
    const a = await account();
    for (let i = 0; i < 3; i++) expect((await saveField(a)).status).toBe(201);
    expect((await saveField(a)).status).toBe(409);
  });

  test('"Delete my data" erases the account\'s records and keeps the account', async () => {
    const a = await account();
    await saveField(a);
    await Prediction.create(photo({ userId: (await User.findOne({}))._id }));
    await Prediction.create(photo({ deviceId: DEVICE }));   // a guest's: not touched
    const res = await as(a)(request(app).delete('/api/predict'));
    expect(res.body).toEqual({ deleted: 1 });
    expect(await Field.countDocuments()).toBe(0);
    expect(await Prediction.countDocuments()).toBe(1);
    expect(await User.countDocuments()).toBe(1);
  });
});

describe('disease reports of accounts', () => {
  const field = { crop: 'wheat', stage: 'flowering', location: { coordinates: [75.66, 30.85] } };
  const report = (userId, o = {}) => photo({ userId, geoCell: '872a1070bffffff', createdAt: new Date(), ...o });
  const near = async (owner) => { /* the cell of the field, computed the way the service does */
    const { latLngToCell } = await import('h3-js');
    const { H3_RESOLUTION } = await import('../utils/geo.js');
    return latLngToCell(30.85, 75.66, H3_RESOLUTION);
  };

  test('each account counts as one reporter, and the asker\'s own account is left out', async () => {
    const cell = await near();
    const ids = [1, 2, 3].map(() => new mongoose.Types.ObjectId());
    await Prediction.insertMany(ids.flatMap((id) => [report(id, { geoCell: cell }), report(id, { geoCell: cell })]));   // 3 accounts, 2 photos each
    expect(await nearbyDisease(field, { userId: String(new mongoose.Types.ObjectId()) })).toMatchObject({ values: { value: 3 } });
    expect(await nearbyDisease(field, { userId: String(ids[0]) })).toBeNull();           // without their own, only 2 are left
    expect(await nearbyDisease(field, { userId: GUEST, deviceId: DEVICE })).toMatchObject({ values: { value: 3 } });
  });
});

describe('delete account', () => {
  test('needs the password; then erases the account and everything of it, and the token stops working', async () => {
    const token = (await signUp()).body.token;
    const auth = `Bearer ${token}`;
    const fieldId = (await saveField(auth)).body._id;
    await as(auth)(request(app).post(`/api/fields/${fieldId}/alerts/feedback`)).send({ alertId: 'FROST-WHEAT-1|2027-02-25', level: 'warn', answer: 'acted' });
    const userId = (await User.findOne({}))._id;
    await Prediction.create(photo({ userId }));
    const other = await account('other@example.com');
    await saveField(other);

    const wrong = await as(auth)(request(app).delete('/api/auth/me')).send({ password: 'not my password' });
    expect(wrong.status).toBe(401);
    expect(wrong.body.code).toBe('wrong_password');
    expect(await User.countDocuments()).toBe(2);
    expect((await as(auth)(request(app).delete('/api/auth/me')).send({})).status).toBe(401);
    expect((await as(auth)(request(app).delete('/api/auth/me')).send({ password: { $ne: 1 } })).status).toBe(401);

    const res = await as(auth)(request(app).delete('/api/auth/me')).send({ password: PASSWORD });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ deleted: 1 });
    expect(await User.findById(userId)).toBeNull();
    expect(await Prediction.countDocuments({ userId })).toBe(0);
    expect(await Field.countDocuments({ userId })).toBe(0);
    expect(await AlertFeedback.countDocuments({ userId })).toBe(0);
    expect(await Field.countDocuments()).toBe(1);                       // the other account's field is still there
    expect((await request(app).get('/api/auth/me').set('authorization', auth)).status).toBe(401);
    expect((await signIn()).status).toBe(401);
  });

  test('a guest cannot call it', async () => {
    expect((await request(app).delete('/api/auth/me').send({ password: PASSWORD })).status).toBe(401);
  });
});

describe('moving a browser\'s guest records into the account', () => {
  const guestWork = async () => {
    await saveField(null, DEVICE);
    await Prediction.create(photo({ deviceId: DEVICE }));
    await Prediction.create(photo({ deviceId: DEVICE }));
  };

  test('says what is there, moves it only on request, and the browser no longer holds it as a guest', async () => {
    await guestWork();
    const a = await account();
    expect((await as(a, DEVICE)(request(app).get('/api/auth/guest-data'))).body).toEqual({ predictions: 2, fields: 1 });
    expect(await Prediction.countDocuments({ userId: (await User.findOne({}))._id })).toBe(0);    // asking moved nothing

    const res = await as(a, DEVICE)(request(app).post('/api/auth/claim-guest'));
    expect(res.body).toEqual({ predictions: 2, fields: 1, fieldsLeft: 0 });
    expect((await as(a)(request(app).get('/api/predict'))).body).toHaveLength(2);
    expect((await as(a)(request(app).get('/api/fields'))).body).toHaveLength(1);
    expect((await as(null, DEVICE)(request(app).get('/api/predict'))).body).toEqual([]);
    expect((await as(null, DEVICE)(request(app).get('/api/fields'))).body).toEqual([]);
    expect((await Prediction.findOne({}).lean()).deviceId).toBeNull();
    expect((await as(a, DEVICE)(request(app).post('/api/auth/claim-guest'))).body).toEqual({ predictions: 0, fields: 0, fieldsLeft: 0 });   // again: nothing left
  });

  test('another browser\'s records are not touched, and a made-up or missing device id moves nothing', async () => {
    await guestWork();
    await Prediction.create(photo({ deviceId: 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d' }));
    const a = await account();
    for (const device of [null, 'not-a-uuid', 'a1b2c3d4-e5f6-4a7b-8c9d-ffffffffffff']) {
      expect((await as(a, device)(request(app).post('/api/auth/claim-guest'))).body.predictions).toBe(0);
    }
    expect(await Prediction.countDocuments({ userId: new mongoose.Types.ObjectId(GUEST) })).toBe(3);
  });

  test('the account\'s limit of 3 fields holds: only the room left is used, the oldest first', async () => {
    const a = await account();
    await saveField(a); await saveField(a);
    await saveField(null, DEVICE, { name: 'first' });
    await saveField(null, DEVICE, { name: 'second' });
    const res = await as(a, DEVICE)(request(app).post('/api/auth/claim-guest'));
    expect(res.body).toMatchObject({ fields: 1, fieldsLeft: 1 });
    expect(await Field.countDocuments({ userId: (await User.findOne({}))._id })).toBe(3);
    expect((await Field.findOne({ deviceId: DEVICE }).lean()).name).toBe('second');
  });

  test('answers to "Did this help?" move too; one the account already gave wins', async () => {
    const a = await account();
    const userId = String((await User.findOne({}))._id);
    const fa = (await saveField(a)).body._id;
    const fg = (await saveField(null, DEVICE)).body._id;
    const body = { alertId: 'FROST-WHEAT-1|2027-02-25', level: 'warn' };
    await as(a)(request(app).post(`/api/fields/${fa}/alerts/feedback`)).send({ ...body, answer: 'acted' });
    await as(null, DEVICE)(request(app).post(`/api/fields/${fg}/alerts/feedback`)).send({ ...body, answer: 'wrong' });
    await as(null, DEVICE)(request(app).post(`/api/fields/${fg}/alerts/feedback`)).send({ alertId: 'HEAT-WHEAT-1|2027-02-25', level: 'warn', answer: 'acted' });
    await as(a, DEVICE)(request(app).post('/api/auth/claim-guest'));
    const rows = await AlertFeedback.find({}).lean();
    expect(rows.map((r) => String(r.userId))).toEqual([userId, userId]);
    expect(rows.find((r) => r.alertKey.startsWith('FROST')).answer).toBe('acted');
    expect(rows).toHaveLength(2);
  });

  test('a guest cannot claim', async () => {
    expect((await as(null, DEVICE)(request(app).post('/api/auth/claim-guest'))).status).toBe(401);
    expect((await as(null, DEVICE)(request(app).get('/api/auth/guest-data'))).status).toBe(401);
  });
});
