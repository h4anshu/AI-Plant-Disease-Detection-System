import { StrictMode } from 'react';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import i18n from '../i18n';

const api = vi.hoisted(() => ({ reply: null, calls: [], puts: [] }));
vi.mock('../services/api', () => ({
  getPredictionContext: async (id) => { api.calls.push(id); return api.reply(); },
  putSoilTest: async (id, body) => { api.puts.push([id, body]); return { data: { ...api.reply().data, soilTest: body, fit: api.after } }; },
  getFieldHealth: () => new Promise(() => {}),
  getPredictionRisk: () => new Promise(() => {}),
}));
import ContextCard from '../components/ContextCard';
import ResultCard from '../components/ResultCard';

const src = { id: 'irri-rkb-bb', title: 'Bacterial blight (fact sheet)', url: 'https://irri.example/bb' };
const item = (extra) => ({ ruleId: 'rice.Bacterialblight.1', factor: 'tmean', op: 'between', threshold: [25, 34], unit: '°C',
  windowDays: 7, hours: null, role: 'favourable', weight: 1, status: 'met', actual: 28.4, from: 'weather', source: src, ...extra });
const fitOf = (level, extra = {}) => ({ class: 'Bacterialblight', level, score: { favourable: 1, neutral: 0.5, unfavourable: 0 }[level] ?? null,
  matched: level === 'favourable' ? [item(), item({ ruleId: 'rice.Bacterialblight.2', factor: 'rhMean', op: 'gt', threshold: 70, unit: '%', actual: 82 })] : [],
  unmatched: level === 'unfavourable' ? [item({ status: 'not_met', actual: 22.1 })] : [], missing: [], reason: null, draft: true, ...extra });
const context = (extra = {}) => ({
  version: 1, reference: { date: '2026-09-20', source: 'created_at' },
  weather: { source: 'open-meteo', days: [{ date: '2026-09-07' }], summary: { tminMean: 23.4, tmaxMean: 31.2, rhMean: 82, rainMm: 31.2, wetDays12: 3 } },
  rainAnomaly: { status: 'ok', source: 'era5-land', windowEnd: '2026-09-19', percentOfNormal: 21 },
  soil: { texture: 'loam', topsoil0to30: { phH2O: 7.78, socGkg: 9.65, nitrogenGkg: 8.1 } },
  fieldHealth: { status: 'not_requested' }, season: { names: ['kharif'] }, riskModel: null,
  provenance: { attributions: ['Weather data by Open-Meteo.com (CC BY 4.0)', 'Soil: ISRIC SoilGrids 250 m (CC BY 4.0)'] }, ...extra });
const reply = (level, { fit, ctx } = {}) => async () => ({ data: {
  context: context(ctx), fit: fit ?? { diagnosed: fitOf(level), alternatives: [] }, draft: true, soilTest: null, soilTestNote: null, cached: false } });

const result = { _id: 'p1', status: 'ok', crop: 'rice', disease: 'Bacterialblight', confidence: 0.91, severity: 'early',
  treatment: 't', yieldLossPercent: 10, imageUrl: 'u', locationSource: 'gps' };

beforeEach(() => { api.calls = []; api.puts = []; });
afterEach(async () => { await i18n.changeLanguage('en'); });

test('favourable: badge, the numbers against the rule, weather, rain, soil, season, draft note and sources', async () => {
  api.reply = reply('favourable');
  render(<ContextCard result={result} />);
  expect(screen.getByRole('status')).toHaveTextContent(/Checking the weather and soil/);
  expect(await screen.findByText('Favours it')).toBeInTheDocument();
  expect(screen.getByText(/Recent weather and soil here favour Bacterialblight/)).toBeInTheDocument();
  expect(screen.getByText(/Average temperature, last 7 days:/)).toHaveTextContent('Average temperature, last 7 days: 28.4 °C (favourable: 25–34 °C)');
  expect(screen.getByText(/Average humidity, last 7 days:/)).toHaveTextContent('82 % (favourable: above 70 %)');
  expect(screen.getByText(/23.4–31.2 °C on average, humidity 82%, rain 31.2 mm/)).toBeInTheDocument();
  expect(screen.getByText(/3 days with 12\+ very humid hours/)).toBeInTheDocument();
  expect(screen.getByText(/21% of normal \(ERA5-Land, compared with 2001–2020\)/)).toBeInTheDocument();
  expect(screen.getByText(/modelled map at 250 m, not a test of your field\): loam, pH 7.8/)).toBeInTheDocument();
  expect(screen.getByText('Season: Kharif.')).toBeInTheDocument();
  expect(screen.getByRole('note')).toHaveTextContent(/not yet checked by an expert/);
  expect(screen.getByText(/it never changes it/)).toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'Bacterial blight (fact sheet)' })).toHaveAttribute('href', 'https://irri.example/bb');
  expect(screen.getByText('Soil: ISRIC SoilGrids 250 m (CC BY 4.0)')).toBeInTheDocument();
});

