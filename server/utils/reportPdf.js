// Draws a report (utils/reportContent.js) as an A4 PDF with PDFKit: no browser in the image, no extra
// memory, no cold-start cost (docs/REPORT.md). Black-and-white safe: levels are written out, fills are greys.
import PDFDocument from "pdfkit";
import * as fontkit from "fontkit";
import { fileURLToPath } from "node:url";
import { fill, labels, sourceRows } from "./reportContent.js";

const font = (f) => fileURLToPath(new URL(`../assets/fonts/${f}`, import.meta.url));
const FONTS = { L: font('NotoSans-Regular.ttf'), LB: font('NotoSans-Bold.ttf'),
  D: font('NotoSansDevanagari-Regular.ttf'), DB: font('NotoSansDevanagari-Bold.ttf') };
const latin = fontkit.openSync(FONTS.L);
const deva = fontkit.openSync(FONTS.D);

// Noto Sans Devanagari has no Latin letters and Noto Sans no Devanagari, so text is split into runs:
// a character goes to the font that has it; one both have (space, digits, punctuation) joins the run it is in.
const kinds = new Map();
const kindOf = (ch) => {
  if (!kinds.has(ch)) {
    const cp = ch.codePointAt(0);
    const d = deva.hasGlyphForCodePoint(cp);
    const l = latin.hasGlyphForCodePoint(cp);
    kinds.set(ch, d && l ? null : d ? 'D' : 'L');
  }
  return kinds.get(ch);
};
export function runs(text) {
  const out = [];
  let cur = null;
  const chars = [...String(text)];
  const first = chars.map(kindOf).find(Boolean) ?? 'L'; // leading digits/spaces go with the first word's script
  for (const ch of chars) {
    const k = kindOf(ch) ?? cur?.font ?? first;
    if (cur?.font === k) cur.text += ch;
    else out.push(cur = { font: k, text: ch });
  }
  return out;
}

// characters neither font can draw (they would print as empty boxes)
export const missingGlyphs = (text) =>
  [...new Set([...String(text)].filter((ch) => /\S/.test(ch) && ![latin, deva].some((f) => f.hasGlyphForCodePoint(ch.codePointAt(0)))))];

// Each font would put its own ascender above the baseline; one shared baseline keeps mixed lines, and
// Hindi and English cells side by side, level
const ASCENT = Math.max(latin.ascent / latin.unitsPerEm, deva.ascent / deva.unitsPerEm);

const PAGE = { w: 595.28, h: 841.89, m: 42, bottom: 60 };
const W = PAGE.w - 2 * PAGE.m;
const X = PAGE.m;
const INK = '#000000';
const GREY = '#444444';
const LIGHT = '#d9d9d9';
const PALE = '#f2f2f2';

// Mixed-script text at (x, y) or at the cursor; returns the y below it
function write(doc, text, { x, y, width = W, size = 9, bold = false, color = INK, align = 'left', lineGap = 1.5 } = {}) {
  const parts = runs(text);
  const baseline = -ASCENT * size;
  doc.fontSize(size).fillColor(color);
  parts.forEach((r, i) => {
    doc.font(bold ? `${r.font}B` : r.font);
    const opts = { width, align, lineGap, baseline, continued: i < parts.length - 1 };
    if (i === 0 && x != null) doc.text(r.text, x, y ?? doc.y, opts);
    else doc.text(r.text, opts);
  });
  return doc.y;
}

const height = (doc, text, width, size = 9) => {
  doc.fontSize(size).font(runs(text).some((r) => r.font === 'D') ? 'D' : 'L');
  return doc.heightOfString(String(text), { width, lineGap: 1.5 });
};

const ensure = (doc, h) => { if (doc.y + h > PAGE.h - PAGE.bottom) doc.addPage(); };

