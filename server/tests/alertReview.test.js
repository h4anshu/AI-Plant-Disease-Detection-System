import { describe, expect, test } from '@jest/globals';
import { readFileSync } from 'node:fs';
import { applyVerdicts, loadStore, resolveRow, reviewRows, reviewedIds, toCsv } from '../scripts/alert_review.js';
import { parseCsv } from '../scripts/rules_review.js';
import { reviewStatusOf } from '../utils/alertRules.js';

// The reviewer's sheet (docs/ALERT_REVIEW.csv) and what applying it does. Verdicts are applied to a copy of the real locale files and an
// empty store here, so the real ones are never touched.
const locales = () => ({ en: JSON.parse(readFileSync(new URL('../../client/src/locales/en.json', import.meta.url), 'utf8')), hi: JSON.parse(readFileSync(new URL('../../client/src/locales/hi.json', import.meta.url), 'utf8')) });
const fresh = () => ({ verdicts: {}, reviewed: [] });
const rows = () => reviewRows(fresh(), locales());
const verdict = (row_id, v, extra = {}) => ({ row_id, reviewer: 'Anshu Mishra', verdict: v, ...extra });
const apply = (filled, store = fresh(), l = locales()) => ({ store, l, ...applyVerdicts(filled, rows(), l, store, '2026-11-01') });
const numbersOf = (id) => rows().filter((r) => r.kind === 'number' && r.row_id.startsWith(`${id}.`)).map((r) => r.row_id);

describe('the sheet', () => {
  test('one row per rule and number, and per sentence in both languages, with the reviewer named', () => {
    const r = rows();
    expect(r.filter((x) => x.kind === 'rule').map((x) => x.row_id)).toContain('DRY-SPELL-1');
    expect(r.filter((x) => x.kind === 'number').map((x) => x.row_id)).toContain('FIRE-NEAR-1.bands');
    const head = r.find((x) => x.row_id === 'FIRE-NEAR-1.head');
    expect(head).toMatchObject({ kind: 'text' });
    expect(head.en).toContain('{{km}}');
    expect(head.hi).toMatch(/[ऀ-ॿ]/);
    expect(r.every((x) => x.reviewer === 'Anshu Mishra')).toBe(true);
  });

  test('every rule that speaks has its sentences in both languages (the sheet has no empty Hindi)', () => {
    expect(rows().filter((x) => x.kind === 'text' && !x.hi)).toEqual([]);
  });

  test('a recorded verdict is shown on the regenerated sheet, and the sheet survives a trip through CSV', () => {
    const store = { verdicts: { 'HEAT-RICE-1': { reviewer: 'Anshu Mishra', verdict: 'change', corrected_value: 'warn at 36', notes: 'see ICAR' } }, reviewed: [] };
    const r = reviewRows(store, locales());
    expect(r.find((x) => x.row_id === 'HEAT-RICE-1')).toMatchObject({ verdict: 'change', corrected_value: 'warn at 36', notes: 'see ICAR' });
    const back = parseCsv(toCsv(r));
    expect(back).toHaveLength(r.length);
    expect(back.find((x) => x.row_id === 'HEAT-RICE-1')).toMatchObject({ verdict: 'change', notes: 'see ICAR' });
    expect(back.find((x) => x.row_id === 'FIRE-NEAR-1.head').hi).toBe(r.find((x) => x.row_id === 'FIRE-NEAR-1.head').hi);
  });
});

describe('applying verdicts', () => {
  test('an ok on the one row of a rule makes it reviewed', () => {
    const { store, done, todo } = apply([verdict('FROST-WHEAT-1', 'ok', { notes: 'matches IMD' })]);
    expect(done).toEqual(['FROST-WHEAT-1: ok']);
    expect(todo).toEqual([]);
    expect(store.reviewed).toEqual(['FROST-WHEAT-1']);
    expect(store.verdicts['FROST-WHEAT-1']).toMatchObject({ reviewer: 'Anshu Mishra', verdict: 'ok', date: '2026-11-01', notes: 'matches IMD', our_value: 'warn at 2; watch at 4' });
  });

  test('a rule with several rows (fire: the bands and the window) is reviewed only when all of them are ok', () => {
    const ids = numbersOf('FIRE-NEAR-1');
    expect(ids).toEqual(['FIRE-NEAR-1.bands', 'FIRE-NEAR-1.window']);
    expect(apply([verdict(ids[0], 'ok')]).store.reviewed).toEqual([]);
    expect(apply(ids.map((i) => verdict(i, 'ok'))).store.reviewed).toEqual(['FIRE-NEAR-1']);
  });

  test('a verdict row with no verdict is skipped; a wrong verdict, an empty reviewer or an unknown row is an error', () => {
    expect(apply([verdict('FROST-WHEAT-1', '')]).done).toEqual([]);
    expect(() => apply([verdict('FROST-WHEAT-1', 'maybe')])).toThrow('verdict must be ok, change or reject');
    expect(() => apply([{ row_id: 'FROST-WHEAT-1', verdict: 'ok', reviewer: '' }])).toThrow('reviewer is empty');
    expect(() => apply([verdict('NOPE-1', 'ok')])).toThrow('unknown row');
  });

  test('a changed number cannot be applied by a script: it is recorded, listed for the code, and the rule stays draft until it is resolved', () => {
    const r = apply([verdict('HEAT-RICE-1', 'change', { corrected_value: 'warn at 36, watch at 34' })]);
    expect(r.todo[0]).toContain('HEAT-RICE-1: change "warn at 35; watch at 33" to "warn at 36, watch at 34" in the code');
    expect(r.store.verdicts['HEAT-RICE-1']).toMatchObject({ verdict: 'change', pending: true });
    expect(r.store.reviewed).toEqual([]);
    expect(() => apply([verdict('HEAT-RICE-1', 'change')])).toThrow('needs corrected_value');
  });

  test('once the code was changed, resolving it makes the row ok for the new value; a changed value after sign-off puts the rule back to draft', () => {
    const { store } = apply([verdict('HEAT-RICE-1', 'change', { corrected_value: 'warn at 36' })]);
    const current = rows().map((x) => (x.row_id === 'HEAT-RICE-1' ? { ...x, our_value: 'warn at 36; watch at 34' } : x)); // what the code says after the edit
    resolveRow('HEAT-RICE-1', current, store, '2026-11-02');
    expect(store.verdicts['HEAT-RICE-1']).toMatchObject({ verdict: 'ok', pending: false, our_value: 'warn at 36; watch at 34', date: '2026-11-02' });
    expect(store.reviewed).toEqual(['HEAT-RICE-1']);
    expect(reviewedIds(rows(), store)).toEqual([]);   // the real code still says 35 / 33: the sign-off no longer matches it
    expect(() => resolveRow('FROST-WHEAT-1', current, store)).toThrow('nothing is waiting');
  });

  test('a rejected rule is listed for removal and never counts as reviewed', () => {
    const r = apply([verdict('RAIN-SPRAY-1', 'reject', { notes: 'too noisy' })]);
    expect(r.todo[0]).toContain('RAIN-SPRAY-1: rejected - remove this rule');
    expect(r.store.reviewed).toEqual([]);
    expect(() => resolveRow('RAIN-SPRAY-1', rows(), r.store)).toThrow('rejected row cannot be resolved');
  });
});

