import { getPushKey, subscribePush, testPush, unsubscribePush } from './api';

// Web push in the browser (docs/PUSH.md): turning notifications on and off for this phone, and keeping the server's copy of the
// subscription in step with who is using the app now. The notifications themselves are drawn by public/sw.js.

export const pushSupported = () => typeof navigator !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
export const isIos = () => /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const installed = () => window.matchMedia?.('(display-mode: standalone)').matches || navigator.standalone === true;

const keyBytes = (b64) => {
  const raw = atob((b64 + '='.repeat((4 - (b64.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
};
const registration = () => navigator.serviceWorker.getRegistration();

// -> { state, endpoint?, ios? }
//   unsupported: this browser cannot (iPhone Safari outside the home screen: `ios` says so, the fix is "Add to Home Screen"; also development, with no worker)
//   unconfigured: the server has no push keys, so the card is not shown
//   blocked: the person said no to notifications for this site
//   off / on: this phone is not / is subscribed
export async function pushStatus() {
  if (!pushSupported()) return { state: 'unsupported', ios: isIos() && !installed() };
  const reg = await registration();
  if (!reg) return { state: 'unsupported', ios: false };
  if (Notification.permission === 'denied') return { state: 'blocked' };
  const sub = await reg.pushManager.getSubscription();
  if (sub && Notification.permission === 'granted') return { state: 'on', endpoint: sub.endpoint };
  try { await getPushKey(); } catch { return { state: 'unconfigured' }; }
  return { state: 'off' };
}

// Asks permission (only now, from a tap), subscribes, and tells the server. Throws { code: 'denied' | 'limit' | 'failed' }.
export async function enablePush(lang) {
  if (await Notification.requestPermission() !== 'granted') throw Object.assign(new Error('denied'), { code: 'denied' });
  const reg = await registration();
  const { data } = await getPushKey();
  const options = { userVisibleOnly: true, applicationServerKey: keyBytes(data.publicKey) };
  let sub = await reg.pushManager.getSubscription();
  if (!sub) sub = await reg.pushManager.subscribe(options);
  try {
    await subscribePush(sub.toJSON(), lang);
  } catch (err) {
    await sub.unsubscribe().catch(() => {});   // no half-state: the phone is not subscribed to something the server does not know
    throw Object.assign(err, { code: err.response?.status === 409 ? 'limit' : 'failed' });
  }
  return sub.endpoint;
}

// Turns notifications off for this phone: the browser's subscription and the server's copy. Best effort and never throws, because it also
// runs on sign-out, which must not wait for the network.
export async function disablePush() {
  try {
    if (!pushSupported()) return;
    const sub = await (await registration())?.pushManager.getSubscription();
    if (!sub) return;
    const { endpoint } = sub;
    await sub.unsubscribe().catch(() => {});
    await unsubscribePush(endpoint).catch(() => {});
  } catch { /* nothing to turn off */ }
}

// When the person who uses the app changes (signed in, a language chosen), the server's copy follows: it is the same browser subscription
// under a new owner and language. Only when notifications are already on; never asks anything.
export async function resyncPush(lang) {
  try {
    if (!pushSupported() || Notification.permission !== 'granted') return;
    const sub = await (await registration())?.pushManager.getSubscription();
    if (sub) await subscribePush(sub.toJSON(), lang);
  } catch { /* the next visit tries again */ }
}

export const sendTestPush = (endpoint) => testPush(endpoint);
