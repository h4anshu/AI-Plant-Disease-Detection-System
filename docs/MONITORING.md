# Monitoring and the feedback loop

The goal is to know when the live system breaks or drifts, and to collect corrected labels that can
improve the models later. Everything here runs on free tiers.

| Question | Where you find the answer |
|---|---|
| Is the site up? | UptimeRobot emails you (set up below) |
| Did something crash? | Google Cloud **Error Reporting** (server, ML service); Sentry for browser errors (optional) |
| What happened to one request? | Cloud Logging, search by `requestId` |
| Are predictions getting worse for a crop? | `server/scripts/drift_report.js` |
| Where is the model wrong in the field? | User feedback, then `ml-service/train/export_relabel_queue.py`, then an expert |

## Logs

Both services write one JSON object per line to stdout. Cloud Run sends these to **Cloud Logging**
(free: 50 GB/month) with no setup.
- Server: pino, `server/utils/logger.js`.
- ML service: Python logging with a JSON formatter, `ml-service/app.py`.

**One request id follows a request through all three parts.**
1. The browser sends a random `x-request-id` with every API call.
2. The server reuses it, or makes one if it's missing or malformed, and passes it to the ML service.
3. Both services return it in the `x-request-id` response header.

| `message` | Written by | Fields |
|---|---|---|
| `request` | server, ML service | `requestId`, `method`, `path`, `status`, `latencyMs` |
| `prediction` | server | `requestId`, `crop`, `status`, `disease`, `confidence`, `diseaseSeverity`, `oodScore`, `modelVersion`, `mlLatencyMs` |
| `prediction` | ML service | same as the server's, plus `reasons` and `inferenceMs` |
| `feedback` | server | `requestId`, `crop`, `status`, `predicted`, `feedback`, `correctedLabel`, `modelVersion` |
| `ML service call failed` | server | `requestId`, `mlStatus`, `code`, `error` |
| errors | both | `severity: ERROR` and a `stack_trace` |

**Never logged:** photos or heatmaps, image URLs, IP addresses (uvicorn's access log is off, and the
server has no access log of its own), tokens, and device ids. Tests check this:
`server/tests/predict.test.js`, `feedback.test.js`, `ml-service/tests/test_api.py`.

**Finding things** (Console → Logging → Logs Explorer):

```
resource.labels.service_name="server" jsonPayload.message="prediction" jsonPayload.crop="wheat"
jsonPayload.requestId="<id from the browser's network tab>"
resource.labels.service_name="server" jsonPayload.message="feedback" jsonPayload.feedback="incorrect"
resource.labels.service_name="ml-service" jsonPayload.message="request" jsonPayload.latencyMs>2000
severity>=ERROR
```

## Errors

**Server and ML service: Cloud Error Reporting** (free).
- Every log entry with `severity: ERROR` and a `stack_trace` is grouped there automatically:
  unhandled exceptions, failed predictions and failed database calls.
- Turn on email alerts: Console → Error Reporting → Configure notifications.

**Browser: Sentry** (optional, free Developer plan, 5,000 errors/month). It's off until a DSN is set.
1. Create a Sentry account and a React project, then copy the DSN.
2. In the project: Settings → Security & Privacy → turn on **Prevent Storing of IP Addresses**.
3. In Vercel: Settings → Environment Variables → `VITE_SENTRY_DSN` = the DSN, then redeploy.

The SDK is loaded as a separate chunk only when the DSN is set (`client/src/main.jsx`), with
`sendDefaultPii: false` and no performance tracing. Sentry for the server and ML service isn't set up:
Error Reporting already covers them without another account.

## Uptime: UptimeRobot (free, 50 monitors, 5-minute checks)

At https://uptimerobot.com, create three **HTTP(s) – Keyword** monitors, each checked every 5 minutes
and alerting your email:

| Monitor | URL | Keyword |
|---|---|---|
| ML service | `https://ml-service-rdegseusxq-el.a.run.app/health` | `"status":"ok"` |
| Server | `https://server-rdegseusxq-el.a.run.app/health` | `"status":"ok"` |
| Website | `https://ai-plant-disease-detection-system.vercel.app` | `PlantGuard` |

