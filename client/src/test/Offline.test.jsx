import { beforeEach, describe, expect, test, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';

const api = vi.hoisted(() => ({ getFieldAlerts: vi.fn(), getPredictionHistory: vi.fn() }));
vi.mock('../services/api', () => api);
import { useFieldAlerts } from '../components/workspace/useFieldAlerts';
import { useHistory } from '../components/workspace/useHistory';
import { readLast } from '../services/offlineCache';

// With no signal the app shows what it last knew, for the person who saw it (docs/OFFLINE.md)
const ANSWER = { data: { checkedAt: '2027-02-24T05:00:00Z', fields: [{ _id: 'f1', name: 'North plot', crop: 'wheat', stage: 'flowering', status: 'ok', alerts: [] }] } };
const NO_SIGNAL = Object.assign(new Error('Network Error'), { code: 'ERR_NETWORK' });
const answered = (status, message = 'x') => Object.assign(new Error(message), { response: { status, data: { message } } });
const guest = (id) => { localStorage.clear(); localStorage.setItem('deviceId', id); };

beforeEach(() => {
  guest('dev-1');
  api.getFieldAlerts.mockReset();
  api.getPredictionHistory.mockReset();
});

describe('the alerts', () => {
  test('a good answer is kept; later with no signal it is shown with a note saying when it was seen', async () => {
    api.getFieldAlerts.mockResolvedValue(ANSWER);
    const first = renderHook(() => useFieldAlerts());
    await waitFor(() => expect(first.result.current.fields).toHaveLength(1));
    expect(readLast('alerts').data).toEqual(ANSWER.data);
    first.unmount();

    api.getFieldAlerts.mockRejectedValue(NO_SIGNAL);
    const again = renderHook(() => useFieldAlerts());
    await waitFor(() => expect(again.result.current.loading).toBe(false));
    expect(again.result.current.fields.map((f) => f.name)).toEqual(['North plot']);
    expect(again.result.current.error).toMatch(/^No connection\. Showing the alerts last checked on .+; they may be out of date\.$/);
  });

  test('the gateway being down (503) counts as no signal; the server answering "no" or failing (500, 401) does not', async () => {
    api.getFieldAlerts.mockResolvedValue(ANSWER);
    renderHook(() => useFieldAlerts()).unmount();
    await waitFor(() => expect(readLast('alerts')).not.toBeNull());

    api.getFieldAlerts.mockRejectedValue(answered(503));
    const down = renderHook(() => useFieldAlerts());
    await waitFor(() => expect(down.result.current.fields).toHaveLength(1));
    down.unmount();

    for (const status of [500, 401, 404]) {
      api.getFieldAlerts.mockRejectedValue(answered(status, 'the server says no'));
      const r = renderHook(() => useFieldAlerts());
      await waitFor(() => expect(r.result.current.loading).toBe(false));
      expect(r.result.current.data).toBeNull();
      expect(r.result.current.error).toBe('the server says no');
      r.unmount();
    }
  });

  test('with no signal and nothing kept, it is the plain error, as before', async () => {
    api.getFieldAlerts.mockRejectedValue(NO_SIGNAL);
    const r = renderHook(() => useFieldAlerts());
    await waitFor(() => expect(r.result.current.loading).toBe(false));
    expect(r.result.current.data).toBeNull();
    expect(r.result.current.error).toBe('Check your connection and try again.');
  });

  test('the next person on the phone does not see it: another guest browser, or an account', async () => {
    api.getFieldAlerts.mockResolvedValue(ANSWER);
    renderHook(() => useFieldAlerts()).unmount();
    await waitFor(() => expect(readLast('alerts')).not.toBeNull());
    api.getFieldAlerts.mockRejectedValue(NO_SIGNAL);

    guest('dev-2');
    const other = renderHook(() => useFieldAlerts());
    await waitFor(() => expect(other.result.current.loading).toBe(false));
    expect(other.result.current.data).toBeNull();
    other.unmount();

    localStorage.setItem('token', 't'); localStorage.setItem('user', JSON.stringify({ id: 'u9' }));
    const account = renderHook(() => useFieldAlerts());
    await waitFor(() => expect(account.result.current.loading).toBe(false));
    expect(account.result.current.data).toBeNull();
  });

  test('when the signal returns, a reload replaces the old copy and the note goes', async () => {
    api.getFieldAlerts.mockResolvedValue(ANSWER);
    renderHook(() => useFieldAlerts()).unmount();
    await waitFor(() => expect(readLast('alerts')).not.toBeNull());
    api.getFieldAlerts.mockRejectedValueOnce(NO_SIGNAL);
    const r = renderHook(() => useFieldAlerts());
    await waitFor(() => expect(r.result.current.error).toMatch(/No connection/));
    api.getFieldAlerts.mockResolvedValue({ data: { checkedAt: '2027-02-25T05:00:00Z', fields: [] } });
    await act(async () => { await r.result.current.reload(); });
    expect(r.result.current.error).toBe('');
    expect(r.result.current.fields).toEqual([]);
    expect(readLast('alerts').data.checkedAt).toBe('2027-02-25T05:00:00Z');
  });
});

describe('the log', () => {
  const rec = (id) => ({ _id: id, crop: 'potato', status: 'ok', disease: 'Early_blight', createdAt: '2027-02-24T05:00:00Z' });

  test('the first page is kept, and shown with a note when there is no signal', async () => {
    api.getPredictionHistory.mockResolvedValue({ data: [rec('a'), rec('b')] });
    const first = renderHook(() => useHistory());
    await waitFor(() => expect(first.result.current.items).toHaveLength(2));
    first.unmount();

    api.getPredictionHistory.mockRejectedValue(NO_SIGNAL);
    const again = renderHook(() => useHistory());
    await waitFor(() => expect(again.result.current.loading).toBe(false));
    expect(again.result.current.items.map((i) => i._id)).toEqual(['a', 'b']);
    expect(again.result.current.hasMore).toBe(false);
    expect(again.result.current.error).toMatch(/^No connection/);
  });

  test('loading an older page with no signal does not swap in the first page again', async () => {
    api.getPredictionHistory.mockResolvedValueOnce({ data: Array.from({ length: 50 }, (_, i) => rec(`r${i}`)) });
    const r = renderHook(() => useHistory());
    await waitFor(() => expect(r.result.current.items).toHaveLength(50));
    api.getPredictionHistory.mockRejectedValue(NO_SIGNAL);
    await act(async () => { await r.result.current.more(); });
    expect(r.result.current.items).toHaveLength(50);
    expect(r.result.current.error).toBe('Could not load your checkups. Please try again.');
  });

  test('another owner sees nothing of it', async () => {
    api.getPredictionHistory.mockResolvedValue({ data: [rec('a')] });
    renderHook(() => useHistory()).unmount();
    await waitFor(() => expect(readLast('history')).not.toBeNull());
    guest('dev-2');
    api.getPredictionHistory.mockRejectedValue(NO_SIGNAL);
    const r = renderHook(() => useHistory());
    await waitFor(() => expect(r.result.current.loading).toBe(false));
    expect(r.result.current.items).toEqual([]);
  });
});
