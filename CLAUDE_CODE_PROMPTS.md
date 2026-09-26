# Claude Code Prompts: Production Readiness + Geospatial Layer

Prepared 26 Sep 2026 for the AI Plant Disease Detection System (10 live crops).
Run the prompts in order, one Claude Code session per prompt. Each prompt is self-contained.

## Status board

| # | Prompt | Depends on | Status |
|---|---|---|---|
| 0 | Repo baseline + metrics consistency | none | Ready |
| 1 | Confidence / out-of-distribution gate + photo quality check | 0 | Ready |
| 2 | Automated tests + GitHub Actions CI | 0, 1 | Ready |
| 3 | Model versioning + ONNX serving | 2 | Ready |
| 4 | Security hardening (no login changes) | 2 | Ready |
| 5 | Deployment: Vercel + Cloud Run + Atlas | 3, 4 | Ready |
| 6 | Monitoring + feedback loop | 5 | Ready |
| 7 | Hindi UI (i18n) | 2 | Ready |
| 8 | Geo-tagging + outbreak map | 5 | Ready |
| 9 | Field health check (Earth Engine, Sentinel-2) | 8 | Ready |
| 10 | Weather-based disease risk (Open-Meteo) | 8 | Ready |
| 11 | Claim-ready field report (PDF) | 9, 10 | Ready |
| P1 | Field-photo test set + `evaluate_field.py` | none | **Pending** (decided 26 Sep 2026) |
| P2 | Re-enable authentication | none | **Pending** (decided 26 Sep 2026) |

Rules that apply to every prompt (already written into each one):

- Work on a new git branch; never commit `.env` files, datasets or archives.
- Do not re-enable login and do not remove the guest bypass in `server/middleware/auth.js` (pending item P2).
- Do not retrain or modify shipped heads, `label_maps.json` or the frozen backbone unless the prompt says so.
- Finish with: tests run, a short summary of what changed, and anything left for the human.

---

## Prompt 0: Repo baseline + metrics consistency

```
Goal: make the repo a clean, versioned baseline before production work.

Context: read README.md and ml-service/NEW_CROPS_REPORT.md first. 10 crops are live
(ml-service/predict.py ACTIVE_CROPS). `git status` shows ~66 modified files, but the
diff is line endings only (CRLF vs LF, Windows checkout); no content changed.

Tasks:
1. Create branch chore/baseline.
2. Add a .gitattributes that normalises text files to LF in the repo (keep *.bat/*.ps1
   as CRLF) and marks binaries (*.keras, *.png, *.jpg, *.zip, *.pdf, *.pptx) as binary.
   Run `git add --renormalize .`, confirm with `git diff --cached --ignore-cr-at-eol --stat`
   that no real content changes are hidden, and commit.
3. Metrics consistency. ml-service/models/test_results.json only has the original 6
   crops, and README's table disagrees with it (README: wheat 99.58% on ~240 images;
   JSON: 99.92% on 2,490). Find out which number is correct from the training
   notebooks/scripts and saved splits; do not guess. Then produce ONE metrics file,
   ml-service/models/metrics.json, covering all 10 crops with: crop, classes, n_test,
   accuracy, 95% CI where available, macro_f1, min_class_recall, eval_method
   ("holdout split" or "5-fold grouped CV"), source dataset(s), date. Reuse
   new_crops_results.json for the 4 new crops. Keep test_results.json only if something
   reads it (grep first); otherwise replace references.
4. Regenerate README's "Crops and disease coverage" table from metrics.json and add one
   line explaining that the two evaluation methods are not directly comparable.
5. Do NOT create the git tag; print the exact `git tag -a v0.2-10crops` command for me.

Done when: `git status` is clean after checkout, README and metrics.json agree for every
crop, and you report which wheat figure was wrong and why.
```

---

## Prompt 1: Confidence / out-of-distribution gate + photo quality check

