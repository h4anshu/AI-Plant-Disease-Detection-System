import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test } from '@jest/globals';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import request from 'supertest';
import app from '../app.js';
import User from '../models/User.js';
import Field from '../models/Field.js';
import Prediction from '../models/Prediction.js';
import PushSubscription from '../models/PushSubscription.js';
import { dispatchPushes, setTransport, validEndpoint } from '../services/push.js';
import { PUSH_LANGS, pushMessage } from '../utils/pushText.js';
import { CROPS } from '../models/Prediction.js';

// Web push (docs/PUSH.md): who may subscribe, who is told what, and that nothing is sent twice.
const DEVICE = '3f2b8c1e-9d4a-4e7b-8a6c-2f1e0d9c8b7a';
const OTHER = 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d';
const ep = (n) => `https://fcm.googleapis.com/fcm/send/dXNlci1hLWxvbmctZW5kcG9pbnQtdG9rZW4${n}`;
const KEYS = { p256dh: 'BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQtUbVlUls0VJXg7A8u-Ts1XbjhazAkj7I99e8QcYP7DkM', auth: 'tBHItJI5svbpez7KI4CCXg' };
const sub = (n = 1, o = {}) => ({ subscription: { endpoint: ep(n), keys: KEYS }, lang: 'en', ...o });
const GUEST = '000000000000000000000000';

let mongod;
let sent;
beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());
  await Promise.all([User, PushSubscription].map((m) => m.init()));
});
beforeEach(() => {
  process.env.VAPID_PUBLIC_KEY = 'BPublicKeyForTests';
  process.env.VAPID_PRIVATE_KEY = 'private-key-for-tests';
  process.env.VAPID_SUBJECT = 'mailto:owner@example.com';
  sent = [];
  setTransport(async (s, payload) => { sent.push({ endpoint: s.endpoint, message: JSON.parse(payload) }); });
});
afterEach(async () => {
  setTransport(null);
  delete process.env.VAPID_PUBLIC_KEY; delete process.env.VAPID_PRIVATE_KEY; delete process.env.VAPID_SUBJECT; delete process.env.PUSH_MIN_LEVEL;
  await Promise.all([User, Field, Prediction, PushSubscription].map((m) => m.deleteMany({})));
});
afterAll(async () => { await mongoose.disconnect(); await mongod.stop(); });

const guest = (device = DEVICE) => (req) => req.set('x-device-id', device);
const account = async (email = 'a@example.com') => `Bearer ${(await request(app).post('/api/auth/register').send({ name: 'Asha', email, password: 'correct horse battery' })).body.token}`;
const subscribe = (body, who = guest()) => who(request(app).post('/api/push/subscribe')).send(body);
const asToken = (token) => (req) => req.set('authorization', token);

describe('setting', () => {
  test('without the three settings the feature is off: no key, no subscribing, no testing', async () => {
    delete process.env.VAPID_PRIVATE_KEY;
    expect((await request(app).get('/api/push/key')).status).toBe(503);
    expect((await subscribe(sub())).status).toBe(503);
    expect((await guest()(request(app).post('/api/push/test')).send({ endpoint: ep(1) })).status).toBe(503);
    expect((await dispatchPushes({ compute: async () => ({}) })).configured).toBe(false);
  });

  test('with them the browser gets the public key, and only that', async () => {
    const res = await request(app).get('/api/push/key');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ publicKey: 'BPublicKeyForTests' });
  });
});

