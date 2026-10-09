// Colour lab: the experiments behind docs/COLOUR_SYSTEM.md.  Run:  node colour_lab.mjs [e1 e2 ...]   (no args = all)
// Every threshold is declared in RULES so a reviewer can see what was decided before the numbers came in.
import { pathToFileURL } from 'node:url';
import { oklch, hexOfOklch, dE, hueDist, wcag, apca, relLum, simulate, minSeparation, VISIONS, mix, rng } from './colour.mjs';

export const RULES = {
  bodyContrast: 7,        // AAA for body copy: farmers read outdoors, glare cuts effective contrast
  bodyLc: 75,             // APCA minimum for body text (Lc 90 is the preferred value)
  textContrast: 4.5,      // any text, any component (AA)
  uiContrast: 3,          // non-text marks: dots, bars, borders, focus ring (WCAG 1.4.11)
  cvdSeparation: 10,      // dE (OKLab x100) between status colours under every vision type; 1 JND is about 2, so 5 JNDs
  competitorGap: 15,      // brand colour must sit this far (dE) from every competitor primary
  maxChroma: 0.14,        // measured: no cluster of real leaf pixels is more saturated than this
  accentChroma: 0.18,     // ONE exception: the bright Rust accent of the hero image (saturation contrast against a muted field); never text, never status
  leafHue: 128, lesionHue: 70, // measured from PlantDoc photos (leaf_palette.py)
  grayStep: 0.08,         // adjacent severity steps must differ by this much OKLab L, or a B/W print merges them
};
const fmt = (n, d = 2) => Number(n).toFixed(d);
const fam = (h, C) => (C < 0.04 ? 'neutral' : h < 45 ? 'red' : h < 80 ? 'orange/brown' : h < 112 ? 'yellow' : h < 135 ? 'olive-lime' : h < 165 ? 'green' : h < 200 ? 'teal' : h < 235 ? 'cyan' : h < 275 ? 'blue' : h < 330 ? 'violet' : 'pink');
const hr = (t) => console.log(`\n${'='.repeat(100)}\n${t}\n${'='.repeat(100)}`);
const want = process.argv.slice(2);
const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href; // importing tokens()/check() must not run the report
const run = (id, title, fn) => { if (isMain && (!want.length || want.includes(id))) { hr(`${id.toUpperCase()}  ${title}`); fn(); } };

// ---------------------------------------------------------------- inputs
export const PAPER = '#F4EFE1', INK = '#1F3B2C'; // what the site ships today
export const SITE_NOW = { parchment: PAPER, card: '#FBF8F0', ink: INK, field: '#4A6741', 'field-dark': '#385031', clay: '#B5652E', wheat: '#C9A227', sage: '#7A8B6F' };

// The five groups from the brief. src: W = Wikipedia list of colours, F = Figma colour page, S = Shutterstock, H = htmlcolorcodes,
// RAL = RAL Design, B = Behr via paintdb, O = octet.design, PL = Pratt & Lambert, BM = Benjamin Moore, 66 = 66colorful, CSS = CSS named colour,
// USER = typed in the brief, ? = no standard exists, value assumed
export const GROUPS = {
  '1 Greens': [['#215C46', 'USER gradient start', 'USER'], ['#4A4C15', 'USER shade', 'USER'], ['#51B42F', 'USER shade ("5IB42F")', 'USER'], ['#50987B', 'USER shade', 'USER'],
    ['#228B22', 'Forest Green (web)', 'W'], ['#2E6F40', 'Forest Green (designer)', 'F'], ['#01796F', 'Pine', 'W'], ['#05472A', 'Evergreen', 'F'], ['#4F7942', 'Fern', 'W'], ['#93C572', 'Pistachio', 'W']],
  '2 Ink Blue + Eucalyptus': [['#0B5369', 'Ink Blue', 'S'], ['#1E675A', 'Eucalyptus (dark, RAL)', 'RAL'], ['#5F8575', 'Eucalyptus', 'H'], ['#8EA096', 'Eucalyptus (light)', 'B']],
  '3 Chocolate, Butter, Olive, Latte': [['#7B3F00', 'Chocolate', 'W'], ['#FFFD74', 'Butter Yellow', 'O'], ['#FEE48D', 'Butter (soft)', 'PL'], ['#808000', 'Olive', 'W'], ['#C19C80', 'Latte', '66'], ['#ECDCCB', 'Latte (milky)', 'BM']],
  '4 Blues': [['#B0E0E6', 'Powder', 'W'], ['#87CEEB', 'Sky', 'W'], ['#007FFF', 'Azure', 'W'], ['#6495ED', 'Cornflower', 'CSS'], ['#0047AB', 'Cobalt', 'CSS'], ['#0F52BA', 'Sapphire', 'W'], ['#4169E1', 'Royal', 'W'], ['#000080', 'Navy', 'W'], ['#191970', 'Midnight', 'CSS']],
  '5 Stone, Inferno, Palm': [['#8B7765', 'Stone brown (assumed)', '?'], ['#700004', 'Red Inferno', 'USER'], ['#7C9254', 'Palm leaf', 'USER']],
};
export const COMPETITORS = { Plantix: '#0158DA', Fasal: '#3898EC', DeHaat: '#0F8040', BigHaat: '#298E4D', 'Tailwind-green (BigHaat)': '#22C55E', Cropin: '#B8FF5A', 'Syngenta amber': '#FFAA00', 'Syngenta blue': '#0550E6' };

