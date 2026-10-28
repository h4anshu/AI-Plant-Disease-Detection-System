// Review sheet for the weather-alert rules and their words (docs/FIELD_ALERTS.md). Same idea as scripts/rules_review.js.
//   cd server && npm run alerts-review                       -> writes docs/ALERT_REVIEW.csv
//   cd server && npm run alerts-review -- --apply <file>     -> applies a filled-in copy of it (verdicts are kept in server/data/alert_review.json)
//   cd server && npm run alerts-review -- --resolve <row_id> -> after a changed number was changed in the code
// One row per rule or number (kind "rule"/"number") and one per sentence of advice (kind "text", English and Hindi side by side).
// The reviewer fills: verdict (ok | change | reject), corrected_value (a number) or hindi_corrected / en_corrected (a sentence), notes.
// --apply: a rule becomes "reviewed" (alerts say so, and the screen drops the word draft) only when every one of its rows is ok and the
// code still has the value that was reviewed. A corrected sentence (en_corrected / hindi_corrected) is written into the locale files; a
// corrected number or a rejected rule is listed for a person to change in the code.
// UTF-8 with a BOM so Excel opens it cleanly.
import fs from 'node:fs';
import { RULES } from '../utils/alertRules.js';
import { parseCsv } from './rules_review.js';

const ROOT = new URL('../../', import.meta.url);
const CSV_PATH = new URL('docs/ALERT_REVIEW.csv', ROOT);
const REVIEWER = 'Anshu Mishra';
const COLUMNS = ['row_id', 'kind', 'what', 'our_value', 'basis', 'en', 'hi', 'reviewer', 'verdict', 'corrected_value', 'en_corrected', 'hindi_corrected', 'notes'];

// where each number comes from (docs/FIELD_ALERT_PLAN.md section 5, docs/FIELD_ALERTS.md section 2); "ours" = chosen by us, to be set by the reviewer
const BASIS = {
  'FROST-WHEAT-1': '4 and 2 °C mirror IMD cold-wave levels; the damage data is US/Australian, an Indian source is still needed',
  'FROST-POTATO-1': 'ours; ICAR-CPRI: furrow irrigation before a frost prevents much of the damage',
  'HEAT-WHEAT-1': '34 °C: Lobell et al. 2012 (northern India); 36 °C on 2 days in a row is ours',
  'HEAT-RICE-1': 'pollen sterility rises above 33 °C and sharply at 35 °C; the action (keep shallow water) needs review',
  'HEAT-ANY-1': 'IMD heat wave in the plains (Tmax 40 °C or more); hills use 30 °C and are not covered yet',
  'RAIN-HARVEST-1': 'ours (10 and 30 mm a day); IMD agromet bulletins say harvest the ripe crop before heavy rain',
  'RAIN-HEAVY-1': '64.5 mm a day is IMD "heavy"; 40 mm is ours',
  'RAIN-SPRAY-1': 'ours (10 mm a day, today or tomorrow)',
  'DRY-SPELL-1': 'a dry day is under 2.5 mm and 7 / 14 days are the counts IMD Mausam Sankalp uses; limiting it to sowing, flowering and grain filling is ours; only the rain-fed crops (rice, maize, groundnut, pigeonpea, blackgram) get it, and an irrigated field should ignore it',
  'DRY-SPELL-2': 'as DRY-SPELL-1; a young crop (vegetative) waits for 14 days and only gets a watch (ours)',
};
const NUMBERS = [
  ['FLOOD-RIVER-1.p95', 'River flow: a watch above this percentile of the river\'s own 2005-2022 history, and rising', '95th percentile', 'a proposal; no forecast skill for Indian rivers is published (research 3.4)'],
  ['FLOOD-RIVER-1.p99', 'River flow: a warning above this percentile (never when the peak is 4 or more days out)', '99th percentile', 'a proposal, as above'],
  ['FLOOD-RIVER-1.min_flow', 'River flow: the smallest river that gets a river signal', '50 m3/s (mean of the next 7 days)', 'ours: separates a drain (2 m3/s at Ludhiana) from the Sutlej (200)'],
  ['FLOOD-RADAR.water_db', 'Satellite radar: VV backscatter below this counts as water', '-16 dB', 'typical open water is -15 to -20 dB, land -5 to -12; ours'],
  ['FLOOD-RADAR.possible', 'Satellite radar: share of the 500 m circle that is new water for "possible"', '5 %', 'ours'],
  ['FLOOD-RADAR.likely', 'Satellite radar: share of the 500 m circle that is new water for "likely"', '20 %', 'ours'],
  ['DISEASE-NEAR-1.min_phones', 'Disease reports nearby: how many different phones must report the same disease (the phone of the field owner never counts)', '3 phones', 'the same rule as the public disease map (MIN_DEVICES)'],
  ['DISEASE-NEAR-1.watch', 'Disease reports nearby: from this many phones the alert is a watch, below it a tip', '6 phones', 'ours'],
  ['DISEASE-NEAR-1.area', 'Disease reports nearby: the area and the time that count', 'about 5 km (19 hexagons of 5 km2), the last 14 days', 'ours; the reports are AI readings of photos, not lab results'],
  ['FIRE-NEAR-1.bands', 'Fire near the field (NASA satellite hot spots): distance for a warning, a watch and a tip', '1 km, 3 km, 5 km', 'ours; the alert asks only for a look around and the fire service number 101'],
  ['FIRE-NEAR-1.window', 'Fire near the field: how old a hot spot may be', '24 hours (VIIRS 375 m detections, low confidence dropped)', 'ours; satellites pass a few times a day and report hours late'],
  ['CWC.radius', 'CWC gauge: how far a gauge still counts as near the field', '25 km', 'ours'],
];