describe('who may subscribe', () => {
  test.each([
    ['plain http', 'http://fcm.googleapis.com/fcm/send/abc'],
    ['an internal address', 'https://169.254.169.254/latest/meta-data'],
    ['localhost', 'https://localhost/x'],
    ['a look-alike host', 'https://fcm.googleapis.com.evil.example/fcm/send/abc'],
    ['a host with the real name in the user part', 'https://fcm.googleapis.com@evil.example/fcm/send/abc'],
    ['credentials on the real host', 'https://user:pw@fcm.googleapis.com/fcm/send/abc'],
    ['another port', 'https://fcm.googleapis.com:8443/fcm/send/abc'],
    ['an unknown service', 'https://push.evil.example/x'],
    ['not an address', 'not a url'],
    ['too long', `https://fcm.googleapis.com/${'a'.repeat(700)}`],
  ])('refuses %s (the server would be posting there)', async (_, endpoint) => {
    expect(validEndpoint(endpoint)).toBe(false);
    const res = await subscribe({ subscription: { endpoint, keys: KEYS }, lang: 'en' });
    expect(res.status).toBe(400);
    expect(await PushSubscription.countDocuments()).toBe(0);
  });

  test.each([
    'https://fcm.googleapis.com/fcm/send/abc',
    'https://updates.push.services.mozilla.com/wpush/v2/abc',
    'https://web.push.apple.com/abc',
    'https://par02p.notify.windows.com/w/?token=abc',
  ])('accepts the push service %s', (endpoint) => { expect(validEndpoint(endpoint)).toBe(true); });

  test('refuses bad keys and a missing subscription', async () => {
    expect((await subscribe({ subscription: { endpoint: ep(1), keys: { p256dh: 'x', auth: 'y' } } })).status).toBe(400);
    expect((await subscribe({ subscription: { endpoint: ep(1), keys: { p256dh: KEYS.p256dh } } })).status).toBe(400);
    expect((await subscribe({ subscription: { endpoint: ep(1), keys: 'nope' } })).status).toBe(400);
    expect((await subscribe({})).status).toBe(400);
    expect((await subscribe(sub(), (r) => r)).status).toBe(400);                       // a guest without a device id owns nothing
  });

  test('saves for a guest browser or an account, and the same endpoint again is an update, not a second row', async () => {
    expect((await subscribe(sub(1, { lang: 'hi' }))).status).toBe(201);
    expect((await subscribe(sub(1, { lang: 'en' }))).status).toBe(201);
    let rows = await PushSubscription.find({}).lean();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ deviceId: DEVICE, lang: 'en' });
    expect(String(rows[0].userId)).toBe(GUEST);

    const token = await account();
    expect((await subscribe(sub(2), asToken(token))).status).toBe(201);
    rows = await PushSubscription.find({ endpoint: ep(2) }).lean();
    expect(rows[0].deviceId).toBeNull();
    expect(String(rows[0].userId)).not.toBe(GUEST);
  });

  test('Punjabi and Odia are kept as chosen, and their notifications are in their own script', async () => {
    await subscribe(sub(1, { lang: 'pa' })); await subscribe(sub(2, { lang: 'or' }));
    expect((await PushSubscription.find({}).sort({ endpoint: 1 }).lean()).map((s) => s.lang)).toEqual(['pa', 'or']);
    expect(pushMessage({ hazard: 'frost', level: 'warn', offset: 1 }, 'wheat', 'pa').title).toBe('ਪਾਲਾ: ਚੇਤਾਵਨੀ');
    expect(pushMessage({ hazard: 'frost', level: 'warn', offset: 1 }, 'wheat', 'or').body).toContain('ଗହମ');
  });

  test('an unknown language is English; at most 5 devices per owner', async () => {
    await subscribe(sub(1, { lang: 'xx' }));
    expect((await PushSubscription.findOne({}).lean()).lang).toBe('en');
    for (let i = 2; i <= 5; i++) expect((await subscribe(sub(i))).status).toBe(201);
    expect((await subscribe(sub(6))).status).toBe(409);
    expect((await subscribe(sub(3))).status).toBe(201);                                // one that is already there still syncs
    expect((await subscribe(sub(6), guest(OTHER))).status).toBe(201);                  // another owner has their own 5
  });

  test('the same browser signing in moves its subscription to the account (whoever uses it now is told)', async () => {
    await subscribe(sub(1));
    const token = await account();
    await subscribe(sub(1), asToken(token));
    const row = await PushSubscription.findOne({}).lean();
    expect(row.deviceId).toBeNull();
    expect(await PushSubscription.countDocuments()).toBe(1);
  });
});

