import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';

const api = vi.hoisted(() => ({ getPushKey: vi.fn(), subscribePush: vi.fn(), unsubscribePush: vi.fn(), testPush: vi.fn() }));
vi.mock('../services/api', () => api);
import { disablePush, enablePush, isIos, pushStatus, pushSupported, resyncPush } from '../services/push';
import PushCard from '../components/workspace/PushCard';

// Notifications on this phone (docs/PUSH.md): the browser side of web push, with a fake push manager
const KEY = 'BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQtUbVlUls0VJXg7A8u-Ts1XbjhazAkj7I99e8QcYP7DkM';
const fakeSub = (endpoint) => ({ endpoint, toJSON: () => ({ endpoint, keys: { p256dh: 'p', auth: 'a' } }), unsubscribe: vi.fn(async () => { if (world?.sub?.endpoint === endpoint) world.sub = null; return true; }) });
let world;

const install = ({ permission = 'default', sub = null, registered = true, answer = 'granted' } = {}) => {
  world = { sub };
  world.pushManager = {
    getSubscription: vi.fn(async () => world.sub),
    subscribe: vi.fn(async () => { world.sub = fakeSub('https://fcm.googleapis.com/fcm/send/new'); return world.sub; }),
  };
  Object.defineProperty(navigator, 'serviceWorker', { value: { getRegistration: async () => (registered ? { pushManager: world.pushManager } : undefined) }, configurable: true });
  window.PushManager = function PushManager() {};
  window.Notification = { permission, requestPermission: vi.fn(async () => { window.Notification.permission = answer; return answer; }) };
};
const uninstall = () => { delete navigator.serviceWorker; delete window.PushManager; delete window.Notification; };

beforeEach(() => {
  Object.values(api).forEach((f) => f.mockReset());
  api.getPushKey.mockResolvedValue({ data: { publicKey: KEY } });
  api.subscribePush.mockResolvedValue({ data: { subscribed: true } });
  api.unsubscribePush.mockResolvedValue({ data: { removed: 1 } });
  api.testPush.mockResolvedValue({ data: { sent: 1 } });
});
afterEach(uninstall);

describe('what this phone can do', () => {
  test('a browser without push is "unsupported"; so is a page with no service worker registered (development)', async () => {
    expect(pushSupported()).toBe(false);
    expect(await pushStatus()).toEqual({ state: 'unsupported', ios: false });
    install({ registered: false });
    expect(await pushStatus()).toEqual({ state: 'unsupported', ios: false });
  });

  test('an iPhone in Safari (not on the home screen) is "unsupported", and told how to fix it', async () => {
    const ua = vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)');
    expect(isIos()).toBe(true);
    expect(await pushStatus()).toEqual({ state: 'unsupported', ios: true });
    ua.mockRestore();
  });

  test('blocked, unconfigured, off and on', async () => {
    install({ permission: 'denied' });
    expect(await pushStatus()).toEqual({ state: 'blocked' });
    uninstall();
    install({});
    api.getPushKey.mockRejectedValue({ response: { status: 503 } });
    expect(await pushStatus()).toEqual({ state: 'unconfigured' });
    api.getPushKey.mockResolvedValue({ data: { publicKey: KEY } });
    expect(await pushStatus()).toEqual({ state: 'off' });
    uninstall();
    install({ permission: 'granted', sub: fakeSub('https://fcm.googleapis.com/fcm/send/mine') });
    expect(await pushStatus()).toEqual({ state: 'on', endpoint: 'https://fcm.googleapis.com/fcm/send/mine' });
  });
});

describe('turning on and off', () => {
  test('asks permission, subscribes with the server\'s key, tells the server, in the current language', async () => {
    install({});
    const endpoint = await enablePush('hi');
    expect(window.Notification.requestPermission).toHaveBeenCalledTimes(1);
    const options = world.pushManager.subscribe.mock.calls[0][0];
    expect(options.userVisibleOnly).toBe(true);
    expect(options.applicationServerKey).toBeInstanceOf(Uint8Array);
    expect(options.applicationServerKey).toHaveLength(65);                         // an uncompressed P-256 point
    expect(api.subscribePush).toHaveBeenCalledWith({ endpoint, keys: { p256dh: 'p', auth: 'a' } }, 'hi');
  });

  test('"no" to the permission asks nothing of the server and subscribes to nothing', async () => {
    install({ answer: 'denied' });
    await expect(enablePush('en')).rejects.toMatchObject({ code: 'denied' });
    expect(world.pushManager.subscribe).not.toHaveBeenCalled();
    expect(api.subscribePush).not.toHaveBeenCalled();
  });

  test('if the server refuses (too many devices) the browser subscription is undone: no half-state', async () => {
    install({});
    api.subscribePush.mockRejectedValue({ response: { status: 409 } });
    await expect(enablePush('en')).rejects.toMatchObject({ code: 'limit' });
    expect(world.sub).toBeNull();                                                   // undone: the fake removes it when unsubscribed
    api.subscribePush.mockRejectedValue(new Error('offline'));
    await expect(enablePush('en')).rejects.toMatchObject({ code: 'failed' });
  });

  test('turning off removes the browser subscription and the server\'s copy, and never throws', async () => {
    install({ permission: 'granted', sub: fakeSub('https://fcm.googleapis.com/fcm/send/mine') });
    const sub = world.sub;
    await disablePush();
    expect(sub.unsubscribe).toHaveBeenCalled();
    expect(api.unsubscribePush).toHaveBeenCalledWith('https://fcm.googleapis.com/fcm/send/mine');
    world.sub = fakeSub('https://fcm.googleapis.com/fcm/send/other');
    api.unsubscribePush.mockRejectedValue(new Error('offline'));
    await expect(disablePush()).resolves.toBeUndefined();
    uninstall();
    await expect(disablePush()).resolves.toBeUndefined();                          // no push at all: nothing to do
  });

  test('syncing follows a change of person or language, only when notifications are already on, and never asks anything', async () => {
    install({ permission: 'default', sub: null });
    await resyncPush('en');
    expect(api.subscribePush).not.toHaveBeenCalled();
    expect(window.Notification.requestPermission).not.toHaveBeenCalled();
    uninstall();
    install({ permission: 'granted', sub: fakeSub('https://fcm.googleapis.com/fcm/send/mine') });
    await resyncPush('hi');
    expect(api.subscribePush).toHaveBeenCalledWith(expect.objectContaining({ endpoint: 'https://fcm.googleapis.com/fcm/send/mine' }), 'hi');
    api.subscribePush.mockRejectedValue(new Error('offline'));
    await expect(resyncPush('hi')).resolves.toBeUndefined();
  });
});

