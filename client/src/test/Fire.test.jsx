import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import i18n from '../i18n';

const api = vi.hoisted(() => ({ getFieldAlerts: vi.fn(), getFields: vi.fn(), getFieldNews: vi.fn() }));
vi.mock('../services/api', () => ({
  getPredictionHistory: async () => ({ data: [] }),
  getPredictionRisk: async () => ({ data: {} }),
  getDeviceId: () => 'abcd1234-0000-0000-0000-1234567890ab',
  getFieldAlerts: api.getFieldAlerts,
  getFields: api.getFields,
  getFieldNews: api.getFieldNews,
  getFieldPrices: async () => ({ data: { status: 'disabled' } }),
  getFloodExtent: vi.fn(),
  updateField: vi.fn(),
}));
vi.mock('../services/location', () => ({ getLocation: vi.fn() }));

import Overview from '../pages/Overview';

// The fire alert as GET /api/fields/alerts sends it (server/services/fire.js): a count, a distance band and a time, no coordinates
const TODAY = '2027-02-24';
const slot = (t) => ({ t, rain: 0, past: false });
const horizon = { now: 0.7, days: [TODAY, '2027-02-25', '2027-02-26'].map((date) => ({ date, slots: [slot(8), slot(14), slot(25), slot(15)] })) };
const fire = (o = {}) => ({
  id: 'FIRE-NEAR-1|2027-02-24', rule: 'FIRE-NEAR-1', hazard: 'fire_near', level: 'warn', date: TODAY, offset: 0, from: '2027-02-24T00:00', to: '2027-02-25T00:00',
  values: { metric: 'fire', count: 2, nearKm: 1, newest: '2027-02-24T01:56:00.000Z', window: 24, radiusKm: 5 }, stage: 'grain_fill', crop: 'wheat', confidence: 'medium', reviewStatus: 'draft', ...o,
});
const field = (o = {}) => ({
  _id: 'f1', name: 'West plot', crop: 'wheat', stage: 'grain_fill', createdAt: '2027-02-01T00:00:00Z', status: 'ok', official: [], today: TODAY, timezone: 'Asia/Kolkata',
  alerts: [fire()], horizon, conditions: { rain7: 12, coldest: { t: 8, date: '2027-02-25' } }, fire: { status: 'ok' },
  flood: { river: { status: 'disabled' }, gauge: { status: 'disabled' }, radar: { status: 'disabled' } }, ...o,
});
const answer = (...fields) => ({ data: { checkedAt: '2027-02-24T05:00:00Z', weatherSource: 'Weather data by Open-Meteo.com', officialSources: [], fields } });
const open = () => render(<MemoryRouter initialEntries={['/overview?mode=weather']}><Overview /></MemoryRouter>);

beforeEach(() => {
  localStorage.clear();
  Object.values(api).forEach((f) => f.mockReset());
  api.getFields.mockResolvedValue({ data: [] });
  api.getFieldNews.mockResolvedValue({ data: { state: null, crop: 'wheat', items: [], links: { national: [], state: [] }, sources: [] } });
});
afterEach(async () => { await i18n.changeLanguage('en'); localStorage.clear(); });

describe('fire near the field', () => {
  test('the sentence, the hot-spot panel, the satellite chip, the caveat and the link to NASA\'s map', async () => {
    api.getFieldAlerts.mockResolvedValue(answer(field()));
    open();
    expect(await screen.findByRole('heading', { level: 3 })).toHaveTextContent('A fire was seen by satellite within 1 km of your field in the last 24 hours. Check around your field now, and if smoke or flames come close, call 101.');
    const panel = within(screen.getByText('Satellite fire detections').parentElement);
    expect(panel.getByText('2 hot spots')).toBeInTheDocument();
    expect(panel.getByText(/within about 1 km of your field, the last one seen /)).toBeInTheDocument();
    expect(panel.getByText(/no alert here does not mean there is no fire/)).toBeInTheDocument();
    const link = panel.getByRole('link', { name: 'Open NASA’s fire map' });
    expect(link).toHaveAttribute('href', 'https://firms.modaps.eosdis.nasa.gov/map/');
    expect(link).toHaveAttribute('target', '_blank');
    expect(link.getAttribute('rel')).toMatch(/noopener/);
    expect(screen.getByText('Satellite (NASA FIRMS)')).toBeInTheDocument();
    expect(screen.queryByText('Model forecast')).not.toBeInTheDocument();
    expect(screen.queryByRole('img', { name: /days|mm/ })).not.toBeInTheDocument(); // no chart
  });

  test('"Why this alert?" says what a satellite cannot see and that only the area, not the field\'s place, goes to NASA', async () => {
    api.getFieldAlerts.mockResolvedValue(answer(field({ alerts: [fire({ level: 'watch', values: { ...fire().values, nearKm: 3, count: 4 } })] })));
    open();
    (await screen.findByRole('button', { name: 'Why this alert?' })).click();
    expect(await screen.findByText(/NASA satellites saw 4 hot spots within 5 km of your field, the nearest within 3 km/)).toBeInTheDocument();
    expect(screen.getByText(/not its exact place/)).toBeInTheDocument();
  });

  test('when the fire check could not be loaded the screen says so, so that no alert is not read as no fire', async () => {
    api.getFieldAlerts.mockResolvedValue(answer(field({ alerts: [], fire: { status: 'unavailable' } })));
    open();
    expect(await screen.findByText('The satellite fire check could not be loaded right now, so a missing fire alert does not mean there is no fire.')).toBeInTheDocument();
  });

  test('status ok or disabled: no such note', async () => {
    api.getFieldAlerts.mockResolvedValue(answer(field({ alerts: [], fire: { status: 'ok' } }), field({ _id: 'f2', name: 'East plot', alerts: [], fire: { status: 'disabled' } })));
    open();
    await screen.findAllByText(/West plot/);
    expect(screen.queryByText(/satellite fire check could not be loaded/)).not.toBeInTheDocument();
  });

  test('Hindi: the sentence, the panel and the chip', async () => {
    await i18n.changeLanguage('hi');
    api.getFieldAlerts.mockResolvedValue(answer(field()));
    open();
    expect(await screen.findByRole('heading', { level: 3 })).toHaveTextContent('पिछले 24 घंटों में आपके खेत से 1 किमी के भीतर सैटेलाइट ने आग देखी है।');
    expect(screen.getByText('2 गर्म जगहें')).toBeInTheDocument();
    expect(screen.getByText('सैटेलाइट (NASA FIRMS)')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'NASA का आग का नक्शा खोलें' })).toBeInTheDocument();
  });
});
