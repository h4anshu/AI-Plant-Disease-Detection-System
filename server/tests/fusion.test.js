import { describe, expect, test } from '@jest/globals';
import { fusionFactor, rerank } from '../utils/fusion.js';
import { evaluate, labelOf, MIN_RECORDS, report } from '../scripts/eval_fusion.js';

const top3 = [{ disease: 'Brownspot', probability: 0.45 }, { disease: 'Bacterialblight', probability: 0.4 }, { disease: 'Healthy', probability: 0.15 }];

describe('rerank (offline only)', () => {
  test('f is bounded 0.5..1.5 and unknown fit changes nothing', () => {
    expect([fusionFactor(0), fusionFactor(0.5), fusionFactor(1), fusionFactor(null)]).toEqual([0.5, 1, 1.5, 1]);
    expect(fusionFactor(7)).toBe(1.5);
  });

  test('never changes an "ok" diagnosis, whatever the fit says', () => {
    const out = rerank({ status: 'ok', top3 }, { Brownspot: 0, Bacterialblight: 1 });
    expect(out).toBe(top3);
  });

  test('may only reorder the existing top-3 of an uncertain checkup, probabilities renormalised', () => {
    const out = rerank({ status: 'uncertain', top3 }, { Brownspot: 0, Bacterialblight: 1, Healthy: null });
    expect(out.map((t) => t.disease)).toEqual(['Bacterialblight', 'Brownspot', 'Healthy']);
    expect(new Set(out.map((t) => t.disease))).toEqual(new Set(top3.map((t) => t.disease))); // same three, nothing added
    expect(out.reduce((s, t) => s + t.probability, 0)).toBeCloseTo(1, 3);
    // p * f^alpha, renormalised: 0.45 * 0.5^0.3, 0.40 * 1.5^0.3, 0.15 * 1
    const w = [0.45 * 0.5 ** 0.3, 0.4 * 1.5 ** 0.3, 0.15];
    expect(out[0].probability).toBeCloseTo(w[1] / (w[0] + w[1] + w[2]), 4);
  });

  test('alpha 0 is the model alone; unknown fits keep the order', () => {
    expect(rerank({ status: 'uncertain', top3 }, { Brownspot: 0, Bacterialblight: 1 }, 0).map((t) => t.disease))
      .toEqual(['Brownspot', 'Bacterialblight', 'Healthy']);
    expect(rerank({ status: 'uncertain', top3 }, {}).map((t) => t.disease)).toEqual(['Brownspot', 'Bacterialblight', 'Healthy']);
    expect(rerank({ status: 'uncertain', top3: undefined }, {})).toBeNull();
  });
});

describe('scripts/eval_fusion.js', () => {
  const ctx = (rh) => ({ reference: { date: '2026-09-20' }, season: { names: ['kharif'] },
    weather: { days: [...Array(14)].map((_, i) => ({ date: `2026-09-${String(7 + i).padStart(2, '0')}`, tmean: 28, rhMean: rh, hoursRh90: 8 })) } });
  const rec = (extra) => ({ crop: 'rice', status: 'uncertain', disease: 'Brownspot', top3, feedback: 'incorrect',
    correctedLabel: 'Bacterialblight', context: ctx(75), ...extra });

  test('labels come from feedback: correct = the diagnosis, incorrect = the corrected class, "Other" is no label', () => {
    expect(labelOf({ feedback: 'correct', disease: 'Blast' })).toBe('Blast');
    expect(labelOf({ feedback: 'incorrect', correctedLabel: 'Tungro' })).toBe('Tungro');
    expect(labelOf({ feedback: 'incorrect', correctedLabel: 'Other' })).toBeNull();
    expect(labelOf({ feedback: 'unsure' })).toBeNull();
  });

  test('fewer than 200 labelled checkups: "insufficient data", no numbers', () => {
    const r = evaluate([rec(), rec({ feedback: 'unsure' }), rec({ context: undefined })]);
    expect(r.n).toBe(1);
    expect(report(r, 0.3)).toBe(`insufficient data: 1 labelled checkups with a context snapshot (need ${MIN_RECORDS})`);
  });

  test('counts top-1 with and without fusion per crop; ok checkups are never changed', () => {
    // RH 75 over 25-34 °C: bacterial blight favourable (IRRI), brown spot not (needs RH 86-100) -> fusion fixes it
    const records = [...Array(150)].map(() => rec())
      .concat([...Array(60)].map(() => rec({ status: 'ok', feedback: 'incorrect', correctedLabel: 'Bacterialblight' })));
    const r = evaluate(records);
    expect(r.n).toBe(210);
    expect(r.byCrop.rice).toEqual({ n: 210, uncertain: 150, before: 0, after: 150 });
    const text = report(r, 0.3);
    expect(text).toMatch(/alpha 0.3, 210 labelled checkups/);
    expect(text).toMatch(/rice\s+210\s+150\s+0.0%\s+71.4%/);
  });
});

describe('scripts/sanity_rules.js (report only)', () => {
  test('counts each class\'s level per month over the documented days only', async () => {
    const { tally } = await import('../scripts/sanity_rules.js');
    const day = (date, extra = {}) => ({ date, tmin: 18, tmean: 22, tmax: 28, rhMean: 80, rhMax: 96, hoursRh90: 13, rain: 0, ...extra });
    const history = [...Array(14)].map((_, i) => day(`2021-12-${String(18 + i).padStart(2, '0')}`));
    const t = tally({ crop: 'groundnut', periods: [{ start: '2022-01-01', end: '2022-01-02',
      days: [...history, day('2022-01-01'), day('2022-01-02', { tmean: 31 })] }] });
    expect(t.Rust['2022-01']).toEqual({ favourable: 2, neutral: 0, unfavourable: 0, unknown: 0 });
    expect(t.Rosette['2022-01'].unknown).toBe(2); // no sourced rule
    expect(Object.keys(t.Rust)).toEqual(['2022-01']); // December is history, not counted
    expect(t.Healthy).toBeUndefined();
  });
});
