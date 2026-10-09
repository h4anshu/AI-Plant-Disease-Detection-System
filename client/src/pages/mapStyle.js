// Hexagon colours by report count. The server never returns a cell below 3 (MIN_DEVICES), so the
// first bin starts there. Kept apart from MapPage so it can be tested without Leaflet.
export const BINS = [
  { min: 3, color: '#F2D98B' },
  { min: 5, color: '#D9A441' },
  { min: 10, color: '#D85D2D' },
  { min: 25, color: '#700004' },
];

export const colorFor = (reports) => [...BINS].reverse().find((b) => reports >= b.min)?.color ?? BINS[0].color;

export const binLabel = (i) => (i === BINS.length - 1 ? `${BINS[i].min}+` : `${BINS[i].min}–${BINS[i + 1].min - 1}`);
