import { beforeEach, expect, test, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const api = vi.hoisted(() => ({ saved: [], checkups: [], getFieldAlerts: vi.fn(), getPredictionHistory: vi.fn() }));
vi.mock('../services/api', () => ({
  getPredictionHistory: (...a) => api.getPredictionHistory(...a),
  getFieldAlerts: (...a) => api.getFieldAlerts(...a),
  getSavedFieldHealth: async (id) => { api.saved.push(id); return ANSWER; },
  getFieldHealth: async (id) => { api.checkups.push(id); return ANSWER; },
  getPredictionRisk: async () => ({ data: {} }),
  getDeviceId: () => 'abcd1234-0000-0000-0000-1234567890ab',
  getFieldPrices: async () => ({ data: { status: 'disabled' } }),
  getFieldNews: async () => ({ data: { items: [], links: [], sources: [] } }),
  getFields: async () => ({ data: [] }),
  updateField: async () => ({ data: {} }),
}));
import CropHealthCard from '../components/workspace/CropHealthCard';
import FieldHealth from '../components/FieldHealth';
import Overview from '../pages/Overview';

// The crop health of a SAVED field (docs/CROP_HEALTH.md): the same view as a checkup's "see this field from space", on request only
const row = (date, ndvi) => ({ date, used: true, clear_fraction: 1, ndvi, ndre: ndvi / 2, z: 0, neighbours: { enough: true, pixels: 5000, ndvi: [0.5, 0.6, 0.7], ndre: [0.25, 0.3, 0.35] } });
const ANSWER = { data: { window: { start: '2026-06-29', end: '2026-10-29' }, geometry_source: 'buffer_30m', images: 20, clear_images: 12, last_clear_date: '2026-10-25',
  flag: { code: 'below', since: '2026-10-10', stale: false }, series: [row('2026-09-13', 0.6), row('2026-10-25', 0.4)] } };
const field = (o = {}) => ({ _id: 'f1', name: 'North plot', crop: 'wheat', stage: 'flowering', status: 'ok', alerts: [], official: [], horizon: { now: 0, days: [] }, conditions: {},
  flood: { river: { status: 'disabled' }, gauge: { status: 'disabled' }, radar: { status: 'disabled' } }, fire: { status: 'disabled' }, createdAt: '2027-02-01T00:00:00Z', ...o });

beforeEach(() => { api.saved = []; api.checkups = []; localStorage.clear(); });

test('FieldHealth of a saved field asks for the field, not for a checkup', async () => {
  render(<FieldHealth fieldId="f1" crop="wheat" />);
  expect(api.saved).toEqual([]);                                                  // nothing until the button
  fireEvent.click(screen.getByRole('button', { name: 'See this field from space' }));
  expect(await screen.findByText(/Below neighbouring fields since/)).toBeInTheDocument();
  expect(api.saved).toEqual(['f1']);
  expect(api.checkups).toEqual([]);
});

test('FieldHealth of a checkup is unchanged', async () => {
  render(<FieldHealth predictionId="p1" crop="wheat" />);
  fireEvent.click(screen.getByRole('button', { name: 'See this field from space' }));
  await screen.findByText(/Below neighbouring fields since/);
  expect(api.checkups).toEqual(['p1']);
  expect(api.saved).toEqual([]);
});

test('the card names the field, spends nothing until asked, and starts afresh when another field is chosen', async () => {
  const { rerender } = render(<CropHealthCard field={field()} name="North plot" />);
  expect(screen.getByRole('heading', { name: 'Crop health from space: North plot' })).toBeInTheDocument();
  expect(api.saved).toEqual([]);
  fireEvent.click(screen.getByRole('button', { name: 'See this field from space' }));
  await screen.findByText(/Below neighbouring fields since/);
  rerender(<CropHealthCard field={field({ _id: 'f2', name: 'East plot' })} name="East plot" />);
  expect(screen.getByRole('heading', { name: 'Crop health from space: East plot' })).toBeInTheDocument();
  expect(screen.queryByText(/Below neighbouring fields since/)).not.toBeInTheDocument();    // the first field's answer is not shown under the second
  fireEvent.click(screen.getByRole('button', { name: 'See this field from space' }));
  await screen.findByText(/Below neighbouring fields since/);
  expect(api.saved).toEqual(['f1', 'f2']);
});

test('it is on the Weather & Alerts page, for the selected field', async () => {
  localStorage.setItem('overviewMode', 'weather');
  api.getPredictionHistory.mockResolvedValue({ data: [] });
  api.getFieldAlerts.mockResolvedValue({ data: { checkedAt: new Date().toISOString(), officialSources: [], fields: [field(), field({ _id: 'f2', name: 'East plot', crop: 'rice' })] } });
  render(<MemoryRouter><Overview /></MemoryRouter>);
  expect(await screen.findByRole('heading', { name: 'Crop health from space: North plot' })).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: /East plot/ }));
  expect(await screen.findByRole('heading', { name: 'Crop health from space: East plot' })).toBeInTheDocument();
});
