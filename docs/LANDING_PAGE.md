# Landing page: what is built, how it scales, how to change it

Written 9 Oct 2026 after the final QA round (task.md, Task 23). Colour decisions and their evidence are in [COLOUR_SYSTEM.md](COLOUR_SYSTEM.md); this file is about the page itself.

## 1. Sections (order in `client/src/pages/Home.jsx`)

| # | Component | id | Tone of its background | Edge | What it shows |
|---|---|---|---|---|---|
| 1 | `Hero.jsx` | – | warm parchment | – | headline, plant picture, result + care-plan cards built in code (so Hindi works) |
| 2 | `HowItWorks.jsx` | `how` | light sage → deeper sage | `--edge-a` | photo → diagnose → treat |
| 3 | `Honest.jsx` | `honest` | warm latte | `--edge-b` | quality gate, "not sure", per-crop accuracy with 95% intervals from `data/accuracy.js` |
| 4 | `MapSection.jsx` | `map` | cool sage-blue | `--edge-c` | privacy-safe hexagon map; filters link to `/map?crop=&days=` |
| 5 | `Beyond.jsx` | `around` | sage-green meadow (greener than the Map above it, so the wave shows) | `--edge-d` | weather risk, rain vs normal, NDVI/NDRE/REDSI (all labelled "Example data") |
| 6 | `ReportSection.jsx` | `report` | butter-cream | `--edge-e` | the real sample PDF report (EN + HI), language buttons |
| 7 | `Finale.jsx` (`<footer id="start">`) | `start` | deep pine, the only dark band | `--edge-f` | one call to action, footer links, limits line, credits |

Navbar: `components/Navbar.jsx` (switches to the hamburger menu below 1184 px, same breakpoint as the sections; the menu has a "Start a check" link). `LangButtons.jsx` is the shared language switch (same state as the navbar).

## 2. How the sections scale

**Desktop (≥ 1184 px, `--breakpoint-lg: 74rem`)**: How, Honest and Map are drawn on a fixed *unit canvas* (How 1672×1010, Honest and Map 1900×941). `--u` is one canvas unit in px:

```
--u: min( max(FLOOR, min( (100cqw - 16px)/W , (100svh - 4.6rem)/H )) , (100cqw - 16px)/W )
```

- the inner `min` fits the canvas into one viewport (width and height); `4.6rem` is the navbar;
- `FLOOR` (0.7 px for How, 0.72 px for Honest and Map) stops text getting unreadable on very short screens, and the outer `min` makes sure the canvas is **never wider than the screen**;
- children are placed with `pos(x, y, w, h)` in canvas units; font sizes use `fs(n, min)` = `max(min px, n × --u)` so the pixel floor wins when the canvas gets small.

Around the leaf, Report and the Finale are normal flow layouts: `min-height: calc(100svh - 4.6rem)`, content centred, paddings kept small enough that the content fits (checked at 1280×720 and 1366×768).

The Report section ends above the dark closing band's wave: its bottom padding is `--edge-h + 1.5 rem` (`+ 2 rem` on phones), so the caption "Sample report, page 1 of 3" never sits on the dark wave (dark text on the dark green was unreadable at 1920×930 before 10 Oct).

**Below 1184 px (tablets, phones)** every section is a stacked column (order set with `max-lg:order-*`), canvas-only decor is `max-lg:hidden`, the hero picture is capped at 34 rem and centred. There is no horizontal scroll at any width checked.

## 3. Backgrounds and the "separate sheets" edges

- Each section's background is a `::before` layer (z-index −1) that reaches `--edge-h` (`clamp(44px, 5.4vw, 92px)`) up over the section above, masked at its top by its own SVG wave (`--edge-a…f`, data-URIs in `index.css`). So every join is a different asymmetric curve and the page reads as overlapping sheets.
- Sections must **not** have a `z-index`, otherwise the layers stop sharing the root stacking context and the overlap breaks.
- Section tones are decorative only; text colours are the tokens of the colour system.

## 4. Assets

All art is WebP in `client/src/assets/{hero,how,honest,map,report,end}/` (about 3 MB in total; the production build is about 4.5 MB). Raw generated originals are in the repo-root `assests/` folder (about 60 MB, **not used by the app**; move it out of the repo or ignore it before pushing).
Optional slots picked up automatically by `import.meta.glob`: `assets/honest/crop-<crop>.webp`, `badge-camera|leaf|bars.webp`, `assets/map/hex-clear.webp`. Sample PDFs are in `client/public/samples/`.
Known unused art: how/leaf-d, camera emblem, rice art, the old Vite `src/assets/hero.png`.