A check every 5 minutes also keeps one instance of each Cloud Run service warm, so users rarely hit a
cold start. It still costs nothing: about 8,600 requests per service per month against 2 million
free, and an idle instance isn't billed with request-based billing.

## Weather alerts (Field Alert Center)

What the feature depends on, how to see its health and what to do when something breaks. Built in Task 40; the feature itself is described in `docs/FIELD_ALERTS.md`.

### One page: the operator health call
```
curl -s https://<server>/api/alerts/health -H "x-alerts-token: $ALERTS_ADMIN_TOKEN"
```
(`ALERTS_ADMIN_TOKEN` is the operator secret; without it the route answers 503.) It returns, with no personal data:
- **`sources`:** each feed (`sachet`, `imd`, `cwc`, `news`) with `state` ok / delayed / down / disabled, the last good fetch, the newest item and the last error. A feed is "delayed" after 3 intervals without a good fetch and "down" after 6 hours; the farmer's screen then says the official warnings may be late.
- **`switches`:** which kill switches are on or off (below).
- **`configured`:** whether the FIRMS key and the geo-service are set.
- **`usage`:** today's calls to Open-Meteo (forecast, and the flood API weighted by locations x days / 14), NASA FIRMS and the satellite checks, with the share of Open-Meteo's 10,000 a day used.
- `GET /api/alerts/feedback` (same token): the "Did this help?" answers per rule.
- `POST /api/alerts/tick` (same token) fetches every feed now, for Cloud Scheduler or by hand.

To be told without looking, point any monitor that can send a header at the health call and alert when the body contains `"state":"down"` (check that your UptimeRobot plan allows custom headers; if not, `POST /api/alerts/tick` from Cloud Scheduler plus the weekly look is enough).

### Kill switches
`ALERTS_DISABLED_SOURCES` is a comma-separated list; changing it needs no deploy: `gcloud run services update server --region asia-south1 --update-env-vars ALERTS_DISABLED_SOURCES=imd,news`. (A comma in `--update-env-vars` needs the escaped form in `gcloud topic escaping`; or set it in the console.)
| Name | Stops | The farmer sees |
|---|---|---|
| `sachet` | NDMA warnings | no NDMA alerts (the feed notice says why) |
| `imd` | IMD district warnings **and the district lookup of new fields** | no IMD alerts; new fields get no official warnings until it is back |
| `cwc` | river gauges | "The CWC gauges could not be checked" |
| `glofas` | river-flow forecast (Open-Meteo flood API) | the river row says unavailable; saves the most Open-Meteo allowance |
| `radar` | the satellite flood check button | the button is not shown |
| `news` | headlines (the official pages stay) | no headlines |
| `fire` | NASA fire check | "fire check not available" is not shown: the check is off |
| `community` | disease reports from other farmers | no such alert |
Plus settings (no deploy needed): `WEATHER_CACHE_HOURS=3` (ask Open-Meteo three times less), `FLOOD_FORECAST_BUDGET_PCT` (default 80) and `FLOOD_CLIMATE_BUDGET_PCT` (default 50): the river forecast and a new river's history stop at those shares of the day's Open-Meteo allowance so that the weather, which every field needs, never runs out first.

### When something breaks
| Symptom | Likely cause | What to do |
|---|---|---|
| Screens say official warnings may be late | a feed is delayed or down | `health`: which one and its `errorReason`. A 5xx or a timeout from the source: wait. A format change (parse error): switch it off, then fix the adapter with a new captured fixture (`server/tests/fixtures`) |
| `usage` shows Open-Meteo above 80% | many distinct places viewed in one day | set `WEATHER_CACHE_HOURS=3`; switch `glofas` off; see "Capacity" below |
| Weather unavailable for every field, Open-Meteo answers 429 | the daily or hourly limit was passed | the same; the river code remembers a failure for 10 minutes, weather retries on the next view |
| Fire check says unavailable | FIRMS key wrong or rotated (HTTP 400 "Invalid MAP_KEY."), or over 5,000 requests in 10 minutes | check the key in `FIRMS_MAP_KEY`; request a new one at `firms.modaps.eosdis.nasa.gov/api/area/` |
| Satellite check says busy (503) | Earth Engine quota or the geo-service is down | `radar` off if it persists; see `docs/GEE_SETUP.md` for the quota (about 1.3 EECU-seconds a check) |
| Real farmers get "Too many requests" | many users behind one mobile-network address share the per-address limit (`GLOBAL_RATE_LIMIT`, 300 per 15 minutes by default) | raise `GLOBAL_RATE_LIMIT` (for example 1500); the alert limiter already counts per browser |
| The database grows | a collection without a TTL | none known: see the table below |