// ---------------------------------------------------------------- E0: defects in what ships today
run('e0', 'Baseline: does the palette on the site today pass its own rules?', () => {
  const t = (name, fg, bg) => console.log(`${name.padEnd(46)} ${fg} on ${bg}  ${fmt(wcag(fg, bg))}:1  Lc ${fmt(apca(fg, bg), 0)}  ${wcag(fg, bg) >= RULES.textContrast ? 'ok' : 'FAIL < 4.5'}`);
  const tint = (c, a, bg) => mix(bg, c, a, 'srgb');
  t('body text-ink/70 on parchment (Home intro)', mix(PAPER, INK, 0.7, 'srgb'), PAPER);
  t('text-sage on parchment (labels, 10px mono)', SITE_NOW.sage, PAPER);
  t('text-clay on parchment (eyebrow)', SITE_NOW.clay, PAPER);
  t('RiskStrip high: text-clay on bg-clay/20', SITE_NOW.clay, tint(SITE_NOW.clay, 0.2, PAPER));
  t('RiskStrip low: text-field on bg-field/15', SITE_NOW.field, tint(SITE_NOW.field, 0.15, PAPER));
  t('RiskStrip medium: ink on bg-wheat/25', INK, tint(SITE_NOW.wheat, 0.25, PAPER));
  t('Button: parchment on field', PAPER, SITE_NOW.field);
  t('text-wheat on parchment (ResultCard)', SITE_NOW.wheat, PAPER);
});

// ---------------------------------------------------------------- E1: inventory
run('e1', 'Inventory: every colour from the brief in OKLCH, against the colours measured in real leaf photos', () => {
  console.log(`measured: healthy leaf hue ~${RULES.leafHue}, lesion hue ~${RULES.lesionHue}, no leaf cluster above chroma ${RULES.maxChroma}\n`);
  console.log('group                       name                          hex      L     C     h    family        d(leaf)  d(lesion)  chroma     src');
  for (const [g, list] of Object.entries(GROUPS)) for (const [hex, name, src] of list) {
    const o = oklch(hex);
    console.log(`${g.padEnd(27)} ${name.padEnd(29)} ${hex}  ${fmt(o.L)}  ${fmt(o.C, 3)}  ${fmt(o.h, 0).padStart(3)}  ${fam(o.h, o.C).padEnd(12)}  ${fmt(hueDist(o.h, RULES.leafHue), 0).padStart(5)}    ${fmt(hueDist(o.h, RULES.lesionHue), 0).padStart(5)}      ${o.C > RULES.maxChroma ? 'TOO VIVID ' : 'natural   '} ${src}`);
  }
});

// ---------------------------------------------------------------- E2: which semantic jobs can each group do on its own?
const BANDS = {
  'healthy (green)': (o) => o.h >= 105 && o.h < 165 && o.C >= 0.04 && o.L > 0.3 && o.L < 0.85,
  'early (yellow)': (o) => o.h >= 85 && o.h < 112 && o.L >= 0.75,
  'moderate (orange-brown)': (o) => o.h >= 40 && o.h < 85 && o.C >= 0.04 && o.L > 0.4 && o.L < 0.8,
  'severe (dark red)': (o) => (o.h < 35 || o.h >= 345) && o.L < 0.45 && o.C >= 0.08,
  'water/rain (blue)': (o) => o.h >= 200 && o.h < 285 && o.C >= 0.04,
  'dark surface (L<0.40)': (o) => o.L < 0.4,
};
run('e2', 'Role coverage: can each group express healthy / early / moderate / severe / water by itself?', () => {
  for (const [g, list] of Object.entries(GROUPS)) {
    const got = Object.keys(BANDS).filter((b) => list.some(([hex]) => BANDS[b](oklch(hex))));
    console.log(`${g.padEnd(34)} covers ${got.length}/${Object.keys(BANDS).length}: ${got.join(', ') || '-'}`);
  }
  const all = Object.values(GROUPS).flat();
  console.log('\nbands nobody supplies:', Object.keys(BANDS).filter((b) => !all.some(([hex]) => BANDS[b](oklch(hex)))).join(', ') || 'none');
});

// ---------------------------------------------------------------- E3: which colours can be text / surfaces / marks?
run('e3', 'Contrast roles: each colour as text on paper and latte, as a mark (>=3), as a dark surface carrying paper-coloured text', () => {
  const L2 = '#ECDCCB';
  console.log('name                          hex      on paper  Lc   on latte | paper-on-it  Lc | role');
  for (const list of Object.values(GROUPS)) for (const [hex, name] of list) {
    const a = wcag(hex, PAPER), b = wcag(hex, L2), c = wcag(PAPER, hex);
    const role = a >= RULES.bodyContrast ? 'BODY TEXT / dark surface' : a >= RULES.textContrast ? 'text, large or UI (AA)' : a >= RULES.uiContrast ? 'mark only (>=3)' : c >= RULES.textContrast ? 'dark surface only' : 'fill/tint only';
    console.log(`${name.padEnd(29)} ${hex}  ${fmt(a).padStart(5)}  ${fmt(apca(hex, PAPER), 0).padStart(3)}   ${fmt(b).padStart(5)}  |  ${fmt(c).padStart(5)}  ${fmt(apca(PAPER, hex), 0).padStart(3)} | ${role}`);
  }
});