const EN_PATH = new URL('client/src/locales/en.json', ROOT);
const HI_PATH = new URL('client/src/locales/hi.json', ROOT);
export const STORE_PATH = new URL('server/data/alert_review.json', ROOT);
const EMPTY = () => ({ verdicts: {}, reviewed: [] });

// What the reviewer has said so far: verdicts by row, and the rules whose rows are all "ok" and unchanged since (the server reads `reviewed`)
export const loadStore = () => { try { return JSON.parse(fs.readFileSync(STORE_PATH, 'utf8')); } catch { return EMPTY(); } };
const readLocales = () => ({ en: JSON.parse(fs.readFileSync(EN_PATH, 'utf8')), hi: JSON.parse(fs.readFileSync(HI_PATH, 'utf8')) });

export function reviewRows(store = loadStore(), { en, hi } = readLocales()) {
  const rows = [];
  for (const r of RULES) {
    const where = [r.crops ? `crops: ${r.crops.join(', ')}` : 'any crop', r.stages ? `stages: ${r.stages.join(', ')}` : 'any stage'].join('; ');
    rows.push({ row_id: r.id, kind: 'rule', what: `${r.hazard}, ${r.metric} (${where})`,
      our_value: Object.entries(r.levels).map(([k, v]) => `${k} at ${v}`).join('; '), basis: BASIS[r.id] ?? '' });
  }
  for (const [row_id, what, our_value, basis] of NUMBERS) rows.push({ row_id, kind: 'number', what, our_value, basis });
  for (const id of Object.keys(en.alerts.rules)) {
    for (const part of ['head', 'why']) {
      rows.push({ row_id: `${id}.${part}`, kind: 'text', what: part === 'head' ? 'the advice shown first' : 'the explanation behind "Why this alert?"', en: en.alerts.rules[id][part], hi: hi.alerts.rules[id]?.[part] ?? '' });
    }
  }
  return rows.map((r) => {
    const v = store.verdicts[r.row_id];
    return { reviewer: REVIEWER, ...r, ...(v && { reviewer: v.reviewer, verdict: v.verdict, corrected_value: v.corrected_value ?? '', notes: v.notes ?? '' }) };
  });
}

// "FIRE-NEAR-1.bands" and "FIRE-NEAR-1" both belong to the rule FIRE-NEAR-1
const ruleOf = (row) => (row.kind === 'rule' ? row.row_id : row.row_id.split('.')[0]);

// A rule counts as reviewed when every one of its rule and number rows has an "ok" that is not waiting for a code change and was given for
// the value the code has now (a threshold changed after the sign-off puts the rule back to draft). Wording is reviewed separately.
export function reviewedIds(rows, store) {
  const byRule = new Map();
  for (const row of rows.filter((r) => r.kind !== 'text')) {
    const v = store.verdicts[row.row_id];
    byRule.set(ruleOf(row), (byRule.get(ruleOf(row)) ?? true) && v?.verdict === 'ok' && !v.pending && v.our_value === row.our_value);
  }
  return [...byRule].filter(([, ok]) => ok).map(([id]) => id).sort();
}

const placeholders = (s) => [...String(s).matchAll(/{{\s*(\w+)\s*}}/g)].map((m) => m[1]).sort().join(',');