describe('unsubscribing and testing', () => {
  test('unsubscribing needs no sign-in (it must work after a sign-out), removes only that endpoint, and an unknown one is fine', async () => {
    await subscribe(sub(1)); await subscribe(sub(2));
    const res = await request(app).post('/api/push/unsubscribe').send({ endpoint: ep(1) });
    expect(res.body).toEqual({ removed: 1 });
    expect((await PushSubscription.find({}).lean()).map((s) => s.endpoint)).toEqual([ep(2)]);
    expect((await request(app).post('/api/push/unsubscribe').send({ endpoint: ep(9) })).body).toEqual({ removed: 0 });
    expect((await request(app).post('/api/push/unsubscribe').send({})).status).toBe(400);
  });

  test('a test notification goes to the caller\'s own subscription only, in their language', async () => {
    await subscribe(sub(1, { lang: 'hi' }));
    const ok = await guest()(request(app).post('/api/push/test')).send({ endpoint: ep(1) });
    expect(ok.body).toEqual({ sent: 1 });
    expect(sent).toHaveLength(1);
    expect(sent[0].message.title).toBe('प्लांटगार्ड की सूचनाएँ चालू हैं');
    expect((await guest(OTHER)(request(app).post('/api/push/test')).send({ endpoint: ep(1) })).status).toBe(404);   // someone else's endpoint
    expect((await guest()(request(app).post('/api/push/test')).send({ endpoint: ep(7) })).status).toBe(404);
    expect(sent).toHaveLength(1);
  });

  test('a test to an expired subscription removes it and says to turn notifications on again; another failure is a 502', async () => {
    await subscribe(sub(1));
    setTransport(async () => { throw Object.assign(new Error('gone'), { statusCode: 410 }); });
    const gone = await guest()(request(app).post('/api/push/test')).send({ endpoint: ep(1) });
    expect(gone.status).toBe(404);
    expect(await PushSubscription.countDocuments()).toBe(0);
    await subscribe(sub(2));
    setTransport(async () => { throw Object.assign(new Error('boom'), { statusCode: 500 }); });
    expect((await guest()(request(app).post('/api/push/test')).send({ endpoint: ep(2) })).status).toBe(502);
    expect(await PushSubscription.countDocuments()).toBe(1);
  });
});

// what the screen would show, as computeFieldAlerts returns it
const alert = (o = {}) => ({ id: 'FROST-WHEAT-1|2027-02-25', rule: 'FROST-WHEAT-1', hazard: 'frost', level: 'warn', date: '2027-02-25', offset: 1, crop: 'wheat', ...o });
const result = (alerts = [alert()], official = [], o = {}) => ({ fields: [{ _id: 'f1', name: 'North plot', crop: 'wheat', stage: 'flowering', status: 'ok', alerts, official, ...o }] });
const owners = [];
const run = (res, o = {}) => dispatchPushes({ compute: async (owner) => { owners.push(owner); return res; }, ...o });

