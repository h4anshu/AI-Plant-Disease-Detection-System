import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import i18n from '../i18n';

const api = vi.hoisted(() => ({
  getFieldAlerts: vi.fn(),
  getFields: vi.fn(),
  createField: vi.fn(),
  updateField: vi.fn(),
  deleteField: vi.fn(),
  getLocation: vi.fn(),
  getFloodExtent: vi.fn(),
  getFieldNews: vi.fn(),
}));
vi.mock('../services/api', () => ({
  getPredictionHistory: async () => ({ data: [] }),
  getPredictionRisk: async () => ({ data: {} }),
  getDeviceId: () => 'abcd1234-0000-0000-0000-1234567890ab',
  getFieldAlerts: api.getFieldAlerts,
  getFields: api.getFields,
  createField: api.createField,
  updateField: api.updateField,
  deleteField: api.deleteField,
  getFloodExtent: api.getFloodExtent,
  getFieldNews: api.getFieldNews,
  getFieldPrices: async () => ({ data: { status: 'disabled' } }),
}));
vi.mock('../services/location', () => ({ getLocation: api.getLocation }));
// Leaflet needs a real browser; the picker's job here is only to hand a place to the page
vi.mock('../components/workspace/LocationPicker', () => ({
  default: ({ onPick }) => <button type="button" onClick={() => onPick({ lat: 30.9, lon: 75.85, source: 'map' })}>pin the field</button>,
}));

import Overview from '../pages/Overview';
import FieldNew from '../pages/FieldNew';
import MyFields from '../components/workspace/MyFields';
import Horizon from '../components/workspace/Horizon';
import { chartScale, collect, feedNotice, stripSpan, summarize, daysBetween, readDone, titleCase } from '../components/workspace/alertsLib';

// ---- fixtures: the shape of GET /api/fields/alerts (server/controllers/fieldController.js) ----
const TODAY = '2027-02-24';
const slot = (t, rain = 0, past = false) => ({ t, rain, past });
const horizon = () => ({
  now: 0.7,
  days: [
    { date: '2027-02-24', slots: [slot(8, 0, true), slot(13), slot(21), slot(15)] },
    { date: '2027-02-25', slots: [slot(1.4), slot(12), slot(22), slot(14)] },
    { date: '2027-02-26', slots: [slot(3.2), slot(11), slot(20, 6), slot(13)] },
  ],
});
const frost = (o = {}) => ({
  id: 'FROST-WHEAT-1|2027-02-25', rule: 'FROST-WHEAT-1', hazard: 'frost', level: 'warn', date: '2027-02-25', offset: 1,
  from: '2027-02-25T00:00', to: '2027-02-25T07:00',
  values: { metric: 'tmin', value: 1.4, threshold: 2, levels: { warn: 2, watch: 4 }, series: [{ date: '2027-02-24', value: 6 }, { date: '2027-02-25', value: 1.4 }, { date: '2027-02-26', value: 3.2 }] },
  stage: 'flowering', crop: 'wheat', confidence: 'medium', reviewStatus: 'draft', ...o,
});
const rain = (o = {}) => ({
  id: 'RAIN-HEAVY-1|2027-02-26', rule: 'RAIN-HEAVY-1', hazard: 'rain_heavy', level: 'watch', date: '2027-02-26', offset: 2,
  from: '2027-02-26T12:00', to: '2027-02-26T20:00',
  values: { metric: 'rain', value: 44.2, threshold: 40, levels: { warn: 64.5, watch: 40 }, series: [{ date: '2027-02-24', value: 0 }, { date: '2027-02-25', value: 2 }, { date: '2027-02-26', value: 44.2 }] },
  stage: 'flowering', crop: 'wheat', confidence: 'low', reviewStatus: 'draft', ...o,
});
const field = (o = {}) => ({
  _id: 'f1', name: 'North plot', crop: 'wheat', stage: 'flowering', createdAt: '2027-02-01T00:00:00Z', status: 'ok', official: [],
  today: TODAY, timezone: 'Asia/Kolkata', alerts: [frost()], horizon: horizon(), conditions: { rain7: 12.4, coldest: { t: 1.4, date: '2027-02-25' } }, ...o,
});
const unavailable = (o = {}) => ({ _id: 'f9', name: 'Far plot', crop: 'rice', stage: 'sowing', createdAt: '2027-02-01T00:00:00Z', status: 'weather_unavailable', official: [], ...o });
const GOOD = [{ source: 'sachet', state: 'ok', fetchedAt: '2027-02-24T05:00:00Z' }, { source: 'imd', state: 'ok', fetchedAt: '2027-02-24T05:00:00Z' }];
const answer = (...fields) => ({ data: { checkedAt: '2027-02-24T05:00:00Z', weatherSource: 'Weather data by Open-Meteo.com', officialSources: GOOD, fields } });
const answerWith = (officialSources, ...fields) => ({ data: { ...answer(...fields).data, officialSources } });
// official alerts as GET /api/fields/alerts sends them (server/services/alerts/official.js)
const sachet = (o = {}) => ({
  id: 'SACHET|IN-1792839894548036_36', origin: 'official', source: 'sachet', issuer: 'Punjab SDMA', level: 'warn', family: 'storm', event: 'Lightning, Gusty winds, and Thunderstorm',
  headlines: { en: 'Thunderstorm with Lightning is likely at isolated places over Amritsar, Bathinda.', pn: 'ਅਗਲੇ 3 ਘੰਟਿਆਂ' }, instruction: 'Please follow SDMA guidelines.', area: '5 districts of Punjab',
  date: '2027-02-24', offset: 0, from: '2027-02-24T17:00', to: '2027-02-24T19:32', issuedAt: '2027-02-24T11:08:06.000Z', expires: '2027-02-24T14:02:00.000Z',
  cap: { identifier: 'IN-1792839894548036_36', msgType: 'Update', severity: 'Severe' }, link: 'https://sachet.ndma.gov.in/cap_public_website/FetchXMLFile?identifier=1792839894548036', ...o,
});
const imd = (o = {}) => ({
  id: 'IMD|2027-02-25', origin: 'official', source: 'imd', issuer: 'IMD', level: 'warn', family: 'rain', codes: [16, 4], districts: ['PALAKKAD'], date: '2027-02-25', offset: 1,
  from: '2027-02-25T00:00', to: '2027-02-26T00:00', issuedAt: '2027-02-24T14:02:02.000Z', expires: '2027-02-25T18:30:00.000Z', link: 'https://mausam.imd.gov.in/responsive/districtWiseWarningGIS.php', ...o,
});

const at = (ui, url = '/overview') => render(<MemoryRouter initialEntries={[url]}>{ui}</MemoryRouter>);
const tab = (name) => screen.findByRole('tab', { name: new RegExp(name) });

beforeEach(() => {
  localStorage.clear();
  Object.values(api).forEach((f) => f.mockReset());
  api.getFieldAlerts.mockResolvedValue(answer());
  api.getFields.mockResolvedValue({ data: [] });
  api.getFieldNews.mockResolvedValue({ data: { state: 'Punjab', crop: 'wheat', items: [], links: { national: [], state: [] }, sources: [] } });
});
afterEach(async () => { await i18n.changeLanguage('en'); localStorage.clear(); });