```
Goal: the system must say "I'm not sure, please retake the photo" instead of always
returning a disease. This is the #1 trust gap: today predict_disease() in
ml-service/predict.py returns argmax for any image, including non-leaves and wrong crops.

Context: read README.md, ml-service/NEW_CROPS_REPORT.md, ml-service/predict.py, app.py,
server/controllers/predictController.js, server/models/Prediction.js,
client/src/pages/Predict.jsx, client/src/components/ResultCard.jsx.
Architecture: frozen EfficientNetB0 backbone (1280-d GAP features) + one small head per
crop. Do not retrain heads or change the backbone.

Design (you decide the details, justify them in docs/OOD_GATE.md):
1. Photo quality check (before the model): too small (< 224 px short side), blurry
   (variance of Laplacian), too dark/bright, and "no leaf" (share of vegetation-coloured
   pixels using an ExG or HSV rule). Thresholds must be chosen from data, not guessed:
   compute the metric distributions on the existing train/val images and pick cut-offs
   that reject < 2% of them.
2. Uncertainty / OOD score on the backbone features and head outputs. Compare at least:
   max softmax probability, energy score, and Mahalanobis distance to per-class feature
   means of that crop. Evaluate with AUROC and FPR@95%TPR where
   in-distribution = that crop's held-out split, near-OOD = images of the other 9 crops
   plus PlantDoc images (_dataset_backup/PlantDoc-Dataset-master.zip) of other species,
   far-OOD = a small public non-plant image set you download (e.g. Imagenette val).
   Pick the best method per crop; store per-crop thresholds in
   ml-service/models/ood_thresholds.json with the numbers that justify them.
3. Response contract of /predict-disease gains:
   "status": "ok" | "uncertain" | "rejected_quality" | "not_leaf",
   "reasons": [...], "ood_score": float, "quality": {...}.
   Keep existing fields for "ok" and "uncertain" (uncertain also returns top-3
   classes with probabilities). Skip Grad-CAM and severity when rejected.
4. Server: only look up treatment and yield-loss when status == "ok"; store status and
   reasons in Prediction (update the Mongoose schema; old records default to "ok").
5. Client: clear, friendly states for each status with retake tips (light, distance,
   one leaf, focus); do not show a disease name as a diagnosis when uncertain.
6. Note in docs/OOD_GATE.md that thresholds must be re-calibrated once the field-photo
   test set (pending item P1) exists; add a TODO with the command to re-run calibration.

Constraints: new branch feat/ood-gate; keep inference latency increase under 50 ms on
CPU (measure and report); do not touch server/middleware/auth.js (login stays disabled).

Done when: calibration script + thresholds file committed, AUROC table per crop in
docs/OOD_GATE.md, end-to-end manual check with 1 good leaf, 1 blurry photo, 1 non-leaf
photo and 1 wrong-crop leaf, and all results reported.
```

---

## Prompt 2: Automated tests + GitHub Actions CI

```
Goal: add a real test suite and CI so every push proves the system still works.
The repo has no tests today (README "Known limitations").

Context: monorepo with client/ (React 19 + Vite, oxlint config present), server/
(Express 5 ESM, Mongoose, Multer, Cloudinary, axios to the ML service), ml-service/
(FastAPI + TensorFlow). Read README.md and each package's entry files first.
Check whether model weights (ml-service/models/**/*.keras) are tracked in git; CI design
depends on it.

Tasks:
1. ml-service: pytest suite.
   - /health; invalid crop -> 400; non-image upload -> clean 4xx.
   - Golden regression test: one small committed fixture image per crop (take it from
     each crop's held-out split, resize to 256 px, keep total fixtures < 3 MB). Assert
     predicted class and confidence within +-0.02 of a stored expected value
     (tests/golden_expected.json). If weights are not in git, mark these tests to skip
     in CI with a clear reason, and make them run locally.
   - Unit tests for severity.compute_severity, gradcam output is a valid PNG, and the
     OOD/quality gate from Prompt 1 (if present).
2. server: Jest (ESM) + supertest. Use mongodb-memory-server; mock Cloudinary and the
   ML service (nock or axios mock). Cover: missing file, missing crop, happy path
   saves a Prediction, ML service error -> 502 with a safe message, history route.
   Keep the guest-auth bypass as is.
3. client: Vitest + React Testing Library smoke tests for Predict and ResultCard
   (renders each status), plus `oxlint` and `vite build`.
4. .github/workflows/ci.yml: three jobs (ml-service, server, client) with dependency
   caching, running on push and PR. Add a README badge.
5. Add `npm test` / `pytest` instructions to README.

Constraints: branch chore/tests-ci; no network calls in tests; whole CI < 10 minutes.
Done when: CI passes on GitHub (or, if no remote is configured, all three suites pass
locally and you show the output), plus a list of anything you had to skip and why.
```