describe('dispatch', () => {
  beforeEach(async () => { owners.length = 0; await subscribe(sub(1)); });

  test('a warning is sent once, in the phone\'s language, naming the hazard, level and crop but never the field\'s name or place', async () => {
    const stats = await run(result());
    expect(stats).toMatchObject({ configured: true, owners: 1, subscriptions: 1, sent: 1 });
    expect(sent).toHaveLength(1);
    expect(sent[0].message).toMatchObject({ title: 'Frost: Warning', body: 'Your wheat field, tomorrow. Open PlantGuard to see what to do.', url: '/overview?mode=weather' });
    expect(JSON.stringify(sent[0].message)).not.toMatch(/North plot|f1|\d+\.\d{3}/);
    expect((await run(result())).sent).toBe(0);                                          // the next run: nothing new
    expect(sent).toHaveLength(1);
  });

  test('only warnings and urgent alerts by default: a watch or a tip stays on the screen', async () => {
    await run(result([alert({ level: 'watch', id: 'W|1' }), alert({ level: 'info', id: 'I|1' })]));
    expect(sent).toHaveLength(0);
    process.env.PUSH_MIN_LEVEL = 'watch';
    await run(result([alert({ level: 'watch', id: 'W|1' }), alert({ level: 'info', id: 'I|1' })]));
    expect(sent).toHaveLength(1);
  });

  test('an alert that gets worse is sent again; the same level is not', async () => {
    await run(result([alert()]));
    await run(result([alert({ level: 'urgent' })]));
    expect(sent.map((s) => s.message.title)).toEqual(['Frost: Warning', 'Frost: Urgent']);
    await run(result([alert({ level: 'urgent' })]));
    expect(sent).toHaveLength(2);
  });

  test('official warnings are sent too, saying who issued them', async () => {
    await run(result([], [{ id: 'IMD|2027-02-25', origin: 'official', source: 'imd', level: 'warn', date: '2027-02-25', offset: 0 }]));
    expect(sent[0].message).toMatchObject({ title: 'Official warning (IMD): Warning' });
    expect(sent[0].message.body).toContain('today');
  });

  test('worst first, and at most 3 per phone per run: the rest follow on the next run', async () => {
    const many = Array.from({ length: 5 }, (_, i) => alert({ id: `HEAT-WHEAT-1|d${i}`, hazard: 'heat', level: i === 4 ? 'urgent' : 'warn', offset: i }));
    await run(result(many));
    expect(sent).toHaveLength(3);
    expect(sent[0].message.title).toBe('Heat: Urgent');
    await run(result(many));
    expect(sent).toHaveLength(5);
  });

  test('each phone of the owner is told, and each remembers on its own', async () => {
    await subscribe(sub(2, { lang: 'hi' }));
    await run(result());
    expect(sent.map((s) => s.endpoint).sort()).toEqual([ep(1), ep(2)]);
    expect(sent.find((s) => s.endpoint === ep(2)).message.title).toBe('पाला: चेतावनी');
    await subscribe(sub(3));
    await run(result());
    expect(sent).toHaveLength(3);                                                          // only the new phone
  });

  test('two runs at the same moment send an alert once', async () => {
    await Promise.all([run(result()), run(result())]);
    expect(sent).toHaveLength(1);
  });

  test('a subscription the push service says is gone is removed; a failure gives the alert back to try again, and 8 in a row drop it', async () => {
    setTransport(async () => { throw Object.assign(new Error('gone'), { statusCode: 410 }); });
    expect(await run(result())).toMatchObject({ removed: 1, sent: 0 });
    expect(await PushSubscription.countDocuments()).toBe(0);

    await subscribe(sub(2));
    setTransport(async () => { throw Object.assign(new Error('boom'), { statusCode: 500 }); });
    expect(await run(result())).toMatchObject({ failed: 1, sent: 0 });
    let row = await PushSubscription.findOne({}).lean();
    expect(row.sent).toEqual([]);                                                          // given back: the next run tries again
    expect(row.failures).toBe(1);
    setTransport(async (s, p) => { sent.push({ endpoint: s.endpoint, message: JSON.parse(p) }); });
    await run(result());
    row = await PushSubscription.findOne({}).lean();
    expect(sent).toHaveLength(1);
    expect(row.failures).toBe(0);

    await PushSubscription.updateOne({}, { $set: { failures: 7, sent: [] } });
    setTransport(async () => { throw Object.assign(new Error('boom'), { statusCode: 500 }); });
    await run(result());
    expect(await PushSubscription.countDocuments()).toBe(0);
  });

  test('an owner whose alerts cannot be computed does not stop the others', async () => {
    await subscribe(sub(2), guest(OTHER));
    let n = 0;
    const stats = await dispatchPushes({ compute: async () => { n += 1; if (n === 1) throw new Error('weather down'); return result(); } });
    expect(stats.failed).toBe(1);
    expect(sent).toHaveLength(1);
  });

  test('asks for each owner\'s own fields: a guest by browser, an account by account', async () => {
    const token = await account();
    await subscribe(sub(2), asToken(token));
    await run(result([]));
    expect(owners).toHaveLength(2);
    expect(owners.some((o) => o.deviceId === DEVICE && String(o.userId) === GUEST)).toBe(true);
    expect(owners.some((o) => o.deviceId === undefined && String(o.userId) !== GUEST)).toBe(true);
  });

  test('it never runs past its time budget', async () => {
    await subscribe(sub(2), guest(OTHER));
    const stats = await dispatchPushes({ budgetMs: -1, compute: async () => result() });
    expect(stats).toMatchObject({ sent: 0, skipped: 2 });
  });

  test('the tick sends them: POST /api/alerts/tick reports what was sent', async () => {
    process.env.ALERTS_DISABLED_SOURCES = 'sachet,imd,cwc,glofas,news,fire,community,mandi,radar';
    // the real compute asks for the owner's fields: none here, so nothing is sent, and the answer still carries the push summary
    const res = await request(app).post('/api/alerts/tick').set('x-alerts-token', process.env.ALERTS_ADMIN_TOKEN);
    expect(res.status).toBe(200);
    expect(res.body.push).toMatchObject({ configured: true, owners: 1, sent: 0 });
  });
});