describe('alertsLib', () => {
  test('IMD district names in capitals read as names', () => {
    expect([titleCase('SOUTH 24 PARGANAS'), titleCase('SERAIKELA-KHARSAWAN'), titleCase('the nilgiris')]).toEqual(['South 24 Parganas', 'Seraikela-Kharsawan', 'The Nilgiris']);
  });

  test('summarize counts alerts by level and fields whose weather did not load', () => {
    const s = summarize([field({ alerts: [frost(), rain()] }), field({ _id: 'f2', alerts: [] }), unavailable()]);
    expect(s).toEqual({ urgent: 0, warn: 1, watch: 1, info: 0, unavailable: 1, ok: 2, total: 3 });
  });

  test('collect puts warnings first, then the soonest, and never lists an unavailable field', () => {
    const f = field({ alerts: [rain(), frost({ level: 'watch' }), frost({ id: 'x', level: 'warn', date: '2027-02-26' })] });
    const list = collect([f, unavailable()]);
    expect(list.map((a) => [a.level, a.date])).toEqual([['warn', '2027-02-26'], ['watch', '2027-02-25'], ['watch', '2027-02-26']]);
    expect(list[0].field._id).toBe('f1');
  });

  test('stripSpan places an alert on the 12-part strip and drops what lies beyond it', () => {
    expect(stripSpan(TODAY, frost())).toEqual({ start: 4, span: 2 });                                  // 25th, 00:00 to 07:00
    expect(stripSpan(TODAY, rain())).toEqual({ start: 10, span: 2 });                                  // 26th, 12:00 to 20:00
    expect(stripSpan(TODAY, frost({ from: '2027-02-27T00:00', to: '2027-02-27T06:00' }))).toBeNull();
    expect(stripSpan(TODAY, frost({ from: '2027-02-24T00:00', to: '2027-02-27T06:00' }))).toEqual({ start: 0, span: 12 });
  });

  test('chartScale keeps the level lines in view and daysBetween ignores the clock', () => {
    expect(chartScale(frost().values)).toEqual({ lo: 0, hi: 8 });
    expect(chartScale(rain().values).hi).toBeGreaterThan(64.5);
    expect(daysBetween('2027-02-28', '2027-03-01')).toBe(1);
    expect(daysBetween('2027-12-31', '2028-01-01')).toBe(1);
  });

  test('readDone survives broken storage', () => {
    localStorage.setItem('alertDone', '{nope');
    expect(readDone()).toEqual({});
  });
});

describe('Overview switch: My Field | Weather & Alerts', () => {
  test('opens on My Field, the page as it always was', async () => {
    at(<Overview />);
    expect(await tab('My Field')).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tab', { name: /Weather & Alerts/ })).toHaveAttribute('aria-selected', 'false');
    expect(screen.getByRole('tabpanel')).toHaveAttribute('aria-labelledby', 'ws-mode-field');
    expect(screen.queryByText(/Add your first field/)).not.toBeInTheDocument();
  });

  test('switching shows the alerts, remembers the choice and the URL carries it', async () => {
    api.getFieldAlerts.mockResolvedValue(answer(field()));
    const { unmount } = at(<Overview />);
    fireEvent.click(await tab('Weather & Alerts'));
    expect(await screen.findByText(/Give a light irrigation in the evening/)).toBeInTheDocument();
    expect(screen.getByRole('tabpanel')).toHaveAttribute('aria-labelledby', 'ws-mode-weather');
    expect(localStorage.getItem('overviewMode')).toBe('weather');
    unmount();
    at(<Overview />);   // a later visit
    expect(await tab('Weather & Alerts')).toHaveAttribute('aria-selected', 'true');
  });

  test('?mode=weather opens the alerts directly and wins over a remembered choice; ?mode=field wins back', async () => {
    localStorage.setItem('overviewMode', 'field');
    const { unmount } = at(<Overview />, '/overview?mode=weather');
    expect(await tab('Weather & Alerts')).toHaveAttribute('aria-selected', 'true');
    unmount();
    localStorage.setItem('overviewMode', 'weather');
    at(<Overview />, '/overview?mode=field');
    expect(await tab('My Field')).toHaveAttribute('aria-selected', 'true');
  });

  test('clicking after landing on ?mode=field really switches (the URL is updated, not just the state)', async () => {
    at(<Overview />, '/overview?mode=field');
    fireEvent.click(await tab('Weather & Alerts'));
    expect(await screen.findByText(/Add your first field/)).toBeInTheDocument();
  });

  test('arrow keys move between the two tabs, focus follows', async () => {
    at(<Overview />);
    const first = await tab('My Field');
    first.focus();
    fireEvent.keyDown(first, { key: 'ArrowRight' });
    const second = screen.getByRole('tab', { name: /Weather & Alerts/ });
    expect(second).toHaveAttribute('aria-selected', 'true');
    expect(second).toHaveFocus();
    fireEvent.keyDown(second, { key: 'Home' });
    expect(screen.getByRole('tab', { name: /My Field/ })).toHaveAttribute('aria-selected', 'true');
  });

  test('each tab says what is waiting in it, so nothing hides behind the other one', async () => {
    api.getFieldAlerts.mockResolvedValue(answer(field({ alerts: [frost(), rain()] }), unavailable()));
    at(<Overview />);
    const weather = await tab('Weather & Alerts');
    await waitFor(() => expect(within(weather).getByText('1 warning')).toBeInTheDocument());
    expect(within(weather).getByText('1 watch')).toBeInTheDocument();
    expect(within(weather).getByText('Weather unavailable')).toBeInTheDocument();
  });

  test('the page title follows the half that is open', async () => {
    api.getFieldAlerts.mockResolvedValue(answer(field({ alerts: [frost(), rain()] })));
    at(<Overview />, '/overview?mode=weather');
    expect(await screen.findByText('2 weather alerts for your fields.')).toBeInTheDocument();
  });
});