### What is kept, and for how long (every cache has a TTL)
| Collection | Kept |
|---|---|
| `OfficialAlert` (NDMA) | until a day after it expires |
| `ImdWarning`, `CwcStation` | replaced on every fetch |
| `WeatherCache` | 3 hours (the key holds the hour) |
| `FloodForecast` | 6 hours |
| `FloodClimate` (a river's usual range) | for good; it is about a river, not a person |
| `FloodExtentCache` (radar answers) | 3 days; also removed by "Delete my data" |
| `FireCache` | 30 minutes |
| `NewsItem` | 30 days |
| `ApiUsage` | 45 days |
| `AlertFeedback` | 1 year |
| `Field` | until the farmer deletes it |

### Capacity on the free tier (from `npm run alerts-load`, 27 Oct 2026)
- **Our own code is not the limit:** 1,000 fields over 334 browsers, 20 requests at a time, against fake services that answer in 40 ms: **0 errors; cold (nothing cached) median 0.3 s, 95% under 0.85 s, about 65 requests a second; warm median 0.13 s, 150 requests a second**; memory about 400 MB with the test data (set the instance memory to at least 512 MB; 1 GB is comfortable).
- **Open-Meteo is the limit.** Per place newly looked at: weather 1 weighted call, the river forecast 3, and **a new river's 17-year history about 460** (once per river, kept for good). The free allowance is 10,000 a day and 5,000 an hour, so: at most **about 10 new rivers' histories a day** (the 50% guard), and, once those are kept, roughly **800 different places a day if each is looked at several times a day, up to about 2,500 if each is looked at once** (a place costs 1 weather call per cache window and 3 river calls per 6 hours). A pilot of a few hundred fields is far under that. **Thousands of fields need a paid Open-Meteo plan, or a cheaper history** (a shorter record, or one record shared by neighbouring cells) **before launch**; the river signal degrades first (it says unavailable) and the weather keeps going.
- NASA FIRMS: 3 requests per place per half hour against 5,000 per 10 minutes: not a limit at this size.
- Repeat it with `cd server && npm run alerts-load -- --fields 1000 --requests 600 --concurrency 20 [--clustered]`. It uses fake services and an in-memory database: it measures our code, not the real services' speed or their 429s.

### Budget alerts (Owner, 10 minutes, free)
1. **Google Cloud billing** (billing was disabled once, `task.md` Task 28): Console, Billing, **Budgets & alerts**, Create budget: the project, a small amount (for example 500 rupees), thresholds 50%, 90% and 100%, email to you. This is an alert, not a stop.
2. **Open-Meteo:** no account; the health page's `usage.openMeteoPct` is the meter. Add it to the weekly look.
3. **Earth Engine:** Cloud Console, Monitoring, Metrics Explorer, `earthengine.googleapis.com/project/cpu/usage_time`, filter the workload tag `flood-extent`; the free tier has 18,000 EECU-seconds a month.
4. **No SMS, WhatsApp or voice is built**, so there is no such budget.

## Drift report

```powershell
cd server
node --env-file=.env scripts/drift_report.js                  # today (UTC) vs the 14 days before
node --env-file=.env scripts/drift_report.js --date 2026-10-01 --json
node scripts/drift_report.js --sample                         # made-up data in an in-memory DB
```

**Per crop and per day** (MongoDB aggregation, read-only):
- the number of predictions;
- mean confidence of diagnosed photos (`ok` + `uncertain`);
- the share of `uncertain`;
- the share of rejected (`rejected_quality` + `not_leaf`);
- the number of "incorrect" feedback answers.

**A crop is flagged** when its mean confidence on the report day is **more than 10 points below its
14-day baseline**. It takes at least 5 diagnosed photos on each side, so a quiet crop can't raise a
false alarm. The exit code is 2 when anything is flagged, so a scheduled job (for example Windows Task
Scheduler, weekly) can alert on it.

A flag means users are sending photos that look different from the training data: a new region,
camera, season or disease. Check that crop's rejected and uncertain shares, then the relabel queue.

**`--sample` output** (wheat's confidence drops on the last day):

```
│ crop     │ count │ meanConfidence │ baselineConfidence │ dropPoints │ uncertainShare │ rejectedShare │ flagged │
│ 'banana' │ 8     │ 0.914          │ 0.913              │ -0.1       │ 0.125          │ 0.125         │ false   │
│ 'rice'   │ 8     │ 0.914          │ 0.913              │ -0.1       │ 0.125          │ 0.125         │ false   │
│ 'wheat'  │ 8     │ 0.704          │ 0.913              │ 20.9       │ 0.125          │ 0.125         │ true    │
FLAGGED: wheat - mean confidence dropped more than 10 points
```

## Feedback and the relabel loop

1. **Feedback.** Under every diagnosis the site asks "Was this correct?" (Yes / No / Not sure). "No"
   lets the user pick the right class for that crop, or "Other".
   - It's saved on the prediction as `feedback`, `correctedLabel` and `feedbackAt`, via
     `PATCH /api/predict/:id/feedback`.
   - A guest can only answer for predictions made in their own browser (device id, docs/SECURITY.md).
   - The class list comes from `GET /api/predict/classes`, which matches the ML label maps; a test
     checks that.
   - Answering again replaces the earlier answer.
2. **Export for review** (weekly or monthly):
   ```powershell
   cd ml-service
   python train/export_relabel_queue.py --env-file ../server/.env --since 2026-10-01
   ```
   - The CSV lists everything marked wrong or not sure, plus everything the gate called uncertain.
   - It includes the photo and heatmap links, the prediction, the user's correction and the model
     versions.
   - It has empty `expert_label`, `reviewer` and `notes` columns.
   - It contains links to users' photos: share it only with the reviewer, and never commit it
     (`ml-service/data/` is ignored).
3. **Expert review.** An agronomist opens each photo and fills in `expert_label`:
   - an exact class name from `ml-service/data/label_maps.json` for that crop;
   - `Other` (a real disease the model doesn't know);
   - or `skip` (unusable photo, or can't tell).

   **User answers are never used as labels directly.** Guests are anonymous and unverified.
4. **From reviewed CSV to training data** (when a few hundred rows are reviewed):
   1. Download each photo with an `expert_label` other than `skip` or `Other` into
      `ml-service/data/field/<crop>/<expert_label>/<id>.jpg`. Keep the CSV next to it as the record
      of who labeled what.
   2. Run the near-duplicate check from `train/new_crops.py analyze` against the existing training
      images, so field photos that are really copies don't leak across splits.
   3. Treat field photos as a **new source**, not extra lab images. Hold part of them out as a
      *field test set*, the first real measure of in-the-field accuracy (a known gap in README).
      Add the rest to training with the grouped split.
   4. Retrain the affected heads (same pipeline as `train/new_crops.py`). Compare old vs new on both
      the lab test set and the field test set. Ship only if field accuracy improves and lab accuracy
      doesn't drop.
   5. Recalibrate the gate with the new data (`train/calibrate_ood.py`). Field photos are exactly
      what it currently calls "uncertain".
   6. Bump the head version in `models/model_registry.json`: MINOR for retrained, MAJOR if a class
      was added for "Other" cases (docs/SERVING.md).
   7. Run `train/export_onnx.py` and `train/check_onnx_parity.py`, regenerate the golden fixtures
      if a golden photo's answer changed on purpose, then deploy (docs/DEPLOY.md). New predictions
      carry the new `modelVersion`, so the drift report and feedback can be compared before and
      after.
