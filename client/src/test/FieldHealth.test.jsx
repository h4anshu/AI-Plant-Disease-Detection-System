import { beforeEach, expect, test, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';

const api = vi.hoisted(() => ({ reply: null, calls: [] }));
vi.mock('../services/api', () => ({
  getFieldHealth: async (id) => { api.calls.push(id); return api.reply(); },
}));
import FieldHealth from '../components/FieldHealth';
import ResultCard from '../components/ResultCard';

const row = (date, ndvi, extra = {}) => ({ date, used: true, clear_fraction: 1, ndvi, ndre: ndvi / 2, z: 0,
  neighbours: { enough: true, pixels: 5000, ndvi: [0.5, 0.6, 0.7], ndre: [0.25, 0.3, 0.35] }, ...extra });
const answer = (flag, extra = {}) => ({ data: {
  window: { start: '2026-05-29', end: '2026-09-26' }, geometry_source: 'buffer_30m', images: 31, clear_images: 3,
  last_clear_date: '2026-09-25', flag, series: [row('2026-08-16', 0.7), row('2026-09-13', 0.6), row('2026-09-25', 0.4)], ...extra } });

beforeEach(() => { api.calls = []; });

test('loads only when asked, then shows the verdict, the chart and what the satellite can and cannot tell', async () => {
  api.reply = async () => answer({ code: 'below', since: '2026-09-13', stale: false });
  const { container } = render(<FieldHealth predictionId="p1" crop="rice" />);
  expect(api.calls).toEqual([]); // no Earth Engine quota spent until the user asks
  fireEvent.click(screen.getByRole('button', { name: 'See this field from space' }));
  expect(screen.getByRole('status')).toHaveTextContent(/Checking satellite images/);
  expect(await screen.findByText(/Below neighbouring fields since/)).toHaveClass('text-clay');
  expect(api.calls).toEqual(['p1']);
  expect(screen.getByRole('img', { name: /Greenness of your field/ })).toBeInTheDocument();
  expect(container.querySelectorAll('polyline')).toHaveLength(2); // NDVI + NDRE
  expect(container.querySelector('polygon')).not.toBeNull(); // neighbours' band
  expect(screen.getByText(/not which disease/)).toBeInTheDocument();
  expect(screen.getByText(/30 m circle/)).toBeInTheDocument();
  expect(screen.queryByText(/REDSI/)).toBeNull(); // wheat only
});

test('cloudy season: says so instead of drawing an empty chart', async () => {
  api.reply = async () => answer({ code: 'no_clear', since: null, stale: true },
    { series: [{ ...row('2026-07-20', null), used: false }], clear_images: 0, last_clear_date: null });
  const { container } = render(<FieldHealth predictionId="p1" crop="rice" />);
  fireEvent.click(screen.getByRole('button', { name: 'See this field from space' }));
  expect(await screen.findByText(/No clear satellite view/)).toBeInTheDocument();
  expect(container.querySelector('svg')).toBeNull();
});

test('wheat adds the experimental REDSI chart', async () => {
  api.reply = async () => answer({ code: 'normal', since: null, stale: false },
    { series: [row('2026-09-13', 0.6, { redsi: 3.1 }), row('2026-09-25', 0.62, { redsi: 2.8 })] });
  render(<FieldHealth predictionId="p1" crop="wheat" />);
  fireEvent.click(screen.getByRole('button', { name: 'See this field from space' }));
  expect(await screen.findByText(/REDSI, experimental/)).toBeInTheDocument();
  expect(screen.getByText(/Not a diagnosis/)).toBeInTheDocument();
});

test('a server error message is shown', async () => {
  api.reply = async () => { throw Object.assign(new Error('x'), { response: { data: { message: 'The satellite service is busy.' } } }); };
  render(<FieldHealth predictionId="p1" crop="rice" />);
  fireEvent.click(screen.getByRole('button', { name: 'See this field from space' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('The satellite service is busy.');
});

test('the result card offers it only for checkups with a location', () => {
  const base = { _id: 'p1', status: 'ok', crop: 'rice', disease: 'Blast', confidence: 0.9, severity: 'early',
    treatment: 't', yieldLossPercent: 10, imageUrl: 'u' };
  const { rerender } = render(<ResultCard result={{ ...base, locationSource: 'none' }} />);
  expect(screen.queryByRole('button', { name: 'See this field from space' })).toBeNull();
  rerender(<ResultCard result={{ ...base, locationSource: 'gps' }} />);
  expect(screen.getByRole('button', { name: 'See this field from space' })).toBeInTheDocument();
});