---

## Prompt 3: Model versioning + ONNX serving

```
Goal: (a) every prediction records which model produced it; (b) smaller, faster CPU
serving for a scale-to-zero container, without losing Grad-CAM.

Context: ml-service/predict.py loads a Keras backbone + 10 heads; Grad-CAM
(ml-service/gradcam.py) needs TensorFlow gradients. Read both first.

Tasks:
1. Versioning: create ml-service/models/model_registry.json listing backbone and each
   head with: version (semver), sha256 of the weight file, training data source,
   metrics reference (metrics.json), date. /predict-disease returns "model_version"
   (backbone + head versions); server stores it on Prediction. /health returns the
   registry summary.
2. ONNX: export backbone and heads with tf2onnx; verify parity on each crop's held-out
   split (identical argmax on >= 99.9% of images, max abs prob diff < 1e-3; report
   actual numbers). Benchmark cold start, RAM and p50/p95 latency for TF vs ONNX
   Runtime in the Docker image.
3. Serving decision: use ONNX Runtime for classification. For Grad-CAM choose one and
   justify in docs/SERVING.md: lazy-load TF only for Grad-CAM, or a separate
   /gradcam endpoint the client calls after showing the diagnosis. Pick the option that
   gives the smallest image and fastest first response while keeping Grad-CAM available.
4. Update Dockerfile (slim, non-root user, pinned requirements with exact versions),
   and make .onnx files part of the image (they are git-ignored; document how they are
   built: `make export-onnx` or a script).

Constraints: branch feat/versioning-onnx; do not change predictions (parity check is
the gate); keep CI green.
Done when: parity + benchmark table in docs/SERVING.md, image size before/after, and
model_version visible in API responses and saved records.
```

---

## Prompt 4: Security hardening (login stays disabled)

```
Goal: make the public deployment safe while login is disabled (re-enabling auth is a
separate, pending task; do NOT change the guest bypass in server/middleware/auth.js).

Context: server/server.js uses cors() open to all, no helmet, no rate limit; Multer
accepts any mimetype starting with image/ up to 5 MB; errors return error.message to
the client; the ML service is reachable by anyone who knows its URL. All guests share
one placeholder userId, so GET /api/predict would show every guest's history.

Tasks:
1. helmet; CORS allowlist from env (CLIENT_ORIGINS); express.json size limit.
2. express-rate-limit on /api/predict (per IP, e.g. 20/10 min, configurable) and a
   global limit.
3. Validate uploads by magic bytes (file-type package), allow jpeg/png/webp only,
   reject images > 4000 px on a side, strip EXIF before uploading to Cloudinary
   (but first extract GPS if Prompt 8 is done, otherwise leave a hook).
4. Return generic error messages to clients; log details server-side only.
5. Protect the ML service: shared secret header (ML_SERVICE_TOKEN) checked by FastAPI;
   server sends it; document that the ML service should not be public.
6. Guest history leak: while in guest mode, give each browser an anonymous device id
   (random UUID stored in localStorage, sent as a header, validated as UUID) and scope
   history to it. Keep a clear TODO to migrate to real user ids when auth returns.
7. Startup env validation (fail fast with a clear message if a required var is missing);
   update server/.env.example.
8. Add a short docs/SECURITY.md with what is covered and what waits for auth.

Constraints: branch feat/security; tests from Prompt 2 must pass and new tests added
for rate limit, bad file type, and history scoping.
Done when: all items done or explicitly deferred with reason.
```

