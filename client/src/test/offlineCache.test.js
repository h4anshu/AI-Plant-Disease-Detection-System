import { beforeEach, describe, expect, test } from 'vitest';
import { clearLast, readLast, saveLast, unreachable } from '../services/offlineCache';

// the last good answers kept for a phone with no signal (docs/OFFLINE.md): one copy per owner, erased on sign-out
const guest = (id) => { localStorage.removeItem('token'); localStorage.removeItem('user'); localStorage.setItem('deviceId', id); };
const account = (id) => { localStorage.setItem('token', 't'); localStorage.setItem('user', JSON.stringify({ id, name: 'Asha' })); };

beforeEach(() => localStorage.clear());

describe('offline copy', () => {
  test('is kept and read back, with the time it was saved', () => {
    guest('dev-1');
    saveLast('alerts', { fields: [{ _id: 'f1' }] });
    const last = readLast('alerts');
    expect(last.data).toEqual({ fields: [{ _id: 'f1' }] });
    expect(Math.abs(last.at - Date.now())).toBeLessThan(2000);
    expect(readLast('history')).toBeNull();
  });

  test('belongs to one owner: another guest browser, an account and a second account never read it', () => {
    guest('dev-1');
    saveLast('alerts', { who: 'guest 1' });
    guest('dev-2');
    expect(readLast('alerts')).toBeNull();
    account('u1');
    expect(readLast('alerts')).toBeNull();
    saveLast('alerts', { who: 'u1' });
    account('u2');
    expect(readLast('alerts')).toBeNull();
    account('u1');
    expect(readLast('alerts').data).toEqual({ who: 'u1' });
    guest('dev-1');
    expect(readLast('alerts').data).toEqual({ who: 'guest 1' });
  });

  test('"clear" erases every copy of everyone, and only the copies', () => {
    guest('dev-1');
    saveLast('alerts', 1); saveLast('history', 2);
    account('u1');
    saveLast('alerts', 3);
    localStorage.setItem('deviceId', 'dev-1');
    clearLast();
    expect(Object.keys(localStorage).filter((k) => k.startsWith('pg:last:'))).toEqual([]);
    expect(localStorage.getItem('deviceId')).toBe('dev-1');
    expect(localStorage.getItem('token')).toBe('t');
  });

  test('a broken or missing store is "nothing kept", never an error', () => {
    guest('dev-1');
    localStorage.setItem('pg:last:alerts:d:dev-1', '{not json');
    expect(readLast('alerts')).toBeNull();
    localStorage.setItem('token', 't'); localStorage.setItem('user', '{not json');
    expect(() => saveLast('alerts', {})).not.toThrow();
    expect(readLast('alerts')).toBeNull();
  });

  test('"cannot be reached" is no answer at all or a gateway error; an answer that says no is an answer', () => {
    expect(unreachable({ message: 'Network Error' })).toBe(true);
    expect(unreachable({ response: { status: 502 } })).toBe(true);
    expect(unreachable({ response: { status: 503 } })).toBe(true);
    expect(unreachable({ response: { status: 500 } })).toBe(false);
    expect(unreachable({ response: { status: 401 } })).toBe(false);
    expect(unreachable({ response: { status: 404 } })).toBe(false);
  });
});