// ---------------------------------------------------------------- E4: distance from competitors
run('e4', 'Distinctiveness: dE from each candidate brand colour to the primary colours of competing sites', () => {
  console.log('competitor primaries (css audit):', Object.entries(COMPETITORS).map(([k, v]) => `${k} ${v}`).join(' | '));
  const cands = ['#15803D', '#22C55E', '#215C46', '#50987B', '#51B42F', '#4F7942', '#7C9254', '#05472A', '#2E6F40', '#0B5369', '#1E675A', '#5F8575', '#7B3F00', '#0F52BA', '#6495ED', '#700004', '#4A6741'];
  console.log('\ncandidate  nearest competitor            dE    gap-rule(>=15)');
  for (const c of cands) {
    const [name, d] = Object.entries(COMPETITORS).map(([k, v]) => [k, dE(c, v)]).sort((a, b) => a[1] - b[1])[0];
    console.log(`${c}${c === '#15803D' ? '*' : c === '#22C55E' ? '*' : ' '}   ${name.padEnd(28)} ${fmt(d, 1).padStart(5)}   ${d >= RULES.competitorGap ? 'ok' : 'TOO CLOSE'}`);
  }
});

// ---------------------------------------------------------------- E5: severity colours under colour-blindness
const SCHEMES = {
  'A conventional traffic light': ['#2E7D32', '#F9A825', '#EF6C00', '#C62828'],
  'B user colours, naive (palm, butter, chocolate, inferno)': ['#7C9254', '#FEE48D', '#7B3F00', '#700004'],
  'C site today (field, wheat, clay + dark clay)': ['#4A6741', '#C9A227', '#B5652E', '#8E3B1F'],
  'D system v1 (E6d solution: palm-ish, mustard, sienna, inferno)': ['#628763', '#B79307', '#8E5100', '#700004'],
  'E system v2 (hero palette: Leaf, ochre, rust-deep, inferno)': ['#6C854D', '#AE9900', '#98370C', '#700004'],
};
const LABELS = ['healthy', 'early', 'moderate', 'severe'];
function grayGaps(hexes) { const L = hexes.map((h) => oklch(h).L); return L.slice(1).map((v, i) => Math.abs(v - L[i])); }
export function reportScheme(name, hexes) {
  const lin = minSeparation(hexes), gam = minSeparation(hexes, VISIONS, 'gamma');
  const gg = grayGaps(hexes), onPaper = hexes.map((h) => wcag(h, PAPER));
  const p = (s) => `${LABELS[s.pair[0]]}~${LABELS[s.pair[1]]} (${s.vision}) ${fmt(s.min, 1)}`;
  console.log(`${name}\n   colours ${hexes.join(' ')}\n   min dE, any vision: ${p(lin)}   [gamma-convention check: ${fmt(gam.min, 1)}]  ${lin.min >= RULES.cvdSeparation ? 'PASS' : 'FAIL'} (>=${RULES.cvdSeparation})\n   adjacent grey steps (dL): ${gg.map((g) => fmt(g)).join(' ')}  ${Math.min(...gg) >= RULES.grayStep ? 'prints ok' : 'MERGE in B/W'}\n   mark contrast vs paper: ${onPaper.map((c) => fmt(c, 1)).join(' ')}  ${Math.min(...onPaper) >= RULES.uiContrast ? 'all >=3' : 'some <3'}`);
}
run('e5', 'Severity under colour-vision deficiency (protan, deutan, tritan), grayscale printing, and mark contrast', () => {
  for (const [n, h] of Object.entries(SCHEMES)) reportScheme(n, h);
  const tints = SCHEMES['E system v2 (hero palette: Leaf, ochre, rust-deep, inferno)'].map((h) => hexOfOklch(0.94, 0.035, oklch(h).h)), ts = minSeparation(tints);
  console.log(`\nfinal system tint fills (decorative only): min dE ${fmt(ts.min, 1)} under ${ts.vision}; they merge for colour-blind users, so no meaning rides on a tint`);
  console.log('\nsimulated appearance of scheme A and B:');
  for (const [n, h] of Object.entries({ A: SCHEMES['A conventional traffic light'], B: SCHEMES['B user colours, naive (palm, butter, chocolate, inferno)'] })) for (const v of VISIONS) console.log(`  ${n} ${v.padEnd(7)} ${h.map((x) => simulate(x, v)).join(' ')}`);
});