// need: room for the first lines after the title, so a title never ends a page alone
function sectionTitle(doc, title, need = 60) {
  ensure(doc, need + 24);
  doc.y += 8;
  write(doc, title, { x: X, size: 11, bold: true });
  doc.moveTo(X, doc.y + 1).lineTo(X + W, doc.y + 1).lineWidth(0.6).strokeColor(INK).stroke();
  doc.y += 6;
}

function table(doc, rows, { labelWidth = 170, size = 9, width = W } = {}) {
  const vw = width - labelWidth - 8;
  for (const r of rows) {
    ensure(doc, Math.max(height(doc, r.label, labelWidth, size), height(doc, r.value, vw, size)) + 4);
    const y0 = doc.y;
    const y1 = write(doc, r.label, { x: X, y: y0, width: labelWidth, size, color: GREY });
    const y2 = write(doc, r.value, { x: X + labelWidth + 8, y: y0, width: vw, size });
    doc.y = Math.max(y1, y2) + 3;
  }
}

function notes(doc, list) {
  for (const n of list ?? []) {
    ensure(doc, height(doc, n, W, 7.5) + 3);
    write(doc, n, { x: X, size: 7.5, color: GREY });
    doc.y += 2;
  }
}

function framedImage(doc, buf, x, y, w, h, missing) {
  doc.rect(x, y, w, h).lineWidth(0.5).strokeColor(GREY).stroke();
  if (buf) doc.image(buf, x + 1, y + 1, { fit: [w - 2, h - 2], align: 'center', valign: 'center' });
  else write(doc, missing, { x, y: y + h / 2 - 5, width: w, size: 8, color: GREY, align: 'center' });
}

function images(doc, s, img) {
  const w = (W - 12) / 2;
  const h = 175;
  ensure(doc, h + 40);
  const y = doc.y;
  framedImage(doc, img.photo, X, y, w, h, '–');
  framedImage(doc, img.gradcam, X + w + 12, y, w, h, s.note ?? '–');
  const c1 = write(doc, s.photo.caption, { x: X, y: y + h + 3, width: w, size: 7.5, color: GREY });
  const c2 = s.gradcam ? write(doc, s.gradcam.caption, { x: X + w + 12, y: y + h + 3, width: w, size: 7.5, color: GREY }) : c1;
  doc.y = Math.max(c1, c2) + 2;
}

function chart(doc, c) {
  const h = 120;
  ensure(doc, h + 40);
  const left = X + 26;
  const cw = W - 26;
  const top = doc.y + 4;
  const t0 = Date.parse(c.window.start);
  const span = Date.parse(c.window.end) - t0 || 1;
  const px = (d) => left + ((Date.parse(d) - t0) / span) * cw;
  const py = (v) => top + h - Math.max(0, Math.min(1, v)) * h;

  doc.lineWidth(0.4).strokeColor(GREY);
  for (const v of [0, 0.5, 1]) {
    doc.moveTo(left, py(v)).lineTo(left + cw, py(v)).dash(1, { space: 2 }).stroke().undash();
    write(doc, v.toFixed(1), { x: X, y: py(v) - 4, width: 22, size: 7, color: GREY, align: 'right' });
  }
  const band = c.points.filter((p) => p.band);
  if (band.length > 1) {
    doc.moveTo(px(band[0].date), py(band[0].band[1]));
    band.forEach((p) => doc.lineTo(px(p.date), py(p.band[1])));
    [...band].reverse().forEach((p) => doc.lineTo(px(p.date), py(p.band[0])));
    doc.closePath().fillColor(LIGHT).fill();
  }
  const line = (key, dashed, width) => {
    const pts = c.points.filter((p) => p[key] != null);
    if (!pts.length) return;
    doc.moveTo(px(pts[0].date), py(pts[0][key]));
    pts.slice(1).forEach((p) => doc.lineTo(px(p.date), py(p[key])));
    doc.lineWidth(width).strokeColor(INK);
    if (dashed) doc.dash(3, { space: 2 });
    doc.stroke().undash();
    if (!dashed) pts.forEach((p) => doc.circle(px(p.date), py(p[key]), 1.6).fillColor(INK).fill());
  };
  line('ndre', true, 0.9);
  line('ndvi', false, 1.4);

  const y = top + h + 3;
  write(doc, c.windowLabels[0], { x: left, y, width: 100, size: 7, color: GREY });
  write(doc, c.windowLabels[1], { x: left + cw - 100, y, width: 100, size: 7, color: GREY, align: 'right' });
  // legend
  let lx = X;
  const ly = y + 12;
  const key = (draw, text) => {
    draw(lx, ly + 4);
    const tw = 18 + doc.fontSize(7).font(runs(text).some((r) => r.font === 'D') ? 'D' : 'L').widthOfString(text) + 14;
    write(doc, text, { x: lx + 18, y: ly, width: tw, size: 7 });
    lx += tw;
  };
  key((x, yy) => { doc.moveTo(x, yy).lineTo(x + 14, yy).lineWidth(1.4).strokeColor(INK).stroke(); }, c.legend.ndvi);
  key((x, yy) => { doc.moveTo(x, yy).lineTo(x + 14, yy).lineWidth(0.9).dash(3, { space: 2 }).strokeColor(INK).stroke().undash(); }, c.legend.ndre);
  key((x, yy) => { doc.rect(x, yy - 3, 14, 6).fillColor(LIGHT).fill(); }, c.legend.band);
  doc.y = ly + 14;
}

