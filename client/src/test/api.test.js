import { beforeEach, expect, test } from 'vitest';
import api from '../services/api';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const addHeaders = (config) => api.interceptors.request.handlers[0].fulfilled(config);

beforeEach(() => localStorage.clear());

test('every request carries the same random device id for this browser', () => {
  const first = addHeaders({ headers: {} }).headers['x-device-id'];
  expect(first).toMatch(UUID);
  expect(addHeaders({ headers: {} }).headers['x-device-id']).toBe(first);
  expect(localStorage.getItem('deviceId')).toBe(first);
});