// ---------------------------------------------------------------- E6: solve for the middle severity colours
// Anchors from the brief: Palm leaf family for healthy, Red Inferno for severe. Search the two middle colours (and let healthy float
// inside the leaf-hue band) to maximise the worst-case separation over all four vision types.
export function searchSeverity({ seed = 11, n = 150000, fixedSevere = '#700004', markMin = RULES.uiContrast, cMax = 1 } = {}) {
  const r = rng(seed), u = (a, b) => a + (b - a) * r();
  let best = { score: -1 };
  for (let i = 0; i < n; i++) {
    const healthy = hexOfOklch(u(0.42, 0.66), u(0.06, 0.13), u(118, 150));
    const early = hexOfOklch(u(0.55, 0.78), u(0.08, Math.min(0.15, cMax)), u(80, 100));
    const moderate = hexOfOklch(u(0.48, 0.66), u(0.09, Math.min(0.16, cMax)), u(40, 66));
    const set = [healthy, early, moderate, fixedSevere];
    if (set.some((h) => wcag(h, PAPER) < markMin)) continue;
    const L = set.map((h) => oklch(h).L);
    if (Math.min(...grayGaps(set)) < RULES.grayStep * 0.5) continue; // cheap prune; the report checks the full rule
    const s = minSeparation(set);
    if (s.min > best.score) best = { score: s.min, set, pair: s.pair, vision: s.vision };
  }
  return best;
}
run('e6', 'Optimiser: best healthy/early/moderate marks next to the brief\'s Red Inferno, constrained to >=3:1 on paper', () => {
  const best = searchSeverity();
  reportScheme('D optimised (150k random candidates, seed 11)', best.set);
  const free = searchSeverity({ fixedSevere: '#8E3B1F' });
  reportScheme('   same search with a lighter severe (#8E3B1F, site today)', free.set);
});

run('e6d', 'Cap chroma at the leaf maximum (0.14): what does it cost?', () => {
  for (const [c, m] of [[1, 2.5], [0.14, 2.5], [0.13, 2.5]]) { const b = searchSeverity({ markMin: m, cMax: c, n: 120000 }); console.log(`cMax ${c}  mark>=${m}: min dE ${fmt(b.score, 1)} (${b.vision})  ${b.set.join(' ')}  C ${b.set.map((h) => fmt(oklch(h).C, 3)).join(' ')}`); }
});
run('e6b', 'Trade-off: how much separation does each step of "mark must contrast with paper" cost?', () => {
  for (const markMin of [1, 1.5, 2, 2.5, 3]) {
    const b = searchSeverity({ markMin, n: 100000 });
    console.log(`mark >= ${String(markMin).padEnd(3)}:1 on paper -> best min dE ${fmt(b.score, 1).padStart(4)} (${LABELS[b.pair[0]]}~${LABELS[b.pair[1]]}, ${b.vision})  ${b.set.join(' ')}  L ${b.set.map((h) => fmt(oklch(h).L)).join(' ')}`);
  }
});

// ---------------------------------------------------------------- E7: map ramp
run('e7', 'Map ramp (sequential, 4 bins): lightness order, step size, colour-blind steps', () => {
  const ramps = {
    'site today': ['#E9C46A', '#DE9B45', '#C4702E', '#8E3B1F'],
    'ColorBrewer YlOrBr-4 (reference)': ['#FFFFD4', '#FED98E', '#FE9929', '#CC4C02'],
    'butter > ochre > clay > inferno': ['#F2D98B', '#D9A441', '#B5652E', '#700004'],
  };
  for (const [n, ramp] of Object.entries(ramps)) {
    const L = ramp.map((h) => oklch(h).L), mono = L.every((v, i) => !i || v < L[i - 1]);
    const steps = (v) => ramp.slice(1).map((h, i) => dE(simulate(ramp[i], v), simulate(h, v)));
    console.log(`${n.padEnd(34)} ${ramp.join(' ')}  L ${L.map((v) => fmt(v)).join(' ')} ${mono ? 'monotone' : 'NOT monotone'}  min adjacent dE: ${VISIONS.map((v) => `${v[0]}${fmt(Math.min(...steps(v)), 1)}`).join(' ')}`);
  }
});

// ---------------------------------------------------------------- E8: gradients
run('e8', 'Gradients: sRGB vs OKLab vs OKLCH interpolation (chroma dip, evenness, worst-case text contrast)', () => {
  const pairs = [['#215C46', '#50987B'], ['#215C46', '#51B42F'], ['#05472A', '#7C9254'], ['#16281F', '#2E6F40'], ['#FEE48D', '#05472A'], ['#ECDCCB', '#215C46'], ['#B5652E', '#700004'], ['#87CEEB', '#215C46']];
  for (const [a, b] of pairs) {
    console.log(`\n${a} -> ${b}   endpoint chroma ${fmt(oklch(a).C, 3)} / ${fmt(oklch(b).C, 3)}`);
    for (const sp of ['srgb', 'oklab', 'oklch']) {
      const stops = Array.from({ length: 9 }, (_, i) => mix(a, b, i / 8, sp)), o = stops.map(oklch);
      const steps = stops.slice(1).map((h, i) => dE(stops[i], h)), mean = steps.reduce((x, y) => x + y) / steps.length;
      const dip = Math.min(...o.map((x) => x.C)) / Math.min(o[0].C, o[8].C);
      const drift = Math.max(...o.map((x) => hueDist(x.h, o[0].h)));
      console.log(`  ${sp.padEnd(6)} chroma-min/endpoint-min ${fmt(dip)}  step evenness (sd/mean) ${fmt(Math.sqrt(steps.reduce((s, x) => s + (x - mean) ** 2, 0) / steps.length) / mean)}  hue drift ${fmt(drift, 0)} deg  paper-text worst ${fmt(Math.min(...stops.map((s) => wcag(PAPER, s))), 1)}:1`);
    }
  }
});

