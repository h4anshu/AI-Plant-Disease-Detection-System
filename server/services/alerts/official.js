import { ImdWarning, OfficialAlert } from "../../models/OfficialAlert.js";
import { addDays, istDate } from "../../utils/context.js";
import { normDistrict } from "../../utils/districts.js";

// The official warnings that apply to a saved field, in the same shape as our own alerts where the screen needs it (level, date,
// offset, from, to) plus what only an official alert has: the issuer, the issue time, the expiry and the official wording.
// docs/FIELD_ALERTS.md, "Official warnings". Official text is passed on as published; we add no farm advice to it.
const IST_MS = 19800e3;
const RANK = { info: 0, watch: 1, warn: 2, urgent: 3 };
const MAX_OFFICIAL = 6;
const IMD_FRESH_MS = 36 * 3600e3;  // an IMD row not updated for this long is old news (some rows in the layer date from 2023)
const SACHET_LOOKAHEAD_MS = 72 * 3600e3;

// CAP severity -> our level (docs/FIELD_ALERT_PLAN.md §4); IMD colour 1 red, 2 orange, 3 yellow
export const CAP_LEVEL = { Extreme: 'urgent', Severe: 'warn', Moderate: 'watch', Minor: 'info', Unknown: 'info' };
export const IMD_LEVEL = { 3: 'watch', 2: 'warn', 1: 'urgent' };
// IMD's hazard codes (the legend of its own page): 2 heavy rain, 3 heavy snow, 4 thunderstorm and lightning, 5 hailstorm, 6 dust
// storm, 7 dust raising winds, 8 strong surface winds, 9 heat wave, 10 hot day, 11 warm night, 12 cold wave, 13 cold day,
// 14 ground frost, 15 fog, 16 very heavy rain, 17 extremely heavy rain. A family picks the icon.
const IMD_FAMILY = { 2: 'rain', 16: 'rain', 17: 'rain', 4: 'storm', 5: 'storm', 6: 'wind', 7: 'wind', 8: 'wind', 9: 'heat', 10: 'heat', 11: 'heat', 12: 'cold', 13: 'cold', 14: 'cold', 3: 'cold', 15: 'fog' };
const familyOfEvent = (event) => (/flood/i.test(event) ? 'flood' : /thunder|lightning|hail/i.test(event) ? 'storm' : /wind|gust|squall|cyclone|dust/i.test(event) ? 'wind' : /rain|shower|drizzle/i.test(event) ? 'rain'
  : /heat/i.test(event) ? 'heat' : /cold|frost|snow/i.test(event) ? 'cold' : /fog/i.test(event) ? 'fog' : 'other');

const local = (d) => new Date(d.getTime() + IST_MS).toISOString().slice(0, 16); // "2026-10-25T10:02", Indian time
const daysBetween = (a, b) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 864e5);
const worst = (a, b) => (RANK[b] > RANK[a] ? b : a);

const headlines = (infos) => Object.fromEntries(infos.filter((i) => i.headline).map((i) => [i.language.slice(0, 2).toLowerCase(), i.headline]));
const issuer = (sender) => String(sender).replace(/-/g, ' ');

function fromSachet(a, today, now) {
  const start = a.onset > now ? a.onset : now; // an alert already in force starts today
  const date = istDate(start);
  const en = a.infos.find((i) => /^en/i.test(i.language)) ?? a.infos[0];
  return {
    id: `SACHET|${a.identifier}`, origin: 'official', source: 'sachet', issuer: issuer(a.sender), level: CAP_LEVEL[a.severity] ?? 'info',
    family: familyOfEvent(a.event), event: a.event, headlines: headlines(a.infos), instruction: en?.instruction || null, area: a.areaDesc,
    date, offset: daysBetween(today, date), from: local(start), to: local(a.expires), issuedAt: a.sent.toISOString(), expires: a.expires.toISOString(),
    cap: { identifier: a.identifier, msgType: a.msgType, severity: a.severity, urgency: a.urgency, certainty: a.certainty },
    link: a.guid ? `https://sachet.ndma.gov.in/cap_public_website/FetchXMLFile?identifier=${encodeURIComponent(a.guid)}` : 'https://sachet.ndma.gov.in/',
  };
}

// IMD: one alert per day (today and the next two) where a district is not green; a field on a border keeps the worse level and every hazard
function fromImd(rows, today, now) {
  const out = [];
  for (let n = 1; n <= 3; n += 1) {
    const date = addDays(today, n - 1);
    const hits = rows.map((r) => ({ r, d: r.days.find((x) => x.n === n) })).filter(({ d }) => d && IMD_LEVEL[d.color]);
    if (!hits.length) continue;
    const level = hits.reduce((l, { d }) => worst(l, IMD_LEVEL[d.color]), 'watch');
    const codes = [...new Set(hits.flatMap(({ d }) => d.codes))];
    const end = new Date(Date.parse(`${addDays(date, 1)}T00:00:00Z`) - IST_MS);
    out.push({
      id: `IMD|${date}`, origin: 'official', source: 'imd', issuer: 'IMD', level, family: IMD_FAMILY[codes[0]] ?? 'other', codes,
      districts: [...new Set(hits.map(({ r }) => r.name))], date, offset: n - 1, from: `${date}T00:00`, to: `${addDays(date, 1)}T00:00`,
      issuedAt: hits.reduce((m, { r }) => (r.updatedAt > m ? r.updatedAt : m), hits[0].r.updatedAt).toISOString(), expires: end.toISOString(),
      link: 'https://mausam.imd.gov.in/responsive/districtWiseWarningGIS.php',
    });
  }
  return out.filter((a) => new Date(a.expires) > now);
}

export const sortOfficial = (list) => list.sort((a, b) => RANK[b.level] - RANK[a.level] || a.from.localeCompare(b.from)).slice(0, MAX_OFFICIAL);

// fields (lean documents with .district) -> Map(fieldId -> official alerts, worst and soonest first)
export async function officialFor(fields, now = new Date()) {
  const today = istDate(now);
  const lgd = [...new Set(fields.flatMap((f) => (f.district?.lgd ?? []).map((d) => d.code)))];
  const imdIds = [...new Set(fields.flatMap((f) => (f.district?.imd ?? []).map((d) => d.id)))];
  const [alerts, rows] = await Promise.all([
    lgd.length ? OfficialAlert.find({ lgd: { $in: lgd }, expires: { $gt: now }, onset: { $lte: new Date(now.getTime() + SACHET_LOOKAHEAD_MS) }, status: 'Actual', scope: 'Public', msgType: { $ne: 'Cancel' }, supersededBy: null }).lean() : [],
    imdIds.length ? ImdWarning.find({ imdId: { $in: imdIds }, updatedAt: { $gt: new Date(now.getTime() - IMD_FRESH_MS) } }).lean() : [],
  ]);
  const rowById = new Map(rows.map((r) => [r.imdId, r]));
  return new Map(fields.map((f) => {
    const codes = new Set((f.district?.lgd ?? []).map((d) => d.code));
    const mine = alerts.filter((a) => a.lgd.some((c) => codes.has(c))).map((a) => fromSachet(a, today, now));
    // a row whose name changed under its id was re-keyed by IMD: not shown rather than shown for the wrong district
    const imdRows = (f.district?.imd ?? []).map((d) => rowById.get(d.id)).filter((r, i) => r && normDistrict(r.name) === normDistrict(f.district.imd[i].name));
    const all = [...mine, ...fromImd(imdRows, today, now)];
    return [String(f._id), sortOfficial(all)];
  }));
}
