// Agronomist review of the disease rules (knowledge/disease_rules.json, docs/DISEASE_RULES.md).
//   cd server && npm run rules-review                     -> writes docs/RULES_REVIEW.csv (everything not yet reviewed)
//   cd server && npm run rules-review -- --apply <file>   -> applies a filled-in copy of that CSV, then rewrites it
// One row per rule, plus one row per class without rules (so its no_rule_reason gets checked too).
// Reviewer columns: reviewer, verdict (ok | change | reject), corrected_value, notes.
//   ok      the rule (or the no-rule reason) is right
//   change  replace the value: a number (28), a range (20-30) or, for season, a list (kharif;zaid)
//   reject  delete the rule; the class keeps a no_rule_reason when no rule is left
// A class becomes review_status "reviewed" when every row of it has a verdict.
// UTF-8 with a BOM so Excel opens it cleanly; tests/knowledge.test.js fails if the CSV is stale.
import fs from 'node:fs';
import { pathToFileURL } from 'node:url';

const ROOT = new URL('../../', import.meta.url);
export const RULES_PATH = new URL('server/knowledge/disease_rules.json', ROOT);
export const CSV_PATH = new URL('docs/RULES_REVIEW.csv', ROOT);
const COLUMNS = ['row_id', 'crop', 'class', 'rule', 'role', 'weight', 'our_reading', 'source', 'source_url',
  'section_or_page', 'quote_or_numbers', 'reviewer', 'verdict', 'corrected_value', 'notes'];
const OPS = { lt: '<', le: '<=', gt: '>', ge: '>=', between: 'between', in: 'in' };

export const loadRules = () => JSON.parse(fs.readFileSync(RULES_PATH, 'utf8'));

export function ruleText(r, factors) {
  const v = r.op === 'between' ? `${r.value[0]}–${r.value[1]}` : Array.isArray(r.value) ? r.value.join(', ') : r.value;
  const what = r.factor === 'wetDays' ? `days with >= ${r.hours} h at RH >= 90%` : factors[r.factor]?.label ?? r.factor;
  const win = r.window_days ? `, last ${r.window_days} days` : '';
  return `${what} ${OPS[r.op]} ${v} ${r.unit}${win}`;
}

export function reviewRows(kb = loadRules()) {
  const rows = [];
  for (const c of kb.classes) {
    if (c.cause_type === 'healthy') continue; // nothing to review
    const src = (id) => c.sources.find((s) => s.id === id) ?? {};
    const base = { crop: c.crop, class: c.class };
    if (c.rules.length === 0 && !c.reviewed_by) {
      const s = c.sources[0] ?? {};
      rows.push({ ...base, row_id: `${c.crop}.${c.class}.none`,
        rule: c.model_ref ? `uses the published model ${c.model_ref} (docs/DISEASE_RISK.md)` : `NO RULE: ${c.no_rule_reason}`,
        source: s.title, source_url: s.url, section_or_page: s.section_or_page, quote_or_numbers: s.quote_or_numbers });
    }
    for (const r of c.rules) {
      if (r.reviewed_by) continue;
      const s = src(r.source_id);
      rows.push({ ...base, row_id: r.id, rule: ruleText(r, kb.factors), role: r.role, weight: r.weight,
        our_reading: r.reading, source: s.title, source_url: s.url, section_or_page: s.section_or_page,
        quote_or_numbers: s.quote_or_numbers });
    }
  }
  return rows;
}

const cell = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
export const toCsv = (rows) => '﻿' + [COLUMNS, ...rows.map((r) => COLUMNS.map((c) => r[c]))]
  .map((line) => line.map(cell).join(',')).join('\n') + '\n'; // LF: .gitattributes stores text as LF

// RFC 4180 reader (quoted fields, doubled quotes, newlines inside quotes), enough for Excel's CSV output
export function parseCsv(text) {
  const rows = [];
  let row = [], field = '', quoted = false;
  const s = text.replace(/^﻿/, '');
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (quoted) {
      if (ch === '"' && s[i + 1] === '"') { field += '"'; i++; } else if (ch === '"') quoted = false; else field += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') { row.push(field); field = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && s[i + 1] === '\n') i++;
      row.push(field); rows.push(row); row = []; field = '';
    } else field += ch;
  }
  if (field || row.length) { row.push(field); rows.push(row); }
  const [head, ...body] = rows.filter((r) => r.some((x) => x !== ''));
  return body.map((r) => Object.fromEntries(head.map((h, i) => [h.trim(), (r[i] ?? '').trim()])));
}

export function parseValue(text, rule) {
  if (rule.op === 'in') return text.split(/[;,]/).map((x) => x.trim()).filter(Boolean);
  if (rule.op === 'between') {
    const m = text.match(/^(-?[\d.]+)\s*[-–to]+\s*(-?[\d.]+)$/);
    if (!m) throw new Error(`${rule.id}: corrected_value "${text}" is not a range like 20-30`);
    return [Number(m[1]), Number(m[2])];
  }
  const n = Number(text);
  if (!Number.isFinite(n)) throw new Error(`${rule.id}: corrected_value "${text}" is not a number`);
  return n;
}

// Applies the verdicts in `rows` to the knowledge base (in place) and returns what changed.
export function applyReview(kb, rows, today = new Date().toISOString().slice(0, 10)) {
  const done = [];
  for (const row of rows) {
    const verdict = row.verdict?.toLowerCase();
    if (!verdict) continue;
    if (!['ok', 'change', 'reject'].includes(verdict)) throw new Error(`${row.row_id}: verdict must be ok, change or reject`);
    if (!row.reviewer) throw new Error(`${row.row_id}: reviewer is empty`);
    const stamp = { reviewer: row.reviewer, verdict, date: today, notes: row.notes || undefined };
    const c = kb.classes.find((x) => row.row_id.startsWith(`${x.crop}.${x.class}.`));
    if (!c) throw new Error(`${row.row_id}: unknown class`);
    if (row.row_id.endsWith('.none')) {
      if (verdict === 'change') throw new Error(`${row.row_id}: a class without rules can only be ok or reject; add new rules in the JSON`);
      c.reviewed_by = stamp;
    } else {
      const i = c.rules.findIndex((r) => r.id === row.row_id);
      if (i < 0) throw new Error(`${row.row_id}: unknown rule`);
      if (verdict === 'reject') {
        c.rules.splice(i, 1);
        if (c.rules.length === 0) {
          c.no_rule_reason = `Rule rejected by the reviewer${row.notes ? `: ${row.notes}` : ''}`;
          c.reviewed_by = stamp;
        }
      } else {
        if (verdict === 'change') c.rules[i].value = parseValue(row.corrected_value, c.rules[i]);
        c.rules[i].reviewed_by = stamp;
      }
    }
    done.push(`${row.row_id}: ${verdict}`);
  }
  for (const c of kb.classes) {
    const complete = c.rules.length ? c.rules.every((r) => r.reviewed_by) : Boolean(c.reviewed_by);
    if (complete && c.cause_type !== 'healthy') c.review_status = 'reviewed';
  }
  return done;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const i = process.argv.indexOf('--apply');
  if (i > 0) {
    const kb = loadRules();
    const done = applyReview(kb, parseCsv(fs.readFileSync(process.argv[i + 1], 'utf8')));
    fs.writeFileSync(RULES_PATH, JSON.stringify(kb, null, 2) + '\n');
    console.log(done.join('\n') || 'no verdicts found');
  }
  const rows = reviewRows();
  fs.writeFileSync(CSV_PATH, toCsv(rows));
  console.log(`${rows.length} rows need review -> docs/RULES_REVIEW.csv`);
}
