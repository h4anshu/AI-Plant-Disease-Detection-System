// Writes docs/TRANSLATION_REVIEW.csv: every Hindi name and piece of advice still marked needs_review, for
// an agronomist. Run after editing client/src/locales/terms.json or utils/treatmentMap.hi.js:
//   cd server && npm run translation-review
// UTF-8 with a BOM so Excel shows the Devanagari correctly. tests/i18n.test.js fails if the file is stale.
import fs from 'node:fs';
import { pathToFileURL } from 'node:url';
import { FALLBACK_TREATMENT, treatmentMap } from '../utils/treatmentMap.js';
import { FALLBACK_TREATMENT_HI, treatmentMapHi } from '../utils/treatmentMap.hi.js';

const ROOT = new URL('../../', import.meta.url);
export const CSV_PATH = new URL('docs/TRANSLATION_REVIEW.csv', ROOT);
const COLUMNS = ['type', 'crop', 'key', 'english', 'hindi_draft', 'source', 'needs_review',
  'hindi_corrected', 'reviewer', 'notes'];

export function reviewRows() {
  const terms = JSON.parse(fs.readFileSync(new URL('client/src/locales/terms.json', ROOT), 'utf8'));
  const row = (type, crop, key, en, hi) => ({ type, crop, key, english: en, hindi_draft: hi.hi ?? hi.text,
    source: hi.source, needs_review: hi.needs_review });
  const rows = [
    ...Object.entries(terms.crops).map(([c, e]) => row('crop_name', c, c, e.en, e)),
    ...Object.entries(terms.diseases).flatMap(([c, m]) => Object.entries(m).map(([d, e]) => row('disease_name', c, d, e.en, e))),
    ...Object.entries(terms.severity).map(([s, e]) => row('severity_label', '', s, e.en, e)),
    ...Object.entries(treatmentMap).flatMap(([c, m]) => Object.keys(m).map((d) =>
      row('treatment_advice', c, d, m[d], treatmentMapHi[c][d]))),
    row('treatment_advice', '', 'FALLBACK', FALLBACK_TREATMENT, FALLBACK_TREATMENT_HI),
  ];
  return rows.filter((r) => r.needs_review);
}

const cell = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
export const toCsv = (rows) => '﻿' + [COLUMNS, ...rows.map((r) => COLUMNS.map((c) => r[c]))]
  .map((line) => line.map(cell).join(',')).join('\n') + '\n'; // LF: .gitattributes stores text as LF

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const rows = reviewRows();
  fs.writeFileSync(CSV_PATH, toCsv(rows));
  console.log(`${rows.length} entries need review -> docs/TRANSLATION_REVIEW.csv`);
}
