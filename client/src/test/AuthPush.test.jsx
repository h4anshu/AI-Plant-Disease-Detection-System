import { beforeEach, expect, test, vi } from 'vitest';
import { act, render } from '@testing-library/react';
import { useContext } from 'react';

const api = vi.hoisted(() => ({ loginUser: vi.fn(), registerUser: vi.fn(), getMe: vi.fn(), deleteAccount: vi.fn() }));
const push = vi.hoisted(() => ({ disablePush: vi.fn(), resyncPush: vi.fn() }));
vi.mock('../services/api', () => api);
vi.mock('../services/push', () => push);
import { AuthContext, AuthProvider } from '../context/AuthContext';

// notifications follow the person using the phone (docs/PUSH.md): synced on sign-in, turned off on sign-out and on account deletion
const USER = { id: 'u1', name: 'Asha', email: 'a@example.com' };
let ctx;
const Grab = () => { ctx = useContext(AuthContext); return null; };
const mount = () => render(<AuthProvider><Grab /></AuthProvider>);

beforeEach(() => {
  localStorage.clear();
  Object.values({ ...api, ...push }).forEach((f) => f.mockReset());
  api.getMe.mockResolvedValue({ data: USER });
  push.disablePush.mockResolvedValue();
  push.resyncPush.mockResolvedValue();
});

test('signing in or registering syncs notifications that are already on to the new person, in the current language', async () => {
  api.loginUser.mockResolvedValue({ data: { token: 't', user: USER } });
  api.registerUser.mockResolvedValue({ data: { token: 't', user: USER } });
  mount();
  await act(async () => { await ctx.login('a@example.com', 'x'); });
  expect(push.resyncPush).toHaveBeenCalledWith('en');
  await act(async () => { await ctx.register('Asha', 'a@example.com', 'x'); });
  expect(push.resyncPush).toHaveBeenCalledTimes(2);
});

test('a failed sign-in syncs nothing', async () => {
  api.loginUser.mockRejectedValue({ response: { status: 401 } });
  mount();
  await act(async () => { await ctx.login('a@example.com', 'bad').catch(() => {}); });
  expect(push.resyncPush).not.toHaveBeenCalled();
});

test('signing out turns notifications off on this phone: the next person is not sent this one\'s warnings', () => {
  localStorage.setItem('token', 't'); localStorage.setItem('user', JSON.stringify(USER));
  mount();
  act(() => ctx.logout());
  expect(push.disablePush).toHaveBeenCalledTimes(1);
  expect(localStorage.getItem('token')).toBeNull();
});

test('deleting the account turns them off too', async () => {
  localStorage.setItem('token', 't'); localStorage.setItem('user', JSON.stringify(USER));
  api.deleteAccount.mockResolvedValue({ data: { deleted: 1 } });
  mount();
  await act(async () => { await ctx.removeAccount('pw'); });
  expect(push.disablePush).toHaveBeenCalledTimes(1);
});

test('a session that merely ran out keeps the notifications (the account is still theirs)', () => {
  localStorage.setItem('token', 't'); localStorage.setItem('user', JSON.stringify(USER));
  mount();
  act(() => { window.dispatchEvent(new Event('auth:expired')); });
  expect(push.disablePush).not.toHaveBeenCalled();
});
