// Hexagon colours by report count. The server never returns a cell below 3 (MIN_DEVICES), so the
// first bin starts there. Kept apart from MapPage so it can be tested without Leaflet.
export const BINS = [
  { min: 3, color: '#E9C46A' },
  { min: 5, color: '#DE9B45' },
  { min: 10, color: '#C4702E' },
  { min: 25, color: '#8E3B1F' },
];

export const colorFor = (reports) => [...BINS].reverse().find((b) => reports >= b.min)?.color ?? BINS[0].color;

export const binLabel = (i) => (i === BINS.length - 1 ? `${BINS[i].min}+` : `${BINS[i].min}–${BINS[i + 1].min - 1}`);