// levels as words plus grey fills: readable in black and white
const LEVEL_FILL = { low: '#ffffff', medium: LIGHT, high: '#404040' };
function riskDays(doc, days) {
  const gap = 4;
  const cw = (W - gap * 5) / 6;
  const h = 34;
  ensure(doc, h + 8);
  const y = doc.y;
  days.forEach((d, i) => {
    const x = X + i * (cw + gap);
    doc.rect(x, y, cw, h).fillColor(LEVEL_FILL[d.level] ?? PALE).fill();
    doc.rect(x, y, cw, h).lineWidth(d.today ? 2 : 0.6).strokeColor(INK).stroke();
    const color = d.level === 'high' ? '#ffffff' : INK;
    write(doc, d.label, { x, y: y + 4, width: cw, size: 7.5, color, align: 'center' });
    write(doc, d.levelText, { x, y: y + 17, width: cw, size: 9, bold: true, color, align: 'center' });
  });
  doc.y = y + h + 5;
}

function limitations(doc, s) {
  const pad = 8;
  const items = s.items.map((i) => `•  ${i}`);
  const h = height(doc, s.title, W - 2 * pad, 9.5) + items.reduce((a, i) => a + height(doc, i, W - 2 * pad, 8) + 2, 0) + 2 * pad + 4;
  doc.y += 8;
  ensure(doc, h + 4);
  const y = doc.y;
  doc.rect(X, y, W, h).fillColor(PALE).fill();
  doc.rect(X, y, W, h).lineWidth(1.2).strokeColor(INK).stroke();
  doc.y = write(doc, s.title, { x: X + pad, y: y + pad, width: W - 2 * pad, size: 9.5, bold: true }) + 3;
  for (const i of items) doc.y = write(doc, i, { x: X + pad, width: W - 2 * pad, size: 8 }) + 2;
  doc.y = y + h + 4;
}

