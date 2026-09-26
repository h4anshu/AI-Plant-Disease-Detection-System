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
