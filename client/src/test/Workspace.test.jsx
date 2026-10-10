import { beforeEach, describe, expect, test, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

const api = vi.hoisted(() => ({ history: [], predicted: null }));
vi.mock('../services/api', () => ({
  getPredictionHistory: async () => ({ data: api.history }),
  getPredictionRisk: async () => ({ data: {} }),
  predictDisease: async () => ({ data: api.predicted }),
  getPrediction: async () => ({ data: api.predicted }),
  getDeviceId: () => 'abcd1234-0000-0000-0000-1234567890ab',
  deleteMyData: async () => ({ data: { deleted: 0 } }),
}));
import { levelOf, needsAttention } from '../components/workspace/status';
import Overview from '../pages/Overview';
import History from '../pages/History';
import Predict from '../pages/Predict';

const DAY = 864e5;
const rec = (id, o) => ({ _id: id, imageUrl: 'u', crop: 'potato', status: 'ok', disease: 'Early_blight', confidence: 0.9, severity: 'moderate',
  yieldLossPercent: 18, createdAt: new Date(Date.now() - 2 * DAY).toISOString(), locationSource: 'none', ...o });
const at = (ui) => render(<MemoryRouter>{ui}</MemoryRouter>);

describe('status of a saved checkup', () => {
  test('gated outcomes are "retake", healthy is healthy, old records without a status count as diagnoses', () => {
    expect(levelOf({ status: 'rejected_quality' })).toBe('retake');
    expect(levelOf({ status: 'uncertain', severity: 'severe' })).toBe('retake');
    expect(levelOf({ severity: 'healthy' })).toBe('healthy');
    expect(levelOf({ disease: 'Healthy', severity: 'early' })).toBe('healthy');
    expect(levelOf({ severity: 'severe' })).toBe('severe');
    expect(needsAttention({ severity: 'moderate' })).toBe(true);
    expect(needsAttention({ status: 'not_leaf' })).toBe(false);
  });
});

describe('workspace pages', () => {
  beforeEach(() => { api.history = []; api.predicted = null; localStorage.clear(); });

  test('overview counts from the history: a moderate result needing a recheck is listed, and a newer check of the same crop clears it', async () => {
    api.history = [rec('a', {}), rec('b', { crop: 'rice', disease: 'Healthy', severity: 'healthy', yieldLossPercent: 0 })];
    const { unmount } = at(<Overview />);
    expect(await screen.findByText(/1 leaf needs a second look/)).toBeInTheDocument();
    expect(screen.getByText(/Recheck due/)).toBeInTheDocument();
    unmount();
    api.history = [rec('new', { createdAt: new Date().toISOString(), severity: 'healthy', disease: 'Healthy', yieldLossPercent: 0 }), rec('a', {})];   // the same crop checked again since
    at(<Overview />);
    expect(await screen.findByText(/Everything you checked looks fine/)).toBeInTheDocument();
  });

  test('field log: the status tabs filter and carry counts', async () => {
    api.history = [rec('a', {}), rec('b', { severity: 'healthy', disease: 'Healthy' }), rec('c', { status: 'rejected_quality', disease: undefined })];
    at(<History />);
    expect(await screen.findByRole('tab', { name: /Needs attentions*1/ })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('tab', { name: /Healthys*1/ }));
    expect(screen.getAllByRole('link', { name: /Healthy/ })).toHaveLength(1);
    fireEvent.click(screen.getByRole('tab', { name: /Retakes*1/ }));
    expect(screen.getByText('Photo not clear enough')).toBeInTheDocument();
  });

  test('a saved result opens as its own checkup page', async () => {
    api.predicted = { ...rec('xyz', {}), crop: 'rice' };
    const { container } = render(
      <MemoryRouter initialEntries={['/predict']}>
        <Routes><Route path="/predict" element={<Predict />} /><Route path="/checkup/:id" element={<p>checkup page</p>} /></Routes>
      </MemoryRouter>);
    fireEvent.change(container.querySelector('input[type="file"]'), { target: { files: [new File(['x'], 'leaf.jpg', { type: 'image/jpeg' })] } });
    fireEvent.click(screen.getByRole('button', { name: /analyze/i }));
    expect(await screen.findByText('checkup page')).toBeInTheDocument();
  });
});
