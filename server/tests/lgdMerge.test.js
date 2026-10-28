import { describe, expect, test } from '@jest/globals';
import { createRequire } from 'node:module';
import { merge } from '../scripts/merge_lgd.js';
import { lgdDistrict, lgdFromImd } from '../utils/districts.js';

const require = createRequire(import.meta.url);

// Bringing the district list up to date (scripts/merge_lgd.js, server/data/README.md): codes are what SACHET uses and they do not change; names do.
const old = [[1, 'Anantnag', 'Jammu and Kashmir'], [100, 'Ganganagar', 'Rajasthan'], [362, 'Khordha', 'Odisha'], [440, 'The Dangs', 'Gujarat']];

describe('merge', () => {
  test('a code already known keeps its name and state: IMD\'s names were paired with those spellings', () => {
    const { merged, renamed, added } = merge(old, [[1, 'Anantnag', 'Jammu And Kashmir'], [100, 'Sri Ganganagar', 'Rajasthan'], [362, 'Khordha', 'Odisha'], [440, 'The Dangs', 'Gujarat']]);
    expect(merged).toEqual(old);
    expect(added).toEqual([]);
    expect(renamed).toEqual([{ code: 100, was: 'Ganganagar, Rajasthan', now: 'Sri Ganganagar, Rajasthan' }]);   // a capital letter in a state is not a rename
  });

  test('a new code is added, its state written the way the file already writes it, and capitals in a name are tidied', () => {
    const { merged, added } = merge(old, [...old, [767, 'Deeg', 'Rajasthan'], [766, 'MAUGANJ', 'Madhya Pradesh'], [800, 'Kali-Bari', 'JAMMU AND KASHMIR'], [801, 'Kota', 'Jammu And Kashmir']]);
    expect(added).toEqual([[767, 'Deeg', 'Rajasthan'], [766, 'Mauganj', 'Madhya Pradesh'], [800, 'Kali-Bari', 'Jammu and Kashmir'], [801, 'Kota', 'Jammu and Kashmir']]);
    expect(merged.map((r) => r[0])).toEqual([1, 100, 362, 440, 766, 767, 800, 801]);       // in code order
  });

  test('a stray space around a name is removed from the old rows too', () => {
    expect(merge([[760, 'Manendragarh Chirimiri Bharatpur ', 'Chhattisgarh']], []).merged).toEqual([[760, 'Manendragarh Chirimiri Bharatpur', 'Chhattisgarh']]);
  });

  test('a code missing from the new list is kept (an old alert may still name it) and reported', () => {
    const { merged, missing } = merge(old, old.slice(0, 2));
    expect(merged).toHaveLength(4);
    expect(missing.map((r) => r[0])).toEqual([362, 440]);
  });
});

describe('the district data of the server (refreshed 28 Oct 2026 from the Local Government Directory)', () => {
  const lgd = require('../data/lgd_districts.json');
  const imd = require('../data/imd_lgd.json');

  test('787 districts, each code once, 36 states and union territories spelled one way each', () => {
    expect(lgd).toHaveLength(787);
    expect(new Set(lgd.map((r) => r[0])).size).toBe(787);
    expect(new Set(lgd.map((r) => r[2])).size).toBe(36);
    expect(lgd.every((r) => Number.isInteger(r[0]) && r[1] && r[2] && r[1] === r[1].trim())).toBe(true);
    expect(lgd.filter((r) => r[1] === r[1].toUpperCase() && r[1].length > 3)).toEqual([]);   // no name left in capitals
  });

  test('the districts created since Oct 2023 are there with their codes, and old ones are unchanged', () => {
    expect(lgdDistrict(767)).toEqual({ code: 767, name: 'Deeg', state: 'Rajasthan' });
    expect(lgdDistrict(772)).toMatchObject({ name: 'Phalodi', state: 'Rajasthan' });
    expect(lgdDistrict(766)).toMatchObject({ name: 'Mauganj', state: 'Madhya Pradesh' });
    expect(lgdDistrict(36)).toMatchObject({ name: 'Ludhiana', state: 'Punjab' });
    expect(lgdDistrict(23)).toMatchObject({ name: 'Shimla', state: 'Himachal Pradesh' });
    expect(lgdDistrict(671)).toMatchObject({ name: 'Shahdara', state: 'Delhi' });             // not in the newest list, kept
  });

  test('every district IMD names points at a code that exists, and the map did not change with the refresh', () => {
    const codes = new Set(lgd.map((r) => r[0]));
    expect(Object.values(imd).every((c) => codes.has(c))).toBe(true);
    expect(Object.keys(imd)).toHaveLength(729);                                              // 12 of IMD's 741 have no LGD district (two are in Pakistan-administered Kashmir)
    expect(lgdFromImd('PUNJAB', 'LUDHIANA')).toBe(36);
    expect(lgdFromImd('ODISHA', 'KHURDA')).toBe(362);
  });

  test('the spellings the news card and the prices card match on are the state names of this file', () => {
    const states = new Set(lgd.map((r) => r[2]));
    for (const s of ['Punjab', 'Uttarakhand', 'Chhattisgarh', 'Puducherry', 'Delhi', 'Andaman and Nicobar Islands', 'Jammu and Kashmir']) expect(states.has(s)).toBe(true);
  });
});