// Applies the verdicts of a filled-in sheet. Wording ("change" with en_corrected / hindi_corrected) is written into the locale objects
// `{ en, hi }` (in place) and counts as done; a changed number or a rejected rule cannot be applied by a script, so it is recorded as
// pending and listed in `todo` for a person to change in the code. Returns { done, todo }; mutates `store` and the locale objects.
export function applyVerdicts(filled, current, { en, hi }, store, today = new Date().toISOString().slice(0, 10)) {
  const byId = new Map(current.map((r) => [r.row_id, r]));
  const done = [];
  const todo = [];
  for (const row of filled) {
    const verdict = row.verdict?.toLowerCase();
    if (!verdict) continue;
    if (!['ok', 'change', 'reject'].includes(verdict)) throw new Error(`${row.row_id}: verdict must be ok, change or reject`);
    if (!row.reviewer) throw new Error(`${row.row_id}: reviewer is empty`);
    const cur = byId.get(row.row_id);
    if (!cur) throw new Error(`${row.row_id}: unknown row (generate the sheet again)`);
    const rec = { reviewer: row.reviewer, verdict, date: today, notes: row.notes || undefined, our_value: cur.our_value };
    if (cur.kind === 'text') {
      if (verdict === 'change') {
        const cut = row.row_id.lastIndexOf('.');
        const [id, part] = [row.row_id.slice(0, cut), row.row_id.slice(cut + 1)];
        const fixes = [['English', row.en_corrected, en], ['Hindi', row.hindi_corrected, hi]].filter(([, text]) => text);
        if (!fixes.length) throw new Error(`${row.row_id}: "change" needs en_corrected or hindi_corrected`);
        for (const [name, text, locale] of fixes) {
          const old = locale.alerts.rules[id]?.[part];
          if (old === undefined) throw new Error(`${row.row_id}: no ${name} sentence to replace`);
          if (placeholders(old) !== placeholders(text)) throw new Error(`${row.row_id}: the ${name} sentence must keep the placeholders {{${placeholders(old).split(',').join('}}, {{')}}}`);
          locale.alerts.rules[id][part] = text;
        }
        rec.verdict = 'ok';
        rec.notes = [`${fixes.map(([name]) => name).join(' and ')} rewritten`, row.notes].filter(Boolean).join('; ');
      } else if (verdict === 'reject') todo.push(`${row.row_id}: rejected - rewrite or remove this sentence by hand`);
    } else if (verdict === 'change') {
      if (!row.corrected_value) throw new Error(`${row.row_id}: "change" needs corrected_value`);
      Object.assign(rec, { corrected_value: row.corrected_value, pending: true });
      todo.push(`${row.row_id}: change "${cur.our_value}" to "${row.corrected_value}" in the code, then run: npm run alerts-review -- --resolve ${row.row_id}`);
    } else if (verdict === 'reject') {
      rec.pending = true;
      todo.push(`${row.row_id}: rejected - remove this rule or number from the code, then run: npm run alerts-review -- --resolve ${row.row_id}`);
    }
    store.verdicts[row.row_id] = rec;
    done.push(`${row.row_id}: ${rec.verdict}${rec.pending ? ' (waiting for the code)' : ''}`);
  }
  store.reviewed = reviewedIds(current, store);
  return { done, todo };
}

// after a person changed the code as the reviewer said: the row is ok for the value the code has now
export function resolveRow(rowId, current, store, today = new Date().toISOString().slice(0, 10)) {
  const cur = current.find((r) => r.row_id === rowId);
  const rec = store.verdicts[rowId];
  if (!cur || !rec?.pending) throw new Error(`${rowId}: nothing is waiting for a code change`);
  if (rec.verdict === 'reject') throw new Error(`${rowId}: a rejected row cannot be resolved while it is still in the code`);
  store.verdicts[rowId] = { ...rec, verdict: 'ok', pending: false, date: today, our_value: cur.our_value, notes: [rec.notes, `changed to ${cur.our_value}`].filter(Boolean).join('; ') };
  store.reviewed = reviewedIds(current, store);
}

const cell = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
export const toCsv = (rows) => `﻿${COLUMNS.join(',')}\r\n${rows.map((r) => COLUMNS.map((c) => cell(r[c])).join(',')).join('\r\n')}\r\n`;

const save = (path, obj) => fs.writeFileSync(path, `${JSON.stringify(obj, null, 2)}\n`);

if (process.argv[1] && import.meta.url === new URL(`file:///${process.argv[1].replace(/\\/g, '/')}`).href) {
  const store = loadStore();
  const arg = (name) => { const i = process.argv.indexOf(name); return i > 0 ? process.argv[i + 1] : null; };
  if (arg('--apply')) {
    const locales = readLocales();
    const before = JSON.stringify(locales);
    const { done, todo } = applyVerdicts(parseCsv(fs.readFileSync(arg('--apply'), 'utf8')), reviewRows(store, locales), locales, store);
    if (JSON.stringify(locales) !== before) { save(EN_PATH, locales.en); save(HI_PATH, locales.hi); }
    save(STORE_PATH, store);
    console.log(done.join('\n') || 'no verdicts found');
    if (todo.length) console.log(`\nTO DO IN THE CODE:\n${todo.join('\n')}`);
  } else if (arg('--resolve')) {
    resolveRow(arg('--resolve'), reviewRows(store), store);
    save(STORE_PATH, store);
    console.log(`${arg('--resolve')}: resolved`);
  }
  const rows = reviewRows(loadStore());
  fs.writeFileSync(CSV_PATH, toCsv(rows));
  console.log(`wrote docs/ALERT_REVIEW.csv (${rows.length} rows); reviewed rules: ${loadStore().reviewed.join(', ') || 'none yet'}`);
}
