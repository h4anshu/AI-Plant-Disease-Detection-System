import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import axe from 'axe-core';
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
  sendAlertFeedback: vi.fn(),
  getFloodExtent: vi.fn(),
  updateField: vi.fn(),
  createField: vi.fn(),
}));
vi.mock('../services/location', () => ({ getLocation: vi.fn() }));

// Leaflet needs a real browser; the map's own accessibility is the library's
vi.mock('../components/workspace/LocationPicker', () => ({ default: ({ onPick }) => <button type="button" onClick={() => onPick({ lat: 30.9, lon: 75.85, source: 'map' })}>pin the field</button> }));

import Overview from '../pages/Overview';
import FieldNew from '../pages/FieldNew';
import Privacy from '../pages/Privacy';
import WorkspaceLayout from '../components/workspace/WorkspaceLayout';

// An automated accessibility check (axe-core: names, roles, labels, headings, landmarks, duplicate ids, link purpose, tap targets that it can
// measure) of the Weather & Alerts screen in each of its main states, in English and Hindi. jsdom has no layout and no colours, so colour
// contrast and real tap-target sizes are checked in a real browser instead (docs/FIELD_ALERTS.md, "Operations"). It cannot judge whether
// the words are understandable: that is what the farmer sessions are for.
const TODAY = '2027-02-24';
const slot = (t) => ({ t, rain: 0, past: false });
const horizon = { now: 0.7, days: [TODAY, '2027-02-25', '2027-02-26'].map((date) => ({ date, slots: [slot(1.4), slot(14), slot(22), slot(15)] })) };
const frost = { id: 'FROST-WHEAT-1|2027-02-25', rule: 'FROST-WHEAT-1', hazard: 'frost', level: 'warn', date: '2027-02-25', offset: 1, from: '2027-02-25T00:00', to: '2027-02-25T07:00',
  values: { metric: 'tmin', value: 1.4, threshold: 2, levels: { warn: 2, watch: 4 }, series: [{ date: TODAY, value: 6 }, { date: '2027-02-25', value: 1.4 }, { date: '2027-02-26', value: 7 }] }, stage: 'flowering', crop: 'wheat', confidence: 'medium', reviewStatus: 'draft' };
const dry = { id: 'DRY-SPELL-1|2027-02-24', rule: 'DRY-SPELL-1', hazard: 'dry_spell', level: 'watch', date: TODAY, offset: 0, from: '2027-02-24T09:00', to: '2027-02-25T00:00',
  values: { metric: 'dry', value: 8, threshold: 7, levels: { warn: 14, watch: 7 }, series: [{ date: TODAY, value: 8 }, { date: '2027-02-25', value: 9 }, { date: '2027-02-26', value: 10 }] }, stage: 'flowering', crop: 'wheat', confidence: 'medium', reviewStatus: 'draft' };
const near = { id: 'DISEASE-NEAR-1|2027-02-24', rule: 'DISEASE-NEAR-1', hazard: 'disease_near', level: 'info', date: TODAY, offset: 0, from: '2027-02-24T00:00', to: '2027-02-25T00:00',
  values: { metric: 'reports', value: 4, window: 14, radiusKm: 5 }, disease: 'Yellow_rust', stage: 'flowering', crop: 'wheat', confidence: 'low', reviewStatus: 'draft' };
const fire = { id: 'FIRE-NEAR-1|2027-02-24', rule: 'FIRE-NEAR-1', hazard: 'fire_near', level: 'warn', date: TODAY, offset: 0, from: '2027-02-24T00:00', to: '2027-02-25T00:00',
  values: { metric: 'fire', count: 2, nearKm: 1, newest: '2027-02-24T01:56:00.000Z', window: 24, radiusKm: 5 }, stage: 'flowering', crop: 'wheat', confidence: 'medium', reviewStatus: 'draft' };
const sachet = { id: 'SACHET|IN-1', origin: 'official', source: 'sachet', issuer: 'Punjab SDMA', level: 'warn', family: 'storm', event: 'Thunderstorm', headlines: { en: 'Thunderstorm with lightning is likely at isolated places.' },
  instruction: 'Please follow SDMA guidelines.', area: '5 districts', date: TODAY, offset: 0, from: '2027-02-24T17:00', to: '2027-02-24T19:30', issuedAt: '2027-02-24T11:08:06.000Z', expires: '2027-02-24T14:02:00.000Z', link: 'https://sachet.ndma.gov.in/' };
const field = (o = {}) => ({ _id: 'f1', name: 'North plot', crop: 'wheat', stage: 'flowering', createdAt: '2027-02-01T00:00:00Z', status: 'ok', official: [], today: TODAY, timezone: 'Asia/Kolkata',
  alerts: [frost], horizon, conditions: { rain7: 12, coldest: { t: 1.4, date: '2027-02-25' } }, fire: { status: 'ok' },
  flood: { river: { status: 'ok', now: 412, peak: 470, p95: 560, p99: 700, rising: true, level: null }, gauge: { status: 'ok', name: 'Gandhighat', km: 5, level: null, trend: null }, radar: { status: 'ready' } }, ...o });
const news = { data: { state: 'Punjab', crop: 'wheat', items: [{ title: 'Wheat sowing in Punjab picks up', link: 'https://www.thehindu.com/a.ece', source: 'thehindu', sourceName: 'The Hindu', date: '2027-02-23T10:00:00.000Z', dated: true, lang: 'en', state: true, crop: true }],
  links: { national: [{ id: 'imd-bulletin', url: 'https://mausam.imd.gov.in/b.pdf' }, { id: 'imd-state', url: 'https://mausam.imd.gov.in/s.php' }, { id: 'dafw', url: 'https://agriwelfare.gov.in/' }, { id: 'sachet', url: 'https://sachet.ndma.gov.in/' }], state: [] }, sources: [] } };