## 5. Honest data rules

- `client/src/data/accuracy.js` mirrors `ml-service/models/metrics.json`; a test enforces that they are equal.
- Everything illustrative on the landing page (example result, Around-the-leaf cards, map example card) is labelled "Example data" and uses real classes only.
- No claim about speed, accuracy beyond the measured table, or sign-in (sign-in is disabled).

## 6. Copy and languages

Namespaces in `client/src/locales/{en,hi}.json`: `home`, `nav.start`, `how`, `honest`, `mapsec`, `beyond`, `repsec`, `finale`. Crop and disease names come from `locales/terms.json`. **The Hindi text is AI-drafted and not reviewed** (add these namespaces to the agronomist review). Hindi has its own CSS rules (`:lang(hi)`: taller line-height, larger mono labels).

## 7. Tests and checks

`cd client && npx vitest run` (67 tests; the landing sections are covered by `Hero`, `Honest`, `MapSection`, `Landing`) · `npx oxlint` (only the old login-related warnings remain) · `npx vite build`.

Final QA round (Playwright, English unless noted):

| Size | Result |
|---|---|
| 360×740, 768×1024 | no horizontal overflow, no tap target under 24 px, no text under 11 px |
| 1100×800 | stacked layout, no overflow |
| 1280×720 | no overflow; Honest, Map 646 (fit); Around 679, Report 666, How 707 (slightly over the 646 available: the unit floor) |
| 1366×768 | Honest, Map one viewport (694); Around 749 and Report 748 (extra top padding for the wave), How 707 |
| 1920×930, 2560×1300 | every canvas section exactly one viewport, no overflow |
| Hindi at 1366×768 | no overflow, all sections one viewport (How 707) |

Sweep of 10 Oct 2026 (Playwright, 11 sizes from 360×740 to 2560×1300, plus 1905×930): no horizontal overflow, no broken images, no text under 11 px. Found and fixed: the Report caption on the dark wave (above); the hero's "SCAN ACTIVE" badge wrapping onto two lines at 1280 to 1440 px (`whitespace-nowrap`, width from `min-width`); 10 px labels in older components (raised to 11 px app-wide). Report is now 769 px tall at 1280×720, 798 at 1366×768 (the wave clearance), and exactly one viewport from 1440×900 up. Hindi: no overflow at 360, 768, 1280 and 1920.

## 8. Known limits

- On 1280×720 and lower, How is up to ~60 px taller than the screen (text floors); nothing is clipped.
- Navbar links are 20 px tall (text links, 24 px bar); the desktop nav is the one place below the 24 px tap guideline.
- Not tested on real phones/tablets or other browsers (only Chromium at those sizes); Hindi checked at 1366×768 only.
- Contrast of body text on the new section tones was not re-measured (the text colours did not change).
- Hindi text unreviewed; the example numbers are illustrative.

## 9. Motion (Task 24)

Scroll and ambient motion is one small system: `client/src/components/motion.jsx` (`useReveal()` called once in `Home.jsx`, `CountUp`) plus the "Motion" block at the end of `client/src/index.css`.

- Markup opts in with `data-rv="up|left|right|zoom|fade|wipe|t"` and `style={d(seconds)}` for a delay. An IntersectionObserver adds `.in` when 15% of the element is visible; the CSS then transitions it (opacity and the individual `translate` / `scale` properties, so it stacks with the layouts' own transforms). `t` only triggers: its children `.rv-grow` (bars and lines grow), `.rv-pop` (dots, chips) and `.rv-fade` animate.
- `CountUp` counts a number from 0 once it is seen; the final text is always what is in the DOM at rest (tests, reduced motion).
- Ambient motion: `.fl` (float), `.sway`, `.glow`, `.nudge`, `.cta-lift` (buttons), a slow turn of the hero ring, scroll-linked drift (`.px`, only where `animation-timeline` exists).
- Rules: everything is inside `prefers-reduced-motion: no-preference`; content is hidden only after the script adds `rv-js` to `<html>`; only transform and opacity animate; reveals run once. `wipe` uses a mask, not `clip-path` (IntersectionObserver treats a fully clipped element as never visible).