describe('Weather & Alerts states', () => {
  const open = () => at(<Overview />, '/overview?mode=weather');

  test('no saved field: invites to add one', async () => {
    open();
    expect(await screen.findByText('Add your first field')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Add a field/ })).toHaveAttribute('href', '/fields/new');
  });

  test('a failed request says so and offers a retry that works', async () => {
    api.getFieldAlerts.mockRejectedValueOnce(new Error('offline'));
    open();
    expect(await screen.findByRole('alert')).toHaveTextContent('Weather alerts did not load');
    api.getFieldAlerts.mockResolvedValue(answer(field()));
    fireEvent.click(screen.getByRole('button', { name: /Try again/ }));
    expect(await screen.findByText(/Give a light irrigation/)).toBeInTheDocument();
    expect(api.getFieldAlerts).toHaveBeenCalledTimes(2);
  });

  test('a field whose weather did not load is shown as unavailable, never as "no alert"', async () => {
    api.getFieldAlerts.mockResolvedValue(answer(unavailable()));
    open();
    const card = await screen.findByRole('alert');
    expect(card).toHaveTextContent('The weather for Far plot could not be loaded');
    expect(card).toHaveTextContent('Do not read this as all clear');
    expect(screen.queryByText('No weather alert for the next 3 days')).not.toBeInTheDocument();
  });

  test('one field fine, one unavailable: the unavailable one is still called out', async () => {
    api.getFieldAlerts.mockResolvedValue(answer(field({ alerts: [] }), unavailable()));
    open();
    expect(await screen.findByText('No weather alert for the next 3 days')).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent('Far plot');
  });

  test('no alert: a calm card with the check time, plus the 72-hour strip', async () => {
    api.getFieldAlerts.mockResolvedValue(answer(field({ alerts: [] })));
    open();
    expect(await screen.findByText('No weather alert for the next 3 days')).toBeInTheDocument();
    expect(screen.getByText('No alert in these 3 days')).toBeInTheDocument();
    expect(screen.getByText('Weather data by Open-Meteo.com')).toBeInTheDocument();
    expect(screen.getByText(/are not official warnings/)).toBeInTheDocument();
  });

  test('the main alert: action first, level in words, window, and the "why" with the numbers on demand', async () => {
    api.getFieldAlerts.mockResolvedValue(answer(field()));
    open();
    expect(await screen.findByRole('heading', { name: /Frost risk\. Give a light irrigation in the evening/ })).toBeInTheDocument();
    expect(screen.getAllByText('Warning').length).toBeGreaterThan(0);
    expect(screen.getByText('Tomorrow')).toBeInTheDocument();
    expect(screen.getByText(/12\s?am to 7\s?am/i)).toBeInTheDocument();
    expect(screen.queryByText(/Rule FROST-WHEAT-1/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Why this alert?' }));
    expect(screen.getByText(/forecast night low is 1\.4 °C/)).toBeInTheDocument();
    expect(screen.getByText(/Rule FROST-WHEAT-1, draft/)).toBeInTheDocument();
    expect(screen.getByText(/Forecast confidence: medium/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Why this alert?' }));
    expect(screen.queryByText(/Rule FROST-WHEAT-1/)).not.toBeInTheDocument();
  });

  test('a three-day-ahead alert explains why it is only a Watch', async () => {
    api.getFieldAlerts.mockResolvedValue(answer(field({ alerts: [rain({ values: { ...rain().values, value: 70 } })] })));
    open();
    await screen.findByRole('heading', { level: 3 });
    expect(screen.queryByText(/least certain/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Why this alert?' }));
    expect(screen.getByText(/Forecast confidence: low/)).toBeInTheDocument();
    expect(screen.getByText(/least certain, so it shows as a Watch at most/)).toBeInTheDocument();
  });

  test('worst alert leads, the others follow under "Then"', async () => {
    api.getFieldAlerts.mockResolvedValue(answer(field({ alerts: [rain(), frost()] })));
    open();
    const lead = await screen.findByRole('heading', { level: 3 });
    expect(lead).toHaveTextContent('Frost risk');
    const then = screen.getByText('Then').parentElement;
    expect(within(then).getByText(/Heavy rain expected/)).toBeInTheDocument();
  });

  test('mark as done is remembered on this device and can be undone', async () => {
    api.getFieldAlerts.mockResolvedValue(answer(field()));
    const { unmount } = open();
    fireEvent.click(await screen.findByRole('button', { name: 'Mark as done' }));
    expect(screen.getByRole('button', { name: 'Marked as done' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByText('All marked as done')).toBeInTheDocument();   // nothing left that needs attention
    expect(Object.keys(JSON.parse(localStorage.getItem('alertDone')))).toEqual(['f1|FROST-WHEAT-1|2027-02-25']);
    unmount();
    open();
    fireEvent.click(await screen.findByRole('button', { name: 'Marked as done' }));
    expect(screen.getByRole('button', { name: 'Mark as done' })).toHaveAttribute('aria-pressed', 'false');
    expect(JSON.parse(localStorage.getItem('alertDone'))).toEqual({});
  });

  test('marking the lead alert done moves it down and the next one leads; undo brings it back', async () => {
    api.getFieldAlerts.mockResolvedValue(answer(field({ alerts: [frost(), rain()] })));
    open();
    fireEvent.click((await screen.findAllByRole('button', { name: 'Mark as done' }))[0]);   // the lead card's own button
    const lead = await screen.findByRole('heading', { level: 3 });
    expect(lead).toHaveTextContent('Heavy rain expected');
    expect(screen.getByText('Needs your attention')).toBeInTheDocument();
    const then = screen.getByText('Then').parentElement;
    expect(within(then).getByText(/Frost risk/)).toBeInTheDocument();
    expect(within(then).getByText('Done', { selector: '.ws-st' })).toBeInTheDocument();
    fireEvent.click(within(then).getByRole('button', { name: 'Marked as done' }));
    expect(screen.getByRole('heading', { level: 3 })).toHaveTextContent('Frost risk');
  });

  test('field chips filter to one field and back to all', async () => {
    api.getFieldAlerts.mockResolvedValue(answer(field(), field({ _id: 'f2', name: 'Rice plot', crop: 'rice', stage: 'vegetative', alerts: [] })));
    open();
    const group = await screen.findByRole('group', { name: 'Your fields' });
    expect(within(group).getByRole('button', { name: 'All fields' })).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(within(group).getByRole('button', { name: 'Rice plot' }));
    expect(await screen.findByText('No weather alert for the next 3 days')).toBeInTheDocument();
    expect(screen.queryByText(/Give a light irrigation/)).not.toBeInTheDocument();
    fireEvent.click(within(group).getByRole('button', { name: 'All fields' }));
    expect(await screen.findByText(/Give a light irrigation/)).toBeInTheDocument();
  });

  test('three fields is the limit: no add link, a plain note instead', async () => {
    api.getFieldAlerts.mockResolvedValue(answer(field({ _id: 'a' }), field({ _id: 'b' }), field({ _id: 'c' })));
    open();
    expect(await screen.findByText('You can save up to 3 fields.')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /Add a field/ })).not.toBeInTheDocument();
  });

  test('changing the crop stage saves it, then asks for the alerts again', async () => {
    api.getFieldAlerts.mockResolvedValue(answer(field()));
    api.updateField.mockResolvedValue({ data: {} });
    open();
    const select = await screen.findByLabelText('Crop stage');
    api.getFieldAlerts.mockResolvedValue(answer(field({ stage: 'sowing', alerts: [] })));
    fireEvent.change(select, { target: { value: 'sowing' } });
    await waitFor(() => expect(api.updateField).toHaveBeenCalledWith('f1', { stage: 'sowing' }));
    expect(await screen.findByText('No weather alert for the next 3 days')).toBeInTheDocument();
    expect(api.getFieldAlerts).toHaveBeenCalledTimes(2);
  });

  test('a stage change that fails says so and keeps the page', async () => {
    api.getFieldAlerts.mockResolvedValue(answer(field()));
    api.updateField.mockRejectedValue(new Error('500'));
    open();
    fireEvent.change(await screen.findByLabelText('Crop stage'), { target: { value: 'harvest_ready' } });
    expect(await screen.findByText('Could not change the stage. Please try again.')).toBeInTheDocument();
    expect(screen.getByText(/Give a light irrigation/)).toBeInTheDocument();
  });

  test('a refresh that fails keeps the earlier answer on screen and says so', async () => {
    api.getFieldAlerts.mockResolvedValue(answer(field()));
    api.updateField.mockResolvedValue({ data: {} });
    open();
    const select = await screen.findByLabelText('Crop stage');
    api.getFieldAlerts.mockRejectedValue(new Error('offline'));
    fireEvent.change(select, { target: { value: 'grain_fill' } });
    await waitFor(() => expect(screen.getAllByRole('alert').length).toBeGreaterThan(0));
    expect(screen.getByText(/Give a light irrigation/)).toBeInTheDocument();
  });

  test('Hindi: the alert, the level and the numbers come out in Hindi', async () => {
    await i18n.changeLanguage('hi');
    api.getFieldAlerts.mockResolvedValue(answer(field()));
    open();
    expect(await screen.findByRole('heading', { name: /पाले का खतरा/ })).toBeInTheDocument();
    expect(screen.getAllByText('चेतावनी').length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole('button', { name: 'यह चेतावनी क्यों?' }));
    expect(screen.getByText(/न्यूनतम तापमान 1\.4 °C/)).toBeInTheDocument();
  });

  test('switching language does not ask the server again', async () => {
    api.getFieldAlerts.mockResolvedValue(answer(field()));
    open();
    await screen.findByText(/Give a light irrigation/);
    await i18n.changeLanguage('hi');
    await screen.findByRole('heading', { name: /पाले का खतरा/ });
    expect(api.getFieldAlerts).toHaveBeenCalledTimes(1);
  });
});

describe('official warnings', () => {
  const open = () => at(<Overview />, '/overview?mode=weather');

  test('helpers: official alerts count and rank with ours, even when the weather did not load; urgent is the top level', () => {
    const f = field({ alerts: [frost()], official: [sachet({ level: 'watch' }), imd({ level: 'urgent' })] });
    expect(summarize([f, unavailable({ official: [imd({ level: 'warn' })] })])).toEqual({ urgent: 1, warn: 2, watch: 1, info: 0, unavailable: 1, ok: 1, total: 2 });
    expect(collect([f, unavailable({ official: [imd({ level: 'warn', id: 'IMD|x' })] })]).map((a) => `${a.level}:${a.origin ?? 'model'}`)).toEqual(['urgent:official', 'warn:official', 'warn:model', 'watch:official']);
    // at the same level an official alert goes first
    expect(collect([field({ alerts: [frost({ level: 'watch' })], official: [imd({ level: 'watch' })] })]).map((a) => a.origin ?? 'model')).toEqual(['official', 'model']);
  });

  test('helpers: the feed notice says nothing when all is well or switched off, else when it was last fetched', () => {
    expect(feedNotice(undefined)).toBeNull();
    expect(feedNotice(GOOD)).toBeNull();
    expect(feedNotice([{ source: 'sachet', state: 'disabled' }, { source: 'imd', state: 'ok' }])).toBeNull();
    expect(feedNotice([{ source: 'sachet', state: 'delayed', fetchedAt: '2027-02-24T03:00:00Z' }, { source: 'imd', state: 'down', fetchedAt: '2027-02-23T20:00:00Z' }])).toEqual({ down: true, at: '2027-02-23T20:00:00Z' });
    expect(feedNotice([{ source: 'sachet', state: 'down', fetchedAt: null }, { source: 'imd', state: 'ok', fetchedAt: 'x' }])).toEqual({ down: true, at: null });
  });

  test('a SACHET warning leads over our own, as published: its headline, issuer, validity and a link to the original', async () => {
    api.getFieldAlerts.mockResolvedValue(answer(field({ alerts: [frost({ level: 'watch' })], official: [sachet()] })));
    open();
    expect(await screen.findByRole('heading', { level: 3 })).toHaveTextContent('Thunderstorm with Lightning is likely at isolated places over Amritsar, Bathinda.');
    expect(screen.getByText('Official · NDMA SACHET')).toBeInTheDocument();
    expect(screen.queryByText('Model forecast')).not.toBeInTheDocument();
    expect(screen.getByText('Official warning')).toBeInTheDocument();            // the panel in place of our chart
    expect(screen.getByText(/Punjab SDMA, /)).toBeInTheDocument();
    expect(screen.getByText('Please follow SDMA guidelines.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Open the original' })).toHaveAttribute('href', sachet().link);
    expect(screen.getByRole('link', { name: 'Open the original' })).toHaveAttribute('rel', 'noopener noreferrer');
    fireEvent.click(screen.getByRole('button', { name: 'Why this alert?' }));
    expect(screen.getByText(/Passed on as published by Punjab SDMA through NDMA SACHET\. Area: 5 districts of Punjab\./)).toBeInTheDocument();
    expect(screen.queryByText(/Rule FROST/)).not.toBeInTheDocument();          // no rule id, no forecast confidence for an official alert
    expect(screen.queryByText(/Forecast confidence/)).not.toBeInTheDocument();
    expect(screen.getByText(/Frost risk/)).toBeInTheDocument();                  // ours follows under "Then"
  });

  test('the SACHET headline comes in the reader\'s language when it exists, else English, else the event name', async () => {
    await i18n.changeLanguage('hi');
    api.getFieldAlerts.mockResolvedValue(answer(field({ official: [sachet({ headlines: { en: 'English words', hi: 'हिंदी शब्द' } })] })));
    const { unmount } = open();
    expect(await screen.findByRole('heading', { level: 3 })).toHaveTextContent('हिंदी शब्द');
    unmount();
    api.getFieldAlerts.mockResolvedValue(answer(field({ official: [sachet({ headlines: { en: 'English words' } })] })));
    const second = open();
    expect(await screen.findByRole('heading', { level: 3 })).toHaveTextContent('English words');
    second.unmount();
    api.getFieldAlerts.mockResolvedValue(answer(field({ official: [sachet({ headlines: {} })] })));
    open();
    expect(await screen.findByRole('heading', { level: 3 })).toHaveTextContent('Lightning, Gusty winds, and Thunderstorm');
  });

  test('IMD sends codes and a colour: named with IMD\'s own legend, in both languages, red as Urgent', async () => {
    api.getFieldAlerts.mockResolvedValue(answer(field({ official: [imd({ level: 'urgent', codes: [17, 4, 8] })] })));
    const { unmount } = open();
    expect(await screen.findByRole('heading', { level: 3 })).toHaveTextContent('Red warning from IMD for Palakkad: extremely heavy rain, thunderstorm and lightning, strong surface winds.');
    expect(screen.getAllByText('Urgent').length).toBeGreaterThan(0);
    expect(screen.getByText('Official · IMD')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Open the original' })).toBeInTheDocument();
    unmount();
    await i18n.changeLanguage('hi');
    open();
    expect(await screen.findByRole('heading', { level: 3 })).toHaveTextContent('Palakkad के लिए IMD की लाल चेतावनी: अत्यधिक भारी बारिश, आंधी-तूफान और बिजली, तेज़ सतही हवाएँ।');
  });

  test('IMD warns by the day: the window says so, with the name of the district in normal case; long lists fold away', async () => {
    api.getFieldAlerts.mockResolvedValue(answer(field({ alerts: [], official: [imd({ districts: ['SOUTH 24 PARGANAS'] }), ...[1, 2, 3, 4, 5, 6].map((n) => imd({ id: `IMD|x${n}`, level: 'watch', date: '2027-02-26', codes: [4] }))] })));
    open();
    expect(await screen.findByRole('heading', { level: 3 })).toHaveTextContent('Orange warning from IMD for South 24 Parganas');
    expect(screen.getByText(/25 Feb, the whole day/)).toBeInTheDocument();
    expect(screen.getByText(/^End of .*25 Feb/)).toBeInTheDocument();
    expect(screen.getAllByText(/Yellow warning from IMD/)).toHaveLength(4);    // 4 rows, 2 more behind the button
    fireEvent.click(screen.getByRole('button', { name: 'Show 2 more' }));
    expect(screen.getAllByText(/Yellow warning from IMD/)).toHaveLength(6);
    fireEvent.click(screen.getByRole('button', { name: 'Show fewer' }));
    expect(screen.getAllByText(/Yellow warning from IMD/)).toHaveLength(4);
  });

  test('an alert whose link is not https, and a headline with markup, are shown safely', async () => {
    api.getFieldAlerts.mockResolvedValue(answer(field({ official: [sachet({ link: 'javascript:alert(1)', headlines: { en: '<img src=x onerror=alert(1)> Storm' } })] })));
    const { container } = open();
    expect(await screen.findByRole('heading', { level: 3 })).toHaveTextContent('<img src=x onerror=alert(1)> Storm');
    expect(container.querySelector('img[src="x"]')).toBeNull();
    expect(screen.queryByRole('link', { name: 'Open the original' })).not.toBeInTheDocument();
  });

  test('official warnings still show when the weather of the field did not load', async () => {
    api.getFieldAlerts.mockResolvedValue(answer(unavailable({ official: [imd({ level: 'warn', codes: [16] })] })));
    open();
    expect(await screen.findByRole('heading', { level: 3 })).toHaveTextContent('Orange warning from IMD for Palakkad: very heavy rain.');
    expect(screen.getByRole('alert')).toHaveTextContent('The weather for Far plot could not be loaded');
  });

  test('a late feed is said out loud, and "no alert" does not stand alone', async () => {
    api.getFieldAlerts.mockResolvedValue(answerWith([{ source: 'sachet', state: 'delayed', fetchedAt: '2027-02-24T03:00:00Z' }, { source: 'imd', state: 'ok', fetchedAt: '2027-02-24T05:00:00Z' }], field({ alerts: [] })));
    open();
    expect(await screen.findByText(/Official warnings are delayed\. Last updated/)).toBeInTheDocument();
    expect(screen.getByText('No alert from our forecast')).toBeInTheDocument();
    expect(screen.getByText('No alert from our forecast.')).toBeInTheDocument();   // the page title says the same
    expect(screen.queryByText('No weather alert ahead.')).not.toBeInTheDocument();
    expect(screen.queryByText('No weather alert for the next 3 days')).not.toBeInTheDocument();
    expect(screen.getAllByText('Unavailable').length).toBeGreaterThan(0);
    const weather = screen.getByRole('tab', { name: /Weather & Alerts/ });
    expect(within(weather).getByText('Official feed late')).toBeInTheDocument();   // the switch does not say "No alert" either
    expect(within(weather).queryByText('No alert')).not.toBeInTheDocument();
  });

  test('a feed that was never fetched is said too; a healthy or switched-off one is not mentioned', async () => {
    api.getFieldAlerts.mockResolvedValue(answerWith([{ source: 'sachet', state: 'down', fetchedAt: null }, { source: 'imd', state: 'down', fetchedAt: null }], field({ alerts: [] })));
    const { unmount } = open();
    expect(await screen.findByText(/Official warnings could not be checked yet/)).toBeInTheDocument();
    unmount();
    api.getFieldAlerts.mockResolvedValue(answerWith([{ source: 'sachet', state: 'disabled', fetchedAt: null }, { source: 'imd', state: 'ok', fetchedAt: '2027-02-24T05:00:00Z' }], field({ alerts: [] })));
    open();
    expect(await screen.findByText('No weather alert for the next 3 days')).toBeInTheDocument();
    expect(screen.queryByText(/Official warnings (are delayed|could not)/)).not.toBeInTheDocument();
  });

  test('the switch counts urgent warnings first', async () => {
    api.getFieldAlerts.mockResolvedValue(answer(field({ alerts: [], official: [imd({ level: 'urgent' }), imd({ level: 'warn', id: 'IMD|b' })] })));
    at(<Overview />);
    const weather = await tab('Weather & Alerts');
    await waitFor(() => expect(within(weather).getByText('1 urgent')).toBeInTheDocument());
    expect(within(weather).getByText('1 warning')).toBeInTheDocument();
  });

  test('official warnings appear on the 72-hour strip, labelled by hazard, with day and level for screen readers', () => {
    const { container } = render(<Horizon field={field({ official: [sachet()] })} />);
    const chips = [...container.querySelectorAll('.hz-chip')];
    expect(chips.map((c) => c.dataset.l)).toEqual(['warn', 'warn']);               // the official one, then ours
    expect(chips[0]).toHaveTextContent('Today, Warning: Thunderstorm');
    expect(chips[0].style.gridColumn).toBe('4 / span 2');                            // 17:00 to 19:32 today: the evening part and the one before it
  });
});

describe('flood signals', () => {
  const open = () => at(<Overview />, '/overview?mode=weather');
  const series = [412, 430, 470, 612, 598, 540, 500].map((value, i) => ({ date: `2027-02-${24 + i > 28 ? '0' + (24 + i - 28) : 24 + i}`, value }));
  const river = (o = {}) => ({
    id: 'FLOOD-RIVER-1|2027-02-27', rule: 'FLOOD-RIVER-1', hazard: 'flood_river', level: 'watch', date: '2027-02-27', offset: 3, from: '2027-02-27T00:00', to: '2027-02-28T00:00',
    values: { metric: 'discharge', value: 612, threshold: 560, levels: { warn: 700, watch: 560 }, series }, stage: 'flowering', crop: 'wheat', confidence: 'low', reviewStatus: 'draft', ...o,
  });
  const cwc = (o = {}) => ({
    id: 'CWC|011-mgd4ptn|2027-02-24', origin: 'official', source: 'cwc', issuer: 'CWC', level: 'watch', family: 'flood', station: 'Dumariaghat', km: 5, trend: 'steady',
    date: '2027-02-24', offset: 0, from: '2027-02-24T00:00', to: '2027-02-25T00:00', issuedAt: '2027-02-24T05:00:00.000Z', expires: '2027-02-24T18:30:00.000Z', link: 'https://ffs.india-water.gov.in/', ...o,
  });
  const calm = { river: { status: 'ok', now: 412, peak: 470, p95: 560, p99: 700, rising: true, level: null }, gauge: { status: 'ok', name: 'Gandhighat', km: 5, level: null, trend: null }, radar: { status: 'ready' } };
  const withFlood = (flood, o = {}) => field({ alerts: [], flood, ...o });

  test('the card says what each signal is: normal flow with its numbers, a gauge below warning', async () => {
    api.getFieldAlerts.mockResolvedValue(answer(withFlood(calm)));
    open();
    expect(await screen.findByRole('heading', { name: 'Flood and water' })).toBeInTheDocument();
    expect(screen.getByText('Normal: 412 m³/s now, forecast peak 470 m³/s (a high flow starts at 560).')).toBeInTheDocument();
    expect(screen.getByText('Gandhighat, about 5 km away: below its warning level.')).toBeInTheDocument();
    expect(screen.getByText(/never say that your field will flood/)).toBeInTheDocument();
  });

  test('"no river here" and "no gauge near" are said, not left out; failures are said too', async () => {
    api.getFieldAlerts.mockResolvedValue(answer(withFlood({ river: { status: 'none' }, gauge: { status: 'none' }, radar: { status: 'ready' } })));
    const { unmount } = open();
    expect(await screen.findByText('No large river near this field, so there is no river signal here.')).toBeInTheDocument();
    expect(screen.getByText('No CWC gauge within 25 km.')).toBeInTheDocument();
    unmount();
    api.getFieldAlerts.mockResolvedValue(answer(withFlood({ river: { status: 'unavailable' }, gauge: { status: 'unavailable' }, radar: { status: 'ready' } })));
    open();
    expect(await screen.findByText('The river forecast could not be loaded.')).toBeInTheDocument();
    expect(screen.getByText('The CWC gauges could not be checked.')).toBeInTheDocument();
    expect(screen.queryByText(/No large river/)).not.toBeInTheDocument();
  });

  test('a signal that is switched off is not shown (the radar button too); with all three off there is no card', async () => {
    api.getFieldAlerts.mockResolvedValue(answer(withFlood({ river: { status: 'disabled' }, gauge: calm.gauge, radar: { status: 'disabled' } })));
    const { unmount } = open();
    expect(await screen.findByRole('heading', { name: 'Flood and water' })).toBeInTheDocument();
    expect(screen.queryByText('River flow, regional forecast')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Check the radar now' })).not.toBeInTheDocument();
    expect(screen.getByText('Nearest CWC gauge')).toBeInTheDocument();
    unmount();
    api.getFieldAlerts.mockResolvedValue(answer(withFlood({ river: { status: 'disabled' }, gauge: { status: 'disabled' }, radar: { status: 'disabled' } })));
    open();
    await screen.findByText('No weather alert for the next 3 days');
    expect(screen.queryByRole('heading', { name: 'Flood and water' })).not.toBeInTheDocument();
  });

  test('a river alert: its own wording (no claim about the field), 7 bars in m³/s without degree signs, low confidence', async () => {
    const f = withFlood({ river: { status: 'ok', now: 412, peak: 612, p95: 560, p99: 700, rising: true, level: 'watch' }, gauge: calm.gauge }, { alerts: [river()] });
    api.getFieldAlerts.mockResolvedValue(answer(f));
    open();
    const head = await screen.findByRole('heading', { level: 3 });
    expect(head).toHaveTextContent('River flow in your area is forecast to be unusually high');
    expect(head.textContent).not.toMatch(/your field (will|is going to) flood/i);
    expect(screen.getByText(/River flow · /)).toBeInTheDocument();           // the label line: hazard, field, stage
    expect(screen.getByText('River flow per day')).toBeInTheDocument();
    expect(screen.getAllByText('m³/s').length).toBeGreaterThan(0);
    expect(screen.getByRole('img', { name: /m³\/s/ }).getAttribute('aria-label').split(', ')).toHaveLength(7);   // one bar per day, each with its unit
    expect(screen.getByText('612')).toBeInTheDocument();                        // no "°" after it
    expect(screen.getByText('Unusually high flow forecast Sat, 27 Feb: 612 m³/s, where a high flow starts at 560.'.replace('Sat', 'Sat'))).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Why this alert?' }));
    expect(screen.getByText(/it does not mean your field will flood/)).toBeInTheDocument();
    expect(screen.getByText(/Forecast confidence: low/)).toBeInTheDocument();
    expect(screen.getByText(/Rule FLOOD-RIVER-1, draft/)).toBeInTheDocument();
  });

  test('a river alert is shown even when the weather of the field did not load', async () => {
    api.getFieldAlerts.mockResolvedValue(answer(unavailable({ alerts: [river()], flood: calm })));
    open();
    expect(await screen.findByRole('heading', { level: 3 })).toHaveTextContent('River flow in your area is forecast');
    expect(screen.getByRole('alert')).toHaveTextContent('could not be loaded');
  });

  test('a CWC gauge above warning is an official alert: its wording, "as of", and no validity it does not have', async () => {
    api.getFieldAlerts.mockResolvedValue(answer(withFlood({ ...calm, gauge: { status: 'ok', name: 'Dumariaghat', km: 5, level: 'watch', trend: 'steady' } }, { official: [cwc()] })));
    const { unmount } = open();
    expect(await screen.findByRole('heading', { level: 3 })).toHaveTextContent('River gauge Dumariaghat, about 5 km from your field, is above its warning level (steady).');
    expect(screen.getByText('Official · CWC gauge')).toBeInTheDocument();
    expect(screen.getByText('As of')).toBeInTheDocument();
    expect(screen.queryByText('Valid until')).not.toBeInTheDocument();
    expect(screen.getByText(/the whole day/)).toBeInTheDocument();
    expect(screen.getByText('Dumariaghat, about 5 km away: above its warning level (steady).')).toBeInTheDocument();   // and in the card
    fireEvent.click(screen.getByRole('button', { name: 'Why this alert?' }));
    expect(screen.getByText(/shows the water in the river at that place, not in your field/)).toBeInTheDocument();
    unmount();
    api.getFieldAlerts.mockResolvedValue(answer(withFlood(calm, { official: [cwc({ level: 'warn', trend: 'rising' })] })));
    open();
    expect(await screen.findByRole('heading', { level: 3 })).toHaveTextContent('above its danger level (rising)');
  });

  test('Hindi: the card, the river alert and the gauge', async () => {
    await i18n.changeLanguage('hi');
    api.getFieldAlerts.mockResolvedValue(answer(withFlood({ river: { status: 'none' }, gauge: { status: 'ok', name: 'Dumariaghat', km: 5, level: 'watch', trend: 'rising' } }, { official: [cwc({ trend: 'rising' })], alerts: [river({ level: 'warn' })] })));
    open();
    expect(await screen.findByRole('heading', { name: 'बाढ़ और पानी' })).toBeInTheDocument();
    expect(screen.getByText('इस खेत के पास कोई बड़ी नदी नहीं है, इसलिए यहाँ नदी का कोई संकेत नहीं है।')).toBeInTheDocument();
    expect(screen.getByText('Dumariaghat, लगभग 5 किमी दूर: अपने चेतावनी स्तर से ऊपर (बढ़ रहा है)।')).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 3 })).toHaveTextContent('आपके इलाके में');
  });

  describe('the satellite radar row', () => {
    const extent = (o = {}) => ({ data: { status: 'ok', buffer_m: 500, image_date: '2027-02-21', age_days: 3, baseline_images: 17, usable_pct: 95.8, water_pct: 94.6, new_water_pct: 68.1, flag: 'likely', cached: false, ...o } });
    const card = () => api.getFieldAlerts.mockResolvedValue(answer(withFlood(calm)));
    const radarLabel = () => screen.getByText('Satellite radar, around your field').parentElement;

    test('nothing is asked until the farmer asks; then the answer, its level, and the limits of radar', async () => {
      card();
      api.getFloodExtent.mockResolvedValue(extent());
      open();
      const button = await screen.findByRole('button', { name: 'Check the radar now' });
      expect(api.getFloodExtent).not.toHaveBeenCalled();
      fireEvent.click(button);
      expect(await screen.findByText(/Likely flooding: about 68\.1% of the 500 m around your field looks newly under water in the radar image of 21 Feb\./)).toBeInTheDocument();
      expect(api.getFloodExtent).toHaveBeenCalledWith('f1');
      expect(screen.getByText(/Radar does not see through thick crops or towns/)).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Check the radar now' })).not.toBeInTheDocument();
      expect(radarLabel()).toHaveTextContent('Warning');
    });

    test('possible is a watch, none is no pill and says how much could be read', async () => {
      card();
      api.getFloodExtent.mockResolvedValue(extent({ flag: 'possible', new_water_pct: 18.1 }));
      const { unmount } = open();
      fireEvent.click(await screen.findByRole('button', { name: 'Check the radar now' }));
      expect(await screen.findByText(/Possible new water: about 18\.1%/)).toBeInTheDocument();
      expect(radarLabel()).toHaveTextContent('Watch');
      unmount();
      api.getFloodExtent.mockResolvedValue(extent({ flag: 'none', new_water_pct: 0 }));
      open();
      fireEvent.click(await screen.findByRole('button', { name: 'Check the radar now' }));
      expect(await screen.findByText('No new water seen in the radar image of 21 Feb (95.8% of the 500 m around the field could be read).')).toBeInTheDocument();
      expect(radarLabel()).not.toHaveTextContent(/Watch|Warning/);
    });

    test('no recent image, no image at all, and too little ground to read are said plainly', async () => {
      card();
      api.getFloodExtent.mockResolvedValue({ data: { status: 'no_recent_image', recent_days: 12, last_image: '2027-02-02', flag: null } });
      const first = open();
      fireEvent.click(await screen.findByRole('button', { name: 'Check the radar now' }));
      expect(await screen.findByText('No radar image in the last 12 days. The last one was on 2 Feb.')).toBeInTheDocument();
      first.unmount();
      api.getFloodExtent.mockResolvedValue({ data: { status: 'no_recent_image', recent_days: 12, last_image: null, flag: null } });
      const second = open();
      fireEvent.click(await screen.findByRole('button', { name: 'Check the radar now' }));
      expect(await screen.findByText('No radar image found in the last 12 days.')).toBeInTheDocument();
      second.unmount();
      api.getFloodExtent.mockResolvedValue(extent({ status: 'too_little_data', flag: null }));
      open();
      fireEvent.click(await screen.findByRole('button', { name: 'Check the radar now' }));
      expect(await screen.findByText(/Too little of the ground around this field can be read by radar/)).toBeInTheDocument();
    });

    test.each([[503, /service is busy/], [429, /Too many satellite checks/], [500, /unavailable right now/]])('a %i answer is explained and the button stays for another try', async (status, text) => {
      card();
      api.getFloodExtent.mockRejectedValueOnce({ response: { status } });
      open();
      fireEvent.click(await screen.findByRole('button', { name: 'Check the radar now' }));
      expect(await screen.findByText(text)).toBeInTheDocument();
      api.getFloodExtent.mockResolvedValueOnce(extent({ flag: 'none', new_water_pct: 0 }));
      fireEvent.click(screen.getByRole('button', { name: 'Check the radar now' }));
      expect(await screen.findByText(/No new water seen/)).toBeInTheDocument();
    });

    test('while it runs the button says so and is off; another field never shows the first field\'s answer', async () => {
      let finish;
      api.getFieldAlerts.mockResolvedValue(answer(withFlood(calm), withFlood(calm, { _id: 'f2', name: 'Rice plot', crop: 'rice' })));
      api.getFloodExtent.mockReturnValue(new Promise((resolve) => { finish = resolve; }));
      open();
      const group = await screen.findByRole('group', { name: 'Your fields' });
      fireEvent.click(within(group).getByRole('button', { name: 'North plot' }));
      fireEvent.click(await screen.findByRole('button', { name: 'Check the radar now' }));
      expect(screen.getByRole('button', { name: 'Checking the satellite…' })).toBeDisabled();
      fireEvent.click(within(group).getByRole('button', { name: 'Rice plot' })); // switch before the answer arrives
      finish(extent());
      await screen.findByRole('button', { name: 'Check the radar now' }); // idle again, for the other field
      await new Promise((r) => setTimeout(r, 20));
      expect(screen.queryByText(/Likely flooding/)).not.toBeInTheDocument();
    });

    test('Hindi', async () => {
      await i18n.changeLanguage('hi');
      card();
      api.getFloodExtent.mockResolvedValue(extent({ flag: 'possible', new_water_pct: 18.1 }));
      open();
      fireEvent.click(await screen.findByRole('button', { name: 'अभी रडार जाँचें' }));
      expect(await screen.findByText(/नया पानी हो सकता है: .* 18\.1%/)).toBeInTheDocument();
      expect(screen.getByText(/रडार घनी फसल या शहर के आर-पार नहीं देख पाता/)).toBeInTheDocument();
    });
  });

  test('both appear on the 72-hour strip, labelled', () => {
    const { container } = render(<Horizon field={field({ alerts: [river({ date: '2027-02-25', offset: 1, from: '2027-02-25T00:00', to: '2027-02-26T00:00' })], official: [cwc()] })} />);
    const chips = [...container.querySelectorAll('.hz-chip')].map((c) => c.textContent);
    expect(chips).toEqual(['Today, Watch: Flood', 'Tomorrow, Watch: River flow']);
  });
});

describe('72-hour strip', () => {
  const view = (f) => render(<Horizon field={f} />);

  test('three days of four parts, the passed ones hatched, "now" marked', () => {
    const { container } = view(field());
    expect(screen.getAllByText(/^(Night|Morning|Noon|Evening)$/)).toHaveLength(12);
    expect(container.querySelectorAll('.hz-part.hz-past')).toHaveLength(1);
    expect(screen.getByText('Now')).toBeInTheDocument();
    expect(screen.getByText('Today')).toBeInTheDocument();
  });

  test('an alert is a labelled chip over its parts, with a frost line only for frost', () => {
    const { container, rerender } = view(field());
    const chip = container.querySelector('.hz-chip');
    expect(chip).toHaveAttribute('data-l', 'warn');
    expect(chip).toHaveTextContent('Frost');
    expect(chip.style.gridColumn).toBe('6 / span 2');
    expect(screen.getByText('2 °C')).toBeInTheDocument();
    rerender(<Horizon field={field({ alerts: [rain()] })} />);
    expect(container.querySelector('.hz-chip')).toHaveTextContent('Heavy rain');
    expect(screen.queryByText('2 °C')).not.toBeInTheDocument();
  });

  test('a dry spell says "No rain expected" and a missing temperature part does not break the line', () => {
    const dry = horizon();
    dry.days[2].slots[2] = slot(null, 0);
    expect(() => view(field({ horizon: dry, alerts: [] }))).not.toThrow();
    expect(screen.getByText('No rain expected')).toBeInTheDocument();
    expect(screen.getByText('No alert in these 3 days')).toBeInTheDocument();
  });

  test('each chip tells a screen reader the day and the level, not just the hazard', () => {
    const { container } = view(field());
    expect(container.querySelector('.hz-chip')).toHaveTextContent('Tomorrow, Warning: Frost');
  });
});

describe('Add a field', () => {
  const Where = () => { const l = useLocation(); return <p data-testid="where">{l.pathname + l.search}</p>; };
  const page = () => render(
    <MemoryRouter initialEntries={['/fields/new']}>
      <Routes><Route path="/fields/new" element={<FieldNew />} /><Route path="/overview" element={<Where />} /></Routes>
    </MemoryRouter>,
  );
  const next = () => screen.getByRole('button', { name: /Next/ });

  test('three steps: Next waits for a choice; saving sends crop, stage and the place, then opens the alerts', async () => {
    api.createField.mockResolvedValue({ data: { _id: 'n1' } });
    page();
    expect(next()).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: /Wheat/ }));
    fireEvent.click(next());
    expect(await screen.findByRole('heading', { name: /How far has the wheat grown/ })).toBeInTheDocument();
    expect(next()).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: /^Flowering/ }));
    fireEvent.click(next());
    const save = await screen.findByRole('button', { name: 'Save field' });
    expect(save).toBeDisabled();
    fireEvent.click(await screen.findByRole('button', { name: 'pin the field' }));
    expect(screen.getByRole('status')).toHaveTextContent('Place chosen');
    fireEvent.change(screen.getByLabelText(/Name/), { target: { value: '  Top field  ' } });
    fireEvent.click(save);
    await waitFor(() => expect(api.createField).toHaveBeenCalledWith({ crop: 'wheat', stage: 'flowering', lat: 30.9, lon: 75.85, name: 'Top field' }));
    expect(await screen.findByTestId('where')).toHaveTextContent('/overview?mode=weather');
  });

  test('the name is optional and limited to 40 characters', async () => {
    api.createField.mockResolvedValue({ data: {} });
    page();
    fireEvent.click(screen.getByRole('button', { name: /Rice/ })); fireEvent.click(next());
    fireEvent.click(await screen.findByRole('button', { name: /^Sowing/ })); fireEvent.click(next());
    expect(await screen.findByLabelText(/Name/)).toHaveAttribute('maxlength', '40');
    fireEvent.click(await screen.findByRole('button', { name: 'pin the field' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save field' }));
    await waitFor(() => expect(api.createField).toHaveBeenCalledWith({ crop: 'rice', stage: 'sowing', lat: 30.9, lon: 75.85 }));
  });

  test('Back keeps what was chosen', async () => {
    page();
    fireEvent.click(screen.getByRole('button', { name: /Maize/ })); fireEvent.click(next());
    fireEvent.click(await screen.findByRole('button', { name: /Back/ }));
    expect(screen.getByRole('button', { name: /Maize/ })).toHaveAttribute('aria-pressed', 'true');
  });

  test('the phone location fills the place; a refusal says what to do instead', async () => {
    api.getLocation.mockResolvedValueOnce({ location_source: 'none' }).mockResolvedValueOnce({ lat: 28.6, lon: 77.2, location_source: 'gps' });
    api.createField.mockResolvedValue({ data: {} });
    page();
    fireEvent.click(screen.getByRole('button', { name: /Potato/ })); fireEvent.click(next());
    fireEvent.click(await screen.findByRole('button', { name: /^Vegetative|^Growing leaves/ })); fireEvent.click(next());
    fireEvent.click(await screen.findByRole('button', { name: 'Use my location' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Could not get your location');
    expect(screen.getByRole('button', { name: 'Save field' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Use my location' }));
    await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: 'Save field' }));
    await waitFor(() => expect(api.createField).toHaveBeenCalledWith({ crop: 'potato', stage: 'vegetative', lat: 28.6, lon: 77.2 }));
  });

  test.each([[409, /already have 3 fields/], [400, /not valid/], [500, /Could not save the field/]])('a %i answer is explained and the page stays', async (status, text) => {
    api.createField.mockRejectedValue({ response: { status } });
    page();
    fireEvent.click(screen.getByRole('button', { name: /Wheat/ })); fireEvent.click(next());
    fireEvent.click(await screen.findByRole('button', { name: /^Flowering/ })); fireEvent.click(next());
    fireEvent.click(await screen.findByRole('button', { name: 'pin the field' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save field' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(text);
    expect(screen.getByRole('button', { name: 'Save field' })).toBeEnabled();   // can try again
    expect(screen.queryByTestId('where')).not.toBeInTheDocument();
  });

  test('already 3 fields: no wizard, a way to manage them', async () => {
    api.getFields.mockResolvedValue({ data: [{ _id: 'a' }, { _id: 'b' }, { _id: 'c' }] });
    page();
    expect(await screen.findByText('Your fields are full')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Manage my fields' })).toHaveAttribute('href', '/me?tab=data');
    expect(screen.queryByRole('button', { name: /Next/ })).not.toBeInTheDocument();
  });

  test('says the place stays private', async () => {
    page();
    fireEvent.click(screen.getByRole('button', { name: /Wheat/ })); fireEvent.click(next());
    fireEvent.click(await screen.findByRole('button', { name: /^Flowering/ })); fireEvent.click(next());
    expect(await screen.findByText('Your place stays private.')).toBeInTheDocument();
  });
});

describe('My fields (Profile > My data)', () => {
  const list = [{ _id: 'a', name: 'North plot', crop: 'wheat', stage: 'flowering' }, { _id: 'b', crop: 'rice', stage: 'sowing' }];
  const show = () => at(<MyFields />, '/me?tab=data');

  test('lists each field without ever showing a place', async () => {
    api.getFields.mockResolvedValue({ data: list });
    show();
    expect(await screen.findByText('North plot')).toBeInTheDocument();
    expect(screen.getByText('Wheat · Flowering')).toBeInTheDocument();
    expect(screen.getByText('Rice · Sowing')).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/\b(lat|lon|coordinates)\b/i);
  });

  test('delete asks first; cancel changes nothing; yes deletes and reloads the list', async () => {
    api.getFields.mockResolvedValue({ data: list });
    api.deleteField.mockResolvedValue({ data: { ok: true } });
    show();
    fireEvent.click(await screen.findByRole('button', { name: 'Delete the field North plot' }));
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(api.deleteField).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Delete the field North plot' }));
    api.getFields.mockResolvedValue({ data: [list[1]] });
    fireEvent.click(screen.getByRole('button', { name: 'Yes, delete' }));
    await waitFor(() => expect(api.deleteField).toHaveBeenCalledWith('a'));
    await waitFor(() => expect(screen.queryByText('North plot')).not.toBeInTheDocument());
    expect(screen.getByText('Rice · Sowing')).toBeInTheDocument();
  });

  test('a failed delete keeps the field and says so', async () => {
    api.getFields.mockResolvedValue({ data: list });
    api.deleteField.mockRejectedValue(new Error('500'));
    show();
    fireEvent.click(await screen.findByRole('button', { name: 'Delete the field North plot' }));
    fireEvent.click(screen.getByRole('button', { name: 'Yes, delete' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Could not delete the field');
    expect(screen.getByText('North plot')).toBeInTheDocument();
  });

  test('no fields: a plain sentence and the add link; a failed load is not shown as "none saved"', async () => {
    const { unmount } = show();
    expect(await screen.findByText('No fields saved yet.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Add a field' })).toHaveAttribute('href', '/fields/new');
    unmount();
    api.getFields.mockRejectedValue(new Error('offline'));
    show();
    expect(await screen.findByRole('alert')).toHaveTextContent('Could not load your fields');
    expect(screen.queryByText('No fields saved yet.')).not.toBeInTheDocument();
  });
});

describe('news and advisories', () => {
  const open = () => at(<Overview />, '/overview?mode=weather');
  const item = (o = {}) => ({ title: 'Wheat sowing in Punjab picks up after the rains', link: 'https://www.thehindu.com/news/a1.ece', source: 'thehindu', sourceName: 'The Hindu',
    date: '2027-02-23T10:00:00.000Z', dated: true, lang: 'en', state: true, crop: true, ...o });
  const LINKS = { national: [{ id: 'imd-bulletin', url: 'https://mausam.imd.gov.in/b.pdf' }, { id: 'imd-state', url: 'https://mausam.imd.gov.in/s.php' }, { id: 'dafw', url: 'https://agriwelfare.gov.in/' }, { id: 'sachet', url: 'https://sachet.ndma.gov.in/' }], state: [] };
  const news = (o = {}) => ({ data: { state: 'Punjab', crop: 'wheat', items: [item()], links: LINKS, sources: [{ id: 'thehindu', name: 'The Hindu' }, { id: 'pib', name: 'PIB' }], ...o } });
  const panel = async () => within((await screen.findByRole('heading', { name: 'What officials and papers say' })).closest('section'));

  test('a headline links out to the publisher, with its source, date and why it is shown', async () => {
    api.getFieldAlerts.mockResolvedValue(answer(field()));
    api.getFieldNews.mockResolvedValue(news({ items: [item(), item({ title: 'पंजाब में रबी की एमएसपी', link: 'https://pib.gov.in/p?1', source: 'pib', sourceName: 'PIB', lang: 'hi', dated: false, state: false, crop: false })] }));
    open();
    const p = await panel();
    const a = await p.findByRole('link', { name: 'Wheat sowing in Punjab picks up after the rains' });
    expect(a).toHaveAttribute('href', 'https://www.thehindu.com/news/a1.ece');
    expect(a).toHaveAttribute('target', '_blank');
    expect(a.getAttribute('rel')).toMatch(/noopener/);
    const li = a.closest('li');
    expect(within(li).getByText('The Hindu')).toBeInTheDocument();
    expect(within(li).getByText('23 Feb')).toBeInTheDocument();
    expect(within(li).getByText('About Punjab')).toBeInTheDocument();
    expect(within(li).getByText('Your crop')).toBeInTheDocument();
    const hindi = p.getByRole('link', { name: 'पंजाब में रबी की एमएसपी' });
    expect(hindi).toHaveAttribute('lang', 'hi');
    const li2 = hindi.closest('li');
    expect(within(li2).getByText('PIB')).toBeInTheDocument();
    expect(within(li2).getByText('Hindi')).toBeInTheDocument();
    expect(within(li2).getByText('first listed 23 Feb')).toBeInTheDocument(); // PIB gives no date: this is when we first saw it
    expect(within(li2).queryByText('About Punjab')).not.toBeInTheDocument();
    expect(api.getFieldNews).toHaveBeenCalledWith('f1');
  });

  test('a headline is shown as text, never as markup', async () => {
    api.getFieldAlerts.mockResolvedValue(answer(field()));
    api.getFieldNews.mockResolvedValue(news({ items: [item({ title: '<img src=x onerror=alert(1)> Wheat', link: 'https://www.thehindu.com/n/2.ece' })] }));
    const { container } = open();
    const p = await panel();
    expect(await p.findByText('<img src=x onerror=alert(1)> Wheat')).toBeInTheDocument();
    expect(container.querySelector('img[src="x"]')).toBeNull();
  });

  test('official pages: the IMD state page names the state; with no state it says "your state"; the note says nothing is copied', async () => {
    api.getFieldAlerts.mockResolvedValue(answer(field()));
    api.getFieldNews.mockResolvedValue(news({ items: [] }));
    const { unmount } = open();
    const p = await panel();
    expect(await p.findByText('No farming headlines have been saved yet. Please check again a little later.')).toBeInTheDocument();
    expect(p.getByRole('link', { name: 'IMD national agromet bulletin (PDF)' })).toHaveAttribute('href', 'https://mausam.imd.gov.in/b.pdf');
    expect(p.getByRole('link', { name: 'NDMA SACHET' })).toHaveAttribute('href', 'https://sachet.ndma.gov.in/');
    expect(p.getByRole('link', { name: 'Department of Agriculture & Farmers Welfare' })).toHaveAttribute('target', '_blank');
    expect(p.getByText('Choose Punjab in the list to see its bulletin.')).toBeInTheDocument();
    expect(p.getByText(/Nothing is copied or summarised, and a headline is not advice for your field/)).toBeInTheDocument();
    unmount();
    api.getFieldNews.mockResolvedValue(news({ state: null, items: [] }));
    open();
    expect(await (await panel()).findByText('Choose your state in the list to see its bulletin.')).toBeInTheDocument();
  });

  test('a state page added to the links shows first, with its own name', async () => {
    api.getFieldAlerts.mockResolvedValue(answer(field()));
    api.getFieldNews.mockResolvedValue(news({ items: [], links: { ...LINKS, state: [{ id: 'pb-agri', url: 'https://agri.punjab.gov.in/', label: { en: 'Punjab Agriculture Department', hi: 'पंजाब कृषि विभाग' } }] } }));
    open();
    const p = await panel();
    const links = (await p.findAllByRole('link')).map((l) => l.textContent);
    expect(links[0]).toBe('Punjab Agriculture Department');
  });

  test('the headlines failing to load is a quiet sentence, not an error page; the alerts above stay', async () => {
    api.getFieldAlerts.mockResolvedValue(answer(field()));
    api.getFieldNews.mockRejectedValue(new Error('offline'));
    open();
    const p = await panel();
    expect(await p.findByText('The headlines and official pages could not be loaded right now. Please try again a little later.')).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 3 })).toBeInTheDocument();      // the alert itself is still there
    expect(screen.queryByRole('heading', { name: 'Something went wrong' })).not.toBeInTheDocument();
  });

  test('another field asks again, and an answer for the field left behind is not shown', async () => {
    api.getFieldAlerts.mockResolvedValue(answer(field(), field({ _id: 'f2', name: 'South plot', crop: 'rice' })));
    let late;
    api.getFieldNews.mockImplementation((id) => (id === 'f1' ? new Promise((resolve) => { late = resolve; }) : Promise.resolve(news({ items: [item({ title: 'Rice news for the south plot', link: 'https://www.thehindu.com/n/3.ece' })] }))));
    open();
    await panel();
    fireEvent.click(await screen.findByRole('button', { name: /South plot/ }));
    expect(await screen.findByRole('link', { name: 'Rice news for the south plot' })).toBeInTheDocument();
    expect(api.getFieldNews).toHaveBeenCalledWith('f2');
    late(news({ items: [item({ title: 'Wheat news that arrived too late', link: 'https://www.thehindu.com/n/4.ece' })] }));
    await new Promise((r) => setTimeout(r, 20));
    expect(screen.queryByRole('link', { name: 'Wheat news that arrived too late' })).not.toBeInTheDocument();
  });

  test('Hindi: the heading, the source language and the official pages', async () => {
    await i18n.changeLanguage('hi');
    api.getFieldAlerts.mockResolvedValue(answer(field()));
    api.getFieldNews.mockResolvedValue(news());
    open();
    const heading = await screen.findByRole('heading', { name: 'अधिकारी और अख़बार क्या कह रहे हैं' });
    const p = within(heading.closest('section'));
    expect(await p.findByText('अंग्रेज़ी')).toBeInTheDocument();
    expect(p.getByText('Punjab के बारे में')).toBeInTheDocument();
    expect(p.getByRole('link', { name: 'कृषि एवं किसान कल्याण विभाग' })).toBeInTheDocument();
    expect(p.getByText('सूची में Punjab चुनें, उसका बुलेटिन दिखेगा।')).toBeInTheDocument();
  });
});