const answer = (...fields) => ({ data: { checkedAt: '2027-02-24T05:00:00Z', weatherSource: 'Weather data by Open-Meteo.com', officialSources: [{ source: 'sachet', state: 'ok', fetchedAt: '2027-02-24T05:00:00Z' }], fields } });

// everything but colour: jsdom cannot compute it. `region` is dropped because the screen is rendered without the app's layout around it.
const check = async (container) => {
  const { violations } = await axe.run(container, { rules: { 'color-contrast': { enabled: false }, region: { enabled: false } } });
  return violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(' | ')} (${v.help})`);
};
const open = () => render(<MemoryRouter initialEntries={['/overview?mode=weather']}><Overview /></MemoryRouter>);

beforeEach(() => {
  localStorage.clear();
  Object.values(api).forEach((f) => f.mockReset());
  api.getFields.mockResolvedValue({ data: [] });
  api.getFieldNews.mockResolvedValue(news);
});
afterEach(async () => { await i18n.changeLanguage('en'); localStorage.clear(); });

const STATES = {
  'a frost alert with the chart, the horizon, the flood card and the news card': () => answer(field()),
  'a dry spell with the chart in days': () => answer(field({ alerts: [dry] })),
  'reports from other farmers (the panel)': () => answer(field({ alerts: [near, dry] })),
  'a fire (the panel) and an official warning below it': () => answer(field({ alerts: [fire], official: [sachet] })),
  'a calm field with nothing to do': () => answer(field({ alerts: [] })),
  'two fields, one whose weather could not be loaded': () => answer(field(), { _id: 'f2', name: 'South plot', crop: 'rice', stage: 'sowing', createdAt: '2027-02-01T00:00:00Z', status: 'weather_unavailable', official: [], alerts: [], flood: { river: { status: 'disabled' }, gauge: { status: 'disabled' }, radar: { status: 'disabled' } }, fire: { status: 'unavailable' } }),
};

describe.each([['en'], ['hi']])('accessibility (axe), language %s', (lang) => {
  test.each(Object.keys(STATES))('%s', async (name) => {
    await i18n.changeLanguage(lang);
    api.getFieldAlerts.mockResolvedValue(STATES[name]());
    const { container } = open();
    await screen.findAllByRole('heading', { level: 2 });
    await screen.findByRole('link', { name: 'Wheat sowing in Punjab picks up' });   // the news card is the last thing to arrive
    expect(await check(container)).toEqual([]);
  });

  test('with "Why this alert?" open and a question answered', async () => {
    await i18n.changeLanguage(lang);
    api.getFieldAlerts.mockResolvedValue(answer(field()));
    const { container } = open();
    (await screen.findByRole('button', { name: i18n.t('alerts.why') })).click();
    await screen.findByText(i18n.t('alerts.whyTitle'));
    expect(await check(container)).toEqual([]);
  });

  test('the empty state and the error state', async () => {
    await i18n.changeLanguage(lang);
    api.getFieldAlerts.mockResolvedValue(answer());
    const { container, unmount } = open();
    await screen.findByText(i18n.t('alerts.empty.title'));
    expect(await check(container)).toEqual([]);
    unmount();
    api.getFieldAlerts.mockRejectedValue(new Error('offline'));
    const again = open();
    await screen.findByText(i18n.t('alerts.error.title'));
    expect(await check(again.container)).toEqual([]);
  });
});

describe.each([['en'], ['hi']])('accessibility (axe) of the other screens of the feature, language %s', (lang) => {
  test('adding a field', async () => {
    await i18n.changeLanguage(lang);
    const { container } = render(<MemoryRouter initialEntries={['/fields/new']}><FieldNew /></MemoryRouter>);
    await screen.findAllByRole('heading');                    // the first step of the form (the crop); the map step is the library's
    expect(await check(container)).toEqual([]);
  });

  test('the privacy page', async () => {
    await i18n.changeLanguage(lang);
    const { container } = render(<Privacy />);
    await screen.findAllByRole('heading', { level: 3 });
    expect(await check(container)).toEqual([]);
  });
});

// what a real browser's axe found on 27 Oct 2026 (docs/FIELD_ALERTS.md, "Operations") and was fixed: kept fixed
describe('the layout around the screen', () => {
  test('one main landmark holds the page, and the phone header is not a second banner', () => {
    render(<MemoryRouter initialEntries={['/overview']}><Routes><Route element={<WorkspaceLayout />}><Route path="/overview" element={<p>the page</p>} /></Route></Routes></MemoryRouter>);
    expect(screen.getByRole('main')).toHaveTextContent('the page');
    expect(screen.queryAllByRole('banner').length).toBeLessThanOrEqual(1);
  });

  test('the 72-hour strip scrolls sideways: it is a named region and the keyboard can reach it', async () => {
    api.getFieldAlerts.mockResolvedValue(answer(field()));
    open();
    const strip = await screen.findByRole('region', { name: 'The 72-hour strip, scrolls sideways' });
    expect(strip).toHaveAttribute('tabindex', '0');
  });

  test('an alert that says the weather could not be loaded is an alert on a plain element, not on an article', async () => {
    api.getFieldAlerts.mockRejectedValue(new Error('offline'));
    open();
    const alert = await screen.findByRole('alert');
    expect(alert.tagName).toBe('DIV');
  });
});
