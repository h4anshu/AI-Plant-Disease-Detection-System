# Offline use and installing the app (PWA)

Added 29 Oct 2026. A farmer's phone often has no signal in the field. Before this, the app showed a blank page or an error. Now it opens with no signal, shows the last alerts and log it had, and can be added to the home screen like an app.

## 1. What works with no signal

| | With no signal |
|---|---|
| Opening the app on any page (`/overview`, `/history`, `/predict`, a link to a checkup) | **Yes**, if the phone has opened it once before: the page shell, scripts, styles and fonts are kept by the service worker |
| **Weather & Alerts**: the fields and their alerts | **Yes, as the last copy.** The screen says "No connection. Showing the alerts last checked on {date}; they may be out of date." |
| The log of checkups (text, first 50) | **Yes, as the last copy**, with a note. Photos and heatmaps do not load (they live on Cloudinary and are not kept) |
| A new leaf check, saving a field, the map, a report, "Did this help?" | **No**: they need the server. Each says so as before; nothing is queued |
| The very first visit | **No**: nothing has been kept yet |

**"No alert" is never said from an old copy.** From a copy kept on the phone, the Overview says "The last copy shows no alert, but it may be out of date", the tab and the field card carry an "Old copy" pill, and the green "No alert" pill is not drawn (`pages/Overview.jsx`, `WeatherAlerts.jsx`; tests in `OfflineOverview.test.jsx`). Alerts that exist are still shown (a frost warning from yesterday is better than nothing), with the same note.

## 2. The pieces

- **`client/public/sw.js`, the service worker.** It keeps only the app's own files: the page shell (`/`, the one `index.html` that opens every route), built files under `/assets/` (their names carry a hash, so they never change), and Google Fonts (the style sheet is served saved and refreshed, the font files are kept). A page is fetched from the network first, so a new deploy shows at once; the saved shell is used only when the network fails. **It never touches anything else: not the API, photos, map tiles, POSTs or the sample PDFs.** `tests/serviceWorker.test.js` runs the file against a fake worker scope and checks each of those.
- **Why the API answers are not in the worker's cache:** a cache belongs to the phone, not to a person. An alerts answer saved there would be shown to the next user after a sign-out.
- **`client/src/services/offlineCache.js`, the last copy.** After every good answer the app keeps the alerts and the first page of the log in `localStorage`, **per owner** (the account, or the guest browser). With no signal (no answer at all, or a gateway error 502 to 504) it shows that copy; if the server answered "no" (401, 404, 500), it shows that, as before. The copy is erased on sign-out, on a session the server ended, on account deletion and on "Delete my data". It holds what the API returned: no exact field place (the API has none to return).
- **`client/public/manifest.webmanifest` and `icons/`**: name, colours, start page (`/overview`), icons (192, 512, a maskable one, and the iOS touch icon, all the brand leaf on pine) and two shortcuts (Scan a leaf, Weather & alerts). The tab icon (`favicon.svg`) was Vite's default purple logo; it is the brand leaf now.
- **`client/src/main.jsx`** registers the worker in a production build only (in development it would serve stale files). **`client/vercel.json`** sends `sw.js` and the manifest with `no-cache`, so a changed worker is picked up at once.

## 3. Checked

- `client/src/test`: `serviceWorker.test.js` (14), `offlineCache.test.js` (5), `Offline.test.jsx` (8), `OfflineOverview.test.jsx` (2).
- Real browser, production build: the worker activated; with the network cut (`setOffline`) a reload opened the app from the saved shell, with the field, the "No connection" note and the "Old copy" pills; `/history` opened offline too; with the signal back the note and pills went.
- Not tested: a real phone, "Add to home screen" on Android Chrome and iOS Safari (iOS needs Share › Add to Home Screen; there is no install banner there), Firefox.

## 4. Limits and what is not built

- **Offline upload queue** (take the photo in the field, send it when the signal returns): not built. It needs the photo kept on the phone (IndexedDB), a retry, and thought about location consent; the Task 25 design marks it "Proposal".
- **Free web push** (a notification when a new warning appears) is not built. It needs a push key pair, a store of subscriptions per owner, a sender that runs when the alerts change (Cloud Scheduler hitting `POST /api/alerts/tick`), and on iPhone only works for an installed app. It is the next feature for the "farmer must open the app to learn about a frost" gap.
- Files of old deploys stay in the worker's cache until `CACHE` in `sw.js` is renamed (a few MB per deploy).
- The copy is one per owner and one per call; there is no "last 7 days of alerts" history.