---

## Prompt 5: Deployment (Vercel + Google Cloud Run + MongoDB Atlas)

```
Goal: a live public demo URL on free tiers.

Target: client on Vercel (client/vercel.json exists); server and ml-service as
containers on Google Cloud Run (scale to zero, free tier); MongoDB Atlas free cluster;
Cloudinary free.

Tasks:
1. Review both Dockerfiles; make them production-ready (non-root, healthcheck,
   PORT from env as Cloud Run requires, minimal layers).
2. Write docs/DEPLOY.md with exact, copy-paste gcloud commands for a beginner:
   project setup, Artifact Registry, build/push, deploy with memory/CPU settings you
   choose from the Prompt 3 benchmarks, min-instances=0, startup CPU boost, env vars
   and secrets via Secret Manager, service-to-service access so only the server can
   call the ML service (IAM invoker or the shared token from Prompt 4).
3. Server: stop storing the Grad-CAM base64 PNG inside MongoDB; upload it to
   Cloudinary and store the URL (migration note for old records).
4. Handle cold starts: client shows a "waking up the model" state if the first call
   is slow; server timeout and retry policy for the ML call.
5. Vercel: env VITE_API_URL, SPA rewrites; confirm the build works.
6. Add a GitHub Actions deploy workflow (manual trigger) for the two Cloud Run
   services using Workload Identity Federation (no JSON keys in the repo); if that is
   too much for a first deploy, document the manual path and leave the workflow as a
   TODO.
7. Add a "Demo mode: login disabled" banner in the client.

Constraints: branch feat/deploy; no secrets in git; stay inside free tiers and state
the expected monthly cost at 1,000 predictions/month.
Done when: I can follow docs/DEPLOY.md end to end; list every step that needs my
manual action (billing account, domain, secrets).
```

---

## Prompt 6: Monitoring + feedback loop

```
Goal: know when the system breaks or drifts, and collect corrected labels to improve it.

Tasks:
1. Structured JSON logging with request ids across client -> server -> ML service
   (pino on Express, standard logging on FastAPI); log crop, status, confidence,
   latency, model_version; never log images or personal data.
2. Sentry (free tier) for server, ml-service and client, DSNs from env, disabled when
   unset.
3. docs/MONITORING.md: UptimeRobot setup for /health endpoints; a Mongo aggregation
   script (scripts/drift_report.js) producing per-crop daily counts, mean confidence,
   share of "uncertain"/"rejected", and flags when a crop's mean confidence drops
   more than 10 points vs its 14-day baseline.
4. Feedback: "Was this correct?" (Yes / No / Not sure) on the result card; on "No",
   let the user pick the correct class from that crop's list or "Other".
   Store on Prediction (feedback, correctedLabel, feedbackAt). API: PATCH
   /api/predict/:id/feedback scoped to the device id from Prompt 4.
5. scripts/export_relabel_queue.py: exports disagreed and uncertain predictions (image
   URL, crop, predicted, corrected, confidence, model_version) to CSV for expert
   review; document how a reviewed CSV becomes training data later.

Constraints: branch feat/monitoring-feedback; tests for the feedback endpoint.
Done when: feedback works end to end locally and the drift report runs on sample data.
```

---

## Prompt 7: Hindi UI (i18n)

