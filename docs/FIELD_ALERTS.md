# Weather & Alerts (Field Alert Center, Phases 1 to 3): what is built, rules, API, privacy, limits

A farmer saves up to 3 fields (crop, growth stage, place). The Overview then has a second half, **Weather & Alerts**, with up to 3 alerts per field for the next 3 days: frost, heat, heavy rain, and rain at harvest or after spraying. The first half, **My Field** (leaf checks), is unchanged and still opens by default.

Why and what comes next: [FIELD_ALERT_RESEARCH.md](FIELD_ALERT_RESEARCH.md), [FIELD_ALERT_PLAN.md](FIELD_ALERT_PLAN.md) (this is the "Phase 1 thin slice" of §6). Built and tested in Task 32 of `task.md`. Design canvas: <https://claude.ai/artifact/9kYucBHrNvYSeGKzjoxszk> (private).

**Our own alerts are forecast-model results, not official warnings** (they are labelled "Model forecast"); alerts labelled **Official** are NDMA SACHET and IMD warnings passed on as published (section 7). All 8 of our rules are `draft`: an agronomist has not reviewed them, and the screen says so ("Rule FROST-WHEAT-1, draft…"). River-flood signals are described in section 8; push/SMS, news and the satellite flood map are later phases and are not in the app.

## Decisions of the owner (26 Oct 2026)

- **Non-commercial.** The app stays non-commercial (no payment, no ads). That is what Open-Meteo's free tier, the Earth Engine noncommercial tier and the public-data use below rest on; if that ever changes, those terms must be read again first.
- **Reviewer of the rules and the Hindi:** Anshu Mishra. `docs/ALERT_REVIEW.csv` (`npm run alerts-review` in `server/`) lists every rule, number and sentence with the reviewer's name filled in and the verdict empty. **Every rule stays `draft` in the code and on the screen until that review is actually done and applied**: a name on a list is not a review.
- **No SMS, WhatsApp or voice (IVR)**: they cost money, so Phase 4's paid channels are not built and are not planned. Everything here is shown inside the app. (Sign-in, phone numbers and the data-protection duties that come with them are therefore not needed either.)
- **Official feeds:** IMD's GeoServer layer, NDMA SACHET and the CWC site are free public data that anyone can read, and the app reads them like any web page does. No permission is required to do that; the open question is only **stability**: IMD's layer and CWC's JSON are not documented APIs and no terms are published, so they could change or be restricted without notice (the kill switches and the "feed delayed" notices exist for that). NDMA's own feed states `copyright: public domain`. A polite letter to IMD/CWC before a wide public launch is advisable but not a blocker.
- **Earth Engine** is already set up for the project, so the satellite radar flood check uses it (section 8).

## 1. What the user sees

