import { beforeEach, expect, test, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

const api = vi.hoisted(() => ({ reply: null, calls: [] }));
vi.mock('../services/api', () => ({
  getFieldHealth: () => new Promise(() => {}),
  getPredictionRisk: async (id) => { api.calls.push(id); return api.reply(); },
}));
import RiskStrip from '../components/RiskStrip';
import ResultCard from '../components/ResultCard';

const dates = ['2026-09-24', '2026-09-25', '2026-09-26', '2026-09-27', '2026-09-28', '2026-09-29'];
const potato = (levels) => ({ data: {
  crop: 'potato', disease: 'late_blight', today: '2026-09-26', weatherSource: 'Weather data by Open-Meteo.com (CC BY 4.0)',
  model: { name: 'INDO-BLIGHTCAST (ICAR-CPRI)', citation: 'Govindakrishnan 2016', url: 'https://doi.example/indo' },
  supporting: { name: 'Wallin severity values / BLITECAST', citation: 'Wallin 1962', url: 'https://umaine.example' },
  days: dates.map((date, i) => ({ date, level: levels[i], forecast: i > 2, conditions: levels[i] && {
    pdays7: 60.2, nightRh7: 610, favourableRun: 3, wallinSV7: 7, rain7mm: 12.5, blitecastInterval: '5-day' } })) } });

beforeEach(() => { api.calls = []; });

test('six days, today marked, the label, and the reasons behind today', async () => {
  const { container } = render(<RiskStrip load={async () => potato(['low', 'medium', 'medium', 'high', 'high', null])} reloadKey="k" />);
  expect(screen.getByRole('status')).toHaveTextContent(/Checking the weather risk/);
  expect(await screen.findByText('Late blight risk (weather)')).toBeInTheDocument();
  const cells = container.querySelectorAll('li[aria-label]');
  expect(cells).toHaveLength(6);
  expect(cells[2]).toHaveTextContent('Today');
  expect(cells[2]).toHaveClass('ring-2');
  expect(cells[0]).toHaveClass('opacity-60'); // past
  expect(cells[3]).toHaveTextContent('High');
  expect(cells[5]).toHaveTextContent('–'); // no answer rather than a guess
  expect(screen.getByText(/not a forecast of infection/)).toBeInTheDocument();
  expect(screen.getByText(/60.2 potato P-days \(needs more than 52.5\).*610 \(needs more than 525\).*3 days in a row/)).toBeInTheDocument();
  expect(screen.getByText(/7 severity values this week, 12.5 mm rain → a 5-day spray interval/)).toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'INDO-BLIGHTCAST (ICAR-CPRI)' })).toHaveAttribute('href', 'https://doi.example/indo');
  expect(screen.getByRole('link', { name: /Open-Meteo.com \(CC BY 4.0\)/ })).toHaveAttribute('href', 'https://open-meteo.com');
});

test('rice shows infection hours and the Padmanabhan streak', async () => {
  const reply = potato(['low', 'low', 'medium', 'low', 'low', 'low']);
  Object.assign(reply.data, { crop: 'rice', disease: 'blast' });
  reply.data.days[2].conditions = { infectionHours: 4, padmanabhanStreak: 5, padmanabhanMet: true };
  render(<RiskStrip load={async () => reply} reloadKey="k" />);
  expect(await screen.findByText('Blast risk (weather)')).toBeInTheDocument();
  expect(screen.getByText(/Infection hours today .*: 4/)).toBeInTheDocument();
  expect(screen.getByText(/: 5 – the Cuttack \(NRRI\) warning condition is met/)).toBeInTheDocument();
});

test('an unavailable weather service says so', async () => {
  render(<RiskStrip load={async () => { throw { response: { data: { message: 'Weather data is unavailable right now.' } } }; }} reloadKey="k" />);
  expect(await screen.findByRole('alert')).toHaveTextContent('Weather data is unavailable right now.');
});

test('the result card shows it only for potato and rice checkups with a location', async () => {
  api.reply = async () => potato(['low', 'low', 'low', 'low', 'low', 'low']);
  const base = { _id: 'p1', status: 'ok', crop: 'potato', disease: 'Late Blight', confidence: 0.9, severity: 'early',
    treatment: 't', yieldLossPercent: 10, imageUrl: 'u' };
  const { rerender } = render(<ResultCard result={{ ...base, locationSource: 'none' }} />);
  rerender(<ResultCard result={{ ...base, crop: 'tomato', locationSource: 'gps' }} />);
  expect(api.calls).toEqual([]);
  rerender(<ResultCard result={{ ...base, locationSource: 'gps' }} />);
  expect(await screen.findByText('Late blight risk (weather)')).toBeInTheDocument();
  expect(api.calls).toEqual(['p1']);
});