// ---------------------------------------------------------------- E9: one variable, three finalists
// Everything else in the system is shared (paper, leaf green, butter, status, map). Only the hue of the dark family changes.
export const FINALISTS = { 'T1 olive-leaf': 125, 'T2 evergreen': 160, 'T3 ink-sea': 205 };
export const darkFamily = (h) => ({ bg: hexOfOklch(0.24, 0.045, h), bg2: hexOfOklch(0.3, 0.05, h), ink: hexOfOklch(0.28, 0.04, h), primary: hexOfOklch(0.34, 0.065, h), primaryHover: hexOfOklch(0.28, 0.06, h) });
export const HERO = { pine: '#193D2B', leaf: '#6C854D', sage: '#DCE4D1', parchment: '#F5F0E2', rust: '#D85D2D' }; // palette of the generated hero image
export const HERO_IMG_BG = '#F2EAD6'; // measured on the image's own pixels (hero_image_probe.py), not the stated parchment
export const LEAF = HERO.leaf, BUTTER = '#F2DB8F';
// system v1, frozen (before the hero palette was adopted) so E12 can still compare against it
export const SYSTEM_V1 = { paper: '#F4EFE1', card: '#FBF8F0', latte: '#EEE1CD', 'butter-wash': '#F7F0CA', ink: '#162F22', ink2: '#2F493B', 'bg-dark': '#072618', 'bg-dark-2': '#143525', primary: '#11422C', 'primary-hover': '#04321E', leaf: '#7C9254', 'leaf-wash': '#D2E6BC', 'leaf-text': '#475E23', butter: '#F2DB8F', sienna: '#8E5100', water: '#0B5369', 'water-wash': '#D2EDF4', healthy: '#628763', early: '#B79307', moderate: '#8E5100', severe: '#700004' };
const LEAF_PHOTO = ['#85B14C', '#648B3D', '#4C632C', '#C0CF87']; // k-means centres of healthy PlantDoc leaves (leaf_palette.py)
run('e9', 'Finalists: same system, only the hue of the dark family changes', () => {
  for (const [name, h] of Object.entries(FINALISTS)) {
    const d = darkFamily(h);
    const comp = Object.entries(COMPETITORS).map(([k, v]) => [k, dE(d.primary, v)]).sort((a, b) => a[1] - b[1])[0];
    console.log(`
${name} (hue ${h})   bg ${d.bg}  bg2 ${d.bg2}  ink ${d.ink}  primary ${d.primary}  hover ${d.primaryHover}`);
    console.log(`   ink on paper ${fmt(wcag(d.ink, PAPER), 1)}:1 Lc ${fmt(apca(d.ink, PAPER), 0)} | primary on paper ${fmt(wcag(d.primary, PAPER), 1)}:1 | paper on primary ${fmt(wcag(PAPER, d.primary), 1)}:1`);
    console.log(`   on dark bg: paper ${fmt(wcag(PAPER, d.bg), 1)}:1 Lc ${fmt(apca(PAPER, d.bg), 0)} | butter ${fmt(wcag(BUTTER, d.bg), 1)}:1 | leaf ${fmt(wcag(LEAF, d.bg), 1)}:1 | butter button text (bg) on butter ${fmt(wcag(d.bg, BUTTER), 1)}:1`);
    console.log(`   distance: primary to nearest competitor ${comp[0]} dE ${fmt(comp[1], 1)} | hue to leaf ${fmt(hueDist(h, RULES.leafHue), 0)} deg | leaf-photo greens vs band: min dE ${fmt(Math.min(...LEAF_PHOTO.map((x) => dE(x, d.bg))), 1)}`);
  }
});

// ---------------------------------------------------------------- E6c: chart series (NDVI / NDRE / REDSI lines are non-text marks: >= 3:1 on paper)
export function searchSeries({ seed = 5, n = 120000 } = {}) {
  const r = rng(seed), u = (a, b) => a + (b - a) * r();
  let best = { score: -1 };
  for (let i = 0; i < n; i++) {
    const set = [hexOfOklch(u(0.5, 0.64), u(0.08, 0.13), u(120, 140)), hexOfOklch(u(0.3, 0.5), u(0.06, 0.12), u(205, 250)), hexOfOklch(u(0.5, 0.64), u(0.1, 0.15), u(38, 65))];
    if (set.some((h) => wcag(h, PAPER) < RULES.uiContrast)) continue;
    const s = minSeparation(set); if (s.min > best.score) best = { score: s.min, set, vision: s.vision, pair: s.pair };
  }
  return best;
}
run('e6c', 'Optimiser: chart-line colours for NDVI / NDRE / REDSI (green, blue, orange bands), >= 3:1 on paper', () => {
  const b = searchSeries(); console.log(`best min dE ${fmt(b.score, 1)} (${b.vision})  NDVI ${b.set[0]}  NDRE ${b.set[1]}  REDSI ${b.set[2]}   L ${b.set.map((h) => fmt(oklch(h).L)).join(' ')}`);
  console.log('for comparison, the site today (field, clay, purple #7A5C99):', fmt(minSeparation(['#4A6741', '#B5652E', '#7A5C99']).min, 1));
});

