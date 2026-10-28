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

// Phase 6 alerts as GET /api/fields/alerts sends them (server/utils/alertRules.js dry spell, server/services/nearbyDisease.js)
const TODAY = '2027-02-24';
const slot = (t) => ({ t, rain: 0, past: false });
const horizon = { now: 0.7, days: [TODAY, '2027-02-25', '2027-02-26'].map((date) => ({ date, slots: [slot(20), slot(26), slot(34), slot(24)] })) };
const dry = (o = {}) => ({
  id: 'DRY-SPELL-1|2027-02-24', rule: 'DRY-SPELL-1', hazard: 'dry_spell', level: 'warn', date: TODAY, offset: 0, from: '2027-02-24T09:00', to: '2027-02-25T00:00',
  values: { metric: 'dry', value: 15, threshold: 14, levels: { warn: 14, watch: 7 }, series: [{ date: TODAY, value: 15 }, { date: '2027-02-25', value: 16 }, { date: '2027-02-26', value: 17 }] },
  stage: 'flowering', crop: 'rice', confidence: 'medium', reviewStatus: 'draft', ...o,
});
const near = (o = {}) => ({
  id: 'DISEASE-NEAR-1|2027-02-24', rule: 'DISEASE-NEAR-1', hazard: 'disease_near', level: 'watch', date: TODAY, offset: 0, from: '2027-02-24T00:00', to: '2027-02-25T00:00',
  values: { metric: 'reports', value: 6, window: 14, radiusKm: 5 }, disease: 'Late_blight', stage: 'vegetative', crop: 'potato', confidence: 'low', reviewStatus: 'draft', ...o,
});
const field = (o = {}) => ({
  _id: 'f1', name: 'East plot', crop: 'rice', stage: 'flowering', createdAt: '2027-02-01T00:00:00Z', status: 'ok', official: [], today: TODAY, timezone: 'Asia/Kolkata',
  alerts: [dry()], horizon, conditions: { rain7: 0, coldest: { t: 12, date: '2027-02-25' } }, flood: { river: { status: 'disabled' }, gauge: { status: 'disabled' }, radar: { status: 'disabled' } }, ...o,
});
const answer = (...fields) => ({ data: { checkedAt: '2027-02-24T05:00:00Z', weatherSource: 'Weather data by Open-Meteo.com', officialSources: [], fields } });
const open = () => render(<MemoryRouter initialEntries={['/overview?mode=weather']}><Overview /></MemoryRouter>);

beforeEach(() => {
  localStorage.clear();
  Object.values(api).forEach((f) => f.mockReset());
  api.getFields.mockResolvedValue({ data: [] });
  api.getFieldNews.mockResolvedValue({ data: { state: 'Punjab', crop: 'rice', items: [], links: { national: [], state: [] }, sources: [] } });
});
afterEach(async () => { await i18n.changeLanguage('en'); localStorage.clear(); });

