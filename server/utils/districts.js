// District names and codes (docs/FIELD_ALERTS.md, "Official warnings"). SACHET alerts name districts by LGD code; IMD's layers by
// name, spelled their own way ("ODHISHA", "TAMILNADU", "BHATINDA"), so names are only ever compared after normalising, inside a state.
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

export const normState = (s) => String(s ?? '').toUpperCase().replace(/\(UT\)/g, '').replace(/&/g, ' AND ').replace(/\bTHE\b/g, '')
  .replace(/[^A-Z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim().replace(/^TAMILNADU$/, 'TAMIL NADU').replace(/^ODHISHA$/, 'ODISHA');
export const normDistrict = (d) => normState(d).replace(/ /g, '');
export const normKey = (state, district) => `${normState(state)}|${normDistrict(district)}`;

let tables;
const load = () => {
  tables ??= { lgd: new Map(require('../data/lgd_districts.json').map(([code, name, state]) => [code, { code, name, state }])), imd: require('../data/imd_lgd.json') };
  return tables;
};

// IMD's (state, district) -> the district's LGD code, or null when the bridge has no entry (that district gets no SACHET match)
export const lgdFromImd = (state, district) => load().imd[`${state}|${district}`] ?? null;
export const lgdDistrict = (code) => load().lgd.get(code) ?? null;