| Where | What |
|---|---|
| `/overview` | A switch of two cards at the top: **My Field** and **Weather & Alerts**, each with a status pill so nothing hides behind the other one ("1 warning", "2 watch", "Weather unavailable", "No alert"; for My Field "1 to recheck", "All clear"). The half last used is remembered on the device (`localStorage.overviewMode`); `/overview?mode=weather` or `?mode=field` opens one directly and wins over the remembered choice. Arrow keys, Home and End move between the two tabs. |
| Weather & Alerts | Field chips (All, one per field, add), the main alert (action first, level in words, when and until, a bar chart of the rule's number for the days ahead, "Why this alert?" and "Mark as done"), the others under "Then", a 72-hour strip (rain, temperature, alert chips, "now" line), field conditions (rain of the last 7 days, coldest night ahead, crop stage selector), disclaimer and weather attribution. |
| `/fields/new` | Three steps: crop (10 crops), stage (5 stages), place (phone GPS or tap the map; optional name, 40 characters). |
| `/me?tab=data` | "My fields": each field with a two-step delete. "Delete my data" also deletes fields. |
| `/privacy` | New section "Saved fields". |

Level words and shapes reuse the disease status look (not colour alone): **Watch** = quarter circle, **Warning** = half circle, **No alert** = tick, **Tip** = dashed dot, **Unavailable** = dashed ring.

Behaviours that are easy to miss:
- A field whose weather could not be loaded is shown as **"The weather for X could not be loaded. Do not read this as all clear."**, never as "no alert".
- A failed refresh keeps the last answer on screen and shows an error note above it.
- "Mark as done" is remembered **on this device only** (`localStorage.alertDone`, key `<fieldId>|<ruleId>|<date>`). Done alerts sink below the others so the next thing to do leads; if all are done the heading says "All marked as done".
- An alert on the third day is never "Warning" (a 3-day-ahead forecast is least certain); the "Why" panel says so.
- Changing the crop stage (select in the conditions card) saves it and recomputes the alerts at once.
- Dates and hours are the **field's local time** (the server sends local dates and hours).
- Everything is English and Hindi. Alert text lives in `client/src/locales/*.json` (`alerts.rules.<RULE-ID>.head/why`); the server returns structured data only (rule id, level, date, window, numbers).

## 2. Rules (`server/utils/alertRules.js`)

Pure code, no network. All `reviewStatus: 'draft'`. "ours" means the number is a placeholder chosen by us for the agronomist to set.

| Rule | Crop and stage | Trigger (forecast, local days 0 to +2) | Level | Source of the number |
|---|---|---|---|---|
| `FROST-WHEAT-1` | wheat, flowering or grain fill | night low ≤ 4 °C / ≤ 2 °C | watch / warn | 4 and 2 °C mirror IMD cold-wave levels; the damage data is US/Australian, Indian source still needed |
| `FROST-POTATO-1` | potato, vegetative, flowering or tuber filling | night low ≤ 4 / ≤ 2 °C | watch / warn | ours |
| `HEAT-WHEAT-1` | wheat, flowering or grain fill | daily max ≥ 34 °C; ≥ 36 °C on 2 days in a row | watch / warn | 34 °C: Lobell et al. 2012 (northern India); 36 °C ours |
| `HEAT-RICE-1` | rice, flowering | daily max ≥ 33 / ≥ 35 °C | watch / warn | pollen sterility above 33 °C; action needs review |
| `HEAT-ANY-1` | any | daily max ≥ 40 °C | watch | IMD heat wave in the plains (hills use 30 °C and are not covered yet) |
| `RAIN-HARVEST-1` | any, ready to harvest | daily rain ≥ 10 / ≥ 30 mm | watch / warn | ours |
| `RAIN-HEAVY-1` | any | daily rain ≥ 40 / ≥ 64.5 mm | watch / warn | 64.5 mm = IMD "heavy"; 40 mm ours |
| `RAIN-SPRAY-1` | any, vegetative to grain fill | daily rain ≥ 10 mm, today or tomorrow only | tip (info) | ours |

How an alert is made (`evaluate(field, weather, now)`): hourly series → only **future** hours → daily numbers → each applicable rule gives at most one alert (its worst day, earliest on a tie) → the 3rd day's "warn" becomes "watch" → rain rules are deduplicated per day (the more specific one wins) → at most 3 alerts, worst first. Night-low rules look at "nights ahead" (days that still have hours before 06:00). Confidence is `medium` for today and tomorrow, `low` for the third day. Not enough forecast hours throws, which the API reports as "weather unavailable" (never an empty all-clear).

**To change a number or add a rule:** edit `RULES` (and the stage lists above it), add `alerts.rules.<ID>.head/why` in `en.json` and `hi.json`, add a case to `server/tests/alertRules.test.js`. When the agronomist signs a rule off, change its `reviewStatus` handling (today `REVIEW_STATUS` is one constant) and remove "draft" from the "Why" text (`alerts.rule`).

## 3. API (all under `/api/fields`)

Same guest identity as the checkups: the `x-device-id` header (random UUID per browser, `services/api.js`). A guest without it gets 400 "Missing device id". Rate limit: 60 requests per 10 minutes per IP for the whole router (`ALERT_RATE_LIMIT`).

| Call | Body or result |
|---|---|
| `GET /api/fields` | `[{ _id, name, crop, stage, createdAt }]` (never the place) |
| `POST /api/fields` | `{ crop, stage, lat, lon, name? }` → 201 with the same 5 fields. 400 "Invalid crop / stage / location / name", 409 when 3 are saved |
| `PATCH /api/fields/:id` | `{ name?, stage? }` only (crop and place cannot change: delete and add). 404 for another browser's or a malformed id |
| `DELETE /api/fields/:id` | 200, 404 as above |
| `GET /api/fields/alerts` | `{ checkedAt, weatherSource, officialSources, fields: [...] }`. Each field: `{ _id, name, crop, stage, createdAt, official, status: 'ok', today, timezone, alerts, horizon, conditions }` or `{ ..., official, status: 'weather_unavailable' }`. `official` and `officialSources` (`[{ source, state, fetchedAt }]`) are described in section 7; `flood` (`{ river, gauge }`) in section 8. A river alert is among `alerts` (a field without weather still has it) |
| `GET /api/alerts/health`, `POST /api/alerts/tick` | operator routes, header `x-alerts-token` (section 7) |

`alerts[]`: `{ id: 'RULE|date', rule, hazard, level: info|watch|warn, date, offset, from, to, values: { metric, value, threshold, levels, series }, stage, crop, confidence, reviewStatus }`. `horizon`: 3 days × 4 parts (night = lowest, morning and evening = average, noon = highest; `past` marks parts already over) and `now`. `conditions`: `rain7` (null when a day is missing) and `coldest`.

## 4. Privacy

- The exact point is stored (GeoJSON, `server/models/Field.js`) but **never returned and never logged**; a test checks every answer and the logger output for coordinates.
- Open-Meteo is asked for the **0.05° grid cell (about 5 km)**, not the point, and the shared cache (`WeatherCache`, keyed by a hash) holds no readable location. Fields in the same cell share one request.
- "Delete my data" (`deleteMine` in `predictController.js`) deletes the fields too; each field also has its own delete button.
- Fields have no public effect: they are not in the public map or any statistic.
- IMD is asked for the same 5 km cell (never the point) and the exact point is tested against the shapes it returns on our server; the districts found are saved on the field, never returned or logged, and deleted with it. No official alert is stored per user: SACHET alerts are public documents kept for everyone, IMD rows are public too.
- Not stored anywhere: our alerts (computed on every read), "done" marks (browser only).

## 5. Limits (known, on purpose)

- Forecast model only; one source (Open-Meteo, free for non-commercial use, 10,000 calls/day; attribution is shown). When it is down the screen says so; failed answers are not cached, so a refresh asks again.
- 3 fields per browser; sign-in is off, so fields belong to the browser (clearing browser data loses the link; "Delete my data" before that).
- Alerts exist only while the page is open: no push, SMS or e-mail yet (needs sign-in or a phone number, a consent flow and an agronomist; plan Phase 4). Because the alert text is built in the client, Phase 4 must either move the sentences to the server or duplicate them there.
- Rules cover wheat, rice, potato and "any crop"; the other 7 crops get only the heat-wave, heavy-rain and spray-tip rules.
- Frost uses the 2 m air temperature; the ground can be several degrees colder.
- The 3-day window ends at the local midnight after the third day; alerts for later days are not computed.

## 6. Tests

| What | Where | Count |
|---|---|---|
| Rules, aggregation, horizon (golden fixtures) | `server/tests/alertRules.test.js` | 24 |
| Fields API: validation matrix, cap, isolation, alerts through a fake Open-Meteo (snapped cell, shared cell, 503, bad answers), no coordinates in answers or logs, delete my data | `server/tests/fields.test.js` | 28 |
| Rate limit of `/api/fields/alerts` | `server/tests/hardening.test.js` | +1 |
| Helpers, mode switch, every Weather & Alerts state, Hindi, strip, add-a-field wizard, My fields, official warnings | `client/src/test/WeatherAlerts.test.jsx` | 75 |
| River flow, CWC gauges, the flood card: real Open-Meteo flood and CWC answers | `server/tests/flood.test.js` | 21 |
| Radar flood check through the API: owner only, cache, every failure, no place in answers or logs | `server/tests/floodExtent.test.js`, `hardeningExtent.test.js` | 10 + 1 |
| Radar method and endpoint, with real Earth Engine statistics | `geo-service/tests/test_flood.py` | 10 |
| Official warnings: real SACHET and IMD documents, matching, Update/Cancel, health, the API, the operator routes | `server/tests/official.test.js` | 52 |

Run: `cd server && npm test`, `cd client && npx vitest run`, `npx oxlint`, `npx vite build`.

Checked once in a real browser (Chromium via Playwright, in-memory MongoDB, the real server, a fake Open-Meteo with frost, rain, heat, calm and 503 areas): empty state, the wizard with a GPS fix and with a map tap and with GPS refused, a frost alert, the "why" panel, mark as done after reload, field chips, stage change, 3 fields and the limit, an unavailable field, Hindi, a 360 px phone, keyboard on the switch, "Delete my data", the Privacy page. It has **not** been checked on a real phone, in Firefox or in Safari, and not against the real Open-Meteo.

## 7. Official warnings: NDMA SACHET and IMD (Phase 2)

Our alerts are a model's estimate. Phase 2 adds what the authorities themselves have issued for the field's **district**, passed on as published and marked "Official" (issuer, issue time, validity, a link to the original). They are in `official` of each field in `GET /api/fields/alerts`, shown in the same list: the worst level first, and at the same level an official alert before ours. Built in Task 33 of `task.md`; plan: [FIELD_ALERT_PLAN.md](FIELD_ALERT_PLAN.md) §7.

### Sources and what is matched

| Source | What it gives | How a field is matched |
|---|---|---|
| **NDMA SACHET** (`sachet.ndma.gov.in/cap_public_website/rss/rss_india.xml` + one CAP 1.2 file per alert) | Nowcasts (3 hours) and state/IMD alerts: event, severity (Extreme/Severe/Moderate/Minor), onset, expiry, headline in the issuer's languages, area | by **LGD district code** (the alert names the districts by code) |
| **IMD district warnings** (`reactjs.imd.gov.in/geoserver`, layer `district_warnings_india`) | 5 days per district: a colour (red, orange, yellow, green) and hazard codes | by the layer's own row **ID** |

Our level for an official alert: SACHET Extreme → **urgent**, Severe → warning, Moderate → watch, Minor → tip. IMD red → urgent, orange → warning, yellow → watch, green → nothing. **Urgent** is new in the app (a full dark circle, "Urgent").

### Finding the districts of a field (once per field, from IMD's point query)
- IMD is asked for the **0.05° cell only** (the same 5 km square as the weather), in two layers, **with shapes**. The exact point is then tested against those shapes **here**, so it never leaves the server. (Without that, WFS answers every district whose bounding box touches the cell: Palakkad also returned Coimbatore and Thrissur.) If no shape holds the point, every district under the cell is kept and the higher level wins.
- The result is saved on the field (`district.imd` ids, `district.lgd` codes; never returned by the API). Fields saved before Phase 2 get theirs on their first look. A failed lookup is not repeated for 15 minutes.
- The two IMD layers spell names differently (KHORDHA / KHURDA), so they are **never joined by name**; the LGD side uses a reviewed bridge:
  - `server/data/lgd_districts.json`: the India Data Portal's "District LGD Codes" (a copy of the Local Government Directory, **Open Data Commons Attribution License**), 765 districts, file dated Oct 2023.
  - `server/data/imd_lgd.json`: IMD (state, district) → LGD code. 729 of 741 IMD districts map: the rest by exact normalised name, 44 by a similar name inside the same state (every one read by hand) and 72 by hand-written aliases (`imd_lgd_aliases.json`). Mirpur and Muzaffarabad (Pakistan-administered) are deliberately unmapped. Rebuild with `node scripts/build_district_map.js` (it prints each guess and every district left over).

### IMD's codes (the "legend check" of the plan, closed)
- **Colours** are IMD's own: its GeoServer style (`GetStyles`) paints 1 red `#F20505`, 2 orange `#F28705`, 3 yellow `#F2E205`, 4 green `#078C03`, 0 white (no data).
- **Hazard codes** are the legend in the source of IMD's own district-warning page: 2 heavy rain, 3 heavy snow, 4 thunderstorm and lightning, 5 hailstorm, 6 dust storm, 7 dust-raising winds, 8 strong surface winds, 9 heat wave, 10 hot day, 11 warm night, 12 cold wave, 13 cold day, 14 ground frost, 15 fog, 16 very heavy rain, 17 extremely heavy rain (1 = no warning).
- **Day_1 to Day_5 are read as today and the next four days.** IMD's page dates Day 1 as the current day and shows the row's `Date` as "Updated at"; only the first three days are used, and a row not updated for 36 hours is ignored. This reading is **not confirmed by IMD** (Pending list).
- `updated_at` ends in "Z" but is **India time** (the newest value read 11:47Z at 06:17 UTC); it is read as +05:30. Found in the first real-browser run: the screen showed an issue time later than "now".

### Keeping it fresh (no new paid service)
- Cloud Run has no timer, so the **first request after an interval refreshes the source**: SACHET every 10 minutes, IMD every 30. A lease in `SourceHealth` keeps two instances from fetching together; the request waits at most 6 seconds and then answers with what is stored while the fetch finishes. A CAP file is fetched once ever; items older than 2 days and links to another host are not fetched.
- An Update or Cancel marks the alerts it references as **superseded** (kept, so that the older item, still in the feed, is not fetched and shown again; also correct when the older one arrives later).
- `POST /api/alerts/tick` fetches both now (what Cloud Scheduler would call; not enabled) and `GET /api/alerts/health` shows each source: both need the header `x-alerts-token` equal to `ALERTS_ADMIN_TOKEN` (503 when unset, 401 when wrong).
- Source states, from the last **successful** fetch: ok (SACHET 30 min, IMD 90 min), delayed (up to 6 hours), down, disabled. The screen says "Official warnings are delayed. Last updated …" or "could not be checked yet", and then it **never says "no alert" alone** (the page title, the calm card and the switch pill all change). A freshness warning is logged when SACHET has had no new item for 6 hours or IMD none for 24.
- Kill switch: `ALERTS_DISABLED_SOURCES=sachet,imd` (either or both).

### On screen
The main card for an official alert shows the official text (SACHET's own headline in the reader's language when the issuer wrote one, else English; for IMD, a sentence made from its colour and hazard names), a panel with issuer, issue time, validity and "Open the original" (https links only), the issuer's instruction when there is one, and no advice from us. The "Why" panel says it is passed on as published. Official text is shown as text, never as HTML. Under the main card up to 4 more are listed ("Show N more" for the rest); the 72-hour strip has a chip for each. Official warnings are shown even when the field's weather could not be loaded.

### Limits (known, on purpose)
- **About half the alerts in today's feed have no district code** (Andhra Pradesh mandal lightning alerts, Goa villages, a UP district named in free text, CWC river stations): SACHET gives their polygon only at a URL that answers 403, so they are not matched. District-level alerts, which carry the IMD and SDMA warnings, are.
- The LGD list is from Oct 2023: districts created later (3 Rajasthan codes in today's feed) are unknown to it, so a field there is not matched to alerts naming only the new code. IMD's layer also uses the older districts.
- Neither source has published terms for this use and IMD's layer is not a documented API: the kill switch exists; no permission was asked (see "Decisions of the owner").
- A 3-hour nowcast is gone when the page is opened 4 hours later; there is no push yet.
- An official alert and our own alert for the same hazard are two cards, not merged. Only the languages the issuer published are shown (English, and for some states Hindi); the Marathi, Telugu, Malayalam and other headlines are stored but not shown.
- The IMD day reading above is an assumption.

### Checked against the real feeds (25 Oct 2026, 11:44 to 11:58 India time)
SACHET: 100 items, 98 still active after Update/Cancel handling, both sources fetched in 1.4 seconds the first time. Districts resolved for Ludhiana, Cuttack, Shimla, Palakkad, Chennai, Delhi (one district each after the shape test) and the sea (none). Palakkad showed the IMD red warning for 26 Oct, the orange one for today and SACHET's "Very Heavy Rain" for Kerala; Chennai an IMD yellow and a SACHET "Light Rain"; Ludhiana, Shimla and Delhi none, as IMD had them green. With SACHET unreachable the screen showed the delay notice and the health route said `sachet: down ECONNREFUSED`, `imd: ok`.

### Configuration
| Variable | Default | Meaning |
|---|---|---|
| `ALERTS_DISABLED_SOURCES` | none | `sachet`, `imd` or both: do not fetch that source |
| `ALERTS_ADMIN_TOKEN` | unset | secret for `/api/alerts/health` and `/tick`; unset = both answer 503 |
| `SACHET_FEED_URL`, `IMD_WFS_URL` | the real ones | for tests and local runs |

## 8. Flood and water (Phase 3)

Three signals are built, each labelled for what it is, and one was tried and dropped. They are in each field's `flood` (`{ river, gauge, radar }`) and, when they warn, in the same alert lists as everything else. Built in Task 34 of `task.md`; plan: [FIELD_ALERT_PLAN.md](FIELD_ALERT_PLAN.md) §8.

**No text says that a field will flood.** The river alert says river flow "in your area" is forecast to be unusually high; the gauge alert says a river gauge "about N km from your field" is above its warning level; both say what they are not.

### River flow, regional forecast (`server/services/flood.js`)
- Open-Meteo's flood API (GloFAS, CC BY 4.0, free for non-commercial use) gives river discharge on a 5 km grid and snaps a point to "the largest river in the cell". For Ludhiana that is a 2 m³/s drain, while the Sutlej (median 140, 95th percentile 231 m³/s) is one step north. So the field's 0.05° cell and its **four neighbours 0.1° away** are asked in one request, and the river with the biggest forecast flow is used. A cell is never asked with the field's exact point.
- "A river": the mean forecast flow of at least 50 m³/s. Below that for all five points, the answer is "No large river near this field, so there is no river signal here" (not silence).
- **"Unusually high" is measured against that river's own history.** The 90th, 95th and 99th percentile of its discharge in the reanalysis (2005 to July 2022, which is where Open-Meteo's record ends) are computed once per river point and kept (`FloodClimate`). Alert when the forecast peak in the next 7 days is **above the 95th percentile and rising** (the peak is later than today and at least 5% above today's flow): watch; above the 99th: warning; a peak 4 or more days out is never a warning. Every alert is **low confidence and a draft**: no forecast skill for Indian rivers is published (research §3.4), and the 95th/99th levels are a proposal.
- **Cost, which decided the design:** Open-Meteo weighs a request by its locations and days. The first version asked the usual range for 5 points over 38 years (about 5,000 weighted calls: the whole free hour), and the second cell got HTTP 429 in the live replay. Now the range is asked for **one point (the river) and 17 years** (about 450 once per river) and a 6-hour forecast request is about 5. A failed or rate-limited question is not asked again for 10 minutes. Forecasts are kept 6 hours, the usual range for good. Planning figure: a few hundred cells a day inside the free tier.
- Shown as: a "River flow" alert in the field's alert list with a bar chart (7 days, m³/s, the 95th and 99th levels as lines), and the flood card.

### Nearest CWC gauge (`server/services/alerts/cwc.js`)
- The Central Water Commission's flood-forecast site (`ffs.india-water.gov.in`) serves two JSON lists to its own page: 1,741 stations with positions (refreshed daily) and the stations **above their warning or danger level** (every 30 minutes, 11 at the time of the check). They are joined by station code (compared in lower case). Not a documented API and no terms were found: kill switch `ALERTS_DISABLED_SOURCES=cwc`, and a source in the health record like SACHET and IMD.
- A field gets the nearest station within 25 km that is above warning, else simply the nearest ("below its warning level"), else "No CWC gauge within 25 km". The distance is rounded to 5 km: an exact distance to a known gauge would narrow the field's place down. Above warning is a **watch**, above danger a **warning**; the card and the alert give the trend (rising, steady, falling).
- The answer must be a list: an error page or an empty reply never clears real warnings (found in the live replay: one reply was unusable and the gauges read "0 above warning"). A station list shorter than 50 never replaces the stored one.
- The status list has no time of its own, so the alert says "As of" the time we last read it.
- Stations of every type are used (the list includes canals and bridges next to rivers): CWC includes them in its own warning list.

### Satellite radar flood check (`geo-service/flood.py`, Earth Engine)
- **What it answers:** is the 500 m around the field *newly under water* in the newest Sentinel-1 radar image? Radar sees through cloud, which is why it is used for floods. Calm open water is dark in VV backscatter: a pixel below **-16 dB** counts as water (a fixed number, not Otsu: inside a circle that is mostly land, Otsu's two-class split is unstable). A 30 m median removes speckle.
- **"New"** = water now and not water in the baseline, the median of the radar images 120 to 20 days earlier. Never trusted: permanent water (JRC Global Surface Water, more than 90% of months), slopes of 5° or more (radar shadow looks like water) and ground the radar did not cover. If under half the circle is usable (hills, shadow) it says "too little data" and judges nothing.
- **Flag:** new water of 5% or more of the usable circle is "possible" (a watch), 20% or more "likely" (a warning); both numbers are ours. The image must be from the last 12 days, else it says there is none and when the last one was. The answer says "likely flooding" about what the **image** shows, never "will flood".
- **Only when asked.** A button in the flood card calls `GET /api/fields/:id/flood-extent` (owner only), because each uncached call is an Earth Engine computation. The answer is cached per place (about 100 m) and day (3 days, hashed key); a limit of 10 uncached checks per 10 minutes per device (`FLOOD_EXTENT_RATE_LIMIT`); `ALERTS_DISABLED_SOURCES=radar` switches it off. The geo-service gets the exact place in a POST body (as for field health) and never logs or returns it.
- **Measured cost, 26 Oct 2026** (Cloud Monitoring, workload tag `flood-extent`): **about 1.3 EECU-seconds and 3 to 4 seconds per check** (15.0 EECU-s for 12 full checks and their image listings). Field health is about 3. At the 18,000 EECU-s daily cap that is over 10,000 checks a day.
- **Checked on real data** (not a validation against mapped floods): the Ravi floodplain on 4 Sep 2025 read 94.6% water, 68.1% new ("likely"), a point beside it 18% ("possible"), upland and other plain points 0 to 3% ("none"); the same area in a dry December 0.3%.
- **Limits that cannot be fixed with these data:** radar does not see under thick crops or in towns; an irrigated rice paddy reads as water (not "new" if it was wet in the baseline, but it is if it was planted in between); a short flood between two passes (every 6 to 12 days) is missed; the thresholds are a draft until a hydrologist sets them.

### The flood card
On the Weather tab, under the strip: "River flow, regional forecast", "Nearest CWC gauge" and "Satellite radar" (the last with its button), each with its words and numbers, "no river"/"no gauge" said plainly, failures said ("could not be loaded"), and a signal that is switched off not shown. It covers the field of the main alert (or the selected one).

### Not built
- **Waterlogging rule.** Tried and removed: any 100 mm two-day spell contains a day of 50 mm, which the heavy-rain rule already flags at the same level, so a rain-only rule could never show; the research gives how long crops tolerate standing water, not how much rain or soil moisture causes it. It needs the soil-moisture variable and numbers from the agronomist.
- **District flood map layer** on the public map.
- A backtest on past floods (plan Phase 7): with no forecast skill published for India, the river signal's false-alarm rate is unknown.

### Limits
- Regional only: the 5 km model cell is not the field; flat areas, canals and embankments are not modelled. A gauge shows the river at its own place.
- The river alert's usual range ends in July 2022.
- A first look for a place asks Open-Meteo for the usual range (about 1.5 s); the very first CWC fetch takes about 16 s because of its station list, so on a cold server the gauge appears from the second look (the screen says official warnings are not checked yet).

### Configuration
| Variable | Meaning |
|---|---|
| `ALERTS_DISABLED_SOURCES` | now also `glofas` (the river signal), `cwc` (the gauges) and `radar` (the satellite check) |
| `OPEN_METEO_FLOOD_URL`, `CWC_URL` | for tests and local runs |
| `FLOOD_EXTENT_RATE_LIMIT` | uncached radar checks per 10 minutes per device (default 10) |
| `GEO_SERVICE_URL`, `GEO_SERVICE_TOKEN` | the existing geo-service settings; without the URL the radar button is not shown |

## 9. Deploy

Server first, then push `main` (the new client calls `/api/fields`). No environment variable is required (optional: `ALERT_RATE_LIMIT`, `ALERTS_DISABLED_SOURCES`, `ALERTS_ADMIN_TOKEN`). No migration: the `fields`, `officialalerts`, `imdwarnings` and `sourcehealths` collections are created on first write (indexes by Mongoose at start). **Phase 2 adds one dependency, `fast-xml-parser`:** the server image must run `npm ci`. Phase 3 adds outbound HTTPS to `flood-api.open-meteo.com` and `ffs.india-water.gov.in`, and the collections `floodforecasts`, `floodclimates` and `cwcstations` (a 2dsphere index, built at start). The server needs outbound HTTPS to `sachet.ndma.gov.in` and `reactjs.imd.gov.in`. Cloud Scheduler is optional (`POST /api/alerts/tick` every 10 minutes keeps the feeds warm; every request does the same when due).

## 10. News and advisories (Phase 5)

A card at the bottom of Weather & Alerts, "What officials and papers say": up to 6 headlines for the field's state and crop, and the official pages. **Headline, source, date and an outbound link only.** Nothing of an article is stored, copied, summarised or rewritten, and no headline is presented as advice.

### Sources (checked 26 Oct 2026)

| Source | What it is | Notes |
|---|---|---|
| The Hindu, agriculture section RSS (`thehindu.com/sci-tech/agriculture/feeder/default.rss`) | 60 items, English, with title, link and publish time | Its `robots.txt` does not disallow feeds (its own sitemap lists them). The feed's copyright line is "THG Publishing"; a headline with a link back is ordinary linking, but **the publisher's terms have not been read by the owner (see Pending in `task.md`)**; kill switch `news` |
| PIB press releases RSS (`pib.gov.in/RssMain.aspx?ModId=6&Lang=2&Regid=3`) | 20 newest releases of **all** ministries, Hindi, **no date**, title and link only | `Lang=1` and a regional `Regid` are redirected to this same national Hindi list, so there is no English or state or agriculture feed. Only titles with a farming, weather or water word are kept (a day's 20 had none), and an item without a date shows "first listed <date>" (the day we first saw it) instead of a made-up publish date |
| IMD agromet pages | the national bulletin PDF and the state page (a state is chosen in a list on the page) | IMD's per-state PDFs (`.../agromet-data/state/current/english-pdf/<State>.pdf`) were **0 bytes** on 26 Oct 2026 (last modified Oct 2025), so they are not linked; the state page is, with "choose Punjab in the list" |
| DA&FW portal, NDMA SACHET | one link each | |

Not used: Google News (its feed is for personal use, so it is not a source), scraping of any page (nothing here needs it; Scrapling stays unused until a page with permissive terms is chosen), any LLM.

### How it works
- `server/services/news.js` reads both feeds when the card is asked for and the last fetch is more than an hour old (a lease in `SourceHealth`, the same lazy refresh as the alerts; `onDemand`, so the alerts' "delayed" notice never mentions news). One feed failing leaves the other serving; both failing is a failed refresh and the stored items stay. Items are kept 30 days (`NewsItem`, TTL), shown while younger than 21 days.
- `server/services/newsFeed.js`: RSS parsing (a link must be `https` on the feed's own host, titles are stripped of markup and cut at 300 characters) and tagging: which of the states and UTs and which of the 10 crops a headline names, including how the papers write them ("T.N.", "U.P.", "Keralam", Hindi names; "New Delhi" is not Delhi, "Bay of Bengal" is not Bengal, "price" is not "rice", "असमान" is not Assam). The feed's own summary is read for tagging and not kept.
- Choosing: `GET /api/fields/:id/news` (owner only). The field's state comes from its stored district; an item about **another** state is left out; this state's items come first, then ones that name the crop, then the newest. A field whose district is not known yet sees only items that name no state. The answer holds the state name only, never a place.
- `server/data/official_links.json`: the pages shown to everyone (`national`) and a `states` map for a state's own agriculture pages, `{ "Punjab": [{ "id", "url", "label": { "en", "hi" } }] }`, **empty until the owner supplies them**.
- Client: `NewsPanel.jsx`. If the answer cannot be loaded the card says so in one sentence and the alerts above stay. Headlines render as text (never markup) and open in a new tab with `noopener`.

### Limits (known, on purpose)
- The Hindu's agriculture section also carries business and lifestyle pieces ("eco-tourism"); there is no relevance gate on it (a gate that drops those also drops "urea policy" and tea estates). Headlines about one crop or state are ranked up, but nothing says a headline is *useful*.
- PIB gives no English, no date and no ministry, so on most days it contributes nothing.
- The state name is shown in English in the Hindi screen (the IMD page lists the same English names).
- The tag lists are plain words: a story about "apple" the company would be tagged as the crop.

### Configuration
| Variable | Meaning |
|---|---|
| `ALERTS_DISABLED_SOURCES` | `news` switches the card's headlines off (the official pages stay) |
| `NEWS_HINDU_URL`, `NEWS_PIB_URL` | feed addresses, for tests and local runs |

### Tests
Server `tests/news.test.js` (37: real feed fixtures from 26 Oct 2026, tagging cases, ingest idempotence, partial and total failure, ranking, the route); client 7 in `WeatherAlerts.test.jsx`. Checked in a real browser against the real feeds and real IMD district lookup.

## 11. Dry spell and disease reports near the field (Phase 6, the two that need no key)

The plan's default for decision 14 (dry spell + disease reports). **Not built:** fire (needs a NASA FIRMS key, yours), market prices (data.gov.in key, and it is not a hazard), cyclone (SACHET already carries it). Both new alerts are `draft` like every rule, and are in `docs/ALERT_REVIEW.csv` (48 rows with the fire rule).

### Dry spell (`DRY-SPELL-1`, `DRY-SPELL-2`, in `server/utils/alertRules.js`)
- A **dry day** is a local day with less than 2.5 mm of rain (rain so far plus forecast); `dryRuns(w)` counts the run of dry days up to each date, from the 14 past days Open-Meteo already gives us to the forecast. A run that reaches the start of the data is a lower bound.
- Levels: sowing, flowering and grain filling: **watch at 7 dry days, warning at 14** (IMD's Mausam Sankalp counts dry spells at 7, 14 and 21 days; the stage split is ours). Vegetative: **watch at 14**. Harvest-ready: nothing (dry is good). As for every rule the third day ahead never says "warning".
- Only the **rain-fed kharif crops** get it (rice, maize, groundnut, pigeonpea, blackgram). Wheat, potato, apple, banana and sugarcane are irrigated, so a dry spell says nothing about them. A rain-fed crop that is irrigated anyway, or saved outside the monsoon, will see this alert: the text asks for irrigation, not for panic, and the reviewer should decide whether the rule needs a season check.
- Screen: the usual bar chart in days ("Dry days in a row") with the two lines; texts `alerts.rules.DRY-SPELL-*` (Hindi AI-drafted).
- Limits: forecast and past rain of a 5 km cell, not a rain gauge; no soil moisture (the geo-service has CHIRPS and soil data, not used here yet).

### Disease reports near the field (`DISEASE-NEAR-1`, `server/services/nearbyDisease.js`)
- Asks the same data as the public disease map about the ring of H3 cells (resolution 7, two rings, 19 cells, about 5 km) around the field: confident diagnoses (`status ok`) of **the field's crop**, not healthy, not demo points, in the **last 14 days**.
- **Same privacy rule as the map:** a disease counts only when at least 3 **different browsers** reported it (one phone sending twenty photos is one report), and **the field's own browser is left out**. The alert carries the disease and the number of phones, never a cell, a point or an id; the field's point stays on the server.
- The commonest disease wins (one alert, not several). **Tip** (info) from 3 phones, **Watch** from 6 (ours). Switch it off with `community` in `ALERTS_DISABLED_SOURCES`; a failing lookup leaves only this alert out.
- Screen: a panel (not a chart) with "6 phones", the disease and crop in the reader's language, the caveat "photo checks by other users, read by AI, not confirmed by a lab", and a link to the disease map. The source chip says "Reports near you" (not "Model forecast").
- Limits: only as good as the AI's reads and as dense as the app's users in that area (in most places there will be none yet); a disease name is not advice, and the card never says what to spray.

### Tests
Server: 9 in `tests/nearby.test.js` (privacy rule, own browser, window, crop, healthy and demo left out, ranking, route answer without cell or point, weather-down case, failing lookup, kill switch) and 7 dry-spell cases in `tests/alertRules.test.js` (the fixtures' default week now has a 3 mm night shower, so that "no rain at all" is not a dry spell in unrelated tests). Client: 7 in `src/test/Phase6.test.jsx`. In a real browser with real weather and 6 invented reports near a Ludhiana test point: a potato field showed the watch with "6 phones", a rice field correctly showed no dry spell (it was not dry there).

## 12. Fire near the field (Phase 6, with the FIRMS key) and the mandi-price API that does not work yet

### Fire (`FIRE-NEAR-1`, `server/services/fire.js`)
- **Source:** NASA FIRMS Area API (`/api/area/csv/<MAP_KEY>/<source>/<west,south,east,north>/2`), VIIRS 375 m detections from Suomi-NPP, NOAA-20 and NOAA-21 (`*_NRT`); MODIS (1 km) is left out. Free with a MAP_KEY (`FIRMS_MAP_KEY` in `server/.env`, server side only, never in an answer or a log line); the key reports a limit of 5,000 requests per 10 minutes; one cell costs 3 requests per half hour at most.
- **What is asked, what is kept:** only the field's 0.05° cell is sent (a box of about 22 km around the cell centre); the distance to each detection is worked out on our server. The cell's detections (a public satellite product, no field data) are cached 30 minutes (`FireCache`); after a failure the cell is not asked again for 10 minutes. The answer carries a count, a distance band and the time of the newest detection, never the fires' or the field's coordinates.
- **Rule (all ours, draft):** a detection counts when it is within 5 km, not older than 24 hours, not low-confidence, and not in the future; one fire seen by two satellites in the same hour counts once. Within 1 km: **Warning**; within 3 km: **Watch**; within 5 km: **Tip**. Any crop and stage (a bare field next to a burning one is still next to a fire). The advice is only "check around your field now, and if smoke or flames come close, call 101".
- **Honesty traps handled:** FIRMS answers a wrong key with HTTP 400 `Invalid MAP_KEY.` and may answer a quota message with a 200 in plain text, so only a body with the table header is an answer; a failed check is reported as `fire: { status: "unavailable" }` and the screen says "a missing fire alert does not mean there is no fire", so a broken check is never shown as an all-clear. Without a key, or with `fire` in `ALERTS_DISABLED_SOURCES`, the status is `disabled` and nothing is asked.
- **Screen:** a hot-spot panel (count, distance, time of the last one, a caveat that a satellite sees a fire only when it passes and a hot spot is not always a crop fire) with a link to NASA's fire map; source chip "Satellite (NASA FIRMS)".
- **Limits:** a satellite passes a few times a day and misses small or short fires; detections arrive a few hours late; a hot spot can be a brick kiln or a flare; in the stubble-burning season (Oct-Nov, Punjab and Haryana) a field there will often have a tip or a watch, and the reviewer should look at whether that is useful or noise.

### Mandi prices (data.gov.in): not built on 27 Oct 2026 because the API was broken on their side (built on 28 Oct 2026: section 15)
- The dataset in question is "Variety-wise Daily Market Prices Data of Commodity" (Agmarknet, resource `35985678-0d79-46b4-9ed6-6f13308a1d24`, updated daily). On 27 Oct 2026 the key was accepted (a wrong key answers 403 `Key not authorised`; no key in the header answers 400), but **every** call, for this and for another public resource, in json, csv, xml and over http, returned HTTP 500 `Slim Application Error: Non-static method OGDP\Models\Oauth2::is_request_to_verify() cannot be called statically` (a PHP error in their server code). Nothing on our side can fix that.
- Nothing was built on it. Retry later with one request (`GET https://api.data.gov.in/resource/35985678-0d79-46b4-9ed6-6f13308a1d24?api-key=<key>&format=json&limit=2`); if it answers, a "today's price" card per state and crop (not an alert) is the plan, with `DATA_GOV_API_KEY` kept on the server.

### Tests
Server `tests/fire.test.js` (14): the real FIRMS tables of 27 Oct 2026 (3 detections near Ludhiana, an empty answer, the wrong-key answer), the three bands, the 24-hour window, a time in the future, two satellites seeing one fire, the cache, the 10-minute failure memory, a plain-text error that comes with a 200, the route (alert and status in the answer, no coordinates or key anywhere, FIRMS down, no key, switch off). Client `src/test/Fire.test.jsx` (5). In a real browser with the real key and real FIRMS: a wheat field next to the 26 Oct detections showed "2 hot spots" within 1 km with a Warning; a Rajasthan rice field showed a real dry spell (15 dry days) and a real heat warning.

## 13. Evaluation (Phase 7): the backtest, the review, "Did this help?" and farmer sessions

What can be built without people is built; what needs an agronomist, real event dates and farmers has a protocol and a place to put the result. Nothing in this section is a validation of the rules: they are all still drafts.

### Backtest (`npm run alerts-backtest`, `server/scripts/alert_backtest.js`, output `docs/ALERT_BACKTEST.md`)
- Runs the weather rules day by day over a past season on the **Open-Meteo archive** (ERA5 reanalysis, hourly, 0.25 degrees; the endpoint works and needs no key, checked 27 Oct 2026). For every day D the rules see 14 past days and the days ahead, exactly as the server runs them, with the weather that really happened standing in for the forecast. That is a **perfect forecast**: it measures how often each rule speaks, how many alerts a farmer would get and how early the first one could come, **not** how good a real forecast is.
- An alert is one rule on one date (a frost seen 3, 2 and 1 days ahead is one alert, first seen 3 days ahead). Consecutive dates of one rule count as one **episode** (what one message about a cold week would cover).
- With `--events <csv>` (columns `label,date,hazard`; label = a run's label) it also scores real events: **detection** (an alert of that hazard at watch or above within a day), **false-alarm ratio** (only for hazards the list covers; a tip is never a false alarm) and **lead time**.
- Built-in runs (city centres, not anybody's field; stage fixed through the season): Ludhiana wheat flowering and grain filling, Shimla potato, Cuttack rice twice, Jaipur maize.

**What the first run showed (27 Oct 2026, see `docs/ALERT_BACKTEST.md`):**
- **The potato frost rule is noisy in the hills:** Shimla Dec to Feb gave 76 frost alerts in 90 days (6 a week, above the target of 2 a week) because the night low is at or below 4 C on most winter nights. It is only 8 *episodes* (0.6 a week), so the fix is in how alerts are grouped, and the reviewer should also look at whether 4 C is too high for a *watch* on potato (it mirrors IMD's cold-wave level for wheat; the potato thresholds are ours). A potato field in Shimla in winter is also not a growing crop, so the season is the wrong one for judging it; it does show what a cold-place frost rule does.
- **Any future push or SMS must send one message per episode, not one per night.** Alerts per date are right for the screen, wrong for a message.
- **The "postpone spraying" tip is frequent in a monsoon** (Cuttack Jul-Aug: 26 tips in 62 days, no watch or warning). It is the lowest level and only shown on screen; if it feels like noise it should be shown only on the field's own spray days or dropped.
- Ludhiana wheat flowering (Feb-Mar 2026) had **no frost at all** in ERA5, so the frost rule could not be tried on a real cold night; the grain-filling heat rule gave 1 watch and 5 warnings in Mar-Apr (2 episodes). Cuttack rice at flowering (Sep-Oct 2025) gave 4 heat watches, 4 dry-spell watches and 1 heavy-rain watch (1.3 a week, 5 episodes), which is plausible. Jaipur maize had 1 heavy-rain warning in a monsoon.
- ERA5 smooths local extremes, so cold hollows and thunderstorm cells are under-counted: real fields will see more.

### Applying the reviewer's sheet (`npm run alerts-review -- --apply <file>`)
- `docs/ALERT_REVIEW.csv` (48 rows) is filled in by the reviewer (Anshu Mishra): `verdict` ok / change / reject, `corrected_value` for a number, `en_corrected` / `hindi_corrected` for a sentence, `notes`. The verdicts are kept in `server/data/alert_review.json`.
- **Wording:** a corrected sentence is written straight into `en.json` / `hi.json` (it must keep the same `{{placeholders}}`, or the apply stops with a message), and counts as ok.
- **Numbers and rules:** a script cannot safely change a threshold, so a "change" is recorded as waiting and printed as "TO DO IN THE CODE"; after the change is made, `npm run alerts-review -- --resolve <row_id>` marks it ok for the new value. A "reject" is listed for removal.
- **What changes on screen:** a rule whose every rule and number rows are ok (and unchanged since: the test `alertReview.test.js` fails if a threshold was edited after its sign-off) gets `reviewStatus: "reviewed"`, and "Why this alert?" says "checked by an expert" instead of "draft". Until then every rule says draft. Wording is reviewed separately and does not change a rule's status.

### "Did this help?" (`POST /api/fields/:id/alerts/feedback`, `GET /api/alerts/feedback`)
- Under the main alert, three answers: **I acted on it**, **Not needed**, **It was wrong**. One answer per browser per rule and date, a later answer replaces the earlier; the answer is also remembered on the phone so the question is not asked twice.
- **Stored:** rule, date, level, answer and the field's crop and stage, tied to the browser's id like a checkup (so "Delete my data" removes it), kept a year. **Never stored:** a place, a field id, an official alert's identifier. Rules that are not ours (SACHET, IMD, CWC) keep only their name and the date.
- Operator view with the alerts token: per rule the number of answers, the share that acted and the share that called the alert wrong (proposed target: at least 60% helpful, which means "acted"; a rule with many "wrong" answers is the first to review).

### Farmer sessions
`docs/ALERT_FARMER_SESSIONS.md`: 5 to 10 farmers, 20 minutes, five cards (frost, dry spell, fire, disease nearby, an official warning), what to ask and time, what to record, and the rules for reading the result (7 in 10 must state a correct action; a word 3 farmers miss is replaced; 3 who need it read aloud means a voice route before any wide launch). **Not run yet.**

### Targets (proposals) and where each stands
| Target | Status |
|---|---|
| Detection of watch-level events at least 80% | cannot be computed without a list of real events (see below) |
| False-alarm ratio reported per rule, under 50% for warnings | same |
| At most 2 notifications a week per field | on screen: above 2 a week for the Shimla frost case; as episodes: under 1 a week everywhere tried. No notifications exist yet |
| At least 60% "Did this help?" helpful | collecting starts when this is deployed |
| Seven in ten farmers act correctly on a card | not run |

### What this needs from you
1. **A list of real events** with dates (a frost night, a heat spell, a heavy-rain day, a dry spell) at places like the built-in runs: from IMD bulletins, news or farmers. A CSV with `label,date,hazard` is all it takes to get detection and false-alarm rates.
2. **The agronomist's review** of `docs/ALERT_REVIEW.csv`, then `npm run alerts-review -- --apply <file>`.
3. **Farmers** for the sessions, via a KVK or the pilot owners.

### Tests
`tests/backtest.test.js` (13: the replay on made-up weather checked by hand, episodes, scoring, the archive request, the report), `tests/alertReview.test.js` (15: the sheet, applying ok / change / reject, the wording and its placeholders, the stale-sign-off guard), `tests/alertFeedback.test.js` (12: storing, replacing, validation, privacy, deleting, the operator view); client `src/test/Help.test.jsx` (7) and one in `Phase6.test.jsx` for the reviewed wording.

## 14. Operations (Phase 8): hardening, accessibility, privacy and the data-protection list

The runbook, the capacity numbers and the budget-alert steps are in `docs/MONITORING.md`, section "Weather alerts"; the data-protection list is `docs/DPDP_CHECKLIST.md`. What Task 40 built and found:

- **Operator health page** (`GET /api/alerts/health`, token): feeds, kill switches, configured keys, today's calls to the free services against their limits (`ApiUsage`, `services/usage.js`).
- **Protecting the weather from the rest.** Open-Meteo's free allowance (10,000 weighted calls a day) is the real limit: a new river's 17-year history costs about 460, the river forecast 3, a place's weather 1. The history is asked for only while the day is under 50% of the allowance and the river forecast under 80%; the count is **reserved in the database before the call** (checking first and counting after let 60 history calls through a budget of 11 when 20 requests arrived together, found by the load test). Past those lines the river says "unavailable" and the weather goes on. `WEATHER_CACHE_HOURS` (default 1, up to 6) asks Open-Meteo less often.
- **Load test** (`npm run alerts-load`, `server/scripts/alert_load.js`): 1,000 fields, real app, in-memory database, fake services. No errors; see the capacity numbers in `docs/MONITORING.md`.
- **Rate limit per browser.** The alert limiter counted per IP address, and on a mobile network hundreds of farmers can share one address, so one could lock out the others. It now counts per browser (its device id, when it is a valid UUID, else the address). The limiters that cost an ML call, an upload or an Earth Engine run stay per address, and the global per-address limit is the backstop (raise `GLOBAL_RATE_LIMIT` in production, see the runbook).
- **Accessibility pass** (`axe-core`, in `src/test/A11y.test.jsx` for English and Hindi and in a real browser for colour): 12 real-browser runs (desktop and phone width, English and Hindi, three alert kinds) now have **no violations, colour contrast included, and no tap target under 44 px on the phone**. Found and fixed: no `<main>` landmark in the workspace; a second banner landmark on the phone; the 72-hour strip scrolled sideways but the keyboard could not reach it (now a named, focusable region); two error cards used `role="alert"` on an `<article>`. Not covered: a screen reader's real reading (try TalkBack on a phone with Hindi), and the map step of "Add a field" (Leaflet).
- **Privacy page** now says what leaves the server (rounded points, the fire area, nothing for the official feeds), how long things are kept, how reports from others and the answers work, and, found while writing it, that **the satellite flood check sends the exact point of the field to Google Earth Engine** (it builds a 500 m circle around it): the page did not say so before. **"Delete my data" now also removes** the "Did this help?" answers and the cached radar answers of the fields (their keys are hashes of the place).
- **Data-protection list** `docs/DPDP_CHECKLIST.md`: the data inventory, who receives what, and 13 items with what is done and what needs the owner or a lawyer.

### Still needs a person
Hindi review of all `alerts.*` and `privacy.*` strings (the review sheet carries the alert rules; the privacy and news Hindi are separate); the lawyer on the disclaimer, the notice and the DPDP items; the data fiduciary's name and a grievance contact; a breach plan; Google Cloud budget alert; a TalkBack pass on a real low-end phone; a decision on "download my data".

## 15. Mandi prices (Phase 6, the last piece)

The data.gov.in API that returned HTTP 500 to every call on 27 Oct 2026 (section 12) answered normally on 28 Oct 2026, so the price card was built.

- **Source:** data.gov.in "Variety-wise Daily Market Prices Data of Commodity" (Agmarknet; resource `35985678-0d79-46b4-9ed6-6f13308a1d24`), free key `DATA_GOV_API_KEY` on the server. Prices are what the market committees reported, **rupees per quintal**; the card says it is not what a farmer will get and not advice to sell or wait. Only the state and the commodity are asked for, so nothing about a farmer or a field is sent.
- **What the card shows** (`GET /api/fields/:id/prices`, `server/services/mandi.js`, `client/.../PricesCard.jsx`): for the field's state and crop, the newest reporting day: the middle price over the markets that reported (the range only when 3 or more did; one market is said to be one market), the change since an earlier reporting day 3 to 14 days before **among markets that reported on both days** (the market mix changes from day to day), and up to 3 markets of the field's own district. A last price older than 14 days is "no price reported in the last 14 days, the last one was on <date>"; no rows is "none"; a failure is "unavailable" (a 200, a quiet sentence). The card is not drawn when the feature is off or the state is not known yet.
- **The crops** map to the dataset's names: wheat `Wheat`, rice `Paddy(Dhan)(Common)` (the card says paddy), sugarcane `Sugarcane`, potato `Potato`, maize `Maize`, pigeonpea `Arhar (Tur/Red Gram)(Whole)`, groundnut `Groundnut`, blackgram `Black Gram (Urd Beans)(Whole)`, apple `Apple`, banana `Banana`. **States** are spelled the dataset's way (`Uttrakhand` and `Uttarakhand` both hold rows and are both asked, `Chattisgarh`, `Pondicherry`, `NCT of Delhi`, `Andaman and Nicobar`); Ladakh and Dadra & Nagar Haveli and Daman & Diu have no rows.
- **What the real data showed (28 Oct 2026):** Punjab potato had 47 markets reporting the day before (₹310 to ₹1,500 a quintal, the middle ₹721); **Punjab wheat's last report was 6 Oct 2026, by one market** (off season); **Odisha paddy's last report was 4 Nov 2025**, a year old. So "stale" and "one market" are common, and the card says them plainly. Prices vary widely inside a state (variety, grade, local), so the middle price is a guide to the level, not a quote. One market reported **₹0.01** (a placeholder): anything under ₹10 a quintal is dropped.
- **Limits of data.gov.in:** it answers 429 to bursts (seen once in testing), so requests are made one at a time with a 0.4 s pause, one answer per state and crop is kept 6 hours, and a failed question is not repeated for 10 minutes. About one request per state and crop every 6 hours, counted in the health page as `data-gov`. Kill switch `mandi` (and no key means off).
- **Tests:** `tests/mandi.test.js` (20: the real Punjab wheat and Odisha paddy answers of 28 Oct 2026 as fixtures, the summary worked out by hand from the raw rows, trends, stale, varieties, spellings of states, 429 and error pages, the route, no key in the log), client `src/test/Prices.test.jsx` (9, with an axe check). Checked in a real browser with the real key: a Ludhiana potato field showed the card in Hindi.
