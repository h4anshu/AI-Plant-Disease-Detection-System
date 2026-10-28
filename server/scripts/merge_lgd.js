// Brings server/data/lgd_districts.json up to date with a newer list of Local Government Directory districts.
//   node scripts/merge_lgd.js <new.json>        new.json: [[lgdCode, name, state], ...]
//   node scripts/build_district_map.js --lgd data/lgd_districts.json     (then rebuilds imd_lgd.json from it; check what it prints)
// Where the list came from and how to turn it into JSON: server/data/README.md.
// Rules: a code already in the file KEEPS its name and state (IMD's names were paired with those spellings; a renamed district changes its
// name in the directory but not its code, which is what SACHET uses); a new code is added, with its state written the way the file already
// writes it; a code that is missing from the new list is kept (a district that left a list may still be in an old alert). The differences are printed.
import fs from 'node:fs';
import { pathToFileURL } from 'node:url';
import { normState } from '../utils/districts.js';

const FILE = new URL('../data/lgd_districts.json', import.meta.url);

// -> { merged, added, renamed, missing }
// the directory writes a few names in capitals ("MAUGANJ")
const tidy = (name) => { const n = name.trim(); return n === n.toUpperCase() ? n.toLowerCase().replace(/(^|[\s-])(\p{L})/gu, (m, sep, c) => sep + c.toUpperCase()) : n; };

export function merge(old, incoming) {
  const spelling = new Map(old.map(([, , state]) => [normState(state), state]));
  const known = new Map(old.map((r) => [r[0], r]));
  const added = [];
  const renamed = [];
  for (const [code, name, state] of incoming) {
    const cur = known.get(code);
    if (!cur) added.push([code, tidy(name), spelling.get(normState(state)) ?? state]);
    else if (cur[1] !== name || normState(cur[2]) !== normState(state)) renamed.push({ code, was: `${cur[1]}, ${cur[2]}`, now: `${name}, ${state}` });
  }
  const inNew = new Set(incoming.map((r) => r[0]));
  const missing = old.filter((r) => !inNew.has(r[0]));
  // names are trimmed too: the portal's file had a trailing space on one of them
  return { merged: [...old, ...added].map(([code, name, state]) => [code, name.trim(), state]).sort((a, b) => a[0] - b[0]), added, renamed, missing };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const file = process.argv[2];
  if (!file) { console.error('usage: node scripts/merge_lgd.js <new.json>'); process.exit(1); }
  const incoming = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (!Array.isArray(incoming) || incoming.length < 700 || !incoming.every((r) => Number.isInteger(r[0]) && r[1] && r[2])) throw new Error('not a list of [code, name, state] with at least 700 districts');
  const { merged, added, renamed, missing } = merge(JSON.parse(fs.readFileSync(FILE, 'utf8')), incoming);
  fs.writeFileSync(FILE, `${JSON.stringify(merged)}\n`);
  console.log(`${merged.length} districts (${added.length} added, ${renamed.length} renamed in the directory but kept as they were, ${missing.length} not in the new list but kept)`);
  console.log(`added:\n${added.map((r) => `  ${r[0]} ${r[1]}, ${r[2]}`).join('\n')}`);
  console.log(`not in the new list:\n${missing.map((r) => `  ${r[0]} ${r[1]}, ${r[2]}`).join('\n')}`);
}