describe('the words', () => {
  test('every language has every hazard, level, crop, and the test message', () => {
    for (const lang of PUSH_LANGS) {
      for (const hazard of ['frost', 'heat', 'heatwave', 'rain_harvest', 'rain_heavy', 'dry_spell', 'rain_spray', 'flood_river', 'fire_near', 'disease_near']) {
        for (const level of ['urgent', 'warn', 'watch', 'info']) {
          const m = pushMessage({ hazard, level, offset: 0 }, 'wheat', lang);
          expect(m.title).toMatch(/\S: \S/);
          expect(m.title).not.toMatch(/undefined/);
        }
      }
      for (const crop of CROPS) {   // the crop's name in that language, never a raw key such as "pigeonpea"
        const body = pushMessage({ hazard: 'frost', level: 'warn', offset: 2 }, crop, lang).body;
        if (lang === 'en') expect(body).toContain(`Your ${crop} field`); else expect(body).not.toContain(crop);
      }
    }
    expect(pushMessage({ hazard: 'frost', level: 'warn', offset: 3 }, 'rice', 'en').body).toContain('in 3 days');
    expect(pushMessage({ hazard: 'frost', level: 'warn', offset: 0 }, 'rice', 'zz').title).toBe('Frost: Warning');   // an unknown language is English
  });
});

describe('the owner\'s data', () => {
  test('"Delete my data" and "Delete my account" remove the notifications; a guest\'s move into the account when claimed', async () => {
    await subscribe(sub(1)); await subscribe(sub(2), guest(OTHER));
    expect((await guest()(request(app).delete('/api/predict'))).status).toBe(200);
    expect((await PushSubscription.find({}).lean()).map((s) => s.endpoint)).toEqual([ep(2)]);

    const token = await account();
    await subscribe(sub(3), asToken(token));
    await request(app).post('/api/auth/claim-guest').set('authorization', token).set('x-device-id', OTHER);
    const moved = await PushSubscription.findOne({ endpoint: ep(2) }).lean();
    expect(moved.deviceId).toBeNull();
    expect(String(moved.userId)).not.toBe(GUEST);

    const res = await request(app).delete('/api/auth/me').set('authorization', token).send({ password: 'correct horse battery' });
    expect(res.status).toBe(200);
    expect(await PushSubscription.countDocuments()).toBe(0);
  });
});
