# Field Alert Center: research findings

Research for a farmer-facing disaster management and early-warning layer ("Field Alert Center"): crop, weather, soil, flood, news and official warnings turned into crop-aware advice for one saved field. Research date: **20 Oct 2026**. The plan that builds on this is [FIELD_ALERT_PLAN.md](FIELD_ALERT_PLAN.md).

**How every claim is marked** (nothing is stated as fact without one of these):

| Mark | Meaning |
|---|---|
| ✅ **T#** | I made a real request on 20 Oct 2026 and read the answer. The test is listed in [Appendix A](#appendix-a-verification-log-what-i-actually-ran). |
| 📄 | I opened and read the primary page or repository file (the URL is given). |
| 🔎 | Taken from a web-search result summary only; the page itself was not opened or could not be opened. **Unverified until opened.** |
| ❓ | Unverified, could not be tested, or I could not find it. |

Source ids `[S#]` point to the list at the end. App code in `client/`, `server/`, `ml-service/`, `geo-service/` was not changed.

---

## 0. Top findings (read this first)

1. **An official, open, machine-readable warning feed exists and works today.** NDMA SACHET publishes RSS plus CAP 1.2 XML ("public domain" in the feed header) with district names and LGD district codes, in several Indian languages ✅T3 ✅T4. IMD's own GeoServer answers "which district is this point in, and what is its 5-day warning" in about 0.1 s ✅T6. **Neither is a documented public API.** IMD's official API requires IP whitelisting (HTTP 401 "needs to be whitelisted") ✅T7, and its WMO Alert Hub feed was empty ✅T8. So: use them, behind an adapter with health checks and a manual fallback.
2. **The gap we can beat is "crop + stage + this field + one action + expiry".** Official products are district-wide and hazard-generic (the SACHET feed is state/district level, no point feed [S3]; IMD district warnings are colour codes per district ✅T6). Meghdoot gives crop advisories per district twice a week [S5][S6]. Field-level hail/weather alerts exist only in paid or foreign products [S11]. Nobody I found ships Hindi, offline-tolerant, crop-stage-aware, per-field alerts that cite the official warning.
3. **Licence traps decide the business model.** Open-Meteo's free tier forbids "websites or apps that have subscriptions or display advertisements" [S20]; Google News RSS is "personal, non-commercial" ✅T11; Earth Engine is noncommercial in this repo's setup (docs/GEE_SETUP.md). All fine for a university project; each one blocks a paid SMS or ad-funded model. The user must decide whether this stays non-commercial.
4. **Flood: the free global model is too coarse to say "your field floods".** Open-Meteo's flood API snaps to the "largest river in a 5 km area" [S20]. For Ludhiana it returned 0.19 m³/s (a drain, not the Sutlej) while Cuttack returned 1,745 m³/s ✅T2. I found no published GloFAS forecast skill for Indian basins, only Bangladesh [S40]. Use it as a regional signal; combine with CWC station status ✅T9 and Sentinel-1 post-event extent [S41].
5. **Delivery is the hard part, not data.** The client has **no PWA/service worker yet** (checked the repo: no manifest, no push) and iOS web push works only for home-screen web apps [S45]. SMS in India needs DLT registration [S43]; DPDP Act substantive duties (notice, consent, children's data) start **13 May 2027** [S42]; WhatsApp utility templates become chargeable on **1 Oct 2026** [S44]. A phone number is personal data, and sign-in is currently switched off in this app.

Also worth knowing: the repo already has most of Phase 1's weather inputs. `server/services/openMeteo.js` caches hourly temperature, humidity and rain for 14 past + 5 forecast days per 0.05° cell, and `dailyAggregates` in `server/utils/diseaseRisk.js` already turns it into daily Tmin/Tmax/rain.

---

## 1. Existing products and programmes

### 1.1 Comparison table

| Product | What it does | Data | Channel | Adoption (as reported) | Weaknesses / gaps we can beat | Src |
|---|---|---|---|---|---|---|
| **IMD Meghdoot** (IMD + ICAR + IITM; ICRISAT built it) | Crop-specific weather advisories, weather forecast, district level (block forecasts for ~6,970 blocks, block advisories ~3,100, 2022) | IMD forecasts; advisories written by Agromet Field/District units, **twice a week (Tue, Fri)** | Android app, 12 languages, offline mode added 2023 | "almost 300,000" downloads by end 2023 📄 | District/block, not field; twice-weekly cadence cannot react to a hailstorm; no stage-from-farmer input; low reach vs ~100M+ farm households 🔎 | [S5][S6] |
| **IMD GKMS / DAAS** (Gramin Krishi Mausam Seva) | Bulletins per district, 130 Agromet Field Units at ag universities/ICAR/IITs (Mar 2025 PIB answer) | IMD 5-day district/block forecasts | SMS, IVRS, radio, print, Kisan portal | 24.5 million SMS subscribers cited in a 2017 parliamentary answer 🔎; NCAER 2020: 3,965 farmers, 121 districts, 98% changed ≥1 practice, income gain "up to 50%" for those who acted 🔎 | Self-reported benefit; the same answer says IMD has no KPI on farmer outcomes 🔎; generic text | [S6][S7] |
| **IMD Mausam app / mausam.imd.gov.in** | National weather, district warnings, nowcasts | IMD | App + web | ❓ (not found) | Warnings colour-coded per district; official API IP-whitelist only ✅T7 | [S1][S4] |
| **NDMA SACHET** (C-DOT built, CAP-based) | Integrated alert system: geo-targeted SMS in all 36 states/UTs; RSS/CAP feeds; Cell Broadcast tests on 2 May 2026 | IMD, CWC, SDMAs, INCOIS, FSI, DGRE | SMS, Cell Broadcast, browser push, RSS | "operational across all 36 states/UTs" 🔎 | Hazard-generic, not crop-aware; feeds state-level, no point/lat-lon feed, no CORS [S3]; ~70 nowcast alerts/day nationally = noisy ✅T3 | [S3][S15] |
| **CWC FloodWatch** (Aug 2023) | River station map with 24 h forecast and 7-day advisory; text+audio; English/Hindi | CWC gauges (reports differ: 338 stations/23 states vs 328 of 1,543 monitoring points) | Android app | ❓ downloads | Station-based, not field-based; limited stations; no crop link | [S14] |
| **Google Flood Hub / AI flood forecasting** | River flood forecasts up to 7 days, village-level depth where possible; Android/Search/Maps notifications; India with CWC since 2018 | CWC + Google models | Phone notifications, Hindi + 8 other languages | India "whole country" since June 2020, "more than 200 million people", ~30M notifications; "65% of people who receive warnings before flooding take action" (Google survey) 📄 | Rivers only; no crop or field advice; depends on a smartphone + Google account. Flooding API has a waitlist and CC BY 4.0 data [S19] | [S19] |
| **Kisan Suvidha** (MoA&FW) | Weather (5-day) + extreme weather alerts, dealers, mandi prices, plant protection, soil health card info | Mixed government sources | App, multi-language, needs registration | ❓ | Information menu, not a decision; no field | [S13] |
| **Kisan Call Centre 1800-180-1551** | Phone answers from Farm Tele Advisors, 22 languages, 6:00-22:00, 14 locations | Human experts | Voice | ❓ call volume not found | Reactive (farmer must call); not a warning system | [S13] |
| **Digital Green Farmer.Chat** | GenAI WhatsApp/voice assistant, mostly for extension agents | RAG over advisory content; GPT (Azure OpenAI), Bhashini speech | WhatsApp, voice | FY25 report: 60% of active users report acting on advice (IDInsight, self-reported); full RCT (600 villages, Kenya) runs 2025-09 to 2027-03, no results yet | Answers questions, does not push field alerts; LLM answer risk | [S8] |
| **Fasal** (Fasal.co) | Orchard/farm IoT sensors + SaaS; disease/pest predictions "almost a week in advance"; advice in local languages | Own sensors + ML | App, SMS, web | 20,000-acre target (2021) 🔎; $1.6M seed, $4M pre-Series A | Paid hardware, horticulture focus; per-farm cost barrier | [S9] |
| **CropIn SmartFarm** | Satellite + weather + knowledge graph advisories, rule-triggered SMS; B2B2F via agribusiness/banks/govt | Satellite, weather | App/SMS through intermediaries | 3.1M acres, 1.6M farmers (NASSCOM case study; 2018 article said 3M acres/2M farmers) 🔎 | Sold to institutions; farmer rarely the customer | [S9b] |
| **Skymet** | Village/tehsil forecasts, crop advisory APIs, 5,500+ AWS, WBCIS/PMFBY data | Own AWS network + models | App/web/API, insurance | "2 million+ active web and app users" (company 2023 presentation) 🔎 | Company claims; commercial | [S10] |
| **Climate FieldView** (Bayer) | Field-level weather hourly/daily, daily email of 24 h rainfall, **text when hail detected in a field** (free Prime tier) | Own data + radar | App, SMS, email | ❓ | US/EU/Brazil model, not India; hail alert only (no frost found) | [S11] |
| **Cropwise (Syngenta)** | Field-level forecast; satellite NDVI anomaly alerts; myFIELD potato disease warnings (green/amber/red) | Satellite, weather | App | ❓ | Retailer/grower in developed markets; India coverage ❓ | 🔎 |
| **FarmLogs** | Not researched; discontinued/merged into Bayer products per my background knowledge | – | – | ❓ | – | ❓ |
| **Plantix** (PEAT) | Photo diagnosis; geo-tagged reports; fall-armyworm map with push notifications to "tens of thousands" of users (2018) | User photos + crowd reports | App push | Reported >7M downloads in India (undated CGIAR), >20M global, 160 countries (company profile, May 2023) 🔎 | Outbreak alerts are reactive and pest-specific; no weather/hazard layer | [S12] |
| **Kheti / Apollo Agriculture (Kenya)** | Not found in my searches | – | – | ❓ | – | ❓ |
| **WINDS** (MoA&FW, July 2023) | Hyper-local weather network: 308 AWS + ~55,570 rain gauges at gram-panchayat level planned; supports PMFBY | Ground stations | Data platform (state rollouts: Odisha with Skymet, MP) | Rollout figures from news/exam sites only 🔎 | Infrastructure, not an advisory; **a future data source for the same job** | [S16] |
| **FEWS NET** (USAID) | Scenario-based food-security outlooks (4-monthly process, 8-month outlook) | Remote sensing, prices, agroclimate | Reports | – | Region/livelihood level; not field | [S18] |
| **ICRISAT-Microsoft sowing advisory** (Telangana/AP) | SMS sowing-date advice from weather + soil + crop systems | Weather, soil | SMS | Claimed yield gains up to 30% in promotional articles (basis unconfirmed) 🔎 | Sowing only; evidence is promotional | 🔎 |
| **Esoko (Ghana)** | Weather/price/tips SMS with agronomist call centre; CCAFS seasonal-forecast pilot | Downscaled forecasts | SMS | 300,000 farmers (company site) 🔎; CCAFS survey of 310 farmers found barriers: inexact info, complex text, cost, poor infrastructure | Shows what fails: unclear, late, hard-to-act text | [S17] |
| **PlantVillage Nuru (Kenya/Tanzania)** | Offline AI diagnosis of cassava diseases; developed by Penn State + IITA | On-device model | App, offline | Used in 19 African countries per IITA 🔎 | Diagnosis only | 🔎 |
| **Bangladesh FFWC / DAE** | Daily flood bulletins; IVR pre-recorded multi-hazard warnings (dial 1090); agromet advisories (e.g. raise bunds, harvest mature vegetables) | FFWC + BMD | IVR, SMS, bulletins | A 2022 report: remote farmers still do not get bulletins in time; a Practical Action document notes no location-specific, impact-based flood EWS | Proves the need and the gap (location-specific, impact-based) | 🔎 |

Not retrievable: IMD's Mausam app adoption, FarmLogs current status, Kheti, Apollo Agriculture. These were left as ❓ rather than guessed.

### 1.2 What the comparison tells us

- **Everyone either informs by district or sells to institutions.** The unserved cell is a free/cheap, Hindi-first, per-field, crop-stage-aware alert that points to the official source and says when it expires.
- **Evidence for outcomes is thin and mostly self-reported.** NCAER's "up to 50%" and Farmer.Chat's "60% took action" are self-reports; the one rigorous voice-advisory trial (cotton, Gujarat, Cole and Fernando) found uptake of recommended inputs but **no systematic yield or profit gain** [S38]. We should promise "earlier, clearer warning", not "higher yield", and measure action taken (Phase 7).
- **Reach comes from channels, not apps.** Meghdoot ~300k downloads vs 24.5M SMS subscribers 🔎 shows the channel gap: a smartphone-only product reaches few farmers.

---

## 2. Data sources

### 2.1 Summary table (verdict = for this project, today)

Latency = how fresh the data is when fetched. "Test" ids refer to Appendix A.

| Source | Access / API shape | Auth | Licence / commercial terms | Latency / update | India coverage and resolution | Verdict |
|---|---|---|---|---|---|---|
| **NDMA SACHET RSS + CAP 1.2** | `GET https://sachet.ndma.gov.in/cap_public_website/rss/rss_india.xml` (RSS 2.0, 100 items, all `Met` in my sample) ✅T3; item link → CAP 1.2 XML (`.../FetchXMLFile?identifier=…`) ✅T4; per-state feeds `rss_odisha.xml`, `rss_punjab.xml`, `rss_haryana.xml`, `rss_bihar.xml` return 10 items each ✅T5 | None (needs a browser-like User-Agent; response sets cookies) | Feed header says `copyright: public domain` ✅T3; no separate terms found ❓ | Items to the minute: newest 20 Oct 15:40 GMT; 100 items span ~34 h ✅T3. The channel `pubDate` is stale (16 Oct), so use item dates | District names + **LGD District Code** geocodes ✅T4; polygon URL exists but returned HTTP 403 to curl ❓ | **Use (Phase 2).** Primary official feed. Himachal and UP state feeds returned 404 under guessed names (the naming rule is not documented) ✅T5 |
| **IMD GeoServer WFS/WMS** (`reactjs.imd.gov.in/geoserver`) | OGC WFS, 33 layers ✅T6: `district_warnings_india` (764 districts; `Day_1..Day_5` hazard codes, `Day1..5_Color`, `updated_at`), `NowcastWarningDistrict` (message, impact, action, validity), `india_districts`, `aws_data_layer`, `indian_river_basin` | None | **Not documented as a public API; no terms found ❓**. A third-party app already uses the WMS layer [S4] | Warning layer `updated_at` values from today ✅T6 | Per district polygon; point query by `bbox` returns the district in ~0.1 s ✅T6 | **Use with care (Phase 2).** Best "point → district warning" path. Unofficial: needs a kill switch and a written request to IMD. Code legend unverified (see 2.3) |
| **IMD official API** | `mausam.imd.gov.in/api/warnings_district_api.php`, `nowcast_district_api.php`, `current_wx_api.php` → **HTTP 401 "IP … needs to be whitelisted"** ✅T7; developer portal at `api.imd.gov.in` has register/login pages 📄 [S1] | Registration + IP whitelist | Not stated on the portal 📄 | – | Districts / stations | **Ask IMD (user action).** Cloud Run egress IPs change unless a static IP is configured |
| **IMD CAP feed on WMO Alert Hub** | `https://cap-sources.s3.amazonaws.com/in-imd-en/rss.xml` ✅T8 | None | `public domain` | **0 items, last built 27 Sep 2026** ✅T8 | – | **Skip.** Empty |
| **CWC flood forecasting site** (`ffs.india-water.gov.in`) | Undocumented JSON used by its own SPA: `/ffm/api/station-water-level-above-warning/` (status `WARNING`/`DANGER`, trend), `/iam/api/layer-station-geo/specification/…` (208 Level/Inflow stations with lat/lon), `/iam/api/new-forecasted-entry-data/…` (forecast inflow, issued/forecast timestamps) ✅T9 | None | **Unknown ❓** (government data; no terms page read) | Forecast rows issued 20 Oct 12:00 IST ✅T9 | 208 stations, not whole rivers | **Phase 3 candidate.** Treat as unofficial; CWC alerts also arrive inside SACHET ("CWC" author) ✅T3 |
| **Open-Meteo forecast** | `GET https://api.open-meteo.com/v1/forecast?...&hourly=temperature_2m,relative_humidity_2m,precipitation` ✅T1 (HTTP 200, ~1 s, 7-day daily for Shimla/Cuttack/Ludhiana) | None | CC BY 4.0 data; **free API only for non-commercial** use; "apps that have subscriptions or display advertisements" are commercial; limits 600/min, 5,000/h, 10,000/day, 300,000/month; per IP and per application; paid plans from 1M calls/month [S20] | Model runs; hourly resolution | Global ~11 km models, point API | **Use (already in repo).** Keep the 0.05° snap + cache. Licence must be revisited before any monetisation |
| **Open-Meteo Flood (GloFAS v4)** | `GET https://flood-api.open-meteo.com/v1/flood?...&daily=river_discharge,river_discharge_mean,river_discharge_max` ✅T2 | None (commercial: API key + `customer-` prefix) | CC BY 4.0, same non-commercial rule [S20] | Daily; forecasts updated daily; reanalysis 1984 to Jul 2022 [S20] | 5 km grid, "largest river in a 5 km area"; may select the wrong river [S20] | **Phase 3, regional signal only.** Ludhiana test returned 0.19 m³/s ✅T2 |
| **NASA POWER** | `GET https://power.larc.nasa.gov/api/temporal/daily/point?parameters=T2M_MIN,T2M_MAX,PRECTOTCORR,RH2M&community=AG&...` ✅T10 | None | Terms/licence not on the docs page I read ❓; NASA open data | Daily values were present to 17 Oct and `-999` for 18 Oct when queried on 20 Oct, so latency ≈ 2-3 days ✅T10 | ~0.5° grid (per my background knowledge ❓) | **Not for alerts** (too slow, coarse). Optional historical normals |
| **NASA FIRMS (fire)** | `GET /api/area/csv/[MAP_KEY]/[SOURCE]/[west,south,east,north]/[1-5 days]`; VIIRS (NOAA-20/21, S-NPP), MODIS; 5,000 transactions / 10 min; RT data within 60 min of overpass [S21] | **Free MAP_KEY required**; the sample key `DEMO_KEY` returned "Invalid MAP_KEY" ✅T12 | Page has no terms section; the gods-eye-view licence note calls FIRMS "CC0 / US public domain (citation requested)" 📄 [S50] | Near real-time | Global, 375 m (VIIRS) | **Phase 6.** Not registered, so not tested (account creation is the user's step) |
| **SoilGrids (ISRIC)** | REST `rest.isric.org/soilgrids/v2.0/properties/query` returned **null values at 2 of 3 cropland points** ✅T13; the repo uses the Earth Engine assets instead (`geo-service/context.py`) | None | CC BY 4.0 per ISRIC (❓ not re-read) | Static | 250 m | **Use via Earth Engine only** (already done) |
| **Sentinel-1/2, CHIRPS, ERA5-Land via Earth Engine** | Already in `geo-service/` (`field_health.py`, `context.py`): NDVI/NDRE, CHIRPS, ERA5-Land, SoilGrids | Service account | Noncommercial Community tier; daily cap set to 18,000 EECU-s (repo task log); ~3 EECU-s per field-health check | S2 ~5 days; CHIRPS lags; S1 6-12 days revisit [S41] | 10 m (S1/S2), 5.5 km (CHIRPS), 11 km (ERA5-Land) | **Use.** S1 flood extent is a new geo-service function (Phase 3) |
| **GDACS** | `https://www.gdacs.org/xml/rss.xml` ✅T14 (253 items; includes "Drought is on going in Southern India"); CAP feed `gdacs_cap.xml` (6.7 MB) | None | EU copyright; "syndication allowed, provided the source is acknowledged" (per event metadata) 🔎 | Event-based | Global, coarse | **Optional (Phase 6).** Cyclone/drought context only |
| **Agmarknet / data.gov.in** | data.gov.in resource page says "API for this resource does not exist … click Request API" 🔎 [S25]; one attempt with the public sample key got **HTTP 429** ✅T15 | data.gov.in API key | Government open data ❓ (licence not read) | Daily | ~4,000 mandis | **Phase 6; unverified.** Needs an API key request (user action) |
| **News: Google News RSS** | `news.google.com/rss/search?q=…&hl=en-IN` (English ✅T11) and Hindi (`hl=hi`) both return items | None | Feed text: "personal, non-commercial use … Any other use … prohibited" ✅T11 | Minutes | Query-based | **Link-out headlines only, or skip.** Not a content source |
| **News: PIB RSS** | `https://pib.gov.in/RssMain.aspx?ModId=6&Lang=1&Regid=3` (Lang=2 Hindi) ✅T11 | None | Government press releases; terms ❓ | Daily | National | **Use for headline + link** (Phase 5) |
| **News: The Hindu agriculture RSS** | `thehindu.com/sci-tech/agriculture/feeder/default.rss` ✅T11 | None | Publisher copyright; headline + link only | Hours | National | Optional |
| **Krishi Jagran / Rural Voice** | No RSS found at common paths; `ruralvoice.in/rss.xml` returns an HTML "RSS Feeds" page ✅T11 | – | – | – | – | **Skip scraping** until terms are read (see 5.1) |
| **State agriculture department advisories** | Not tested ❓ | – | – | – | – | **Manual link directory** (Phase 5), no scraping |

### 2.2 Why SACHET and IMD WFS matter most

- A SACHET alert carries, in one place: event, severity, certainty, urgency, effective/onset/**expires** (with +05:30), headline, instruction and district geocodes ✅T4. That is exactly what an alert needs, so CAP 1.2 is the right canonical format for the normaliser.
- The all-India feed is noisy: **100 items in ~34 h**, mostly 3-hour thunderstorm nowcasts from IMD centres, plus one CWC alert and 41 from Andhra Pradesh SDMA ✅T3. Dedupe and relevance filtering (crop, stage, severity) are required before anything reaches a farmer.
- IMD's WFS gave the district and five daily codes for Shimla, Ludhiana and Cuttack in under 0.2 s ✅T6. For Shimla the 0.0001° box returned **two districts (SHIMLA and SOLAN)**, so boundaries overlap or are generalised: when a point returns two districts, take the higher severity and say so. IMD spells the state "ODHISHA" for Cuttack ✅T6: never match on names without a normalisation table.

### 2.3 Open data questions I could not close

- **IMD warning codes.** Today's `Day_1` values: `1` (3,183 of 3,820 day-slots, i.e. no warning), `4`, `4,8`, `2,4`, `2,4,8`, `16,4`, `8`; `Day1_Color` values 4 (611 districts), 3 (133), 2 (11), 0 (9) ✅T6. The IMD page legend is "No Warning / Watch / Alert / Warning" 📄, but **which code is which hazard and which colour number is which level is not published** in anything I could open. The plan makes "verify against the IMD page for five districts" a Phase 2 task and does not hard-code a meaning until then.
- **SACHET polygon files** returned 403 to a script ❓: district geocodes (LGD) are enough for the first version.
- **Whether IMD/CWC accept use of these endpoints.** The plan includes a written request (user action).

### 2.4 Costs and limits that matter for the budget

- Open-Meteo: the repo already caches per 0.05° cell for 3 h, so an active cell costs ≤ 8 calls/day (docs/DISEASE_RISK.md). At the free 10,000/day limit that is ~1,200 simultaneously active cells before any other use. The limit is per IP; Cloud Run egress shares IPs, which Open-Meteo warns can hit limits sooner [S20].
- Earth Engine: ~3 EECU-s per field-health check (repo log), cap 18,000 EECU-s/day set by the owner. A flood-extent run is not measured yet; the plan budgets 3-6 EECU-s per field per event and measures it in Phase 3.

---

## 3. Research papers and methods

Facts marked 🔎 come from search summaries; open the paper before quoting a number in the app.

### 3.1 Impact-based forecasting and warning (IBFWS)

- WMO's guidelines start from "it is no longer enough to provide a good forecast or warning of what the weather will BE. People need information on what the weather might DO" 🔎 [S26]; they recommend verification with impact-based monitoring and user feedback. **Design consequence:** the alert's headline is the impact on this crop at this stage, with the weather number as evidence.
- A message should contain hazard and consequences, protective action, location/population at risk, timing, and the sender (Mileti and Sorensen's model as summarised in the Warning Lexicon study) 🔎 [S37]. Official warnings often omit some of these 🔎. **Design consequence:** the one-decision / time-window / source / expiry layout in the plan.

### 3.2 Crop-stage-aware weather risk (thresholds we can start from)

All thresholds below are **starting points for agronomist review**, not verified rules. Rows with a US/Australian source need an Indian source before launch.

| Hazard | Evidence | Strength |
|---|---|---|
| **Wheat terminal heat** | Satellite study of northern India: exposure above **34 °C** accelerates senescence; crop models may underestimate losses at +2 °C by up to 50% for some sowing dates (Lobell et al., doi 10.1038/NCLIMATE1356) 🔎 [S27]. IARI trials: sowing delay beyond the optimum cut yield 29-77 kg/ha/day by cultivar 🔎. InfoCrop: terminal heat reduces wheat yield 18.1% now, early sowing + extra irrigation at grain fill was the best adaptation 🔎 | Medium (observational + model) |
| **Wheat frost at heading/flowering** | Damage from about −2 °C (28-30 °F) at boot/heading/flowering; early stages to jointing tolerate ~−4 °C (25 °F); damage depends on duration (NDSU, K-State, U Kentucky) 🔎 [S28]. Western Australia: cold damage 5 °C to −2 °C, freezing below −2 °C 🔎 | Medium; **US/AU sources, not Indian** |
| **Ground frost vs screen temperature** | Air near the ground is "generally up to 5 degrees colder" than at 2 m; the gap grows with clear skies (MeteoSwiss) 🔎 [S34]. IMD cold wave (plains) = minimum ≤ 4 °C, severe ≤ 2 °C 🔎 [S33]. I found **no IMD numeric ground-frost threshold** ❓ | Medium; so a forecast Tmin (2 m) of ≤ 4 °C is a sensible "watch" trigger, to be reviewed |
| **Potato frost** | Leaf damage around −2 to −1 °C (gardening site only ❓); CPRI/ICAR: furrow irrigation prevents frost damage "to a large extent"; recovery sprays tested on a 60-day crop (ICAR papers) 🔎 [S29] | Weak for thresholds; good for the action (irrigate) |
| **Rice heat at flowering** | Pollen sterility rises above 33 °C at anthesis in Indian cultivars; 35.5 °C gave 17% pollen sterility in one basmati line (Chakrabarti et al. 2010 as summarised); 6 h exposure at peak anthesis hurts more than 2 h 🔎 [S30] | Medium; cold at booting: **no threshold found** ❓ |
| **Waterlogging** | Wheat tolerates ~3-4 days with leaves above water; maize at tasseling −58% yield; groundnut damage visible within 2 days; pigeonpea establishment most critical, 25-30% loss in waterlogging-prone areas 🔎 [S31]; no rice tolerance figure found ❓ | Mixed; indicative only |
| **Dry spell** | IMD "Mausam SANKALP" counts consecutive dry days (rain < 2.5 mm) at 7/14/21-day thresholds 🔎 [S32]; no formal crop-stage thresholds found ❓ | Medium for definition |
| **Heavy rain categories** | IMD: heavy 64.5-115.5 mm, very heavy 115.6-204.4, extremely heavy ≥ 204.5 mm/day (parliamentary reply); heat wave: Tmax ≥ 40 °C plains, ≥ 37 °C coastal, ≥ 30 °C hilly, or +4.5 °C departure [S33] | Official definitions |
| **Operational advice pattern** | IMD agromet bulletins repeatedly say: drain excess water, postpone spraying/fertiliser in heavy rain, harvest mature crop before heavy rain and keep produce safe [S49] | Official wording to imitate |

**Take-away:** the thresholds exist in literature, but no single Indian source gives a crop × stage × hazard table for our ten crops. The rule table in the plan is therefore drafted from these sources, marked `draft`, and routed through the same agronomist review used for `docs/RULES_REVIEW.csv`.

### 3.3 Forecast skill and what that means for wording

- No published district-level heavy-rain POD/FAR for ECMWF/NCMRWF at day 1-5 was found ❓ (only India-wide comparisons, basin-level probabilistic verification, and the finding that models can have a wet bias from too many light-rain days) 🔎 [S35]. **So:** word alerts as "forecast", show the number, and avoid precise thresholds near the decision boundary; use ≥ 2 days lead only for "watch".
- Open-Meteo's own forecast for the hills depends on grid elevation (Shimla returned elevation 1,940 m ✅T1), but station bias in valleys is not quantified ❓ → say "forecast for your area".

### 3.4 Flood early warning for smallholders

- GloFAS skill: Bangladesh reforecasts (1999-2018) show limited skill for extreme floods (99th percentile); lead-time dependent thresholds reduce false alarms but also detection; a separate study found GloFAS-ERA5 **reanalysis** skill "admirable" for the Ganges-Brahmaputra and moderate-to-good for Mahanadi, Godavari, Krishna, lowest for Pennar and Cauvery 🔎 [S40]. **No India forecast validation found.**
- Google's flood product reports that "65 percent of people who receive flood warnings before the flooding begins take action" (survey) 📄 [S19] and works with CWC.
- Sentinel-1 flood mapping in Earth Engine with Otsu thresholding on VV backscatter reached ~94% overall accuracy for Kerala 2018; adding an SRTM slope mask reduces false water on slopes; Otsu overestimated vs random forest in one Godavari comparison (359,253 ha vs RF at 84% accuracy) 🔎 [S41]. **Not paddy-specific**: flooded paddy vs open water needs care ❓.

### 3.5 Advisory effectiveness

- NCAER evaluations (2009, 2015, 2020) are the main Indian evidence; I only saw summaries (Down To Earth, MoES) 🔎 [S7]. The "up to 50%" is among farmers who acted on advisories (self-report).
- The cotton voice-advisory RCT: uptake of recommended inputs, no systematic yield/profit effect, willingness to pay below cost 📄 [S38].
- Reviews of digital advisory tools: trust is the foundation for adoption; frequent failures are no feedback loop and mismatch of timing and information needs 🔎 [S39].

### 3.6 Alert fatigue and false-alarm cost

- The "cry wolf" effect is **debated**: some studies find higher false-alarm ratios linked to more harm (tornado data), others find no effect on compliance (LeClerc and Joslyn experiment; a 2019 tornado survey), and perceived false-alarm ratio varies widely and does not track actual ratio 🔎 [S36]. The effect may appear only after several false alarms.
- **Design consequence (our judgement, not a cited finding):** keep alerts few, tied to a decision, and say how sure we are; log every alert and the farmer's reaction so that we measure our own false-alarm cost instead of assuming it.

### 3.7 Last-mile delivery to low-literacy users

- IVR and SMS: IDinsight found low smartphone use limited options to SMS and automated calls; pre-recorded IVR cost about **$0.028 per minute** vs about **$0.015 per SMS** (their campaign) 📄 [S38]. Audio/video supplements matched in-person extension on comprehension and trust and beat a printed card alone, "especially promising for illiterate farmers" (32% in Gujarat) 🔎.
- Avaaj Otalo (51 farmers): users learned simple menu navigation and preferred numeric key input over speech 🔎 [S38].
- Esoko/CCAFS (Ghana, 310 farmers): barriers were inexact information, **complex text messages**, cost, and poor infrastructure 🔎 [S17].
- **Design consequence:** one short sentence in the farmer's language, optionally with a read-aloud (Phase 4), numbers last.

### 3.8 Connectivity-poor design and trust

- Meghdoot added an offline mode and notifications in 2023 [S5]; Nuru works offline 🔎. A PWA that caches the last alerts and shows "as of 6:10 pm" covers the same need.
- Trust and liability: every alert shows its source and "forecast, not a guarantee"; AI-drafted Hindi stays marked `needs_review` as in the existing app. Farmer.Chat is deployed mostly through extension agents for human review 🔎 [S8], which supports not letting an LLM write live alerts.

---

## 4. System design findings

### 4.1 Canonical format: CAP 1.2

- SACHET already speaks CAP 1.2 (sender, sent, status, msgType, scope, references, info{language, category, event, urgency, severity, certainty, effective, onset, expires, headline, description, instruction, parameter, area{areaDesc, geocode, polygon}}) ✅T4.
- Libraries: Google's `cap-library` (Java, Apache-2.0, **archived since 2019**) [S46]; `capparselib` (PyPI, MIT, 0.6.6); `cap-tools` (PyPI, MIT, 3.1.1, xsData bindings for CAP 1.2); `@dec112/cap-ts` (npm, MIT, 0 stars, last push Aug 2025) [S46]. None is a clear schema validator ❓. The SACHET messages are simple enough to parse with the XML parser already used in Node.
- **We are not an alerting authority.** Google Public Alerts accepts only public-safety agencies or their authorised partners [S46]; WMO's Alert Hub lists registered authorities [S3][S46]. So: use CAP as our *internal* schema (mapping severity/urgency/certainty/expires), never publish our alerts as official CAP.

### 4.2 Field-level geo-matching

- Point-in-district: IMD's WFS does it server-side by `bbox` (the CQL `INTERSECTS` with a point failed with an SRID error ✅T6). For SACHET, match by **LGD district code** (needs the LGD code list, an open government dataset I did not verify) or by normalised district + state name.
- Buffer matching is only needed for rivers (stations within a radius of the field, same basin) and fires (FIRMS pixels within X km).
- Privacy: the app already stores the exact point privately and snaps weather requests to 0.05° (docs/DISEASE_RISK.md). The same rule should apply to any new `Field`.

### 4.3 Rule engine

A declarative table `(crop, stage, hazard, data window, threshold) → severity, action, evidence`, evaluated over the daily series the server already builds (`dailyAggregates`), is enough for Phase 1-3. The existing `diseaseRisk.js` is the pattern: pure functions, thresholds with citations, `LABEL` string, tests.

### 4.4 Ingestion pattern worth copying

`worldmonitor` (AGPL, patterns only) stores each source's result in a small **envelope** `{fetchedAt, recordCount, sourceVersion, schemaVersion, state, failedDatasets, errorReason, newestItemAt, maxContentAgeMin}` and runs a **freshness monitor** every 15 minutes that flags sources whose newest item is too old 📄 [S50]. The same idea gives us "SACHET last item 6 h ago" alarms without copying code.

### 4.5 Delivery channels, cost and consent

| Channel | Cost evidence | Requirements | Fit |
|---|---|---|---|
| **In-app (My Field)** | free | none | Phase 1 |
| **Web push (PWA)** | `web-push` npm is MPL-2.0 (file-level copyleft; fine as a dependency) ✅; FCM pricing not verified ❓ | Service worker + manifest + VAPID keys; **iOS only for home-screen web apps, iOS ≥ 16.4**, user gesture to ask permission [S45] | Phase 4. The repo has no PWA yet |
| **SMS** | Vendor claims ₹0.10-0.18 per delivered transactional SMS; DLT entity registration ₹5,900 one-time (Infobip docs; other vendor says ₹5,900 each for sender id/template, so check) 🔎 [S43] | TRAI **DLT** registration of entity, sender id, templates; template approval; consent record | Phase 4; needs a phone number |
| **WhatsApp Business** | Per message since 1 Jul 2025; utility templates **free inside the 24 h window until 30 Sep 2026, charged from 1 Oct 2026**; 1,000 free service messages/month per number; India INR rate card **not on the page** (a vendor blog says ₹0.145, unverified) 📄🔎 [S44] | Opt-in required; template approval; prices change only on 1 Jan/Apr/Jul/Oct | Phase 4 optional |
| **IVR voice** | ~$0.028/min pre-recorded (IDinsight campaign) 📄 [S38] | Telephony provider, voice recordings in Hindi, consent | Phase 4+ (best for low literacy) |
| **Cell Broadcast** | NDMA/C-DOT, test on 2 May 2026, not available to third parties 🔎 [S15] | Government channel | Not ours: **our alert should point to it, not duplicate it** |

**DPDP Act and Rules 2025 (law firm summaries, gazette not read):** institutions provisions from 13 Nov 2025; consent-manager registration 13 Nov 2026; **notice, consent, security, children's data, rights from 13 May 2027**; notices must be clear, itemised and link to withdrawal; breach reporting with a 72-hour detailed report; one-year log retention 📄 [S42]. Some law firms give 14 Nov/14 May: confirm the gazette. A farm location and phone number are personal data; a minor's data needs verifiable parental consent from May 2027.

### 4.6 Build options

| Option | What | Pros | Cons | Verdict |
|---|---|---|---|---|
| **A. Compute on read in the Node server** (reuse `getWeather` + rule engine) | No scheduler, no new service | Smallest diff; uses cached weather; 0 new cost; fits guest/device model | No push, no history, official feeds not polled | **Phase 1** |
| **B. Scheduled ingest + alert store in MongoDB** (Cloud Scheduler → server endpoint or Cloud Run Job) | Poll SACHET/IMD/CWC every 10-15 min, normalise to one schema, match to fields, store alerts | Same stack; enables push/SMS, dedupe, audit, offline "last known" | New code and monitoring; Scheduler price not verified ❓ | **Recommended from Phase 2** |
| **C. GCP-native: Pub/Sub + Firestore + Cloud Functions** | Event pipeline | Elastic | New stack for a student project; repo uses MongoDB Atlas, not Firestore | Reject (over-engineering) |
| **D. Adopt a CAP/crisis platform (Sahana Eden MIT, Ushahidi, farmOS GPL-2.0)** | Reuse an existing platform | Features | Wrong shape (these are incident/farm records systems, not field-alert engines); heavy to run; GPL/AGPL obligations | Reject; learn patterns only |
| **E. Buy delivery only** (SMS/WhatsApp/IVR vendor) | Keep the engine ours | Compliance handled by vendor | Per-message cost; vendor lock-in | **Use for Phase 4** |

**Recommendation:** A → B on the existing stack, canonical CAP-aligned JSON, vendors only for last-mile delivery.

---

## 5. The four repositories, assessed honestly

All four READMEs and key files were read from `raw.githubusercontent.com` into a temp folder (deleted at the end); no code was executed. Star counts are as of 20 Oct 2026.

### 5.1 `d4vinci/Scrapling` (BSD-3-Clause, 88,827 stars, Python ≥ 3.10) 📄

- **What it is:** a scraping framework: fast HTTP fetcher (curl_cffi), stealth browsers (Playwright/patchright), Cloudflare Turnstile handling, a spider engine with a priority scheduler and URL dedupe (`spiders/scheduler.py`), checkpoint pause/resume (`spiders/checkpoint.py`), AutoThrottle, an opt-in `robots_txt_obey` flag (`spiders/robotstxt.py`), XML/RSS feed spiders, an MCP server.
- **Fit:** for our feeds (SACHET RSS, IMD WFS JSON, CWC JSON) a plain HTTP client + XML parser is enough; Scrapling adds nothing there. It would matter only for HTML-only state advisory pages.
- **Risks:** its headline features (stealth, anti-bot bypass, proxy rotation) are the wrong tools for government sites; bypassing a WAF is a legal and reputational risk. Python in a Node server means a new service. The README itself says respect ToS and robots.txt.
- **Reuse:** patterns only: per-domain throttling, robots check, checkpointed crawl, response caching. **Verdict: do not adopt for v1; consider for Phase 5 only for pages whose terms allow it and with `robots_txt_obey` on.**

### 5.2 `Panniantong/agent-reach` (MIT, 100,163 stars) 📄

- **What it is:** a CLI that installs and health-checks internet "channels" for an AI coding agent (web via Jina Reader, RSS via feedparser, GitHub, YouTube via yt-dlp, Twitter/X, Reddit, XiaoHongShu, Bilibili, LinkedIn…); several need browser cookies or logged-in sessions (`cookie_extract.py`, "OpenCLI" reuses a Chrome session).
- **Fit:** a developer-research tool, not a server component. Its social channels depend on user cookies and platform bans; none is relevant to Indian government feeds.
- **Risks:** account/cookie bans, platform ToS violations, third-party relay (`r.jina.ai`) seeing every URL; installs system packages when allowed.
- **Reuse:** one idea: `agent-reach doctor` (a per-channel "is it working and which route is active" check), which we mirror as a source-health endpoint. **Verdict: dev-research only; do not ship.**

### 5.3 `koala73/worldmonitor` (**AGPL-3.0**, 88,920 stars, TypeScript) 📄

- **What it is:** a global intelligence dashboard (news, conflict, markets, climate, wildfire) with Vite + deck.gl/globe.gl, Redis cache, Vercel edge functions, protobuf API contracts, per-source "seeders" on cron, and freshness monitors.
- **Fit:** the *architecture* fits our problem: seed → envelope → cache → serve, freshness SLOs, layered map catalog, a wildfire proto built on FIRMS fields (`proto/worldmonitor/wildfire/v1/fire_detection.proto`: brightness, FRP, confidence, day/night).
- **Risks:** AGPL-3.0: copying code into a network service obliges us to publish our whole service source under AGPL. Heavy stack (Tauri, Convex, Redis).
- **Reuse:** patterns only, no code: (1) the per-source envelope with `fetchedAt/newestItemAt/maxContentAgeMin/state` (`api/_seed-envelope.js`), (2) a scheduled freshness monitor (`.github/workflows/seed-freshness-monitor.yml`), (3) separating "seeding" (cron) from "serving" (read cache), (4) the FIRMS field list. **Verdict: patterns only unless the user accepts AGPL for the whole app.**

### 5.4 `bilawalsidhu/gods-eye-view` (MIT for code, with data carve-outs, 58,440 stars) 📄

- **Licence detail (important):** GitHub's API reports `NOASSERTION`. The LICENSE file is MIT **for source code only**; bundled datasets and live provider data are **not** MIT, e.g. TeleGeography cables CC BY-NC-SA 3.0 (NonCommercial), OSM extracts ODbL, event imagery CC BY-NC 4.0; Google Maps/OpenSky restrict commercial use.
- **What it is:** a CesiumJS/Vite globe with ~20 layer modules, each split into `layers/<name>/` (model, source, policy, ingestion, state, rendering) and a thin `app/layers/<name>.js` adapter that injects services; share links serialise camera, style and layers into a URL; server-side proxy for keyed APIs with SSRF protection and response caps; request budgets (OpenSky credit governor, TomTom tile budget).
- **Fit:** Cesium + Google 3D tiles are heavy and metered: wrong for low-end Android and our budget. Our Map is Leaflet.
- **Reuse (patterns only):** (1) **layer-module contract** (a layer = source adapter + model + policy + renderer, registered by name) so Flood/Fire/Official layers plug into our Map the same way; (2) **shareable URL state** for layers and filters; (3) **server-side proxy with caps and a budget governor** for keyed APIs (FIRMS key must never reach the browser); (4) keyless-first layer table with a green/yellow/red "needs key / metered" column. **Verdict: patterns only; no Cesium.**

### 5.5 Other open-source projects worth knowing

| Project | Licence (verified from GitHub API unless noted) | Use |
|---|---|---|
| **GDACS** feeds | EU copyright, syndication with source acknowledged 🔎 | Cyclone/drought context (Phase 6) |
| `google/cap-library` | Apache-2.0, **archived** 2019 | CAP profile validation ideas; not a dependency |
| `capparselib` (PyPI) | MIT | Python CAP parsing if geo-service ingests |
| `cap-tools` (PyPI) | MIT | CAP 1.2 data classes |
| `@dec112/cap-ts` (npm) | MIT, 0 stars | Possible Node CAP builder; not needed for parsing |
| **farmOS** | GPL-2.0, 1,374 stars, active | Farm records platform; model for field/crop/log data, **not** to embed |
| **Sahana Eden** | MIT, active | Disaster-management platform; reference for alert/warning workflows |
| **Ushahidi platform** | GitHub shows `NOASSERTION`; licence ❓ (I did not read the file) | Crowd reports; pattern for community reports (Phase 6) |
| **OpenDRR** | MIT, last push 2024 | Risk modelling reference; low relevance |
| **WMO Alert Hub / Google Public Alerts** | n/a | Aggregation of official CAP feeds; only for registered authorities |

---

## 6. UX for farmers

**What an alert must say (from IBFWS + the Warning Lexicon elements, adapted):**
1. **One decision**, in the first line: "Cover the harvested wheat before rain tomorrow evening".
2. **Time window**: from when to when ("Tonight 8 pm to Thursday morning").
3. **Why, with numbers last**: "Rain forecast 22 mm; your wheat is ready to harvest".
4. **Source and freshness**: "IMD district warning, issued 20 Oct 6:10 pm" or "Open-Meteo forecast".
5. **Expiry**: after which the card disappears.
6. **How sure**: "forecast, can change", never a bare certainty.

**Layout in the existing workspace** (`docs/WORKSPACE.md`): one "Field alerts" card at the top of Overview, above Needs attention; a field switcher; each alert as a card with a status shape + word + colour (the existing `status.jsx` language), the action as the headline, a "Why?" expander for numbers and sources. A Map layer shows alert districts. Alert history lives in the Field log.

**Hindi-first wording:** short sentences, no jargon (पाला, ओलावृष्टि, भारी बारिश, लू), numbers with units, same drafted-by-AI / `needs_review` marking as the existing `ws.*` strings. Read-aloud via the browser's speech synthesis is a Phase 4 candidate (not tested).

**Accessibility and low-end Android:** minimum 44 px targets and 11 px text already enforced in the workspace (docs/WORKSPACE.md); never colour alone; an alert is plain HTML text first (no map needed); cache the last answer for offline with "as of" time; avoid heavy map libraries in the alert path; the Overview card must render from one small JSON call.

---

## 7. Risks

| Risk | Evidence / reason | Mitigation |
|---|---|---|
| **Liability for a wrong or missed alert** | Decision-grade advice about frost, flood, spraying | Source on every alert; "advisory, forecast" label; never claim to be an official warning; keep SACHET/IMD wording visible; terms/disclaimer reviewed by a lawyer (user action) |
| **False alarms and alert fatigue** | Effect debated, but trust is the adoption driver 🔎 [S36][S39] | Few alerts, decision-linked, severity thresholds, notification budget, log and evaluate (Phase 7) |
| **Unofficial endpoints disappear or change** | IMD WFS and CWC JSON are undocumented; IMD feed on Alert Hub was empty ✅T8 | Adapter per source, schema checks, freshness alarms, kill switch, written request to IMD/CWC |
| **Data licences block monetisation** | Open-Meteo non-commercial rule; Google News personal use; EE noncommercial | Keep non-commercial, or budget paid Open-Meteo plan / alternative before charging |
| **Privacy of field locations** | A saved field is a precise farm location | Store like Prediction (private point, never returned), round to 0.05° for outside calls, delete-my-data covers fields |
| **DPDP Act** | Phone numbers, consent, children (from 13 May 2027) | Consent record per channel, notice in plain Hindi/English, delete on request; sign-in must come before SMS |
| **Scraping terms** | Krishi Jagran / news sites: no RSS and terms unread | Headline + link only; no scraping of full articles; read robots/ToS first |
| **Cost** | Open-Meteo 10,000/day, EE 18,000 EECU-s/day, SMS per message | Cache per cell, budget governor, per-field alert caps |
| **Maintainability** | Student project, one maintainer | One schema, one rule table in JSON, tests for every rule, source-health page |
| **Wrong stage input** | Farmer picks a stage or sowing date wrongly | Show the stage used in the alert; allow one-tap correction |

---

## Source list

URLs I opened (📄) or that came from search results (🔎). Test requests are in Appendix A.

- **S1** IMD API platform: <https://api.imd.gov.in/> 📄 (register/login pages; no terms)
- **S2** IMD APIs page: <https://mausam.imd.gov.in/responsive/apis.php> (returned 404 when fetched; appears in search results only ❓)
- **S3** Thejesh GN, "Common Alerting Protocol (CAP) in the Indian Context": <https://thejeshgn.com/2025/05/28/common-alerting-protocol-cap-in-the-indian-context/> 📄
- **S4** "Simple IMD Alerts" (IMD WMS/WFS use): <https://thejeshgn.com/?p=32267> 📄
- **S5** CGIAR, "Inside Meghdoot": <https://www.cgiar.org/news-events/news/inside-meghdoot-the-app-delivering-weather-based-agricultural-advice-to-farmers-across-india> 📄
- **S6** MoES parliamentary answers: <https://www.moes.gov.in/sites/default/files/LS-English-5387-05042023.pdf>, <https://www.moes.gov.in/sites/default/files/PIB1913976.pdf>, <https://moes.gov.in/sites/default/files/RS_US_19_02022017.pdf> 🔎 (the 24.5 million SMS subscribers figure is from one of the 2017 answers in the result list; which file was not confirmed)
- **S7** NCAER 2020 summary: <https://www.downtoearth.org.in/news/agriculture/weather-advisories-drive-farmers-income-up-to-50--74110> 🔎
- **S8** Digital Green FY25 report: <https://digitalgreen.org/wp-content/uploads/2025/07/Digital-Green-FY25-Annual-Report.pdf>; RCT registry: <https://www.socialscienceregistry.org/trials/17035>; OpenAI story: <https://openai.com/index/digital-green> 🔎
- **S9** Fasal: <https://agfundernews.com/fasal-scores-4m-pre-series-a-funding-for-southeast-asia-push>, <https://inc42.com/startups/food-for-thought-agritech-startup-fasal-turns-to-iot-to-brighten-farmers-lives/> 🔎; **S9b** CropIn: <https://community.nasscom.in/communities/digital-transformation/agritech/agritech-case-study-series-smartfarm-by-cropin.html>, <https://agfundernews.com/indias-cropin-raises-8m-series-b-to-digitize-smallholder-farms-at-scale> 🔎
- **S10** Skymet: <https://www.devex.com/organizations/skymet-weather-services-pvt-ltd-97648>, <https://geosmartindia.net/2023/presentations/18-oct/new-space-economy/session-4/Skymet-Beyond-Weather-Arjun-m.pdf> 🔎
- **S11** FieldView Prime: <https://climate.com/static/cms/farm-data-with-fieldview-prime/> 🔎
- **S12** Plantix: <https://bigdata.cgiar.org/digital-intervention/plant-disease-diagnosis-using-artificial-intelligence-a-case-study-on-plantix/>, <https://www.reutersevents.com/sustainability/node/57037> 🔎
- **S13** Kisan Call Centre: <https://mkisan.gov.in/Home/AboutKCC>; Kisan Suvidha: <https://vikaspedia.in/agriculture/ict-applications-in-agriculture/kisan-call-center-app> 🔎
- **S14** CWC FloodWatch: <https://www.indiawaterportal.org/agriculture/farm/india-releases-floodwatch-app-provide-real-time-flood-updates> 🔎
- **S15** SACHET: <https://www.vikaspedia.in/social-welfare/disaster-management-1/national-disaster-alert-portal>; Cell Broadcast test: <https://www.etvbharat.com/en/bharat/ndma-tests-cell-broadcast-message-to-alert-citizens-on-severe-disaster-enn26050201915> 📄; first heatwave warning on phones: <https://www.thehitavada.com/Encyc/2026/5/27/vid-residents-receive-first-ever-heatwave-warning-on-cellphones.html> 🔎
- **S16** WINDS: <https://www.drishtiias.com/state-pcs-current-affairs/weather-information-network-and-data-system-winds-project/print_manually>, <https://www.thestatesman.com/india/odisha-govt-signs-mou-with-skymet-to-improve-weather-data-accessibility-1503453173.html> 🔎
- **S17** Esoko/CCAFS: <https://oar.icrisat.org/10145>, <https://ccafs.cgiar.org/es/node/111023> 🔎
- **S18** FEWS NET: <https://fews.net/about/projections>, <https://wmo.int/node/25397> 🔎
- **S19** Google flood forecasting: <https://blog.google/innovation-and-ai/products/flood-forecasts-india-bangladesh/> 📄; <https://blog.google/innovation-and-ai/products/google-ai-global-flood-forecasting/> 🔎; Flood Forecasting API: <https://developers.google.com/flood-forecasting> 📄 (waitlist, CC BY 4.0, free of charge; India not mentioned on that page)
- **S20** Open-Meteo: terms <https://open-meteo.com/en/terms> 📄, licence <https://open-meteo.com/en/licence> 📄, flood docs <https://open-meteo.com/en/docs/flood-api> 📄
- **S21** NASA FIRMS Area API: <https://firms.modaps.eosdis.nasa.gov/api/area/> 📄
- **S22** NASA POWER API docs: <https://power.larc.nasa.gov/docs/services/api/> 📄
- **S23** SoilGrids REST: <https://rest.isric.org/soilgrids/v2.0/properties/query>; FAQ <https://docs.isric.org/globaldata/soilgrids/SoilGrids_faqs_01.html>
- **S24** GDACS: <https://www.gdacs.org/xml/rss.xml>
- **S25** data.gov.in mandi prices: <https://data.gov.in/resource/current-daily-price-various-commodities-various-markets-mandi> 🔎
- **S26** WMO IBFWS guidelines: <https://www.preventionweb.net/publication/wmo-guidelines-multi-hazard-impact-based-forecast-and-warning-services>, <https://wmo.int/node/12781> 🔎
- **S27** Wheat heat: Lobell et al. <https://www.doi.org/10.1038/NCLIMATE1356>, <https://fsi.stanford.edu/node/26622>, <https://krishi.icar.gov.in/jspui/handle/123456789/24249>, <https://agris.fao.org/search/en/records/65ded1240f3e94b9e5d1a8a8>, <https://frontiersin.org/articles/10.3389/fpls.2023.1224334/full> 🔎
- **S28** Wheat frost: <https://www.ndsu.edu/agriculture/ag-hub/fall-frost-damage-field-crops>, <https://secondary.climate.ksu.edu/news/stories/2017/04/freeze_injury_update>, <https://graincrops.mgcafe.uky.edu/wheat-freeze-injury>, <https://www.agric.wa.gov.au/sites/gateway/files/What%20is%20frost.pdf> 🔎
- **S29** Potato frost (ICAR): <https://epubs.icar.org.in/index.php/IndFarm/article/view/49947>, <https://epubs.icar.org.in/index.php/PotatoJ/article/view/32441> 🔎
- **S30** Rice heat: <https://link.springer.com/10.1556/0806.43.2015.023>, <https://centaur.reading.ac.uk/8714/> 🔎
- **S31** Waterlogging: <https://www.ncbi.nlm.nih.gov/pmc/articles/PMC8401455/>, <https://agris.fao.org/search/en/records/6472417553aa8c896303726e>, <https://oar.icrisat.org:443/6169/7/JAS_Waterlogging_1-26_2013.pdf>, <https://repository.lsu.edu/plantsoil_pubs/555> 🔎
- **S32** Dry spell: <https://mausamsankalp.imd.gov.in/rfdry>, <https://mausamjournal.imd.gov.in/index.php/MAUSAM/article/view/3095> 🔎
- **S33** IMD categories: <https://www.moes.gov.in/sites/default/files/RS-in-25-27-07-2023.pdf>, <https://internal.imd.gov.in/press_release/20200523_pr_820.pdf> 🔎
- **S34** Ground frost: <https://www.meteoswiss.admin.ch/weather/weather-and-climate-from-a-to-z/ground-frost.html> 🔎
- **S35** NWP verification: <https://www.ncmrwf.gov.in/Reports-eng/AMD_report_FINAL.pdf>, <https://websevak.ncmrwf.gov.in/JJAS2015-RF-VerificationReport.pdf> 🔎
- **S36** Cry-wolf evidence: <https://hess.copernicus.org/articles/26/4265/2022/>, <https://bushfirecrc.com/node/8332>, <https://www.stat.berkeley.edu/users/aldous/157/Papers/leclerk.pdf> 🔎
- **S37** Warning content: <https://ascelibrary.com/doi/abs/10.1061/NHREFO.NHENG-1900>, <https://www.meteoschweiz.admin.ch/dam/jcr:d93fa953-ac85-40d0-b23d-087cbc5453e7/CommunicatingWeatherWarnings_MeteoSwiss_SientificReport-doi.pdf>, <https://eena.org/wp-content/uploads/2025/08/SUTTON_EENA_2025-1.pdf> 🔎
- **S38** Voice/IVR: Cole and Fernando <https://www.atai-research.org/wp-content/uploads/2020/06/ueaa084.pdf>; IDinsight <https://www.idinsight.org/article/when-is-the-best-time-to-send-ivr-and-sms-messages-to-farmers/>; Avaaj Otalo <https://collablab.northwestern.edu/CollabolabDistro/nucmc/PatelEtAl-AvaajOtalo-VoiceForumForSmallFarmers-2010.pdf> 🔎
- **S39** Digital agro-advisory reviews: <https://cgspace.cgiar.org/items/a79ac85e-792c-4b22-8e2f-3b43490caf8f/full> 🔎
- **S40** GloFAS skill: <https://www.ecmwf.int/node/25389>, <https://essopenarchive.org/users/534630/articles/598523-skill-assessment-of-glofas-era5-operational-river-discharge-for-the-major-indian-river-catchments>, <https://re.public.polimi.it/handle/11311/1259326> 🔎
- **S41** Sentinel-1 flood mapping: <https://www.ncbi.nlm.nih.gov/pmc/articles/PMC7437901/>, <https://ebooks.spiedigitallibrary.org/journals/Journal-of-Applied-Remote-Sensing/volume-14/issue-03/034505/GEE4FLOOD--rapid-mapping-of-flood-areas-using-temporal-Sentinel/10.1117/1.JRS.14.034505.full> 🔎
- **S42** DPDP Rules 2025: <https://www.azbpartners.com/bank/update-indias-digital-personal-data-protection-framework-comes-into-effect/> 📄, <https://ssrana.in/articles/meity-notifies-final-digital-personal-data-protection-rules-2025/> 🔎
- **S43** SMS/DLT: <https://www.infobip.com/docs/essentials/asia-registration/dlt-registration>, <https://www.messagecentral.com/blog/a2p-sms-pricing-india> 🔎 (vendor pages)
- **S44** WhatsApp pricing: <https://developers.facebook.com/documentation/business-messaging/whatsapp/pricing.md> 📄; <https://m.aisensy.com/blog/whatsapp-pricing-update-october-2026/> 🔎 (vendor, unverified)
- **S45** Web push on iOS: <https://documentation.onesignal.com/docs/web-push-for-ios>, <https://www.goodbarber.com/blog/ios-16-4-and-web-push-notifications-a1240/> 🔎
- **S46** CAP tooling: <https://github.com/google/cap-library>, <https://pypi.org/project/capparselib/>, <https://pypi.org/project/cap-tools/>, <https://npmjs.com/package/@dec112/cap-ts>, Google Public Alerts <https://developers.google.com/public-alerts/guides/overview> 🔎
- **S47** farmOS <https://github.com/farmOS/farmOS>; Sahana Eden <https://github.com/sahana/eden>; Ushahidi <https://github.com/ushahidi/platform>; OpenDRR <https://github.com/OpenDRR/opendrr-api> (licences from the GitHub API)
- **S48** PMFBY 72-hour intimation: <https://www.goodreturns.in/news/pmfby-crop-loss-reporting-rules-hailstorm-alert-india-011-1497555.html>, <https://eparlib.nic.in/bitstream/123456789/977813/1/AU3866.pdf> 🔎 (secondary; official portal pmfby.gov.in not opened)
- **S49** IMD agromet bulletins: <https://mausam.imd.gov.in/guwahati/mcdata/ams_bulletin_en.pdf>, <https://mausam.imd.gov.in/ahmedabad/mcdata/agromet.pdf>, <https://mausam.imd.gov.in/imphal/mcdata/ibf_agri.pdf> 🔎
- **S50** Repositories (README, LICENSE and key files read): <https://github.com/d4vinci/Scrapling>, <https://github.com/Panniantong/agent-reach>, <https://github.com/koala73/worldmonitor>, <https://github.com/bilawalsidhu/gods-eye-view>

---

## Appendix A: verification log (what I actually ran)

All on **20 Oct 2026**, from the development laptop (IP in India), with `curl` unless noted. Raw outputs were kept only in a temp folder (deleted).

| Id | Request | Result |
|---|---|---|
| **T1** | `GET api.open-meteo.com/v1/forecast` daily Tmin/Tmax/rain/gust/ET0/UV, 7 days, for Shimla (31.10, 77.17), Cuttack (20.46, 85.88), Ludhiana (30.90, 75.85) | HTTP 200, 0.95-1.0 s, ~920 B each. Shimla elevation 1,940 m, Tmin 6.3-8.3 °C, Tmax 18.5-20.6 °C, rain 0-0.9 mm. Cuttack Tmin 21.3-24.6, Tmax 30.2-31.4. Ludhiana Tmin 17.4-19.8, Tmax 30.5-31.2, no rain |
| **T1b** | Same Open-Meteo endpoint with `hourly=soil_moisture_0_to_1cm,soil_temperature_0cm,wet_bulb_temperature_2m,freezing_level_height`, Ludhiana, 1 day | HTTP 200, hourly arrays returned (so soil moisture is available for a waterlogging rule) |
| **T2** | `GET flood-api.open-meteo.com/v1/flood` daily `river_discharge` (+mean/max), 7 days, Cuttack (20.46, 85.88) and Ludhiana (30.95, 75.85) | HTTP 200. Cuttack snapped to (20.475, 85.875): 1,744.8 → 1,338.7 m³/s. Ludhiana snapped to (30.975, 75.875): 0.19 m³/s (not the Sutlej) |
| **T3** | `GET sachet.ndma.gov.in/cap_public_website/rss/rss_india.xml` | HTTP 200, 77,997 B, `Cache-Control: no-store`; 100 `<item>`, all category `Met`; authors: Andhra Pradesh SDMA 41, IMD Chennai 24, IMD Jaipur 9, IMD Mumbai 8, others ≤3, one CWC; items from 19 Oct 05:01 to 20 Oct 15:40 GMT; titles include Malayalam, Marathi, Telugu, Odia; `copyright: public domain`; channel `pubDate` 16 Oct (stale) |
| **T4** | `GET .../FetchXMLFile?identifier=1792510737644028` (first item) | CAP 1.2: sender `Rajasthan-SDMA`, msgType Update, severity Moderate, certainty Possible, urgency Expected, onset/expires with +05:30, areaDesc "Jaisalmer, Jhalawar districts of Rajasthan", geocodes `LGD District Code` 103 and 105, `Polygon URL` parameter. The polygon URL (`FetchPolygonXMLFile`) returned **403** to curl, also with a browser UA and referer |
| **T5** | State feeds `rss_odisha`, `rss_punjab`, `rss_haryana`, `rss_bihar` (200, 10 items each); `rss_himachal_pradesh`, `rss_uttar_pradesh`, `rss_Himachal_Pradesh`, `rss_Odisha` (404) | Naming is case/underscore sensitive and undocumented |
| **T6** | IMD GeoServer `reactjs.imd.gov.in/geoserver/wfs` GetCapabilities (109 KB, 33 layers); `GetFeature typeName=imd:district_warnings_india` by `bbox` at Shimla, Ludhiana, Cuttack; whole layer attributes; `NowcastWarningDistrict` | Point query 0.09-0.18 s. Shimla → SHIMLA **and** SOLAN; Ludhiana → LUDHIANA; Cuttack → CUTTACK (state "ODHISHA"). All three `Day_1..5 = "1"`, `Day1_Color 4`. Whole layer: 764 districts, 404 KB, 0.33 s. `CQL INTERSECTS(geom, POINT(..))` fails: "mixed SRID geometries"; the EWKT form also fails. Nowcast layer has `message`, `impact`, `action`, `toi`, `vupto` |
| **T7** | `mausam.imd.gov.in/api/warnings_district_api.php`, `nowcast_district_api.php`, `current_wx_api.php?id=42182` | HTTP **401** "Your IP … needs to be whitelisted" (the names are real: other guessed names returned 404) |
| **T8** | `cap-sources.s3.amazonaws.com/in-imd-en/rss.xml` (linked from the IMD page footer as "Latest CAP Alerts") | HTTP 200, 1,140 B, **0 items**, last built 27 Sep 2026, `Last-Modified` 13 Oct |
| **T9** | CWC FFS: opened `ffs.india-water.gov.in` in the Playwright browser to read its network calls, then `curl` of three of them | `/ffm/api/station-water-level-above-warning/` 2 KB JSON (stations with status WARNING/DANGER, trend); `/iam/api/layer-station-geo/specification/…` 208 stations with lat/lon (46 KB); `/iam/api/new-forecasted-entry-data/specification/?…` forecast rows (issued 20 Oct 12:00) |
| **T10** | `GET power.larc.nasa.gov/api/temporal/daily/point` T2M_MIN, T2M_MAX, PRECTOTCORR, RH2M, 1-18 Oct, Shimla | HTTP 200, 1.9 KB; 18 Oct T2M_MIN = −999 (missing) |
| **T11** | RSS: Google News (English and Hindi query), PIB (Lang 1 and 2), The Hindu agriculture, Krishi Jagran (`/feed/`, `/rss.xml`: 404), Rural Voice (`/feed`: 404; `/rss.xml`: HTML page) | Google/PIB/Hindu return XML. Google feed `<copyright>`: "personal, non-commercial use … any other use … prohibited" |
| **T12** | FIRMS `area/csv/DEMO_KEY/VIIRS_SNPP_NRT/74,29,78,32/1` | HTTP 400 "Invalid MAP_KEY". I did **not** register for a key |
| **T13** | SoilGrids REST `properties/query` clay + phh2o 0-5 cm at 3 points | Values at (77.17, 31.11); `null` at (75.85, 30.95) and (85.88, 20.50) |
| **T14** | `GET gdacs.org/xml/rss.xml`, `gdacs_cap.xml` | RSS 776 KB, 253 items (an India item: "Drought is on going in Southern India"); CAP 6.7 MB |
| **T15** | data.gov.in Agmarknet resource with the publicly documented sample key | HTTP **429** "Rate limit exceeded" (not retried; no registration done) |
| **T16** | GitHub API + raw files for the four repos (licence, size, activity, README, key files); `gods-eye-view/LICENSE` read in full | See section 5 |
| **T17** | Repo checks (local): `server/services/openMeteo.js`, `server/utils/diseaseRisk.js`, `server/models/Prediction.js`, `server/middleware/guestDevice.js`, `server/middleware/rateLimit.js`, `client/src/App.jsx`, `client/vite.config.js`, `client/public/` | No `Field` model, no scheduler, no service worker/manifest, MongoDB (not Firestore), sign-in off (guest device id) |

Nothing from these tests is stored in the repo.
