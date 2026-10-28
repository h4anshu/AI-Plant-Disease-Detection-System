import axios from "axios";
import { ImdWarning } from "../../models/OfficialAlert.js";
import { lgdDistrict, lgdFromImd } from "../../utils/districts.js";
import { UA } from "./sachet.js";

// IMD's district warnings through its public GeoServer (the layers its own website draws). Not a documented API and no terms
// were found, so: one kill switch (ALERTS_DISABLED_SOURCES=imd), a whole-layer fetch at most every 30 minutes, a point query
// only with the 0.05° cell of a field (never its exact place). docs/FIELD_ALERTS.md, "Official warnings".
const wfsUrl = () => process.env.IMD_WFS_URL || 'https://reactjs.imd.gov.in/geoserver/wfs';
const GRID = 0.05; // the same cell as the weather (services/openMeteo.js)

const query = async (typeName, params) => (await axios.get(wfsUrl(), {
  params: { service: 'WFS', version: '1.0.0', request: 'GetFeature', typeName, outputFormat: 'application/json', ...params },
  timeout: 15000, maxContentLength: 20e6, headers: { 'User-Agent': UA },
})).data;

// Day_1..Day_5 hold hazard codes ("16,4"); Day1_Color..Day5_Color hold 1 red, 2 orange, 3 yellow, 4 green, 0 no data.
// `updated_at` ends in "Z" but is India time (checked 25 Oct 2026: the newest value read 11:47Z when it was 06:17Z), so it is read as +05:30.
// Both meanings are IMD's own: the legend in the source of mausam.imd.gov.in/responsive/districtWiseWarningGIS.php and the style
// of the layer (GetStyles). Code 1 means "no warning".
export const parseLayer = (json) => (json?.features ?? []).map((f) => f.properties).filter((p) => p?.ID && p.District && p.updated_at).map((p) => ({
  imdId: Number(p.ID), name: String(p.District), updatedAt: new Date(String(p.updated_at).replace(/Z$/, '+05:30')),
  days: [1, 2, 3, 4, 5].map((n) => ({ n, color: Number(p[`Day${n}_Color`]) || 0, codes: String(p[`Day_${n}`] ?? '').split(',').map(Number).filter((c) => Number.isInteger(c) && c > 1) })),
})).filter((r) => !Number.isNaN(r.updatedAt.getTime()));

const ATTRS = ['ID', 'District', 'updated_at', ...[1, 2, 3, 4, 5].flatMap((n) => [`Day_${n}`, `Day${n}_Color`])].join(',');

export async function ingestImd({ now = new Date() } = {}) {
  const rows = parseLayer(await query('imd:district_warnings_india', { propertyName: ATTRS }));
  if (!rows.length) throw new Error('empty warnings layer');
  await ImdWarning.bulkWrite(rows.map((r) => ({ updateOne: { filter: { imdId: r.imdId }, update: { $set: { ...r, fetchedAt: now } }, upsert: true } })));
  return { recordCount: rows.length, newestItemAt: rows.reduce((m, r) => (r.updatedAt > m ? r.updatedAt : m), rows[0].updatedAt) };
}

// GeoJSON Polygon / MultiPolygon (rings of [lon, lat], holes after the outer ring): is the point inside?
const ring = (r, x, y) => { let c = false; for (let i = 0, j = r.length - 1; i < r.length; j = i++) { const [xi, yi] = r[i]; const [xj, yj] = r[j]; if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c; } return c; };
export const inside = (g, x, y) => (g?.type === 'Polygon' ? [g.coordinates] : g?.type === 'MultiPolygon' ? g.coordinates : []).some((p) => ring(p[0], x, y) && !p.slice(1).some((h) => ring(h, x, y)));

// The districts of a field: IMD warning rows (by the layer's own ID) and LGD districts (for SACHET, through the reviewed bridge in
// data/imd_lgd.json). The two IMD layers spell names differently, so they are never joined by name. IMD answers a bbox with every district
// whose bounding box touches it, which for a big or winding district means neighbours too; so only the cell is sent (never the point), and
// the point is tested against the returned shapes here. If no shape holds it (generalised borders leave small gaps) every candidate is kept
// and the higher level wins.
export async function resolveDistricts(lat, lon) {
  const [cLat, cLon] = [lat, lon].map((x) => Math.round(x / GRID) * GRID);
  const h = GRID / 2;
  const bbox = [cLon - h, cLat - h, cLon + h, cLat + h].map((x) => x.toFixed(4)).join(',') + ',EPSG:4326';
  const [warn, dist] = await Promise.all([
    query('imd:district_warnings_india', { bbox }),
    query('imd:india_districts', { bbox }),
  ]);
  const near = (json) => { const all = (json.features ?? []).filter((f) => f.properties); const held = all.filter((f) => inside(f.geometry, lon, lat)); return held.length ? held : all; };
  const seen = new Set();
  const imd = near(warn).map((f) => f.properties).filter((p) => p?.ID && !seen.has(p.ID) && seen.add(p.ID)).slice(0, 4).map((p) => ({ id: Number(p.ID), name: String(p.District) }));
  const lgd = [];
  for (const { properties: p } of near(dist)) {
    const code = p?.state ? lgdFromImd(p.state, p.district) : null;
    if (code && !lgd.some((d) => d.code === code)) lgd.push({ code, name: lgdDistrict(code)?.name ?? String(p.district), state: lgdDistrict(code)?.state ?? String(p.state) });
  }
  return { imd, lgd: lgd.slice(0, 4) };
}