describe('dry spell', () => {
  test('the main alert says how many dry days, and the chart is in days with its two lines', async () => {
    api.getFieldAlerts.mockResolvedValue(answer(field()));
    open();
    const head = await screen.findByRole('heading', { level: 3 });
    expect(head).toHaveTextContent('Dry spell: 15 dry days in a row (Today). Irrigate if you can');
    expect(screen.getByText('Dry days in a row')).toBeInTheDocument();
    expect(screen.getByText('days')).toBeInTheDocument();
    expect(screen.getByRole('img', { name: /15 days, .* 16 days, .* 17 days/ })).toBeInTheDocument();
    expect(screen.getByText(/Warning 14/)).toBeInTheDocument();
    expect(screen.getByText(/Watch 7/)).toBeInTheDocument();
    expect(screen.getByText('Dry spell · East plot · Flowering')).toBeInTheDocument();
  });

  test('"Why this alert?" names the 2.5 mm day, the level and IMD', async () => {
    api.getFieldAlerts.mockResolvedValue(answer(field()));
    open();
    (await screen.findByRole('button', { name: 'Why this alert?' })).click();
    expect(await screen.findByText(/A dry day is a day with less than 2\.5 mm of rain\. 15 in a row is past 14/)).toBeInTheDocument();
    expect(screen.getByText(/IMD counts dry spells at 7 and 14 days/)).toBeInTheDocument();
  });

  test('"Why this alert?" says draft until the reviewer has signed the rule off, then says it was checked', async () => {
    api.getFieldAlerts.mockResolvedValue(answer(field()));
    const { unmount } = open();
    (await screen.findByRole('button', { name: 'Why this alert?' })).click();
    expect(await screen.findByText('Rule DRY-SPELL-1, draft: an expert has not reviewed it yet')).toBeInTheDocument();
    unmount();
    api.getFieldAlerts.mockResolvedValue(answer(field({ alerts: [dry({ reviewStatus: 'reviewed' })] })));
    open();
    (await screen.findByRole('button', { name: 'Why this alert?' })).click();
    expect(await screen.findByText('Rule DRY-SPELL-1, checked by an expert')).toBeInTheDocument();
    expect(screen.queryByText('Rule DRY-SPELL-1, draft: an expert has not reviewed it yet')).not.toBeInTheDocument();
  });

  test('the young-crop rule has its own words', async () => {
    api.getFieldAlerts.mockResolvedValue(answer(field({ stage: 'vegetative', alerts: [dry({ id: 'DRY-SPELL-2|2027-02-24', rule: 'DRY-SPELL-2', level: 'watch', stage: 'vegetative', values: { ...dry().values, threshold: 14, levels: { watch: 14 } } })] })));
    open();
    expect(await screen.findByRole('heading', { level: 3 })).toHaveTextContent('Check the soil moisture, and irrigate if the crop is wilting.');
  });

  test('Hindi: the sentence, the chart label and the hazard', async () => {
    await i18n.changeLanguage('hi');
    api.getFieldAlerts.mockResolvedValue(answer(field()));
    open();
    expect(await screen.findByRole('heading', { level: 3 })).toHaveTextContent('सूखा दौर: लगातार 15 दिन से बारिश नहीं');
    expect(screen.getByText('लगातार सूखे दिन')).toBeInTheDocument();
    expect(screen.getByText(/सूखा दौर · /)).toBeInTheDocument();
  });
});

describe('disease reports near the field', () => {
  const potato = (o = {}) => field({ crop: 'potato', stage: 'vegetative', alerts: [near()], ...o });

  test('a panel with the number of phones, the disease in the reader\'s words, the caveat and a link to the disease map', async () => {
    api.getFieldAlerts.mockResolvedValue(answer(potato()));
    open();
    expect(await screen.findByRole('heading', { level: 3 })).toHaveTextContent('Other farmers near you found Late blight on potato in the last 14 days. Look at your own plants soon.');
    const panel = within(screen.getByText('Reports near your field').parentElement);
    expect(panel.getByText('6 phones')).toBeInTheDocument();
    expect(panel.getByText('checked a potato leaf in the last 14 days, within about 5 km, and the AI read Late blight.')).toBeInTheDocument();
    expect(panel.getByText(/not confirmed by a lab/)).toBeInTheDocument();
    expect(panel.getByRole('link', { name: 'See the disease map' })).toHaveAttribute('href', '/map');
    expect(screen.getByText('Reports near you')).toBeInTheDocument(); // the source chip: not "Model forecast"
    expect(screen.queryByText('Model forecast')).not.toBeInTheDocument();
    expect(screen.queryByRole('img', { name: /days|mm/ })).not.toBeInTheDocument(); // no chart: there is no daily number
  });

  test('a lower alert in the list shows its words and level like any other', async () => {
    api.getFieldAlerts.mockResolvedValue(answer(potato({ alerts: [dry({ crop: 'potato' }), near({ level: 'info' })] })));
    open();
    expect(await screen.findByText(/Other farmers near you found Late blight on potato/)).toBeInTheDocument();
    expect(screen.getAllByText('Tip').length).toBeGreaterThan(0);
  });

  test('Hindi: the disease and the crop are the Hindi names', async () => {
    await i18n.changeLanguage('hi');
    api.getFieldAlerts.mockResolvedValue(answer(potato()));
    open();
    expect(await screen.findByRole('heading', { level: 3 })).toHaveTextContent('आपके पास के किसानों ने पिछले 14 दिनों में आलू में पछेती झुलसा पाया है।');
    expect(screen.getByText('6 फ़ोन')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'बीमारी का नक्शा देखें' })).toBeInTheDocument();
  });
});