describe('applying wording', () => {
  test('a corrected Hindi sentence replaces the old one in the locale file, keeps its placeholders and counts as ok', () => {
    const text = 'सूखा दौर: लगातार {{value}} दिन से बारिश नहीं ({{day}})। सिंचाई करें।';
    const { l, store, done } = apply([verdict('DRY-SPELL-2.head', 'change', { hindi_corrected: text })]);
    expect(l.hi.alerts.rules['DRY-SPELL-2'].head).toBe(text);
    expect(l.en.alerts.rules['DRY-SPELL-2'].head).toContain('Dry spell');     // English untouched
    expect(store.verdicts['DRY-SPELL-2.head']).toMatchObject({ verdict: 'ok', notes: 'Hindi rewritten' });
    expect(done).toEqual(['DRY-SPELL-2.head: ok']);
  });

  test('both languages can be corrected at once; the notes say which', () => {
    const { l, store } = apply([verdict('FIRE-NEAR-1.why', 'change', { en_corrected: 'Seen {{count}} times, nearest {{km}} km.', hindi_corrected: '{{count}} बार दिखी, सबसे पास {{km}} किमी।', notes: 'shorter' })]);
    expect(l.en.alerts.rules['FIRE-NEAR-1'].why).toBe('Seen {{count}} times, nearest {{km}} km.');
    expect(l.hi.alerts.rules['FIRE-NEAR-1'].why).toBe('{{count}} बार दिखी, सबसे पास {{km}} किमी।');
    expect(store.verdicts['FIRE-NEAR-1.why'].notes).toBe('English and Hindi rewritten; shorter');
  });

  test('a sentence that loses or invents a placeholder is refused (the screen would show the raw {{braces}} or lose a number)', () => {
    expect(() => apply([verdict('DRY-SPELL-1.head', 'change', { hindi_corrected: 'सूखा दौर, सिंचाई करें।' })])).toThrow('must keep the placeholders');
    expect(() => apply([verdict('DRY-SPELL-1.head', 'change', { en_corrected: 'Dry {{value}} {{day}} {{extra}}' })])).toThrow('must keep the placeholders');
  });

  test('"change" with no new text is an error, and an ok on a sentence changes nothing', () => {
    expect(() => apply([verdict('DRY-SPELL-1.head', 'change')])).toThrow('needs en_corrected or hindi_corrected');
    const { l, store } = apply([verdict('DRY-SPELL-1.head', 'ok')]);
    expect(l.hi.alerts.rules['DRY-SPELL-1'].head).toBe(locales().hi.alerts.rules['DRY-SPELL-1'].head);
    expect(store.reviewed).toEqual([]);          // wording does not make a rule reviewed
  });
});

describe('what the server reads', () => {
  test('a rule is a draft unless the store lists it as reviewed', () => {
    expect(reviewStatusOf('FROST-WHEAT-1')).toBe(loadStore().reviewed.includes('FROST-WHEAT-1') ? 'reviewed' : 'draft');
    expect(reviewStatusOf('NO-SUCH-RULE')).toBe('draft');
  });

  test('the committed store is not stale: every sign-off still matches the code, and `reviewed` is exactly what its rows say', () => {
    const store = loadStore();
    const current = rows();
    for (const [id, v] of Object.entries(store.verdicts)) {
      const row = current.find((r) => r.row_id === id);
      expect(row).toBeDefined();
      if (row.kind !== 'text' && v.verdict === 'ok' && !v.pending) expect(v.our_value).toBe(row.our_value);   // else: a number was changed after the sign-off; review it again
    }
    expect(store.reviewed).toEqual(reviewedIds(current, store));
  });
});
