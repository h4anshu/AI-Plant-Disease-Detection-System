import { cellToBoundary, latLngToCell } from 'h3-js';

// Public disease map (docs/PRIVACY in the app, GET /api/map/reports). The exact point of a prediction
// is private; the map only shows counts per H3 cell, and only for cells where enough different
// browsers reported that no single farm stands out.
export const H3_RESOLUTION = 7; // average cell 5.16 km^2: an area, not a farm
export const MIN_DEVICES = 3; // distinct browsers, not reports: one farmer checking 3 leaves must not show
export const WINDOWS = [7, 30, 90]; // fixed windows: free-form ranges could be subtracted to isolate a report
export const LOCATION_SOURCES = ['gps', 'exif', 'none'];

export class BadLocation extends Error {}

const num = (v) => (typeof v === 'string' && v.trim() !== '' ? Number(v) : typeof v === 'number' ? v : NaN);

// Multipart fields from the client (lat, lon, accuracy_m, location_source) -> Prediction fields.
// Anything but a valid gps/exif fix stores no location at all.
export function parseLocation({ lat, lon, accuracy_m: accuracy, location_source: source = 'none' } = {}) {
  if (!LOCATION_SOURCES.includes(source)) throw new BadLocation('Invalid location source');
  if (source === 'none') return { locationSource: 'none' };
  const la = num(lat);
  const lo = num(lon);
  if (!Number.isFinite(la) || !Number.isFinite(lo) || Math.abs(la) > 90 || Math.abs(lo) > 180) {
    throw new BadLocation('Invalid location');
  }
  const acc = accuracy === undefined || accuracy === '' ? null : num(accuracy);
  if (acc !== null && !(Number.isFinite(acc) && acc >= 0)) throw new BadLocation('Invalid location accuracy');
  return {
    location: { type: 'Point', coordinates: [lo, la] }, // GeoJSON order: lon, lat
    locationAccuracyM: acc,
    locationSource: source,
    geoCell: latLngToCell(la, lo, H3_RESOLUTION),
  };
}

// H3 cell -> GeoJSON polygon; with formatAsGeoJson h3-js returns [lon, lat] pairs as a closed ring
export const cellPolygon = (cell) => ({ type: 'Polygon', coordinates: [cellToBoundary(cell, true)] });
