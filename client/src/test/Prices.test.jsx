import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import axe from 'axe-core';
import i18n from '../i18n';

const api = vi.hoisted(() => ({ getFieldAlerts: vi.fn(), getFields: vi.fn(), getFieldNews: vi.fn(), getFieldPrices: vi.fn() }));
vi.mock('../services/api', () => ({
  getPredictionHistory: async () => ({ data: [] }),
  getPredictionRisk: async () => ({ data: {} }),
  getDeviceId: () => 'abcd1234-0000-0000-0000-1234567890ab',
  getFieldAlerts: api.getFieldAlerts,
  getFields: api.getFields,
  getFieldNews: api.getFieldNews,
  getFieldPrices: api.getFieldPrices,
  getFloodExtent: vi.fn(),
  updateField: vi.fn(),
}));
vi.mock('../services/location', () => ({ getLocation: vi.fn() }));

import Overview from '../pages/Overview';

// The mandi-price card (server/services/mandi.js): what the market committees reported, never a forecast and never "sell" or "hold".
const TODAY = '2027-02-24';
const slot = (t) => ({ t, rain: 0, past: false });
const horizon = { now: 0.7, days: [TODAY, '2027-02-25', '2027-02-26'].map((date) => ({ date, slots: [slot(8), slot(14), slot(22), slot(15)] })) };
const field = (o = {}) => ({ _id: 'f1', name: 'North plot', crop: 'wheat', stage: 'flowering', createdAt: '2027-02-01T00:00:00Z', status: 'ok', official: [], today: TODAY, timezone: 'Asia/Kolkata',
  alerts: [], horizon, conditions: { rain7: 12, coldest: { t: 8, date: TODAY } }, fire: { status: 'ok' }, flood: { river: { status: 'disabled' }, gauge: { status: 'disabled' }, radar: { status: 'disabled' } }, ...o });
const answer = (...fields) => ({ data: { checkedAt: '2027-02-24T05:00:00Z', weatherSource: 'Weather data by Open-Meteo.com', officialSources: [], fields } });
const prices = (o = {}) => ({ data: { status: 'ok', state: 'Punjab', crop: 'wheat', unit: 'quintal', date: '2027-02-23', ageDays: 1, markets: 12, median: 2390, min: 2300, max: 2440,
  local: [{ market: 'Jagraon APMC', district: 'Ludhiana', price: 2440 }, { market: 'Khanna APMC', district: 'Ludhiana', price: 2400 }], trend: { pct: 4.5, since: '2027-02-18', markets: 9 }, ...o } });
const open = () => render(<MemoryRouter initialEntries={['/overview?mode=weather']}><Overview /></MemoryRouter>);
const card = async (name = 'Mandi prices for wheat') => within((await screen.findByRole('heading', { name })).closest('section'));

beforeEach(() => {
  localStorage.clear();
  Object.values(api).forEach((f) => f.mockReset());
  api.getFields.mockResolvedValue({ data: [] });
  api.getFieldNews.mockResolvedValue({ data: { state: 'Punjab', crop: 'wheat', items: [], links: { national: [], state: [] }, sources: [] } });
  api.getFieldAlerts.mockResolvedValue(answer(field()));
});
afterEach(async () => { await i18n.changeLanguage('en'); localStorage.clear(); });