describe('the card', () => {
  test('is not shown when the server has no keys, or the browser cannot (except an iPhone, which is told what to do)', async () => {
    api.getPushKey.mockRejectedValue({ response: { status: 503 } });
    install({});
    const a = render(<PushCard />);
    await waitFor(() => expect(api.getPushKey).toHaveBeenCalled());
    expect(a.container).toBeEmptyDOMElement();
    a.unmount(); uninstall();
    const b = render(<PushCard />);
    await new Promise((r) => setTimeout(r, 20));
    expect(b.container).toBeEmptyDOMElement();
    b.unmount();
    const ua = vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0)');
    render(<PushCard />);
    expect(await screen.findByText(/tap Share, then Add to Home Screen/)).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    ua.mockRestore();
  });

  test('off: says what it is and what it sends; one tap turns it on, then it offers a test and "turn off"', async () => {
    install({});
    render(<PushCard />);
    expect(await screen.findByText(/Get a notification when a serious warning is issued/)).toBeInTheDocument();
    expect(screen.getByText(/never the name or the place of your field/)).toBeInTheDocument();
    expect(window.Notification.requestPermission).not.toHaveBeenCalled();           // nothing is asked until the tap
    fireEvent.click(screen.getByRole('button', { name: 'Turn on notifications' }));
    expect(await screen.findByText('Notifications are on for this phone.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Send a test' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Send a test' }));
    expect(await screen.findByRole('status')).toHaveTextContent('Test sent');
    expect(api.testPush).toHaveBeenCalledWith('https://fcm.googleapis.com/fcm/send/new');
    fireEvent.click(screen.getByRole('button', { name: 'Turn off' }));
    expect(await screen.findByRole('button', { name: 'Turn on notifications' })).toBeInTheDocument();
  });

  test('already on: the server is told again on opening (so a copy it lost is healed), and again when the language changes', async () => {
    install({ permission: 'granted', sub: fakeSub('https://fcm.googleapis.com/fcm/send/mine') });
    render(<PushCard />);
    await screen.findByText('Notifications are on for this phone.');
    await waitFor(() => expect(api.subscribePush).toHaveBeenCalledWith(expect.objectContaining({ endpoint: 'https://fcm.googleapis.com/fcm/send/mine' }), 'en'));
    expect(api.subscribePush).toHaveBeenCalledTimes(1);
    expect(window.Notification.requestPermission).not.toHaveBeenCalled();
  });

  test('off: nothing is sent to the server on opening', async () => {
    install({});
    render(<PushCard />);
    await screen.findByRole('button', { name: 'Turn on notifications' });
    expect(api.subscribePush).not.toHaveBeenCalled();
  });

  test('a failed test, a refused subscription and a blocked site each say so', async () => {
    install({});
    api.subscribePush.mockRejectedValueOnce({ response: { status: 409 } });
    render(<PushCard />);
    fireEvent.click(await screen.findByRole('button', { name: 'Turn on notifications' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Too many devices have notifications on');
    fireEvent.click(screen.getByRole('button', { name: 'Turn on notifications' }));
    await screen.findByRole('button', { name: 'Send a test' });
    api.testPush.mockRejectedValue({ response: { status: 404 } });
    fireEvent.click(screen.getByRole('button', { name: 'Send a test' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('The test could not be sent');
  });

  test('blocked for this site: says how to allow it, offers no button', async () => {
    install({ permission: 'denied' });
    render(<PushCard />);
    expect(await screen.findByText(/blocked for this site/)).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  test('saying no to the browser\'s own question leaves the card as it was, with no error', async () => {
    install({ answer: 'denied' });
    render(<PushCard />);
    fireEvent.click(await screen.findByRole('button', { name: 'Turn on notifications' }));
    expect(await screen.findByText(/blocked for this site/)).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});