```
Goal: Hindi + English UI with a language switcher; structure ready for more languages.

Tasks:
1. i18next + react-i18next in client; extract every user-facing string; locales in
   client/src/locales/{en,hi}.json; switcher in Navbar; remember choice in
   localStorage; default from navigator.language.
2. Crop names, disease names and severity labels: use the Hindi names farmers
   actually use (e.g. common/local names), not literal translations. Put them in
   a separate file with a "source" and "needs_review": true field per entry, because
   an agronomist must review them.
3. Treatment advice text (server/utils/treatmentMap.js): add a Hindi field per entry,
   marked needs_review; the API returns the text in the requested language
   (Accept-Language), falling back to English. Never machine-translate advice at
   runtime.
4. Use Noto Sans Devanagari; check layout on a 360 px wide screen.

Constraints: branch feat/i18n-hi; no change to model or API semantics.
Done when: every screen works in both languages, and a list of entries needing expert
review is generated (docs/TRANSLATION_REVIEW.csv).
```

---

## Prompt 8: Geo-tagging + outbreak map

```
Goal: every diagnosis can carry a location (with consent), and a public map shows
where diseases are being reported. This is the first geospatial feature.

Tasks:
1. Consent-first location capture in the client: explain why, ask permission, use
   browser geolocation; fallback to photo EXIF GPS (exifr) when present; allow "skip".
   Send lat, lon, accuracy_m, source ("gps" | "exif" | "none").
2. Server: GeoJSON Point on Prediction + 2dsphere index; validate ranges; keep the
   exact point private.
3. Aggregation API: GET /api/map/reports?crop=&disease=&days=30 returns counts
   aggregated to H3 hexagons (h3-js; choose a resolution around 5 km2 so no single
   farm is identifiable, and suppress cells with fewer than 3 reports).
4. Client map page: Leaflet + OpenStreetMap tiles (respect the OSM tile usage policy,
   attribution), hex layer coloured by count, filters for crop/disease/time, legend,
   works on mobile.
5. Add a short privacy note (what is stored, what is public, how to delete) and a
   DELETE endpoint for a device's own records.
6. Seed script with realistic fake points for local demo, clearly flagged as demo
   data and never mixed with real data.

Constraints: branch feat/geo-map; tests for aggregation and suppression.
Done when: a real prediction with location appears on the map within one refresh.
```

---

## Prompt 9: Field health check (Google Earth Engine, Sentinel-2)

```
Goal: for a diagnosed location, show how the whole field looks from space: NDVI and
NDRE history, the last clear image date, and whether this field is below its
neighbourhood. I am a beginner in remote sensing, so explain choices in comments and
docs.

Context: Earth Engine noncommercial Community tier (150 EECU-hours/month, free);
Google Agricultural Understanding (ALU) field boundaries for India are CC BY 4.0 via
its API; Sentinel-2 L2A is 10 m with ~5-day revisit.

Tasks:
1. docs/GEE_SETUP.md: step-by-step for a beginner: register a noncommercial Earth
   Engine project, create a service account, key handling via env/Secret Manager,
   quota monitoring. Note that commercial use needs a commercial licence.
2. New Python module (ml-service/geo/ or a separate geo-service, your call; justify):
   endpoint GET /field-health?lat=&lon=&date=&days=120
   - Field geometry: ALU polygon if the API is reachable with my credentials,
     otherwise a 30 m buffer; return which one was used.
   - COPERNICUS/S2_SR_HARMONIZED, cloud/shadow mask with the SCL band, per-date field
     mean NDVI and NDRE (state the exact bands and formula), skip dates with < 60%
     clear pixels.
   - Neighbourhood baseline: median of cropland pixels (ESA WorldCover cropland class)
     in a 1 km ring, same dates.
   - Output: time series, last clear date, field vs neighbourhood z-score or
     percentile, and a plain-language flag ("below neighbours since <date>").
   - Cache results (Mongo, keyed by rounded location + date) to stay inside quota;
     log EECU usage per call.
3. Client: chart on the result page (NDVI/NDRE lines, neighbourhood band), with a
   one-line explanation: satellite shows stress, not which disease; the leaf photo
   tells which disease.
4. Tests with mocked Earth Engine responses; one notebook
   (ml-service/geo/notebooks/explore_field.ipynb, geemap) that reproduces a field
   check visually for learning.
5. Stretch (only if everything above is done): compute REDSI
   (Sentinel-2 B4, B5, B7; Sensors 2018, 18(3):868) for wheat fields and show it as an
   experimental layer.

Constraints: branch feat/field-health; no GEE credentials in git; handle cloudy
kharif months gracefully.
Done when: the endpoint works for 3 real coordinates I give you (ask me for them) and
docs explain every index used.
```