describe('mandi prices', () => {
  test('the middle price per quintal, the range, the change among markets that reported both days, and the district\'s own markets', async () => {
    api.getFieldPrices.mockResolvedValue(prices());
    open();
    const c = await card();
    expect(api.getFieldPrices).toHaveBeenCalledWith('f1');
    expect(c.getByText('₹2,390 per quintal')).toBeInTheDocument();
    expect(c.getByText('The middle price of 12 markets in Punjab, reported on 23 Feb.')).toBeInTheDocument();
    expect(c.getByText('Lowest ₹2,300, highest ₹2,440.')).toBeInTheDocument();
    expect(c.getByText('Up 4.5% since 18 Feb, in the 9 markets that reported on both days.')).toBeInTheDocument();
    const list = within(c.getByText('Markets in your district').parentElement);
    expect(list.getByText('Jagraon APMC')).toBeInTheDocument();
    expect(list.getByText('₹2,440')).toBeInTheDocument();
    expect(c.getByText(/not advice to sell or to wait/)).toBeInTheDocument();
    const src = c.getByRole('link', { name: 'See the source' });
    expect(src).toHaveAttribute('href', 'https://www.data.gov.in/resource/variety-wise-daily-market-prices-data-commodity');
    expect(src).toHaveAttribute('target', '_blank');
  });

  test('one market only: it says so and shows no range; a price a few days old says how old; paddy is named for rice', async () => {
    api.getFieldAlerts.mockResolvedValue(answer(field({ crop: 'rice' })));
    api.getFieldPrices.mockResolvedValue(prices({ markets: 1, median: 2300, min: 2300, max: 2300, ageDays: 5, local: [], trend: null }));
    open();
    const c = await card('Mandi prices for paddy');
    expect(c.getByText(/The price of the one market in Punjab that reported on 23 Feb\. \(5 days ago\)/)).toBeInTheDocument();
    expect(c.queryByText(/Lowest/)).not.toBeInTheDocument();
    expect(c.queryByText('Markets in your district')).not.toBeInTheDocument();
  });

  test('a falling price and an unchanged one', async () => {
    api.getFieldPrices.mockResolvedValue(prices({ trend: { pct: -3, since: '2027-02-18', markets: 4 } }));
    const { unmount } = open();
    expect(await (await card()).findByText('Down 3% since 18 Feb, in the 4 markets that reported on both days.')).toBeInTheDocument();
    unmount();
    api.getFieldPrices.mockResolvedValue(prices({ trend: { pct: 0, since: '2027-02-18', markets: 4 } }));
    open();
    expect(await (await card()).findByText('Unchanged since 18 Feb, in the 4 markets that reported on both days.')).toBeInTheDocument();
  });

  test('stale, none and unavailable are said in words, with no price', async () => {
    api.getFieldPrices.mockResolvedValue({ data: { status: 'stale', state: 'Odisha', lastDate: '2026-11-04', ageDays: 325, crop: 'rice' } });
    const { unmount } = open();
    expect(await (await card()).findByText('No price for wheat has been reported in Odisha in the last 14 days. The last one was on 4 Nov.')).toBeInTheDocument();
    unmount();
    api.getFieldPrices.mockResolvedValue({ data: { status: 'none', state: 'Punjab', crop: 'wheat' } });
    const second = open();
    expect(await (await card()).findByText('No mandi price for wheat was found in Punjab.')).toBeInTheDocument();
    second.unmount();
    api.getFieldPrices.mockResolvedValue({ data: { status: 'unavailable', state: 'Punjab', crop: 'wheat' } });
    open();
    expect(await (await card()).findByText('The mandi prices could not be loaded right now. Please try again a little later.')).toBeInTheDocument();
    expect(screen.queryByText(/₹/)).not.toBeInTheDocument();
  });

  test('a request that fails is the same quiet sentence; the alerts above stay', async () => {
    api.getFieldPrices.mockRejectedValue(new Error('offline'));
    open();
    expect(await (await card()).findByText('The mandi prices could not be loaded right now. Please try again a little later.')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'What officials and papers say' })).toBeInTheDocument();   // the rest of the screen stays
  });

  test('switched off or no state known yet: the card is not drawn at all', async () => {
    api.getFieldPrices.mockResolvedValue({ data: { status: 'disabled', crop: 'wheat' } });
    const { unmount } = open();
    await screen.findByRole('heading', { name: 'What officials and papers say' });
    await new Promise((r) => setTimeout(r, 30));
    expect(screen.queryByRole('heading', { name: /Mandi prices/ })).not.toBeInTheDocument();
    unmount();
    api.getFieldPrices.mockResolvedValue({ data: { status: 'no_state', crop: 'wheat' } });
    open();
    await screen.findByRole('heading', { name: 'What officials and papers say' });
    await new Promise((r) => setTimeout(r, 30));
    expect(screen.queryByRole('heading', { name: /Mandi prices/ })).not.toBeInTheDocument();
  });

  test('another field asks again, with its own crop', async () => {
    api.getFieldAlerts.mockResolvedValue(answer(field(), field({ _id: 'f2', name: 'South plot', crop: 'potato' })));
    api.getFieldPrices.mockImplementation((id) => Promise.resolve(id === 'f1' ? prices() : prices({ median: 1300, local: [], trend: null, crop: 'potato' })));
    open();
    await card();
    screen.getByRole('button', { name: /South plot/ }).click();
    expect(await (await card('Mandi prices for potato')).findByText('₹1,300 per quintal')).toBeInTheDocument();
    expect(api.getFieldPrices).toHaveBeenCalledWith('f2');
  });

  test('Hindi', async () => {
    await i18n.changeLanguage('hi');
    api.getFieldPrices.mockResolvedValue(prices());
    open();
    const c = within((await screen.findByRole('heading', { name: 'गेहूँ का मंडी भाव' })).closest('section'));
    expect(await c.findByText('₹2,390 प्रति क्विंटल')).toBeInTheDocument();
    expect(c.getByText('आपके ज़िले की मंडियाँ')).toBeInTheDocument();
    expect(c.getByText(/बेचने या रुकने की सलाह नहीं/)).toBeInTheDocument();
  });

  test('no accessibility violations (axe, without colour: jsdom has none)', async () => {
    api.getFieldPrices.mockResolvedValue(prices());
    const { container } = open();
    await card();
    const { violations } = await axe.run(container, { rules: { 'color-contrast': { enabled: false }, region: { enabled: false } } });
    expect(violations.map((v) => `${v.id}: ${v.help}`)).toEqual([]);
  });
});
