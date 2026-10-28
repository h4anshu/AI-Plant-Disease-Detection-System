// Rebuilds server/data/lgd_districts.json and server/data/imd_lgd.json (docs/FIELD_ALERTS.md, "Official warnings").
//
//   node scripts/build_district_map.js [--lgd <csv path or URL>] [--imd <india_districts json path or URL>]
//
// lgd_districts.json: [[lgdCode, name, state], ...] from the India Data Portal "District LGD Codes" CSV (Open Data Commons
// Attribution License; the codes are the Local Government Directory's, which SACHET alerts use).
// imd_lgd.json: { "IMD STATE|IMD DISTRICT": lgdCode } for every district of IMD's `india_districts` layer. A district is matched
// by its normalised name inside its state; the rest by manual aliases (data/imd_lgd_aliases.json, reviewed by hand) and, last, by
// a very similar name inside the same state (printed, so each guess can be checked). Districts left over are listed and get no
// SACHET match (their IMD warning still works).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { normDistrict, normKey, normState } from '../utils/districts.js';

const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), '../data');
const arg = (name, fallback) => { const i = process.argv.indexOf(name); return i > 0 ? process.argv[i + 1] : fallback; };
const LGD = arg('--lgd', 'https://ckandev.indiadataportal.com/dataset/a7419751-ac37-46ad-b938-638cda7b7b60/resource/19df978a-675e-4ff5-8015-d0e1de447319/download/district-lgd-codes.csv');
const IMD = arg('--imd', 'https://reactjs.imd.gov.in/geoserver/wfs?service=WFS&version=1.0.0&request=GetFeature&typeName=imd:india_districts&outputFormat=application/json&propertyName=state,district');
const UA = 'Mozilla/5.0 (compatible; PlantGuardBuild/1.0)';

const read = async (src) => (/^https?:/.test(src) ? (await fetch(src, { headers: { 'user-agent': UA } })).text() : fs.readFileSync(src, 'utf8'));
const csvRow = (line) => [...line.matchAll(/(?:"([^"]*)"|([^,]*))(?:,|$)/g)].map((m) => m[1] ?? m[2]);

const bigrams = (s) => { const t = s.replace(/ /g, ''); return new Set(Array.from({ length: Math.max(t.length - 1, 0) }, (_, i) => t.slice(i, i + 2))); };
const dice = (a, b) => { const x = bigrams(a); const y = bigrams(b); let n = 0; x.forEach((g) => { if (y.has(g)) n += 1; }); return (2 * n) / (x.size + y.size || 1); };

// a .json list ([[code, name, state], ...], as scripts/merge_lgd.js writes it) is used as it is; anything else is the portal's CSV
const lgd = LGD.endsWith('.json') ? JSON.parse(await read(LGD)) : (await read(LGD)).trim().split(/\r?\n/).slice(1).map(csvRow).map((c) => [Number(c[2]), c[1], c[5]]);
if (lgd.length < 700 || !lgd.every((r) => Number.isInteger(r[0]) && r[1] && r[2])) throw new Error(`the district list has ${lgd.length} usable rows: refusing to overwrite the data files`);
const imd = JSON.parse(await read(IMD)).features.map((f) => f.properties).filter((p) => p.state && p.district);
const aliases = JSON.parse(fs.readFileSync(path.join(dir, 'imd_lgd_aliases.json'), 'utf8'));

const byKey = new Map(lgd.map(([code, name, state]) => [normKey(state, name), code]));
// districts IMD names exactly are taken; a guess may only pick from the others ("RAE BAREILLY" must not become Bareilly)
const taken = new Set(imd.map(({ state, district }) => byKey.get(normKey(state, district))).filter(Boolean));
const byState = new Map();
lgd.filter(([code]) => !taken.has(code)).forEach(([code, name, state]) => { const k = normState(state); byState.set(k, [...(byState.get(k) ?? []), [code, name]]); });

const map = {}; const guessed = []; const left = [];
for (const { state, district } of imd) {
  const key = `${state}|${district}`;
  const exact = byKey.get(normKey(state, district));
  if (aliases[key]) map[key] = aliases[key];
  else if (exact) map[key] = exact;
  else {
    const same = (byState.get(normState(state)) ?? []).map(([code, name]) => [code, name, dice(normDistrict(district), normDistrict(name))]).sort((a, b) => b[2] - a[2]);
    if (same[0] && same[0][2] >= 0.8 && (!same[1] || same[0][2] - same[1][2] >= 0.1)) { map[key] = same[0][0]; guessed.push(`${key}  ->  ${same[0][1]} (${same[0][0]}, ${same[0][2].toFixed(2)})`); }
    else left.push(`${key}   still free in ${state}: ${same.slice(0, 6).map((s) => `${s[1]} ${s[0]}`).join(' | ')}`);
  }
}

fs.writeFileSync(path.join(dir, 'lgd_districts.json'), `${JSON.stringify(lgd)}\n`);
fs.writeFileSync(path.join(dir, 'imd_lgd.json'), `${JSON.stringify(map, null, 0).replace(/,"/g, ',\n"')}\n`);
console.log(`LGD districts: ${lgd.length}; IMD districts: ${imd.length}; mapped: ${Object.keys(map).length} (by alias ${Object.keys(map).filter((k) => aliases[k]).length}, by similar name ${guessed.length}); not mapped: ${left.length}`);
if (guessed.length) console.log(`\nSimilar-name guesses (check each):\n${guessed.join('\n')}`);
if (left.length) console.log(`\nNot mapped:\n${left.join('\n')}`);
