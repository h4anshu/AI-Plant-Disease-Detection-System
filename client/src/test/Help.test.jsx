import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import i18n from '../i18n';

const api = vi.hoisted(() => ({ getFieldAlerts: vi.fn(), getFields: vi.fn(), getFieldNews: vi.fn(), sendAlertFeedback: vi.fn() }));
vi.mock('../services/api', () => ({
  getPredictionHistory: async () => ({ data: [] }),
  getPredictionRisk: async () => ({ data: {} }),
  getDeviceId: () => 'abcd1234-0000-0000-0000-1234567890ab',
  getFieldAlerts: api.getFieldAlerts,
  getFields: api.getFields,
  getFieldNews: api.getFieldNews,
  getFieldPrices: async () => ({ data: { status: 'disabled' } }),
  sendAlertFeedback: api.sendAlertFeedback,
  getFloodExtent: vi.fn(),
  updateField: vi.fn(),
}));
vi.mock('../services/location', () => ({ getLocation: vi.fn() }));

import Overview from '../pages/Overview';

// "Did this help?" under the main alert (server/controllers/fieldController.js giveAlertFeedback)
const TODAY = '2027-02-24';
const slot = (t) => ({ t, rain: 0, past: false });
const horizon = { now: 0.7, days: [TODAY, '2027-02-25', '2027-02-26'].map((date) => ({ date, slots: [slot(1.4), slot(14), slot(22), slot(15)] })) };
const frost = (o = {}) => ({
  id: 'FROST-WHEAT-1|2027-02-25', rule: 'FROST-WHEAT-1', hazard: 'frost', level: 'warn', date: '2027-02-25', offset: 1, from: '2027-02-25T00:00', to: '2027-02-25T07:00',
  values: { metric: 'tmin', value: 1.4, threshold: 2, levels: { warn: 2, watch: 4 }, series: [{ date: TODAY, value: 6 }, { date: '2027-02-25', value: 1.4 }, { date: '2027-02-26', value: 7 }] },
  stage: 'flowering', crop: 'wheat', confidence: 'medium', reviewStatus: 'draft', ...o,
});
const rain = () => ({ id: 'RAIN-HEAVY-1|2027-02-26', rule: 'RAIN-HEAVY-1', hazard: 'rain_heavy', level: 'watch', date: '2027-02-26', offset: 2, from: '2027-02-26T12:00', to: '2027-02-26T20:00',
  values: { metric: 'rain', value: 44, threshold: 40, levels: { warn: 64.5, watch: 40 }, series: [{ date: TODAY, value: 0 }, { date: '2027-02-25', value: 2 }, { date: '2027-02-26', value: 44 }] }, stage: 'flowering', crop: 'wheat', confidence: 'low', reviewStatus: 'draft' });
const field = (o = {}) => ({
  _id: 'f1', name: 'North plot', crop: 'wheat', stage: 'flowering', createdAt: '2027-02-01T00:00:00Z', status: 'ok', official: [], today: TODAY, timezone: 'Asia/Kolkata',
  alerts: [frost(), rain()], horizon, conditions: { rain7: 12, coldest: { t: 1.4, date: '2027-02-25' } }, flood: { river: { status: 'disabled' }, gauge: { status: 'disabled' }, radar: { status: 'disabled' } }, ...o,
});
const answer = (...fields) => ({ data: { checkedAt: '2027-02-24T05:00:00Z', weatherSource: 'Weather data by Open-Meteo.com', officialSources: [], fields } });
const open = () => render(<MemoryRouter initialEntries={['/overview?mode=weather']}><Overview /></MemoryRouter>);

beforeEach(() => {
  localStorage.clear();
  Object.values(api).forEach((f) => f.mockReset());
  api.getFields.mockResolvedValue({ data: [] });
  api.getFieldNews.mockResolvedValue({ data: { state: null, crop: 'wheat', items: [], links: { national: [], state: [] }, sources: [] } });
  api.getFieldAlerts.mockResolvedValue(answer(field()));
  api.sendAlertFeedback.mockResolvedValue({ data: { saved: 1 } });
});
afterEach(async () => { await i18n.changeLanguage('en'); localStorage.clear(); });

describe('Did this help?', () => {
  test('three plain answers under the main alert, and only there', async () => {
    open();
    const group = await screen.findByRole('group', { name: 'Did this help?' });
    expect(group).toBeInTheDocument();
    expect(screen.getAllByRole('group', { name: 'Did this help?' })).toHaveLength(1);          // not under the alerts listed below
    for (const name of ['I acted on it', 'Not needed', 'It was wrong']) expect(screen.getByRole('button', { name })).toBeEnabled();
  });

  test('an answer goes to the server with the alert, its level and the field; then a thank-you replaces the buttons', async () => {
    open();
    fireEvent.click(await screen.findByRole('button', { name: 'I acted on it' }));
    expect(await screen.findByText('Thank you. Your answer helps us judge this alert.')).toBeInTheDocument();
    expect(api.sendAlertFeedback).toHaveBeenCalledWith('f1', { alertId: 'FROST-WHEAT-1|2027-02-25', level: 'warn', answer: 'acted' });
    expect(screen.queryByRole('button', { name: 'Not needed' })).not.toBeInTheDocument();
  });

  test('the answer is remembered on this device, so the question is not asked again after a reload', async () => {
    const { unmount } = open();
    fireEvent.click(await screen.findByRole('button', { name: 'It was wrong' }));
    await screen.findByText(/Thank you/);
    unmount();
    open();
    expect(await screen.findByText(/Thank you/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'It was wrong' })).not.toBeInTheDocument();
    expect(api.sendAlertFeedback).toHaveBeenCalledTimes(1);
  });

  test('"Change answer" brings the buttons back, and a new answer is sent', async () => {
    open();
    fireEvent.click(await screen.findByRole('button', { name: 'Not needed' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Change answer' }));
    fireEvent.click(await screen.findByRole('button', { name: 'I acted on it' }));
    await waitFor(() => expect(api.sendAlertFeedback).toHaveBeenCalledTimes(2));
    expect(api.sendAlertFeedback).toHaveBeenLastCalledWith('f1', expect.objectContaining({ answer: 'acted' }));
  });

  test('a failure says so, keeps the buttons and remembers nothing', async () => {
    api.sendAlertFeedback.mockRejectedValue(new Error('offline'));
    open();
    fireEvent.click(await screen.findByRole('button', { name: 'I acted on it' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Your answer could not be saved. Please try again.');
    expect(screen.getByRole('button', { name: 'I acted on it' })).toBeEnabled();
    expect(localStorage.getItem('alertHelp')).toBeNull();
  });

  test('a new alert (another date) is asked about again; the old answer stays for the old one', async () => {
    const { unmount } = open();
    fireEvent.click(await screen.findByRole('button', { name: 'I acted on it' }));
    await screen.findByText(/Thank you/);
    unmount();
    api.getFieldAlerts.mockResolvedValue(answer(field({ alerts: [frost({ id: 'FROST-WHEAT-1|2027-02-26', date: '2027-02-26', offset: 2 })] })));
    open();
    expect(await screen.findByRole('button', { name: 'I acted on it' })).toBeInTheDocument();
  });

  test('Hindi', async () => {
    await i18n.changeLanguage('hi');
    open();
    expect(await screen.findByRole('group', { name: 'क्या इससे मदद मिली?' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'मैंने इस पर काम किया' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'ज़रूरत नहीं थी' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'यह ग़लत था' })).toBeInTheDocument();
  });
});
