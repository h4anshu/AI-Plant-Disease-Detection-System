import { beforeEach, expect, test, vi } from 'vitest';
import api from '../services/api';

// what the client sends and does with the server's answers about the session (docs/AUTH.md); the real api module, as in api.test.js
const addHeaders = (config) => api.interceptors.request.handlers[0].fulfilled(config);
beforeEach(() => localStorage.clear());

test('the token is sent as a Bearer header, and only when there is one', () => {
  expect(addHeaders({ headers: {} }).headers.authorization).toBeUndefined();
  localStorage.setItem('token', 'tok-1');
  expect(addHeaders({ headers: {} }).headers.authorization).toBe('Bearer tok-1');
});

test('the device id is still sent when signed in (it finds the guest records to add to the account)', () => {
  localStorage.setItem('token', 'tok-1');
  expect(addHeaders({ headers: {} }).headers['x-device-id']).toMatch(/^[0-9a-f-]{36}$/);
});

test('"invalid_token" from the server forgets the session and announces it; a wrong password does not', async () => {
  const heard = vi.fn();
  window.addEventListener('auth:expired', heard);
  localStorage.setItem('token', 'tok-1'); localStorage.setItem('user', '{}');
  const reject = api.interceptors.response.handlers[0].rejected;
  await expect(reject({ response: { status: 401, data: { code: 'wrong_password' } } })).rejects.toBeDefined();
  await expect(reject({ response: { status: 500, data: {} } })).rejects.toBeDefined();
  await expect(reject({ message: 'Network Error' })).rejects.toBeDefined();
  expect(heard).not.toHaveBeenCalled();
  expect(localStorage.getItem('token')).toBe('tok-1');
  await expect(reject({ response: { status: 401, data: { code: 'invalid_token' } } })).rejects.toBeDefined();
  expect(heard).toHaveBeenCalledTimes(1);
  expect(localStorage.getItem('token')).toBeNull();
  expect(localStorage.getItem('user')).toBeNull();
  window.removeEventListener('auth:expired', heard);
});
