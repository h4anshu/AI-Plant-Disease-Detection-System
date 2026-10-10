# My Field workspace: what is built, how it scales, how to change it

The area behind the landing page where a visitor checks a leaf, reads the result and keeps a record. Sign-in is switched off, so everyone is a "guest": records belong to a random per-browser id (`getDeviceId()` in `client/src/services/api.js`, `server/middleware/guestDevice.js`).

Design source (a Claude Design canvas, 13 artboards: map, pages, states, design system, phone screens): <https://claude.ai/artifact/1LRHv6EMuMSrP2msb6gzvj> (private). Built in Tasks 25 to 27 of `task.md`.

## 1. Routes and layouts (`client/src/App.jsx`)

| Layout | Routes | Chrome |
|---|---|---|
| `SiteLayout` | `/`, `/map`, `/privacy`, `/login`, `/register` | demo banner + top navbar (landing look) |
| `WorkspaceLayout` | `/overview`, `/predict`, `/history`, `/checkup/:id`, `/me` | left menu (≥ 1184 px) or top bar + bottom tab bar with a raised camera button (below) |

Unknown routes redirect to `/`. The navbar has a "My field" link to `/overview`.

**Back to the site.** The workspace has a "Back to the site" link (top of the menu, back arrow on phones). `SiteLayout` records the page and scroll position in `sessionStorage` (`siteReturn`, `components/workspace/siteReturn.js`); the button returns there and restores the scroll. Without a record it goes to `/`.

## 2. Pages

| Page | File | What it shows | Data |
|---|---|---|---|
| Overview | `pages/Overview.jsx` | greeting, scan card, last checkup, four counts, needs-attention list (recheck due 7 days after a disease result), weather-risk strip, recent checkups, crop bars, accuracy of the user's crops | `GET /api/predict` (history, 50 newest) and counts from it; `GET /api/predict/:id/disease-risk` for the latest located potato or rice checkup; `data/accuracy.js` |
| New check | `pages/Predict.jsx` (+ `UploadBox`, `LocationConsent`) | crop tiles, photo (camera or file), location consent, Analyze | `POST /api/predict`. A saved result (has `_id`) opens `/checkup/:id` with the record in router state; one without an id still shows inline |
| Checkup | `pages/Checkup.jsx` | photo / heatmap switch, confidence ring, severity, yield, other classes, tabs: Care plan, Field context, Satellite, Report & feedback | router state, else `GET /api/predict/:id`. Tabs reuse `RiskStrip`, `ContextCard`, `FieldHealth`, `ReportButton`, `Feedback`. A retake or not-sure result shows the existing `ResultCard` |
| Field log | `pages/History.jsx` | status tabs with counts, crop chips, list or photo view, legend, load older | `GET /api/predict` |
| Profile & privacy | `pages/Profile.jsx` | guest card (sign-in disabled), language, location switch, my data (delete with confirm), model accuracy and limits | `deleteMyData`, `readConsent/saveConsent`, `data/accuracy.js` |

The recheck date is computed (`createdAt` + 7 days); nothing is stored. A moderate or severe checkup counts as "rechecked" once a newer checkup of the same crop exists (comment in `Overview.jsx`; there are no field ids yet).

**Backend added:** `GET /api/predict/:id` (`getOne` in `server/controllers/predictController.js`): owner only (device id for guests), includes the heatmap, never the exact location, 404 for another browser, a bad id or an unknown id. Test: `server/tests/getOne.test.js`.

## 3. Shared code (`client/src/components/workspace/`)

| File | Role |
|---|---|
| `status.jsx` | `STATUS` colours and glyphs, `levelOf(prediction)` (healthy / early / moderate / severe / retake), `needsAttention`, `StatusPill`. A status is always a shape, a word and a colour |
| `parts.jsx` | `titleOf`, `CropTag`, `PageHead`, `Lbl`, date helpers, `hasLocation` |
| `useHistory.js` | loads this browser's checkups, `more()` for the next page |
| `WorkspaceLayout.jsx`, `icons.jsx`, `siteReturn.js`, `cropIcon.js` | shell, menu icons, back-to-site memory, crop pictures from `assets/honest` |

CSS: block "My Field workspace" at the end of `client/src/index.css` (`.ws-card`, `.ws-btn`, `.ws-tab`, `.ws-seg`, `.ws-st`, `.ws-ring`, …). Unlayered CSS beats Tailwind utilities, so a utility such as `sm:grid` does not override `.ws-row`; use the `.ws-row-grid` helper there.

## 4. Languages

New strings are in the `ws.*` namespace of `locales/en.json` and `locales/hi.json` (plus `nav.myField`). The Hindi is AI-drafted and **not reviewed** (it is on the Pending list in `task.md`). Disease, crop and severity names come from `locales/terms.json`.

## 5. How it scales

| Width | Layout |
|---|---|
| < 640 px | one column; list rows show the status and date under the title; the hero's plant is hidden; bottom tab bar (84 px, safe-area aware); the page ends 7 rem above the bottom so nothing sits under the bar |
| 640 to 1183 px (phones landscape, tablets) | still the tab bar and one column; Needs attention and Weather risk go side by side from 768 px |
| ≥ 1184 px (`--breakpoint-lg`) | left menu (248 px, sticky), two-column pages, max content width 1180 px |

Buttons, chips, tabs and tab-bar items are at least 44 px tall (48 for tabs); the language switch is 40 px and plain text links ("View all") are smaller.

## 6. Tests and checks

- `cd client && npx vitest run`: 67 tests; `src/test/Workspace.test.jsx` covers `levelOf`, the Overview counts and recheck rule, the Field log filters, and "a saved result opens the checkup page". `Predict.test.jsx` still covers the form.
- `cd server && npm test -- tests/getOne.test.js`.
- `npx oxlint` (only "fast refresh" notes for helper files and the old login warnings), `npx vite build`.

Device sweep (Playwright, Chromium, API mocked), English: `/overview`, `/predict`, `/history`, `/checkup/:id` (diagnosis and retake), `/me` (all four tabs) at 360×740, 390×844, 768×1024, 1024×768, 1280×720, 1440×900 and 1920×1080: no horizontal overflow, no broken images, no text under 11 px, no content under the tab bar (verified by screenshot). Hindi at 360, 768, 1280 and 1920: no overflow, no clipped text.

Bugs this sweep found and fixed: a 6 px horizontal overflow on `/overview` at 360 px (risk card padding and `min-w-0`); 10 px labels in the older components (raised to 11 px everywhere); `text-sage` labels with low contrast (now `text-ink-2`).

## 7. Known limits

- The Field context, Satellite and Report tabs still use the older components inside the new cards, so their inner look (square, mono) is older than the rest.
- The Map page is still in the public shell, not in the workspace shell.
- Offline queue and "download my data" from the design are not built.
- Not tested on real devices or in Firefox / Safari; the sweep used a mocked API, so the Field context and Satellite tabs were not exercised with real data.
- Hindi is unreviewed; the example data in the design file is not in the app (the app shows real records only).
