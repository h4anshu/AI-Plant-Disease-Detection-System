import { beforeEach, expect, test, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const api = vi.hoisted(() => ({ getFieldAlerts: vi.fn(), getPredictionHistory: vi.fn() }));
vi.mock('../services/api', () => ({
  ...api,
  getPredictionRisk: async () => ({ data: {} }),
  getDeviceId: () => 'abcd1234-0000-0000-0000-1234567890ab',
  getFieldPrices: async () => ({ data: { status: 'disabled' } }),
  getFieldNews: async () => ({ data: { items: [], links: [], sources: [] } }),
  getFields: async () => ({ data: [] }),
  updateField: async () => ({ data: {} }),
}));
import Overview from '../pages/Overview';

// "No alert" must never be said from an old copy as if it were today's (docs/OFFLINE.md)
const FIELD = { _id: 'f1', name: 'North plot', crop: 'wheat', stage: 'flowering', status: 'ok', alerts: [], horizon: { now: 0, days: [] }, conditions: {},
  flood: { river: { status: 'disabled' }, gauge: { status: 'disabled' }, radar: { status: 'disabled' } }, fire: { status: 'disabled' }, createdAt: '2027-02-01T00:00:00Z' };
const ANSWER = { data: { checkedAt: new Date().toISOString(), officialSources: [], fields: [FIELD] } };
const NO_SIGNAL = Object.assign(new Error('Network Error'), { code: 'ERR_NETWORK' });
const open = () => render(<MemoryRouter><Overview /></MemoryRouter>);

beforeEach(() => {
  localStorage.clear();
  localStorage.setItem('deviceId', 'dev-1');
  localStorage.setItem('overviewMode', 'weather');
  api.getPredictionHistory.mockResolvedValue({ data: [] });
});

test('today\'s answer: "No alert"', async () => {
  api.getFieldAlerts.mockResolvedValue(ANSWER);
  open();
  expect(await screen.findByText('No weather alert ahead.')).toBeInTheDocument();
  expect(screen.getAllByText('No alert').length).toBeGreaterThan(0);          // the tab and the card of the field
  expect(screen.queryByText('Old copy')).not.toBeInTheDocument();
});

test('the same answer shown from the copy kept on the phone is an "Old copy", with the time it was seen, and never "No alert"', async () => {
  api.getFieldAlerts.mockResolvedValue(ANSWER);
  open().unmount();
  await screen.findByText('No weather alert ahead.').catch(() => {});
  api.getFieldAlerts.mockRejectedValue(NO_SIGNAL);
  open();
  expect(await screen.findByText('The last copy shows no alert, but it may be out of date.')).toBeInTheDocument();
  expect(screen.queryByText('No alert')).not.toBeInTheDocument();             // neither the tab nor the card
  expect(screen.queryByText('No weather alert ahead.')).not.toBeInTheDocument();
  expect(screen.getByText('No alert in the last copy')).toBeInTheDocument();
  expect(screen.getAllByText('Old copy').length).toBe(2);
  expect(screen.getByText(/No connection\. Showing the alerts last checked on/)).toBeInTheDocument();
  expect(screen.getAllByText('North plot').length).toBeGreaterThan(0);
});
