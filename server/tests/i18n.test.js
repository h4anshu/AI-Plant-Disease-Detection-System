import { describe, expect, test } from '@jest/globals';
import { FALLBACK_TREATMENT, localizedTreatment, treatmentMap } from '../utils/treatmentMap.js';
import fs from 'node:fs';
import { treatmentMapHi } from '../utils/treatmentMap.hi.js';
import { CSV_PATH, reviewRows, toCsv } from '../scripts/translation_review.js';

// Active ingredients / products in the English advice: each must reach the Hindi text unchanged
const CHEMICALS = ['propiconazole', 'thiophanate-methyl', 'carboxin', 'thiram', 'Vitavax Power', 'Trichoderma',
  'tebuconazole', 'trifloxystrobin', 'streptocycline', 'copper oxychloride', 'tricyclazole', 'azoxystrobin',
  'difenoconazole', 'mancozeb', 'imidacloprid', 'thiamethoxam', 'strobilurin', 'carbendazim', 'potassium silicate',
  'triadimefon', 'cymoxanil', 'dimethomorph', 'captan', 'spinosad', 'chlorantraniliprole', 'indoxacarb', 'fenazaquin',
  'fenpyroximate', 'hexaconazole', 'chlorothalonil', 'ferrous sulphate', 'citric acid', 'dimethoate',
  'wettable sulphur', 'Bacillus subtilis', 'neem oil', 'mineral oil'];

const entries = Object.entries(treatmentMap).flatMap(([crop, m]) => Object.keys(m).map((d) => [crop, d]));
const numbers = (s) => new Set(s.match(/\d+(?:\.\d+)?/g) ?? []);
const latinWords = (s) => new Set((s.match(/[A-Za-z]+/g) ?? []).map((w) => w.toLowerCase())); // hyphen parts separately

describe('Hindi treatment advice (treatmentMap.hi.js)', () => {
  test('covers exactly the English entries, each with text, needs_review and source', () => {
    expect(Object.keys(treatmentMapHi).sort()).toEqual(Object.keys(treatmentMap).sort());
    for (const [crop, disease] of entries) {
      const hi = treatmentMapHi[crop][disease];
      expect(hi).toBeDefined();
      expect(hi.text).toMatch(/[ऀ-ॿ]/);
      expect(typeof hi.needs_review).toBe('boolean');
      expect(hi.source).toEqual(expect.any(String));
    }
    for (const crop of Object.keys(treatmentMapHi)) {
      expect(Object.keys(treatmentMapHi[crop]).sort()).toEqual(Object.keys(treatmentMap[crop]).sort());
    }
  });

  test.each(entries)('%s.%s keeps every number and dose of the English text', (crop, disease) => {
    const hi = numbers(treatmentMapHi[crop][disease].text);
    const missing = [...numbers(treatmentMap[crop][disease])].filter((n) => !hi.has(n));
    expect(missing).toEqual([]);
  });

  test.each(entries)('%s.%s keeps the chemical names and adds no Latin words of its own', (crop, disease) => {
    const en = treatmentMap[crop][disease];
    const hi = treatmentMapHi[crop][disease].text;
    const dropped = CHEMICALS.filter((c) => en.toLowerCase().includes(c.toLowerCase()) && !hi.includes(c));
    expect(dropped).toEqual([]);
    const enWords = latinWords(en);
    expect([...latinWords(hi)].filter((w) => !enWords.has(w))).toEqual([]);
  });
});

describe('localizedTreatment', () => {
  test('Hindi when written, flagged for review', () => {
    expect(localizedTreatment('potato', 'Late_blight', 'hi')).toEqual(
      { text: treatmentMapHi.potato.Late_blight.text, lang: 'hi', needsReview: true });
  });

  test('English for en, an unknown language, or an unknown class (English fallback text)', () => {
    expect(localizedTreatment('potato', 'Late_blight', 'en')).toMatchObject({ lang: 'en', needsReview: false });
    expect(localizedTreatment('potato', 'Late_blight', 'fr').lang).toBe('en');
    expect(localizedTreatment('potato', 'NoSuchDisease', 'en').text).toBe(FALLBACK_TREATMENT);
    expect(localizedTreatment('potato', 'NoSuchDisease', 'hi').text).toMatch(/[ऀ-ॿ]/);
  });
});

test('docs/TRANSLATION_REVIEW.csv is up to date (regenerate: npm run translation-review)', () => {
  const rows = reviewRows();
  expect(rows.length).toBeGreaterThan(0);
  expect(fs.readFileSync(CSV_PATH, 'utf8')).toBe(toCsv(rows));
});