// ---------------------------------------------------------------- E10: the system, built from rules, and its contract
export const STATUS = { healthy: HERO.leaf, early: '#AE9900', moderate: '#98370C', severe: '#700004' }; // v2, E12b: your Leaf fixed as healthy, rust-deep at the Rust hue (40 deg), mark >= 2.5:1, chroma <= 0.14
export const SERIES = { ndvi: '#6F9364', ndre: '#0A3C62', redsi: '#98370C' }; // E6c solved the trio (redsi was #8A5517); v2 reuses rust-deep when it still separates
export const MAP_RAMP = ['#F2D98B', '#D9A441', '#D85D2D', '#700004']; // v2: bin 3 is the brand Rust (v1 had clay #B5652E); min step 12.0 under any vision
export function tokens(h) {
  const d = darkFamily(h), st = {};
  for (const [k, hex] of Object.entries(STATUS)) { const o = oklch(hex); st[`${k}`] = hex; st[`${k}-tint`] = hexOfOklch(0.94, 0.035, o.h); st[`${k}-text`] = hexOfOklch(0.36, Math.min(o.C, 0.11), o.h); }
  return {
    paper: HERO.parchment, card: '#FBF8F0', latte: hexOfOklch(0.915, 0.03, 80), 'butter-wash': hexOfOklch(0.95, 0.05, 98),
    ink: d.ink, ink2: hexOfOklch(0.38, 0.04, h), 'bg-dark': d.bg, 'bg-dark-2': h === 160 ? HERO.pine : d.bg2, primary: h === 160 ? HERO.pine : d.primary, 'primary-hover': h === 160 ? hexOfOklch(0.27, 0.05, 160) : d.primaryHover,
    leaf: LEAF, 'sage-wash': HERO.sage, // NOT the site's existing --color-sage #7A8B6F (a text colour today); renamed to avoid breaking text-sage labels
     'leaf-text': hexOfOklch(0.45, 0.09, 128),
    butter: BUTTER, rust: HERO.rust, 'rust-deep': STATUS.moderate, water: '#0B5369', 'water-wash': hexOfOklch(0.93, 0.03, 215),
    ...SERIES, 'on-dark': HERO.parchment, 'on-dark-2': mix(d.bg, HERO.parchment, 0.88, 'oklab'), ...st,
  };
}
// [what, foreground, background, minimum contrast, minimum APCA Lc or 0]
export function contract(t) {
  const B = RULES.bodyContrast, T = RULES.textContrast, L = RULES.bodyLc;
  const rows = [
    ['body: ink on paper', t.ink, t.paper, B, L], ['body: ink on card', t.ink, t.card, B, L], ['body: ink on latte', t.ink, t.latte, B, L],
    ['secondary: ink-2 on paper', t.ink2, t.paper, B, L], ['secondary: ink-2 on latte', t.ink2, t.latte, T, L], ['secondary: ink-2 on card', t.ink2, t.card, B, L],
    ['link / ink button: paper on primary', t.paper, t.primary, B, L], ['link: primary on paper', t.primary, t.paper, B, L], ['primary-hover: paper on it', t.paper, t['primary-hover'], B, L],
    ['dark band: paper on bg-dark', t['on-dark'], t['bg-dark'], B, L], ['dark band: on-dark-2 on bg-dark', t['on-dark-2'], t['bg-dark'], B, L], ['dark band: paper on bg-dark-2 (cards)', t['on-dark'], t['bg-dark-2'], B, L],
    ['dark band: butter on bg-dark', t.butter, t['bg-dark'], B, L], ['dark band: butter button, bg-dark text', t['bg-dark'], t.butter, B, L], ['dark band: leaf on bg-dark (bars, non-text)', t.leaf, t['bg-dark'], RULES.uiContrast, 0], ['dark band: butter on pine card', t.butter, t['bg-dark-2'], B, L], ['accent on pine card: rust (large / marks)', t.rust, t['bg-dark-2'], RULES.uiContrast, 0],
    ['emphasis (small text): rust-deep on paper', t['rust-deep'], t.paper, T, 0], ['display (>=24px) and marks: rust on paper', t.rust, t.paper, RULES.uiContrast, 0], ['stamp / badge: paper on rust-deep fill', t.paper, t['rust-deep'], T, 0], ['sage-wash: ink on it', t.ink, t['sage-wash'], B, L], ['emphasis: leaf-text on paper', t['leaf-text'], t.paper, T, 0], ['data: water on paper', t.water, t.paper, B, L],
    ['focus ring: ink on paper (non-text)', t.ink, t.paper, RULES.uiContrast, 0], ['focus ring: butter on bg-dark (non-text)', t.butter, t['bg-dark'], RULES.uiContrast, 0],
  ];
  for (const k of Object.keys(STATUS)) {
    rows.push([`chip ${k}: text on tint`, t[`${k}-text`], t[`${k}-tint`], B, 0], [`chip ${k}: mark on paper (dot)`, t[k], t.paper, 2.5, 0]);
  }
  return rows;
}
export function check(t) {
  const fails = [];
  for (const [what, fg, bg, min, lc] of contract(t)) { const r = wcag(fg, bg), l = apca(fg, bg); if (r < min || l < lc) fails.push(`${what}: ${fg} on ${bg} = ${fmt(r)}:1 Lc ${fmt(l, 0)} (need ${min}:1${lc ? ` Lc ${lc}` : ''})`); }
  for (const [k, v] of Object.entries(t)) if (oklch(v).C > (k === 'rust' ? RULES.accentChroma : RULES.maxChroma + 0.005)) fails.push(`token ${k} ${v} is more saturated (C ${fmt(oklch(v).C, 3)}) than any leaf pixel measured`);
  const sep = minSeparation(Object.values(STATUS)); if (sep.min < RULES.cvdSeparation) fails.push(`status colours too close under ${sep.vision}: ${fmt(sep.min, 1)}`);
  for (const v of VISIONS) MAP_RAMP.slice(1).forEach((c, i) => { const d = dE(simulate(MAP_RAMP[i], v), simulate(c, v)); if (d < 8) fails.push(`map bins ${i}-${i + 1} merge under ${v}: ${fmt(d, 1)}`); });
  const L = MAP_RAMP.map((c) => oklch(c).L); if (!L.every((v, i) => !i || v < L[i - 1])) fails.push('map ramp is not monotone in lightness');
  const series = Object.values(SERIES), ss = minSeparation(series); for (const [k, c] of Object.entries(SERIES)) if (wcag(c, PAPER) < RULES.uiContrast) fails.push(`series ${k} ${c} below 3:1 on paper`); if (ss.min < RULES.cvdSeparation) fails.push(`chart series (NDVI/NDRE/REDSI) too close under ${ss.vision}: ${fmt(ss.min, 1)}`);
  return fails;
}
run('e10', 'The system per finalist: tokens and the contract (every intended pair must pass)', () => {
  for (const [name, h] of Object.entries(FINALISTS)) {
    const t = tokens(h), f = check(t);
    console.log(`\n${name}: ${f.length ? 'FAILS ' + f.length : 'contract PASSES (' + contract(t).length + ' pairs + status/map/series separation)'}`);
    f.forEach((x) => console.log('   x ' + x));
    if (want.includes('e10')) console.log('   ' + Object.entries(t).map(([k, v]) => `${k} ${v}`).join('\n   '));
  }
});

