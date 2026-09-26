// Hand-made inputs for the report tests: a rice blast checkup as the API returns it, a cached
// field-health answer and a weather-risk answer, with fixed ids and times so snapshots are stable.
import { MODELS } from '../utils/diseaseRisk.js';
import { treatmentMap } from '../utils/treatmentMap.js';

export const prediction = {
  _id: '66f5a0c2e4b0a1b2c3d4e5f6', crop: 'rice', disease: 'Blast', status: 'ok', confidence: 0.9312,
  severity: 'moderate', yieldLossPercent: 25, yieldLossConfidence: 'high', treatment: treatmentMap.rice.Blast,
  top3: [{ disease: 'Blast', probability: 0.9312 }, { disease: 'Brownspot', probability: 0.051 }, { disease: 'Healthy', probability: 0.012 }],
  modelVersion: { backbone: 'efficientnetb3-v1', head: 'rice-v2', gate: 'gate-v1' },
  locationSource: 'gps', createdAt: '2026-09-20T05:30:00.000Z',
};

export const location = { lat: 30.9123, lon: 75.8067, accuracyM: 12.4 };

const nb = (p25, p50, p75) => ({ enough: true, pixels: 5000, ndvi: [p25, p50, p75], ndre: [p25 / 2, p50 / 2, p75 / 2] });
export const fieldHealth = {
  window: { start: '2026-05-23', end: '2026-09-20' }, geometry_source: 'buffer_30m', images: 31, clear_images: 4,
  last_clear_date: '2026-09-18', field_farmland: 0.94, flag: { code: 'below', since: '2026-09-13', stale: false },
  series: [
    { date: '2026-06-28', used: true, clear_fraction: 1, ndvi: 0.21, ndre: 0.11, z: 0.2, neighbours: nb(0.15, 0.2, 0.26) },
    { date: '2026-07-18', used: false, clear_fraction: 0.2, ndvi: null, ndre: null, z: null, neighbours: nb(0.3, 0.4, 0.5) },
    { date: '2026-08-22', used: true, clear_fraction: 0.9, ndvi: 0.74, ndre: 0.38, z: 0.1, neighbours: nb(0.66, 0.72, 0.79) },
    { date: '2026-09-13', used: true, clear_fraction: 1, ndvi: 0.58, ndre: 0.29, z: -1.4, neighbours: nb(0.7, 0.76, 0.81) },
    { date: '2026-09-18', used: true, clear_fraction: 0.8, ndvi: 0.55, ndre: 0.27, z: -1.6, neighbours: nb(0.69, 0.75, 0.8) },
  ],
};

const days = ['2026-09-24', '2026-09-25', '2026-09-26', '2026-09-27', '2026-09-28', '2026-09-29'];
const levels = ['low', 'medium', 'medium', 'high', 'high', null];
export const risk = {
  crop: 'rice', disease: 'blast', today: '2026-09-26', model: MODELS.rice.model, supporting: MODELS.rice.supporting,
  days: days.map((date, i) => ({ date, level: levels[i], forecast: i > 2,
    conditions: levels[i] && { infectionHours: [0, 3, 4, 7, 6][i], padmanabhanStreak: [1, 2, 3, 4, 5][i], padmanabhanMet: i >= 3 } })),
  weatherSource: 'Weather data by Open-Meteo.com (CC BY 4.0)',
};

export const images = { photo: 'a'.repeat(64), gradcam: 'b'.repeat(64), map: 'c'.repeat(64) };

export const input = (over = {}) => ({
  reportId: 'PG-TESTREPORT01', generatedAt: '2026-09-26T09:15:00.000Z', lang: 'en', prediction, location,
  fieldHealth, risk, images, verifyUrl: 'https://api.example/api/reports/PG-TESTREPORT01', ...over,
});
