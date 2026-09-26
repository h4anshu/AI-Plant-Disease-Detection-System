import axios from "axios";
import sharp from "sharp";

// A small map for the report from OpenStreetMap tiles, stitched with sharp. OSM's tile policy
// (https://operations.osmfoundation.org/policies/tiles/): attribution (printed on the map and in the
// report), an identifying User-Agent, no bulk downloads, and cache what you fetch. One report = about
// 6 tiles; tiles are kept in memory for the instance's life.
const TILE_URL = () => process.env.OSM_TILE_URL || 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
const USER_AGENT = 'PlantGuard-field-report/1.0 (+https://github.com/h4anshu/AI-Plant-Disease-Detection-System)';
const ZOOM = 13;
const TILE = 256;
const MAX_TILES = 300; // ~15 KB each

const tiles = new Map();
async function tile(z, x, y) {
  const key = `${z}/${x}/${y}`;
  if (tiles.has(key)) return tiles.get(key);
  const url = TILE_URL().replace('{z}', z).replace('{x}', x).replace('{y}', y);
  const { data } = await axios.get(url, { responseType: 'arraybuffer', timeout: 8000, headers: { 'User-Agent': USER_AGENT } });
  const buf = Buffer.from(data);
  if (tiles.size >= MAX_TILES) tiles.delete(tiles.keys().next().value);
  tiles.set(key, buf);
  return buf;
}

// Web Mercator pixel position of a point at the zoom
const project = (lat, lon, z) => {
  const n = 2 ** z * TILE;
  const r = (lat * Math.PI) / 180;
  return { x: ((lon + 180) / 360) * n, y: ((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * n };
};

// PNG of width x height px centred on (lat, lon), with a circle of radiusM metres around it
export async function staticMap(lat, lon, { width = 1020, height = 300, radiusM = 1000 } = {}) {
  const c = project(lat, lon, ZOOM);
  const x0 = Math.floor((c.x - width / 2) / TILE);
  const y0 = Math.floor((c.y - height / 2) / TILE);
  const x1 = Math.floor((c.x + width / 2) / TILE);
  const y1 = Math.floor((c.y + height / 2) / TILE);
  const parts = [];
  for (let tx = x0; tx <= x1; tx++) {
    for (let ty = y0; ty <= y1; ty++) {
      parts.push(tile(ZOOM, tx, ty).then((input) => ({ input, left: (tx - x0) * TILE, top: (ty - y0) * TILE })));
    }
  }
  const canvas = await sharp({ create: { width: (x1 - x0 + 1) * TILE, height: (y1 - y0 + 1) * TILE, channels: 3, background: '#ffffff' } })
    .composite(await Promise.all(parts)).png().toBuffer();
  const cropped = await sharp(canvas)
    .extract({ left: Math.round(c.x - width / 2) - x0 * TILE, top: Math.round(c.y - height / 2) - y0 * TILE, width, height })
    .toBuffer();
  const metresPerPx = (156543.03392 * Math.cos((lat * Math.PI) / 180)) / 2 ** ZOOM;
  const r = radiusM / metresPerPx;
  const overlay = Buffer.from(`<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
    <circle cx="${width / 2}" cy="${height / 2}" r="${r}" fill="none" stroke="#000" stroke-width="4" stroke-dasharray="10 6"/>
    <circle cx="${width / 2}" cy="${height / 2}" r="5" fill="#000"/>
  </svg>`); // no SVG text: the slim image has no system fonts; the report draws the attribution itself
  return sharp(cropped).composite([{ input: overlay }]).png().toBuffer();
}
