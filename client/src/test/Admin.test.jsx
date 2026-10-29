import { beforeEach, describe, expect, test, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import axe from 'axe-core';

const api = vi.hoisted(() => ({ getAdminSummary: vi.fn(), getAdminHealth: vi.fn(), getAdminFeedback: vi.fn() }));
vi.mock('../services/api', () => api);
import Admin from '../pages/Admin';

// The operator's page (docs/ADMIN.md): a token, then counts. The server decides who may; this page only asks and shows.
const SUMMARY = { data: {
  generatedAt: new Date().toISOString(),
  users: { total: 12, newThisWeek: 3 },
  fields: { total: 9, byCrop: { wheat: 5, rice: 4 } },
  checkups: { total: 240, last7Days: 31, last30Days: 118, byStatusLast30Days: { ok: 100, rejected_quality: 15, not_leaf: 3 }, withLocationLast30Days: 44 },
  modelFeedback: { answered: 30, rightPct: 80, byCrop: [{ crop: 'wheat', answered: 20, correct: 15, incorrect: 3, unsure: 2, rightPct: 83 }, { crop: 'rice', answered: 10, correct: 5, incorrect: 3, unsure: 2, rightPct: 63 }] },
  topDiseasesLast30Days: [{ crop: 'wheat', disease: 'BlackPoint', n: 21 }, { crop: 'potato', disease: 'Late_blight', n: 9 }],
  push: { subscriptions: 4, byLanguage: { hi: 3, pa: 1 } },
} };
const HEALTH = { data: {
  sources: [{ source: 'sachet', state: 'ok', fetchedAt: new Date(Date.now() - 5 * 60000).toISOString() }, { source: 'imd', state: 'down', fetchedAt: null }],
  switches: { sachet: 'on', imd: 'on', news: 'off' }, configured: { firmsKey: true, geoService: true, push: false },
  usage: { openMeteoPct: 12, openMeteoCalls: 1200, services: [{ service: 'open-meteo', calls: 1000, perDay: 10000, pct: 10 }, { service: 'firms', calls: 20, perDay: null, pct: null }] },
} };
const FEEDBACK = { data: { total: 40, helpfulPct: 65, rules: [{ rule: 'FROST-WHEAT-1', total: 25, acted: 18, notNeeded: 4, wrong: 3, helpfulPct: 72, wrongPct: 12 }] } };
const denied = (status) => Promise.reject(Object.assign(new Error('x'), { response: { status } }));

beforeEach(() => {
  sessionStorage.clear(); localStorage.clear();
  Object.values(api).forEach((f) => f.mockReset());
  api.getAdminSummary.mockResolvedValue(SUMMARY);
  api.getAdminHealth.mockResolvedValue(HEALTH);
  api.getAdminFeedback.mockResolvedValue(FEEDBACK);
});
const enter = (token = 'right-token') => {
  fireEvent.change(screen.getByLabelText('Operator token'), { target: { value: token } });
  fireEvent.click(screen.getByRole('button', { name: 'Open' }));
};

describe('the token', () => {
  test('asks for it first and calls nothing; the right one opens the page, is kept for this tab only, and goes in the calls', async () => {
    render(<Admin />);
    expect(screen.getByLabelText('Operator token')).toHaveAttribute('type', 'password');
    expect(api.getAdminSummary).not.toHaveBeenCalled();
    enter();
    expect(await screen.findByRole('heading', { name: 'Operator page' })).toBeInTheDocument();
    expect(api.getAdminSummary).toHaveBeenCalledWith('right-token');
    expect(api.getAdminHealth).toHaveBeenCalledWith('right-token');
    expect(api.getAdminFeedback).toHaveBeenCalledWith('right-token');
    expect(sessionStorage.getItem('adminToken')).toBe('right-token');
    expect(localStorage.length).toBe(0);
  });

  test('a token kept for this tab opens the page at once; signing out forgets it', async () => {
    sessionStorage.setItem('adminToken', 'kept-token');
    render(<Admin />);
    expect(await screen.findByText(/Counts only/)).toBeInTheDocument();
    expect(api.getAdminSummary).toHaveBeenCalledWith('kept-token');
    fireEvent.click(screen.getByRole('button', { name: 'Sign out' }));
    expect(screen.getByLabelText('Operator token')).toBeInTheDocument();
    expect(sessionStorage.getItem('adminToken')).toBeNull();
  });

  test.each([[401, /That token is not right/], [429, /Too many wrong tokens/], [503, /ALERTS_ADMIN_TOKEN/]])('a %i answer is said plainly and the token is not kept', async (status, text) => {
    api.getAdminSummary.mockImplementation(() => denied(status));
    render(<Admin />);
    enter('bad');
    expect(await screen.findByRole('alert')).toHaveTextContent(text);
    if (status !== 503) expect(sessionStorage.getItem('adminToken')).toBeNull();
    expect(screen.queryByText(/Counts only/)).not.toBeInTheDocument();
  });

  test('any other failure offers to try again, and keeps the token', async () => {
    api.getAdminSummary.mockImplementationOnce(() => denied(500));
    render(<Admin />);
    enter();
    expect(await screen.findByRole('alert')).toHaveTextContent('The summary could not be loaded');
    expect(sessionStorage.getItem('adminToken')).toBe('right-token');
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByText(/Counts only/)).toBeInTheDocument();
  });
});

