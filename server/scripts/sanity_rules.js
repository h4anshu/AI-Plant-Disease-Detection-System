// Sanity check of the disease rules against the documented collection place and months of a dataset
// (docs/CONTEXT_LAYER.md "Sanity check"). Reads the weather rows written by geo-service/sanity_check.py and
// runs the same rule engine as the app, day by day. A report only: never used for training.
//   cd server && node scripts/sanity_rules.js [../docs/sanity/DS-09.json]
import fs from 'node:fs';
import { pathToFileURL } from 'node:url';
import { fit, KB } from '../utils/environmentFit.js';
import { seasonOf } from '../utils/context.js';

export const LEVELS = ['favourable', 'neutral', 'unfavourable', 'unknown'];

// dataset JSON -> { class: { 'YYYY-MM': { favourable: n, ... } } } over every day of the documented periods
export function tally(ds, kb = KB) {
  const classes = kb.classes.filter((c) => c.crop === ds.crop && c.cause_type !== 'healthy');
  const out = Object.fromEntries(classes.map((c) => [c.class, {}]));
  for (const period of ds.periods) {
    const days = period.days;
    days.forEach((d, i) => {
      if (d.date < period.start || d.date > period.end) return; // the 14 days before are history only
      const snapshot = { reference: { date: d.date }, weather: { days: days.slice(Math.max(0, i - 13), i + 1) },
        soil: null, season: seasonOf(d.date, kb), riskModel: null };
      for (const c of classes) {
        const month = d.date.slice(0, 7);
        const m = (out[c.class][month] ??= Object.fromEntries(LEVELS.map((l) => [l, 0])));
        m[fit(c, snapshot, null, kb.factors).level]++;
      }
    });
  }
  return out;
}

export function markdown(ds, t) {
  const months = [...new Set(Object.values(t).flatMap((m) => Object.keys(m)))].sort();
  const lines = [`| Class | ${months.join(' | ')} |`, `|---|${months.map(() => '---').join('|')}|`];
  for (const [cls, m] of Object.entries(t)) {
    lines.push(`| ${cls} | ${months.map((mo) => LEVELS.map((l) => m[mo]?.[l] ?? 0).join(' / ')).join(' | ')} |`);
  }
  return lines.join('\n');
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const file = process.argv[2] ?? new URL('../../docs/sanity/DS-09.json', import.meta.url);
  const ds = JSON.parse(fs.readFileSync(file, 'utf8'));
  console.log(`${ds.id} ${ds.crop}, ${ds.place}. Days per month: favourable / neutral / unfavourable / unknown\n`);
  console.log(markdown(ds, tally(ds)));
  // monthly weather, to read the table with
  for (const p of ds.periods) {
    const byMonth = {};
    for (const d of p.days.filter((x) => x.date >= p.start)) (byMonth[d.date.slice(0, 7)] ??= []).push(d);
    for (const [m, ds2] of Object.entries(byMonth)) {
      const avg = (k) => (ds2.reduce((s, d) => s + (d[k] ?? 0), 0) / ds2.length).toFixed(1);
      const sum = (k) => ds2.reduce((s, d) => s + (d[k] ?? 0), 0).toFixed(0);
      console.log(`${m}: Tmean ${avg('tmean')} °C, Tmin ${avg('tmin')}, RH ${avg('rhMean')}%, days with >= 6 h RH 90%+: ${ds2.filter((d) => d.hoursRh90 >= 6).length}, >= 12 h: ${ds2.filter((d) => d.hoursRh90 >= 12).length}, rain ${sum('rain')} mm`);
    }
  }
}