---

## Prompt 10: Weather-based disease risk (Open-Meteo)

```
Goal: a daily disease-risk indicator with a 3-day outlook for 2 diseases, based on
published models, not invented rules.

Scope: potato late blight and rice blast first.

Tasks:
1. Research and cite the rules before coding. For late blight, check India-specific
   work (for example ICAR-CPRI's Indo-Blightcast) and classic rules (Hyre, Wallin/
   Blitecast); for rice blast, published temperature/RH/leaf-wetness thresholds from
   ICAR-NRRI or IRRI. Write docs/DISEASE_RISK.md with each rule, its source link, and
   its known limits. If a rule needs inputs Open-Meteo lacks, document the proxy used.
2. Service: fetch hourly forecast + past 7 days from Open-Meteo (free noncommercial,
   no key; respect rate limits; cache per location per hour).
3. Endpoint GET /disease-risk?lat=&lon=&crop= returning per-day risk level
   (low/medium/high), the driving conditions, and the source citation.
4. Client: risk strip on the result page and on the map page for the selected crop,
   labelled "risk indicator, not a forecast of infection".
5. Unit tests on the rule functions with hand-made weather series covering each
   threshold edge.

Constraints: branch feat/disease-risk; if a rule cannot be sourced, do not ship it.
Done when: both rules are cited, tested, and visible in the UI.
```

---

## Prompt 11: Claim-ready field report (PDF)

```
Goal: one-click PDF report per diagnosis for insurers, banks and FPOs.

Content: header with report id, timestamp (IST), model_version; photo + Grad-CAM;
diagnosis with confidence and status; severity; yield-loss estimate with its confidence
tag and source note; location (rounded) with a small static map; NDVI/NDRE chart and
last clear image date (Prompt 9); weather risk (Prompt 10); treatment advice; a
limitations box (lookup-based loss, satellite shows stress not disease, not an official
loss assessment); a SHA-256 hash of the report content for tamper evidence.

Tasks:
1. Choose the rendering approach (server-side HTML to PDF with Playwright, or a PDF
   library) and justify it for Cloud Run (image size, cold start).
2. Endpoint GET /api/predict/:id/report.pdf (device-scoped like other routes).
3. English first, Hindi if Prompt 7 is done.
4. Test: snapshot test on the HTML template; one generated sample in docs/sample_report.pdf
   using demo data.

Constraints: branch feat/field-report; A4, prints well in black and white.
Done when: the sample report looks professional and every number in it traces to an
API field.
```

---

## Pending (do not start yet)

### P1: Field-photo test set + `evaluate_field.py` (pending since 26 Sep 2026)

Trigger to start: at least 20 real field photos per crop for the in-season crops, with
a metadata CSV (file, crop, label, labelled_by, date, GPS, phone model; unsure labels
marked `uncertain`). After it exists, re-run the Prompt 1 threshold calibration on it.

### P2: Re-enable authentication (pending since 26 Sep 2026)

Scope when started: restore the 401 in `server/middleware/auth.js`, switch to the
standard `Authorization: Bearer <token>` format on both client and server, token
expiry + refresh, migrate device-id scoped records (Prompt 4) to user accounts, and
remove the "Demo mode" banner.