// ---------------------------------------------------------------- E11: glare. A screen in sun reflects a roughly constant luminance F on top of both colours.
// Model only (F is assumed, not measured): effective ratio = (Lbg + F + .05) / (Ltext + F + .05) on relative luminance.
run('e11', 'Glare sensitivity: how much of the contrast survives when ambient light washes the screen?', () => {
  const t = tokens(160), pairs = [['ink on paper', t.ink, t.paper], ['ink-2 on paper', t.ink2, t.paper], ['rust-deep on paper', t['rust-deep'], t.paper], ['leaf-text on paper', t['leaf-text'], t.paper], ['site today: ink/70 on parchment', mix(PAPER, INK, 0.7, 'srgb'), PAPER], ['site today: sage on parchment', '#7A8B6F', PAPER], ['site today: clay on parchment', '#B5652E', PAPER]];
  console.log('pair'.padEnd(36) + [0, 0.05, 0.1, 0.2, 0.3].map((f) => `F=${f}`.padStart(8)).join(''));
  for (const [n, a, b] of pairs) {
    const [x, y] = [relLum(a), relLum(b)].sort((p, q) => q - p);
    console.log(n.padEnd(36) + [0, 0.05, 0.1, 0.2, 0.3].map((f) => fmt((x + f + 0.05) / (y + f + 0.05), 1).padStart(8)).join(''));
  }
  console.log('\nread: at F=0.1 the 4.5:1 body text the site ships today falls to 3.4:1 (below AA); a 7:1 pair still keeps 4.5:1. That is why body copy is held to 7:1.');
});