// content: buildReport(); img: { photo, gradcam, map } as JPEG/PNG buffers (or null); hash: contentHash()
export function renderReport(content, img, hash) {
  const t = labels(content.lang);
  const doc = new PDFDocument({ size: 'A4', bufferPages: true, autoFirstPage: true,
    margins: { top: PAGE.m, left: PAGE.m, right: PAGE.m, bottom: PAGE.bottom },
    info: { Title: `${content.title} ${content.reportId}`, Author: content.brand, Subject: content.title,
      CreationDate: new Date(content.generatedAt) } });
  for (const [name, path] of Object.entries(FONTS)) doc.registerFont(name, path);
  const chunks = [];
  doc.on('data', (c) => chunks.push(c));
  const done = new Promise((resolve) => doc.on('end', () => resolve(Buffer.concat(chunks))));

  // header: brand and title on the left, the record's identity on the right
  write(doc, content.brand, { x: X, y: PAGE.m, width: 220, size: 18, bold: true });
  const yTitle = write(doc, content.title, { x: X, width: 220, size: 11, color: GREY });
  let yr = PAGE.m + 2;
  for (const r of content.header) {
    write(doc, r.label, { x: X + 230, y: yr, width: 95, size: 7.5, color: GREY });
    yr = write(doc, r.value, { x: X + 330, y: yr, width: W - 330, size: 7.5 }) + 1;
  }
  doc.y = Math.max(yTitle, yr) + 4;
  doc.moveTo(X, doc.y).lineTo(X + W, doc.y).lineWidth(1.5).strokeColor(INK).stroke();
  doc.y += 6;

  for (const s of content.sections) {
    if (s.id === 'limitations') { limitations(doc, s); continue; }
    // keep a section's heading with its text, or with its table (up to ~10 rows)
    sectionTitle(doc, s.title, s.text ? height(doc, s.text, W, 9) + 10 : Math.min(60 + (s.rows?.length ?? 0) * 19, 220));
    if (s.id === 'images') { images(doc, s, img); continue; }
    if (s.days) riskDays(doc, s.days);
    if (s.map) {
      // the few location rows on the left, the map beside them
      const tw = 232;
      const mw = W - tw - 12;
      const h = 118;
      ensure(doc, h + 30);
      const y = doc.y;
      table(doc, s.rows, { labelWidth: 112, width: tw, size: 8.5 });
      const mx = X + tw + 12;
      framedImage(doc, img.map, mx, y, mw, h, '–');
      doc.rect(mx + mw - 118, y + h - 12, 117, 11).fillColor('#ffffff').fill(); // OSM attribution on the map
      write(doc, '© OpenStreetMap contributors', { x: mx + mw - 116, y: y + h - 11, width: 114, size: 6.5, align: 'right' });
      doc.y = Math.max(doc.y, y + h + 4);
    } else if (s.rows?.length) table(doc, s.rows);
    if (s.chart) chart(doc, s.chart);
    if (s.text) { ensure(doc, 40); write(doc, s.text, { x: X, size: 9, lineGap: 2 }); doc.y += 3; }
    notes(doc, s.notes);
  }

  // where every value comes from, then the integrity block
  sectionTitle(doc, t.sourcesTitle);
  table(doc, sourceRows(content).map((r) => ({ label: r.label, value: r.source })), { labelWidth: 170, size: 7 });
  sectionTitle(doc, t.integrity);
  table(doc, [{ label: t.hash, value: hash }], { size: 8 });
  write(doc, content.verify.text, { x: X, size: 7.5, color: GREY });

  // footer (and the watermark, if any) on every page
  const range = doc.bufferedPageRange();
  for (let i = 0; i < range.count; i++) {
    doc.switchToPage(i);
    doc.page.margins.bottom = 0; // writing below the margin would otherwise start a new page
    const fy = PAGE.h - 34;
    doc.moveTo(X, fy - 4).lineTo(X + W, fy - 4).lineWidth(0.4).strokeColor(GREY).stroke();
    write(doc, `${content.brand} · ${content.title} · ${content.reportId} · SHA-256 ${hash.slice(0, 16)}…`,
      { x: X, y: fy, width: W - 90, size: 7, color: GREY });
    write(doc, fill(t.page, { i: i + 1, n: range.count }), { x: X + W - 90, y: fy, width: 90, size: 7, color: GREY, align: 'right' });
    if (content.watermark) {
      doc.save().rotate(-35, { origin: [PAGE.w / 2, PAGE.h / 2] }).fillOpacity(0.12);
      write(doc, content.watermark, { x: 0, y: PAGE.h / 2 - 20, width: PAGE.w, size: 30, bold: true, align: 'center' });
      doc.restore();
    }
  }
  doc.end();
  return done;
}