describe('the page', () => {
  const ready = async () => { render(<Admin />); enter(); await screen.findByText(/Counts only/); };
  const card = (name) => within(screen.getByRole('region', { name }));

  test('shows the use of the app, with the crops and the outcomes', async () => {
    await ready();
    const use = card('Use of the app');
    expect(use.getByText('12')).toBeInTheDocument();
    expect(use.getByText('3 new this week')).toBeInTheDocument();
    expect(use.getByText('wheat 5, rice 4')).toBeInTheDocument();
    expect(use.getByText('118')).toBeInTheDocument();
    expect(use.getByText('31 in 7 days, 240 in all')).toBeInTheDocument();
    expect(use.getByText('hi 3, pa 1')).toBeInTheDocument();
    expect(use.getByRole('cell', { name: 'rejected quality' })).toBeInTheDocument();
    expect(use.getByText(/44 of them shared a location/)).toBeInTheDocument();
  });

  test('says how often the model is right, per crop, and what the unsure answers are worth', async () => {
    await ready();
    const model = card("Is the model right? (the users' own answer)");
    expect(model.getByText('80%')).toBeInTheDocument();
    expect(model.getByText(/not sure" counts for neither/)).toBeInTheDocument();
    expect(model.getByRole('row', { name: /wheat 20 15 3 2 83%/ })).toBeInTheDocument();
    expect(model.getByRole('row', { name: /rice 10 5 3 2 63%/ })).toBeInTheDocument();
  });

  test('lists the diseases by name, the alert answers, the feeds (one down), the switches that are off and the day\'s use of the free services', async () => {
    await ready();
    expect(card('Most common diseases, 30 days').getByRole('row', { name: /wheat .* 21/ })).toBeInTheDocument();
    expect(card('Did the alerts help?').getByText('65%')).toBeInTheDocument();
    expect(card('Did the alerts help?').getByRole('row', { name: /FROST-WHEAT-1 25 72% 4 12%/ })).toBeInTheDocument();
    const feeds = card('Feeds and switches');
    expect(feeds.getByRole('row', { name: /imd down never/ })).toBeInTheDocument();
    expect(feeds.getByText(/Switched off: news/)).toBeInTheDocument();
    expect(feeds.getByText(/push no/)).toBeInTheDocument();
    const free = card('Free services today');
    expect(free.getByText('12%')).toBeInTheDocument();
    expect(free.getByRole('row', { name: /firms 20 see note –/ })).toBeInTheDocument();
  });

  test('the health or the alert answers failing leaves the rest of the page', async () => {
    api.getAdminHealth.mockImplementation(() => denied(500));
    api.getAdminFeedback.mockImplementation(() => denied(500));
    await ready();
    expect(card('Use of the app').getByText('12')).toBeInTheDocument();
    expect(card('Feeds and switches').getByText('Could not be loaded.')).toBeInTheDocument();
    expect(card('Did the alerts help?').getByText('Could not be loaded.')).toBeInTheDocument();
    expect(card('Free services today').getByText('Could not be loaded.')).toBeInTheDocument();
  });

  test('an empty app reads as nothing yet, not as an error', async () => {
    api.getAdminSummary.mockResolvedValue({ data: { ...SUMMARY.data, users: { total: 0, newThisWeek: 0 }, fields: { total: 0, byCrop: {} }, checkups: { total: 0, last7Days: 0, last30Days: 0, byStatusLast30Days: {}, withLocationLast30Days: 0 },
      modelFeedback: { answered: 0, rightPct: null, byCrop: [] }, topDiseasesLast30Days: [], push: { subscriptions: 0, byLanguage: {} } } });
    await ready();
    expect(card("Is the model right? (the users' own answer)").getByText('No answers yet.')).toBeInTheDocument();
    expect(card('Most common diseases, 30 days').getByText('No disease results in 30 days.')).toBeInTheDocument();
  });

  test('is kept out of search engines while it is open', async () => {
    const { unmount } = render(<Admin />);
    expect(document.head.querySelector('meta[name="robots"][content="noindex"]')).not.toBeNull();
    unmount();
    expect(document.head.querySelector('meta[name="robots"]')).toBeNull();
  });
});

describe('accessibility (axe)', () => {
  const check = async (container) => {
    const { violations } = await axe.run(container, { rules: { 'color-contrast': { enabled: false }, region: { enabled: false } } });
    return violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(' | ')}`);
  };

  test('the token form and the page', async () => {
    const { container, unmount } = render(<Admin />);
    expect(await check(container)).toEqual([]);
    enter();
    await waitFor(() => expect(screen.getByText(/Counts only/)).toBeInTheDocument());
    expect(await check(container)).toEqual([]);
    unmount();
  });
});