// ---------------------------------------------------------------- E12: the palette of the hero image you generated (9 Oct 2026)
run('e12', 'Hero image palette: Pine, Leaf, Sage, Parchment, Rust', () => {
  const sys = SYSTEM_V1, near = (h) => Object.entries(sys).map(([k, v]) => [k, dE(h, v)]).sort((a, b) => a[1] - b[1])[0];
  console.log('colour      hex      L     C     h   chroma   nearest token in system v1    competitor gap   on parchment   parchment on it');
  for (const [n, h] of Object.entries(HERO)) {
    const o = oklch(h), [tk, d] = near(h), comp = Object.entries(COMPETITORS).map(([k, v]) => [k, dE(h, v)]).sort((a, b) => a[1] - b[1])[0];
    console.log(`${n.padEnd(10)} ${h}  ${fmt(o.L)}  ${fmt(o.C, 3)}  ${fmt(o.h, 0).padStart(3)}  ${o.C > RULES.maxChroma ? 'ABOVE cap' : 'ok       '}  ${tk.padEnd(14)} dE ${fmt(d, 1).padStart(5)}      ${comp[0].slice(0, 8).padEnd(8)} ${fmt(comp[1], 1).padStart(5)}    ${fmt(wcag(h, HERO.parchment), 2).padStart(5)}:1       ${fmt(wcag(HERO.parchment, h), 2).padStart(5)}:1`);
  }
  console.log('\nHow the image uses them (pair, size, requirement):');
  const T = RULES.textContrast, B = RULES.bodyContrast, rows = [
    ['pine headline on parchment (60px)', HERO.pine, HERO.parchment, 3], ['parchment on pine: CTA / care-plan text (13px mono)', HERO.parchment, HERO.pine, T],
    ['RUST eyebrow on parchment (12px mono caps)', HERO.rust, HERO.parchment, T], ['near-white on RUST badge (12px mono caps)', '#FFFFF8', HERO.rust, T], ['parchment on RUST badge', HERO.parchment, HERO.rust, T], ['pine on RUST (dark text on badge)', HERO.pine, HERO.rust, T],
    ['LEAF italic headline on parchment (60px)', HERO.leaf, HERO.parchment, 3], ['LEAF as body/label text on parchment', HERO.leaf, HERO.parchment, T], ['pine on sage (icons, labels)', HERO.pine, HERO.sage, B], ['LEAF on sage (icons)', HERO.leaf, HERO.sage, 3],
    ['RUST on pine (accent on the dark card, large)', HERO.rust, HERO.pine, 3], ['LEAF on pine', HERO.leaf, HERO.pine, 3], ['butter on pine (my accent)', BUTTER, HERO.pine, B],
  ];
  for (const [n, f, b, min] of rows) { const r = wcag(f, b); console.log(`  ${n.padEnd(54)} ${fmt(r, 2).padStart(5)}:1  Lc ${fmt(apca(f, b), 0).padStart(3)}  need ${min}  ${r >= min ? 'ok' : 'FAIL'}`); }
  console.log(`\nSeam: the image's own background ${HERO_IMG_BG} vs stated Parchment ${HERO.parchment}: dE ${fmt(dE(HERO_IMG_BG, HERO.parchment), 1)}; vs system paper #F4EFE1: dE ${fmt(dE(HERO_IMG_BG, PAPER), 1)} (1 JND is about 2)`);
  // text-safe rust: same hue and chroma family, darkened until it passes
  const ro = oklch(HERO.rust); console.log(`\nrust family at hue ${fmt(ro.h, 0)}, chroma ${fmt(ro.C, 3)}: lightness needed on parchment`);
  for (const L of [0.62, 0.56, 0.52, 0.5, 0.48, 0.46, 0.44, 0.42, 0.4]) { const x = hexOfOklch(L, ro.C, ro.h); console.log(`  L ${L}  ${x}  C ${fmt(oklch(x).C, 3)}  on parchment ${fmt(wcag(x, HERO.parchment), 2)}:1  parchment on it ${fmt(wcag(HERO.parchment, x), 2)}:1`); }
  // severity ladder with the hero palette's Leaf = healthy, its Rust = moderate, Red Inferno = severe; best early colour
  const r = rng(3), u = (a, b) => a + (b - a) * r(); let best = { s: -1 };
  for (let i = 0; i < 60000; i++) { const early = hexOfOklch(u(0.55, 0.9), u(0.07, 0.17), u(80, 105)), set = [HERO.leaf, early, HERO.rust, '#700004'], m = minSeparation(set); if (m.min > best.s) best = { s: m.min, early, m }; }
  console.log(`\nSeverity ladder, Leaf / best early / Rust / Inferno: ${fmt(best.s, 1)} (${LABELS[best.m.pair[0]]}~${LABELS[best.m.pair[1]]}, ${best.m.vision}) early ${best.early}  (rule: >= ${RULES.cvdSeparation})`);
  const fixed3 = minSeparation([HERO.leaf, HERO.rust, '#700004']); console.log(`  even without an early colour, Leaf / Rust / Inferno: ${fmt(fixed3.min, 1)} (${['leaf', 'rust', 'inferno'][fixed3.pair[0]]}~${['leaf', 'rust', 'inferno'][fixed3.pair[1]]}, ${fixed3.vision})`);
  console.log('  system v1 ladder (healthy / early / sienna / inferno):', fmt(minSeparation(['#628763', '#B79307', '#8E5100', '#700004']).min, 1));
});

run('e12b', 'Can a rust-hued colour be the "moderate" status? Search with moderate pinned to the rust hue band (36-46 deg)', () => {
  for (const [label, cMax, markMin] of [['rust band, chroma <= 0.17, mark >= 2.5', 0.17, 2.5], ['rust band, chroma <= 0.17, mark >= 3', 0.17, 3], ['rust band, chroma <= 0.14 (cap), mark >= 2.5', 0.14, 2.5]]) {
    const r = rng(21), u = (a, b) => a + (b - a) * r(); let best = { s: -1 };
    for (let i = 0; i < 120000; i++) {
      const set = [hexOfOklch(u(0.5, 0.72), u(0.06, 0.12), u(118, 150)), hexOfOklch(u(0.55, 0.8), u(0.08, 0.15), u(82, 100)), hexOfOklch(u(0.42, 0.6), u(0.12, cMax), u(36, 46)), '#700004'];
      if (set.some((h) => wcag(h, HERO.parchment) < markMin)) continue;
      const m = minSeparation(set); if (m.s === undefined && m.min > best.s) best = { s: m.min, set, m };
    }
    console.log(`${label}\n   best min dE ${fmt(best.s, 1)} (${LABELS[best.m.pair[0]]}~${LABELS[best.m.pair[1]]}, ${best.m.vision})  ${best.set.join(' ')}  L ${best.set.map((h) => fmt(oklch(h).L)).join(' ')}`);
  }
  console.log('\nfor comparison: system v1 (sienna, hue 63) =', fmt(minSeparation(['#628763', '#B79307', '#8E5100', '#700004']).min, 1));
});

// `node colour_lab.mjs css` prints the CSS custom properties for each finalist (used by ../preview.html), then exits the report.
if (isMain && want.includes('css')) {
  const shared = (t) => Object.entries(t).map(([k, v]) => `--${k}:${v};`).join('');
  for (const [name, h] of Object.entries(FINALISTS)) console.log(`[data-theme="${name.split(' ')[0].toLowerCase()}"]{${shared(tokens(h))}${MAP_RAMP.map((c, i) => `--m${i + 1}:${c};`).join('')}}`);
}