test.each([
  ['neutral', 'Mixed', /partly fit/],
  ['unfavourable', "Doesn't favour it", /don't favour Bacterialblight/],
])('%s level', async (level, badge, sentence) => {
  api.reply = reply(level);
  render(<ContextCard result={result} />);
  expect(await screen.findByText(badge)).toBeInTheDocument();
  expect(screen.getByText(sentence)).toBeInTheDocument();
});

test('unknown with its reason; missing values say what is needed; no soil and no rainfall data are said plainly', async () => {
  api.reply = reply('unknown', {
    fit: { diagnosed: fitOf('unknown', { class: 'Nutrition_Deficiency', reason: 'missing_data',
      missing: [item({ ruleId: 'n', factor: 'soilTest.availableN', status: 'missing', actual: null, reason: 'needs_soil_test', windowDays: null })] }), alternatives: [] },
    ctx: { soil: null, rainAnomaly: { status: 'unknown', reason: 'data ends' } } });
  render(<ContextCard result={{ ...result, crop: 'groundnut', disease: 'Nutrition_Deficiency' }} />);
  expect(await screen.findByText("Can't tell")).toBeInTheDocument();
  expect(screen.getByText('Available nitrogen: needs your Soil Health Card value')).toBeInTheDocument();
  expect(screen.getByText(/No soil map data for this place/)).toBeInTheDocument();
  expect(screen.getByText(/not available yet for these dates/)).toBeInTheDocument();
});

test('a class without published numbers says so', async () => {
  api.reply = reply('unknown', { fit: { diagnosed: fitOf('unknown', { class: 'Tungro', reason: 'no_rules' }), alternatives: [] } });
  render(<ContextCard result={{ ...result, disease: 'Tungro' }} />);
  expect(await screen.findByText(/No published conditions with numbers were found/)).toBeInTheDocument();
});

test('an error message instead of a card when the service fails', async () => {
  api.reply = async () => { throw { response: { data: { message: 'The satellite service is busy. Please try again later.' } } }; };
  render(<ContextCard result={result} />);
  expect(await screen.findByRole('alert')).toHaveTextContent('The satellite service is busy.');
});

test('loads once per checkup, also under StrictMode', async () => {
  api.reply = reply('favourable');
  render(<StrictMode><ContextCard result={result} /></StrictMode>);
  await screen.findByText('Favours it');
  expect(api.calls).toEqual(['p1']);
});

test('Soil Health Card values: sent as numbers the farmer typed, the fit updates', async () => {
  api.reply = reply('unknown');
  api.after = { diagnosed: fitOf('favourable'), alternatives: [] };
  render(<ContextCard result={result} />);
  await screen.findByText("Can't tell");
  fireEvent.click(screen.getByText('Have a Soil Health Card? Add its values'));
  fireEvent.change(screen.getByLabelText('Zinc (ppm)'), { target: { value: '0.4' } });
  fireEvent.change(screen.getByLabelText('Date the sample was taken'), { target: { value: '2025-03-01' } });
  fireEvent.click(screen.getByRole('button', { name: 'Save' }));
  expect(await screen.findByText(/now uses your card/)).toBeInTheDocument();
  expect(api.puts).toEqual([['p1', { zn: '0.4', sampleDate: '2025-03-01' }]]);
  expect(screen.getByText('Favours it')).toBeInTheDocument();
  expect(screen.getByText(/never your name or card number/)).toBeInTheDocument();
});

test('uncertain: every possibility with its fit, labelled "not a diagnosis"', async () => {
  api.reply = reply('neutral', { fit: { diagnosed: fitOf('neutral'),
    alternatives: [{ ...fitOf('unknown', { class: 'Blast', reason: null }), probability: 0.3,
      model: { name: 'Yoshino infection hours', level: 'low' } }] } });
  render(<ResultCard result={{ ...result, status: 'uncertain', reasons: ['low_confidence'],
    top3: [{ disease: 'Bacterialblight', probability: 0.5 }, { disease: 'Blast', probability: 0.3 }] }} />);
  expect(await screen.findByText(/this is not a diagnosis/)).toBeInTheDocument();
  expect(screen.getByText(/partly fit Bacterialblight/)).toBeInTheDocument();
  expect(screen.getByText('Published model (Yoshino infection hours): Low on this day.')).toBeInTheDocument();
});

test('the result card shows it only with a location', async () => {
  api.reply = reply('favourable');
  const { rerender } = render(<ResultCard result={{ ...result, locationSource: 'none' }} />);
  expect(screen.queryByText(/Checking the weather and soil/)).not.toBeInTheDocument();
  rerender(<ResultCard result={result} />);
  expect(await screen.findByText('Favours it')).toBeInTheDocument();
});

test('Hindi: the card at 360 px wide, with the Devanagari texts and the draft note', async () => {
  await i18n.changeLanguage('hi');
  api.reply = reply('favourable');
  const { container } = render(<div style={{ width: 360 }}><ContextCard result={result} /></div>);
  expect(await screen.findByText('अनुकूल')).toBeInTheDocument();
  expect(screen.getByText(/फ़सल-मौसम: खरीफ़/)).toBeInTheDocument();
  expect(within(container).getByRole('note')).toHaveTextContent(/विशेषज्ञ ने नहीं जाँची/);
  expect(screen.getByText(/औसत तापमान, पिछले 7 दिन/)).toBeInTheDocument();
});
