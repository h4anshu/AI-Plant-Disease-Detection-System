// Colour maths for the colour lab. Zero dependencies (Node >= 18).
// Cross-checked against culori (OKLab, WCAG) and apca-w3 (APCA) in the session that wrote it; see COLOUR_SYSTEM.md.

export const hex2rgb = (h) => { h = h.replace('#', ''); if (h.length === 3) h = [...h].map((c) => c + c).join(''); return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)); };
export const rgb2hex = (rgb) => '#' + rgb.map((v) => Math.round(Math.min(255, Math.max(0, v))).toString(16).padStart(2, '0')).join('').toUpperCase();

const toLin = (c) => { c /= 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
const fromLin = (c) => 255 * (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055);
export const lin = (hex) => hex2rgb(hex).map(toLin);

// ---- OKLab / OKLCH (Björn Ottosson, 2020) ----
export function oklabOfLin([r, g, b]) {
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [0.2104542553 * l + 0.7936177850 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * s];
}
export function linOfOklab([L, a, b]) {
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.2914855480 * b) ** 3;
  return [4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s];
}
export const oklab = (hex) => oklabOfLin(lin(hex));
export function oklch(hex) {
  const [L, a, b] = oklab(hex);
  return { L, C: Math.hypot(a, b), h: ((Math.atan2(b, a) * 180) / Math.PI + 360) % 360 };
}
const inGamut = (v) => v.every((c) => c >= -0.0005 && c <= 1.0005);
// OKLCH -> hex; if out of sRGB, lower chroma (keeps L and h, which is what a designer wants)
export function hexOfOklch(L, C, h) {
  const at = (c) => linOfOklab([L, c * Math.cos((h * Math.PI) / 180), c * Math.sin((h * Math.PI) / 180)]);
  let lo = 0, hi = C, v = at(C);
  if (!inGamut(v)) { for (let i = 0; i < 24; i++) { const mid = (lo + hi) / 2; inGamut(at(mid)) ? (lo = mid) : (hi = mid); } v = at(lo); }
  return rgb2hex(v.map((c) => fromLin(Math.min(1, Math.max(0, c)))));
}
// Euclidean distance in OKLab x100. ~2 = one just-noticeable difference.
export const dE = (a, b) => 100 * Math.hypot(...oklab(a).map((v, i) => v - oklab(b)[i]));
export const hueDist = (a, b) => { const d = Math.abs(a - b) % 360; return d > 180 ? 360 - d : d; };

// ---- WCAG 2.x contrast ----
export const relLum = (hex) => { const [r, g, b] = lin(hex); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
export function wcag(a, b) { const [x, y] = [relLum(a), relLum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); }

// ---- APCA-W3 0.0.98G-4g (|Lc|, text first, background second) ----
export function apca(text, bg) {
  const y = (hex) => { const [r, g, b] = hex2rgb(hex).map((c) => (c / 255) ** 2.4); return 0.2126729 * r + 0.7151522 * g + 0.0721750 * b; };
  const soft = (v) => (v > 0.022 ? v : v + (0.022 - v) ** 1.414);
  const yt = soft(y(text)), yb = soft(y(bg));
  if (Math.abs(yb - yt) < 0.0005) return 0;
  if (yb > yt) { const s = (yb ** 0.56 - yt ** 0.57) * 1.14; return s < 0.1 ? 0 : (s - 0.027) * 100; }
  const s = (yb ** 0.65 - yt ** 0.62) * 1.14; return s > -0.1 ? 0 : Math.abs(s + 0.027) * 100;
}

// ---- Colour-vision deficiency, Machado, Oliveira & Fernandes 2009 (severity 1.0), applied in linear sRGB ----
export const CVD = {
  protan: [[0.152286, 1.052583, -0.204868], [0.114503, 0.786281, 0.099216], [-0.003882, -0.048116, 1.051998]],
  deutan: [[0.367322, 0.860646, -0.227968], [0.280085, 0.672501, 0.047413], [-0.011820, 0.042940, 0.968881]],
  tritan: [[1.255528, -0.076749, -0.178779], [-0.078411, 0.930809, 0.147602], [0.004733, 0.691367, 0.303900]],
};
// space 'linear' follows the paper (matrices act on linear light). 'gamma' applies them to encoded sRGB the way culori does,
// kept only so results can be checked for robustness to that convention.
export function simulate(hex, kind, space = 'linear') {
  if (kind === 'normal') return hex;
  const M = CVD[kind];
  if (space === 'gamma') { const c = hex2rgb(hex); return rgb2hex(M.map((r) => Math.min(255, Math.max(0, r[0] * c[0] + r[1] * c[1] + r[2] * c[2])))); }
  const c = lin(hex);
  return rgb2hex(M.map((row) => fromLin(Math.min(1, Math.max(0, row[0] * c[0] + row[1] * c[1] + row[2] * c[2])))));
}
export const VISIONS = ['normal', 'protan', 'deutan', 'tritan'];
// smallest pairwise dE inside a set of colours, over every vision type; returns {min, pair, vision}
export function minSeparation(hexes, visions = VISIONS, space = 'linear') {
  let best = { min: Infinity };
  for (const v of visions) {
    const s = hexes.map((h) => simulate(h, v, space));
    for (let i = 0; i < s.length; i++) for (let j = i + 1; j < s.length; j++) {
      const d = dE(s[i], s[j]);
      if (d < best.min) best = { min: d, pair: [i, j], vision: v };
    }
  }
  return best;
}

// ---- gradients: sample n stops in a colour space ----
export function mix(a, b, t, space) {
  if (space === 'srgb') return rgb2hex(hex2rgb(a).map((v, i) => v + (hex2rgb(b)[i] - v) * t));
  const [A, B] = [oklab(a), oklab(b)];
  if (space === 'oklab') return rgb2hex(linOfOklab(A.map((v, i) => v + (B[i] - v) * t)).map((c) => fromLin(Math.min(1, Math.max(0, c)))));
  const [p, q] = [oklch(a), oklch(b)];
  let dh = q.h - p.h; if (dh > 180) dh -= 360; if (dh < -180) dh += 360;
  return hexOfOklch(p.L + (q.L - p.L) * t, p.C + (q.C - p.C) * t, (p.h + dh * t + 360) % 360);
}

// small seeded PRNG so searches are reproducible
export const rng = (seed) => () => { seed |= 0; seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
