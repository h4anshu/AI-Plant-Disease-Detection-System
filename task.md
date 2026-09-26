# Work log

Running record of work on the AI Plant Disease Detection System: what was done, how, and why. Newest entries at the bottom of each section; each task lists its outcome and where the evidence lives.

## Pending (user to do later)

Added 26 Sep 2026. Tick an item off when it's done.

**Monitoring setup** (optional, about 10 minutes; steps in `docs/MONITORING.md`):
- [ ] **UptimeRobot:** 3 free monitors (ML `/health`, server `/health`, website). You get an email when the site goes down, and the 5-minute pings keep the Cloud Run services warm, so there are fewer cold starts.
- [ ] **Error Reporting emails:** Google Cloud Console → Error Reporting → Configure notifications.
- [ ] **Sentry for the browser:** create a free Sentry React project, turn on "Prevent Storing of IP Addresses", and set `VITE_SENTRY_DSN` in Vercel, then redeploy.

**Carried over from earlier:**
- [x] **Deploy the server again (and the new geo-service), then push `main`.** Done 26 Sep 2026 (evening): server `00013` (new code + `GEO_SERVICE_URL`/`GEO_SERVICE_TOKEN`), ml-service `00006` current, `main` pushed at `3b82d57`, Vercel serving Map / Privacy / field health.
- [x] **Deploy the geo-service**, done: `geo-service-00001` runs as `geo-service@…`, `/health` shows `earth_engine: true`, and calls without the token get 401.
- [ ] **Agronomist review of the Hindi content:** 121 entries in `docs/TRANSLATION_REVIEW.csv` (10 crop names, 53 disease names, 4 severity labels, 54 treatment texts, all AI-drafted). Fill `hindi_corrected` / `reviewer`, then apply the corrections in `client/src/locales/terms.json` and `server/utils/treatmentMap.hi.js` with `needs_review: false`, and run `npm run translation-review` in `server/`. Until then the app shows a "not yet checked by an expert" note under Hindi advice.
- [ ] **Secrets to Secret Manager** (optional): `docs/DEPLOY.md` Part C.
- [x] **Deploy the server for the disease-risk strip (Task 13), then push `main`:** Done 26 Sep 2026: server `00015`, `main` pushed, Vercel bundle has the strip. Live check: `/api/disease-risk` potato near Shimla → high ×6, rice near Cuttack → low ×6, wheat → 400; live Map → Potato → district zoom shows the strip with the "Why?" numbers and citations. Original step: `gcloud run deploy server --source server --region asia-south1` (no new env vars needed; Open-Meteo needs no key), then `git push origin main` for Vercel. Check: a potato/rice checkup with location shows the strip; Map → Potato → zoom to a district.
- [x] **Deploy the server for the PDF report (Task 14), then push `main`:** Done 26 Sep 2026: server `00016` (no watermark env), `main` pushed at `c98b5d0`, Vercel bundle has the button (en + hi); verified live end to end (Task 14, "Live"). Original step: `gcloud run deploy server --source server --region asia-south1` (no new env vars needed; `REPORT_WATERMARK` must stay unset in production), then `git push origin main` for Vercel. Check: a checkup → "Download report (PDF)", then open the verify link printed on its last page.
- [ ] **Hindi report strings** (`report.*` in `client/src/locales/hi.json` and the `hi` labels in `server/utils/reportContent.js`, AI-drafted): include them in the agronomist review.
- [ ] **Hindi disease-risk strings** (`risk.*` in `client/src/locales/hi.json`, AI-drafted): include them in the agronomist review.
- [x] **Earth Engine setup for field health**, done 26 Sep 2026: registered (noncommercial, BBDU, Community tier), API on, sign-in via gcloud ADC works (test: 7 Sentinel-2 images), `geo-service` service account with both roles. daily EECU cap set to 18,000 EECU-s. **Still open:** an ALU answer (likely no, no GWCID), and **3 real field coordinates** (owners' consent). The field-health code starts after the coordinates.

---

## Task 1 — Environment: GPU training setup (25 Sep 2026)

**Goal:** use the laptop GPU (RTX 3050, 4 GB) for training.

**What happened**
- Windows `nvidia-smi` saw the GPU, but the project `.venv` (TensorFlow 2.21) reported no GPU: TensorFlow ≥ 2.11 has no GPU support on native Windows.
- WSL Ubuntu 24.04 also saw the GPU. The sudo password was not known, so everything was installed in user space:
  - `pip install --user virtualenv` → `~/tfgpu` virtualenv.
  - `tensorflow[and-cuda]==2.21.0` (same version as `.venv`, so `.keras` files load in both), plus pillow, numpy, scikit-learn, scipy, matplotlib, and later `opencv-python-headless`.
- TensorFlow still could not find the pip-installed CUDA libraries ("Cannot dlopen some GPU libraries"). Fix: wrapper `~/tfgpu/bin/pygpu` that puts every `site-packages/nvidia/*/lib` folder on `LD_LIBRARY_PATH`.
- Benchmark: EfficientNetB0 feature extraction ~350 images/s at batch 32.

**Lessons**
- Batch 64 in eager mode ran out of GPU memory; batch 32 with `predict_on_batch` works.
- The WSL VM has only ~7.7 GB RAM. An 80k-image job crashed WSL (`Wsl/Service/E_UNEXPECTED`), fixed with `wsl --shutdown`. Long jobs are started with `setsid nohup … &` and a WSL client is kept attached, otherwise the idle VM stops and kills them.
- Reading from `/mnt/d` via WSL is slow (60–300 files/s).

---

## Task 2 — New-crop expansion (25–26 Sep 2026)

**Goal:** analyse ~19 raw dataset archives one crop at a time, pick correct sources (merge only if justified), train new heads with the existing approach, and put them live. Rules from the user: never touch the 6 existing crops; move ineffective datasets to a separate folder with a report.

**Inputs:** 19 zips/rars in the repo root (~116k images, 20 candidate crops) and the catalogue `Indian_Crop_Disease_Datasets_Catalogue.xlsx` (its 5 selection rules were followed: Healthy class required, one source per head unless proven safe, reject plain backgrounds, licence, raw over augmented).

### 2.1 Pipeline built
`ml-service/train/new_crops.py`, run in WSL via `~/tfgpu/bin/pygpu`, stages:
1. **ingest** — copy each configured source into `ml-service/data/raw/<crop>/<class>/`, write `manifest.csv` (source, original path, grouping hint). Handles nested zips (unpacked to `~/staging`), folder-name drift via regex keys, Roboflow/YOLO exports (image-level label only when a single class is present).
2. **analyze** — integrity check; backbone features computed with **exactly the serving preprocessing** (`PIL Image.resize((224,224))`, as `predict.py` does; the old notebook used `tf.image.resize`, which aliases badly on 4000–6000 px photos); near-duplicate grouping; label-conflict detection; shortcut probes.
3. **train** — group-aware 70/15/15 split, same head recipe as `03_train_local.ipynb` (Dense 128 → Dropout 0.3 → softmax, Adam 1e-3, early stopping), test report, confusion matrix, Grad-CAM grid, external test, grouped 5-fold CV.
4. **promote** — copy head to `models/heads/`, add the crop to `label_maps.json` / `class_weights.json` (additive only), write metrics.

### 2.2 How "honest accuracy" was enforced (and why each step exists)
- **Near-duplicates.** Embedding cosine alone failed (median nearest-neighbour cosine 0.958 — different leaves look alike). Replaced by embedding kNN candidates + **ORB keypoints + RANSAC homography**: two images are "the same physical leaf" when enough keypoints match geometrically (robust to crop, zoom, rotation, flip). Calibrated by eye on montages: ≥ 8 inliers groups images for splitting; a cross-class match is treated as label noise only at ≥ 25. Byte-identical files always collapse to one.
- **Evidence it mattered:** tightening grouping from 12 to 8 inliers moved groundnut test accuracy 96.9% → 94.7%; with stricter grouping Tamil Nadu "Healthy" recall fell to 1% — the earlier high numbers were leakage.
- **Pre-augmented datasets:** one medoid per physical leaf is used for evaluation; augmented copies may join training only with their own leaf. Tested on apple: keeping copies in train was better (test 92→94%, outside photos 42→55%).
- **Splitter fix:** the first version could put a whole large group in validation, leaving a class with zero test images (crashed the Tamil Nadu groundnut run). Rewritten: largest groups first, each into the split furthest below its target share; checked on a synthetic case.
- **Grouped 5-fold CV** over every independent image (single 15% test splits were too small, e.g. apple n=50, ±7%), reported overall and per source.
- **Gate:** CV accuracy ≥ 85%, every class ≥ 70% recall (also within each source for classes with ≥ 20 images), ≥ 2 classes, and a Healthy class.
- **Shortcut checks:** file size/shape, border colour, border-only image, source-identity probes; plain-backdrop share per class; Grad-CAM grids viewed for every crop; augmentation-artifact share and accuracy on artifact-free photos; external tests on another source (PlantDoc etc.).
- **Bugs found and fixed along the way:** bootstrap CI re-seeded every iteration (degenerate CI); `set_memory_growth` after TF init; empty training set crash when all classes fall below the minimum; waiter scripts matching their own command line in `pgrep`.

### 2.3 Results per crop

| Crop | Decision | Key evidence |
|---|---|---|
| Groundnut | **Shipped** | Two sources merged: each alone collapses on the other (57.6% / 37.4%). Tamil Nadu 8,463 files = 672 physical leaves; its "Healthy" = ~5 leaves copied ~80×, one diseased → dropped. CV 92.7%, on artifact-free photos 89.8%. |
| Blackgram | **Shipped** | Clean single source. CV 96.2%. |
| Apple | **Shipped** (limited) | 7,505 files = 332 leaves (~22 augmented copies each). CV 94.9%. PlantDoc healthy apple leaves called Alternaria 40–58% of the time. |
| Banana | **Shipped** | Source bug: `banana_sigatoka` held 494 groundnut images (Roboflow class-id mix-up) → filtered by filename prefix; "sigatoka" and "yellow-and-black sigatoka" merged into one class; Cordana dropped (34 leaves). CV 96.8%. |
| Grape | Not shipped (user decision) | 93–99% leaves on paper; 99% on paper photos but 12–19% on field photos. |
| Turmeric | Not shipped | 100% leaves on paper. |
| Tea | Not shipped | Leaves on paper; 80k files = 1,500 raw × 9 augmentations per class (file k and k+1500·j are copies — discovered from nearest-neighbour offsets and used as an exact grouping key). CV 99.2% but only on paper. |
| Cotton | Not shipped | Only a 2-class model (Bacterial Blight/Healthy) is defensible; Bangladesh set is white-paper and fails on field photos (Fusarium 2%). |
| Chilli | Rejected | Bangladesh set on white paper (healthy field leaves → "Leaf Curl" 344/424); Tamil Nadu disease classes largely web-scraped (Shutterstock watermarks) while Healthy is one farm. |
| Okra | Rejected | 1,495 files but 293 unique; honest CV 55%. |
| Tomato | Rejected | Paper backdrop, label noise, per-class JPEG size; CV 62.5%, 17% on field photos. |
| Mango | Rejected | Background removed onto black, resolution differs by class; CV 86.4%, Gall Midge 59%. |
| Cauliflower | Rejected | "Healthy" photos are curds, diseases are leaves. |
| Radish | Rejected | All on black cloth; ~43 real leaves. |
| 6 small Bangladesh vegetables | Rejected | Paper backdrop, 135–303 photos per crop, most lack Healthy. |
| Sorghum | Rejected | Grain heads, not leaves; no Healthy. |

Full evidence: `ml-service/NEW_CROPS_REPORT.md`; per-crop artefacts in `ml-service/data/new_crops/<crop>/` (analysis JSON, montages, confusion matrix, Grad-CAM).

### 2.4 Going live
- Heads added: `ml-service/models/heads/{groundnut,blackgram,apple,banana}_head.keras`. Existing 6 heads untouched (verified: same files, same label maps). Pre-change maps backed up in `ml-service/data/_backup_pre_new_crops/`.
- `ml-service/predict.py` `ACTIVE_CROPS`, `client/src/pages/Predict.jsx` crop list, `server/models/Prediction.js` crop enum (without it saving history fails validation), Dockerfile comment.
- `server/utils/treatmentMap.js` and `yieldLoss.js`: advice and yield-loss for all 21 new classes, sourced from TNAU/ICRISAT, ICAR-IIPR / Legume Research, SKUAST-K, ICAR-NRC Banana, with high/med/low confidence tags. Needs agronomist review before wide release.
- Verified: serving code (`predict.py` in the Windows `.venv`) on held-out images — groundnut 23/24, blackgram 20/20, apple 10/12, banana 26/28, wheat and rice 20/20; FastAPI endpoint returns correct results and rejects non-live crops; frontend shows all 10 crops (browser check). Express/MongoDB/Cloudinary path not exercised (would write to production services).

### 2.5 Dataset housekeeping
- `_rejected_datasets/` — every rejected or not-shipped archive, with `README.md` giving the reason for each (Sorghum, duplicate cotton zip, sugarcane (existing crop, parked), Okra, Mango, Tomato-Village, Bangladesh chilli/cotton/small vegetables, grape, turmeric, tea, Pune cotton).
- `_dataset_backup/` — archives behind the shipped heads (groundnut, blackgram, apple, Multi-Crop) and PlantDoc; not needed at runtime, kept to re-run the analysis. `new_crops.py` config points at both folders.
- Tea `.rar` files were partly unreadable by Windows `tar` (RAR5); extracted with the installed WinRAR `UnRAR.exe`.
- `.gitignore`: extracted `Tea Leaf Dataset/` added.
- Left over: `~/staging` in WSL (5.5 GB of temporary nested-zip copies) — can be deleted on request.

User committed this work as `1ed0621 new crops added`.

---

## Task 3 — Repo baseline + metrics consistency (26 Sep 2026)

**Goal:** clean, versioned baseline before production work (prompt 0 in `CLAUDE_CODE_PROMPTS.md`).

**What happened**
1. Branch `chore/baseline` created from `main`.
2. `.gitattributes`: `* text=auto eol=lf`, `.bat/.cmd/.ps1` CRLF, models/images/archives/Office files binary. `git add --renormalize .` changed no tracked file (the index was already all LF; the "~66 modified files" in the brief did not exist on this checkout). `--stat` with and without `--ignore-cr-at-eol` identical. Commit `bc0d5f5`.
3. Metrics: re-evaluated the six deployed original heads on their saved test-split features (`data/features/*_test.npz`, sizes match `split_report.json`). They reproduce the notebook's test figures exactly.
   - **Wrong wheat figure: `test_results.json` (99.92% on 2,490)** — produced by the old 6-class head that still had Yellow_Rust (2,250 of the test images). The deployed 5-class head scores 99.58% on 240 (notebook cell 15), as the README said.
   - README was stale for four crops: rice 99.68→99.78, sugarcane 92.31→92.70, potato 98.76→98.14 (98.76 was best validation accuracy), pigeonpea 79.05→81.08.
   - New single file `ml-service/models/metrics.json` for all 10 crops (accuracy, 95% CI, macro-F1, weakest-class recall, eval method, sources, date). New crops use their 5-fold grouped CV (macro-F1 from the CV confusion matrix).
   - Deleted `test_results.json/.csv` and `new_crops_results.json` (nothing read them); `new_crops.py promote()` now upserts into `metrics.json` (dry-run on temp copies matched exactly). Audit report reference updated.
4. README table regenerated from `metrics.json` with a line that holdout-split and grouped-CV numbers are not directly comparable; checked row by row. Commit `c91b408`.
5. Fresh checkout in a temporary worktree: 0 modified files, all LF.

**Not changed (out of scope, still show old numbers):** `presentation.html`, the two `.pptx` decks, `PROJECT_STATE_REPORT.md`.

**Tag (for the user to run):**
```
git tag -a v0.2-10crops c91b408 -m "Baseline: 10 live crops, LF-normalised repo, single metrics.json"
```

---

## Task 4 — Confidence / out-of-distribution gate + photo quality check (26 Sep 2026, in progress)

**Goal:** the system says "not sure, please retake" instead of always returning a disease. Today `predict_disease()` returns the argmax for any image (non-leaves, wrong crop). Branch `feat/ood-gate` (from `chore/baseline`). Heads and backbone must not change; auth middleware untouched; latency increase < 50 ms on CPU.

**Plan**
1. Photo quality check before the model (size, blur, brightness, vegetation share) with cut-offs taken from train/val distributions (< 2% of them rejected).
2. OOD score on backbone features / head outputs: compare max softmax, energy and Mahalanobis; evaluate AUROC and FPR@95%TPR against near-OOD (other 9 crops, PlantDoc other species) and far-OOD (Imagenette val); pick best method per crop; thresholds in `ml-service/models/ood_thresholds.json`.
3. API contract: `status` ok / uncertain / rejected_quality / not_leaf, `reasons`, `ood_score`, `quality`; top-3 when uncertain; no Grad-CAM/severity when rejected.
4. Server: treatment/yield only when ok; store status/reasons.
5. Client: friendly states with retake tips.
6. `docs/OOD_GATE.md` with the AUROC table and re-calibration TODO.

**Log**
- Data check: held-out splits per crop exist (apple val/test only 50 images each because apple is 332 real leaves → its threshold is the noisiest).
- Downloaded Imagenette (`imagenette2-160.tgz`, 99 MB, fast.ai S3) as the far-OOD set; only `val` kept (3,925 non-plant images) in `ml-service/data/ood_external/` (git-ignored).
- `ml-service/gate.py` (new): quality metrics measured on the 224×224 image the model already sees (no extra resize; resolution-independent), quality verdict, head logits recomputed in numpy from the head's own weights (for energy), Mahalanobis in a per-crop PCA space (small enough for git), `Gate` class loaded once at startup. All scores oriented "higher = more OOD".
- `ml-service/train/calibrate_ood.py` (new): features via the exact serving path (cached in `data/ood_cache/`), quality cut-offs from train/val of all 10 crops, per-crop comparison of MSP, energy, Mahalanobis (PCA 64/128/256 and full 1280 for reference) with AUROC / FPR@95%TPR on near-OOD (other crops' test images, PlantDoc other species) and far-OOD (Imagenette); threshold = keep 95% of the crop's validation images.
- `predict.py`: quality check first (rejected photos return immediately: no backbone, Grad-CAM or severity), then the OOD score decides ok / uncertain (+ top-3); unreadable files → `rejected_quality` instead of a 500. `load_models(with_gate=False)` for calibration. `app.py` passes the gate. Dockerfile copies `gate.py` (would have broken the image otherwise).
- Server: ML call moved before the Cloudinary upload (no orphan uploads on ML failure); treatment / yield-loss only when `status == "ok"`; `Prediction` schema gains `status` (default "ok" so old records read as ok), `reasons`, `oodScore`, `quality`, `top3`; disease/confidence/severity required only for ok/uncertain, treatment only for ok. Checked offline with `validateSync` for every status + an old record.
- Client: `ResultCard` has retake states per status with reason-specific tips (light, distance, one leaf, focus); uncertain never shows a disease heading — model's leanings only behind a collapsed "not a diagnosis" toggle, no treatment/yield. `HistoryList` shows "Not sure" / "Retake" instead of a disease for gated records.
- Calibration run 1 stopped on its own safety assert: the fixed 224 px size rule plus global cut-offs rejected 2.19% of train/val photos. Found 3.8% of rice training photos are 209–223 px and classified 100% correctly → size cut-off made data-derived (212 px). A global cut-off still rejected 4.9% of rice, 4.2% of maize, 2.7% of sugarcane (its Dried_Leaves class has little green) → each cut-off now sits at the most lenient crop's 0.4% tail and the script asserts every crop < 2% (result: 0.45% overall, worst crop rice 1.06%).
- Mahalanobis code was ~100× too slow (einsum per class through 1280×1280); rewritten as zPz − 2zPμ + μPμ (identical to 3e-15). Stats stored float16 (5.9 MB); live gate re-scored against calibration: identical rates.
- End-to-end run 1 (with user's approval to use Cloudinary/MongoDB): good leaf ok, blurry → rejected_quality, church → not_leaf, but **wheat photo sent as banana → "Moko Wilt 99.6%" (miss)**: banana's chosen method (energy) let ~23% of other crops through. Added combined scores and a nearest-prototype method (`knn256`: cosine distance to 256 k-means prototypes of the crop's train features). knn256 is best or tied for every crop; banana wrong-crop flagging 77% → 94%, rice 88% → 99%, blackgram 79% → 91%.
- Final per crop: other crops flagged 91–100%, PlantDoc 77–100% (apple weakest), Imagenette 100%, own test photos kept 93–97%. Full AUROC / FPR@95%TPR tables in `docs/OOD_GATE.md`.
- Latency (CPU, `train/bench_gate_latency.py`): gate adds 2.1 ms median, 9.4 ms max (< 50 ms budget); full call ~740 ms (unchanged, backbone + Grad-CAM).
- End-to-end run 2: all four cases correct (wheat-as-banana → "We're not sure about this one"); History page shows gated records as "Not sure" / "Retake". 8 test records were created in MongoDB (+ 8 Cloudinary uploads) — IDs listed in the final report; record `6ab748480b8116240ec672a2` is the pre-fix wrong "Moko Wilt" result.
- Temporary files removed (`client/public/__e2e`, `client/.env.development.local`); client production build OK; `python gate.py` self-check added and passing. Docs: `docs/OOD_GATE.md`; README overview mentions the gate.

---

## Task 5 — Test suite + CI (26 Sep 2026, in progress)

**Goal:** real tests (ml-service pytest, server Jest + supertest, client Vitest + RTL + oxlint + build) and a GitHub Actions workflow with three jobs; branch `chore/tests-ci` (from `feat/ood-gate`, so the gate is covered); no network in tests; CI < 10 min.

**Before starting**
- The wrong pre-fix "Moko Wilt" record (`6ab748480b8116240ec672a2`) and its Cloudinary image: deleting production data is not something Claude does itself — gave the user the two one-line commands to run from `server/`.
- Design facts: remote `origin` = GitHub `h4anshu/AI-Plant-Disease-Detection-System` (push only after asking); model weights **are** tracked (backbone + 10 heads), so golden tests can run in CI; but `ml-service/data/label_maps.json` was git-ignored (service can't start without it — CI and every deploy depended on a local file) → track it with `class_weights.json`; `requirements.txt` had unpinned `tensorflow` → pin 2.21.0 (the version that saved the models).
- ml-service: `app.py` returns 415 for uploads that are not images (was 200 + rejected_quality); `requirements-dev.txt` (pytest, httpx), `pytest.ini`. Golden fixtures via `tests/make_golden.py`: one held-out photo per crop the model gets right with status ok, short side resized to 256 px (above the 212 px quality cut-off) — 10 fixtures, 202 KB; first attempt missed rice because I capped confidence at 0.995 (rice sits at 0.9999) — cap removed. Suite: `test_api.py` (health, invalid crop 400, non-image 415, golden ×10 with Grad-CAM PNG check, blurred photo → rejected with no diagnosis, banana photo sent as potato → uncertain + top-3) and `test_units.py` (severity on synthetic spotted leaves: 0/9% → early, 23% → moderate, 43% → severe — large solid brown areas are masked out by the Otsu leaf mask so the test uses scattered lesions; bucket edges; Grad-CAM PNG with a tiny fake model; quality verdict precedence; Mahalanobis formula; kNN/softmax/energy ordering; committed thresholds cover every crop). **33 passed in 14 s.** One test assumption fixed (a flipped vector's nearest prototype isn't its own).
- server: `app.js` exports the app, `server.js` only connects + listens. Controller: ML 415 → 400 "not a readable image", ML 400 → 400, other ML errors / unreachable → 502 with a safe message; 500s no longer leak `error.message`; multer upload errors → 400 (was Express default 500). Jest (ESM via `--experimental-vm-modules`) + supertest + mongodb-memory-server + nock (`disableNetConnect`, localhost only). 10 tests: missing file, missing crop, non-image, happy path saves Prediction (treatment + yield 50%), uncertain/rejected saved without treatment, ML 500 → 502 with no Cloudinary upload and nothing saved, ML unreachable → 502 (closed local port — nock's replyWithError hung with a streamed form-data body), ML 415 → 400, history (guest only, newest first, pre-gate records read as ok). **10 passed in ~2 s.**
- client: Vitest + React Testing Library + jsdom; 9 tests (ResultCard for ok / pre-gate record / uncertain / rejected_quality / not_leaf; Predict: 10 crops, asks for a photo, sends crop + file and shows result, shows server error message). Vitest's `vi.fn()` reported the mocked axios rejection as unhandled even though the component catches it → replaced by a plain recording function. oxlint: 0 errors, 10 pre-existing warnings (disabled-login leftovers in App.jsx, Navbar.jsx, AuthContext.jsx, Home.jsx — left alone). `vite build` OK. **9 passed.**
- `.github/workflows/ci.yml`: jobs ml-service / server / client, pip + npm caches, MongoDB binary cache, 10-min cap each, on push + PR. README: CI badge, "Running tests" section, "no tests" limitation replaced. Committed `ac04bba` on `chore/tests-ci`; pushed to origin with the user's OK (4 commits; main untouched).

---

## Task 6 — Local dev: DB connection + stale-backend debugging (26 Sep 2026)

**Goal:** get the local three-service stack (client/server/ml-service) actually working end to end for manual testing on `localhost`, after the guest-auth bypass had already landed (`3f0d9f7`).

**What happened**
1. User saw `/predict` on `localhost:5173` still returning "No token provided, authorization denied" after restarting the server with `npm run dev`.
2. `server/config/db.js` swallows the real Mongo error (`console.log("DB Error...")` only) — ran a standalone `mongoose.connect()` with the same `.env` to surface it: `querySrv ENOTFOUND _mongodb._tcp.cluster0.xtdsd3e.mongodb.net`. Confirmed with `nslookup` that general DNS works (`google.com` resolves) but that specific Atlas cluster hostname is NXDOMAIN — the cluster itself no longer exists (deleted/renamed in Atlas), not a network/DNS-provider issue. User was told to get a fresh connection string from the Atlas dashboard and update `MONGODB_URI`.
3. User then fixed the URI and DB connected, but the same "No token provided" error persisted in the browser. Checked `server/middleware/auth.js` — the guest-bypass fix was intact and committed (`git show HEAD:server/middleware/auth.js`), so the running Node process wasn't the problem.
4. Root cause: `client/.env` had `VITE_API_URL=https://server-211927486412.asia-south1.run.app/api` — the frontend was calling the **deployed Cloud Run backend**, not `localhost:4000`, the whole time. Any local server fix was invisible because requests never reached it.
5. Fix: `client/.env` → `VITE_API_URL=http://localhost:4000/api`, old value kept commented directly below for switching back to prod testing. File is gitignored (`.gitignore:6`), so this is a local-only change with no repo impact.

**Not yet verified:** a full click-through Analyze run against the corrected local stack (user was about to retry when this task entry was written).

---
- CI run 1 (`ac04bba`): ml-service ✅ 1.4 min (golden tests ran on Linux), server ✅ 0.3 min, client ❌ at `npm test` — vitest 5 / jsdom 30 / jest-dom need Node ≥ 22, job used 20 (local is 22). Fix `23ed4ee`: client job on Node 22 + `engines` in client/package.json; server job stays on Node 20 (= its Dockerfile).
- CI run 2: **all three jobs green** — https://github.com/h4anshu/AI-Plant-Disease-Detection-System/actions/runs/36219238570 (ml-service 1.1 min, server 0.3, client 0.3; ~1.5 min wall clock in parallel).
- Skipped / left as is: oxlint's 10 pre-existing warnings (disabled-login leftovers); GitHub's notice that actions/checkout@v4 & setup-node@v4 run on a deprecated Node 20 runtime (still works); no browser end-to-end test in CI (needs real Mongo/Cloudinary). Nothing had to be skipped in the suites themselves — weights are in git, so golden tests run in CI.

---

## Task 6 (continued) — Live site still broken after push: stale Cloud Run deploy (26 Sep 2026)

**Goal:** user reported the production site (`ai-plant-disease-detection-system.vercel.app`) still showed "No token provided, authorization denied" after the auth fix was pushed.

**What happened**
1. Confirmed `chore/tests-ci` had already been merged into `main` (`main` was at `964bd67`) and `server/middleware/auth.js` on `main` already had the guest-bypass fix — so the fix genuinely was in the repo.
2. Read the built JS bundle of the live Vercel frontend directly (fetched `index-*.js`, regex for `run.app`/`localhost` URLs) to confirm which backend it calls: `https://server-211927486412.asia-south1.run.app/api` — the Cloud Run service, as expected for prod (the earlier `client/.env` edit was local-only and correctly irrelevant here).
3. `curl`'d that Cloud Run URL directly — still returned `401 {"message":"No token provided, authorization denied"}`, proving the *running container* was stale, not the frontend or the code.
4. `gcloud run services list` showed the `server` service's last deploy was 2026-07-27, months before the auth fix — there is no CI/CD trigger wired to Cloud Run, so `git push` never redeploys it; deploys are manual (per README).
5. Checked existing service config before touching anything: all 6 env vars already set (`MONGODB_URI`, `JWT_SECRET`, `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET`, `FASTAPI_URL`); `gcloud` was already authenticated for project `plant-disease-503711`.
6. Asked the user for explicit confirmation before redeploying a production service; approved. Ran `gcloud run deploy server --source ./server --region asia-south1` (source-based deploy, no `--set-env-vars` so existing env vars carried over). New revision `server-00006-62k` deployed, serving 100% traffic.
7. Verified: `curl` to the same endpoint now returns `200` with real guest prediction history (a prior test record with `userId: "000000000000000000000000"` was already in Mongo, confirming the guest-bypass path had worked locally/against prod DB before this).

**Result:** live site's Analyze flow should now work without login. `ml-service` Cloud Run service was untouched (already current, last deployed alongside the new-crop heads).

---

## Task 6 — Model versioning + ONNX serving (26 Sep 2026, in progress)

**Goal:** every prediction records which model made it (`model_registry.json`, `model_version` in API + saved records, registry on `/health`); ONNX Runtime for CPU serving in a smaller image without losing Grad-CAM; parity gate (same argmax on ≥ 99.9% of held-out images, max prob diff < 1e-3); benchmark TF vs ONNX in Docker; slim non-root Dockerfile with exact pins. Work directly on `main` (user preference, overrides the brief's `feat/versioning-onnx`).

**Log**
- Key finding for the Grad-CAM decision: the heads sit on global-average-pooling of the backbone's last conv map, so d(class prob)/d(conv map) has a closed form from the head weights (softmax → Dense → ReLU → Dense → GAP). Grad-CAM can run in numpy on a second ONNX backbone output (the conv map) — no TensorFlow in the serving image at all. To be verified against the TF implementation.
- Export tooling: tf2onnx 1.17 + onnx 1.23 + onnxruntime 1.30 install into `.venv` next to TF 2.21 without conflicts (dry-run checked).

---

## Task 7 — Live site fix, round 2: stale token on a phone bypassed the guest fallback (26 Sep 2026)

**Goal:** user's phone still got blocked on the live site after the Task 6 Cloud Run redeploy, with a different message this time: `"Token is invalid or expired"` (not "No token provided").

**What happened**
- The phone's browser had a real JWT saved in `localStorage` from before login was disabled (client's `api.js` interceptor always attaches it when present). `server/middleware/auth.js`'s guest bypass only fired on a **missing** token (`if(!token)`); a present-but-invalid/expired one still fell into the `jwt.verify` `catch` and returned a real `401`.
- Fix: the `catch` block now also sets `req.user` to the guest ObjectId and calls `next()` instead of returning 401 — same reversible pattern (original 401 line commented directly below). One shared middleware, so this covers every route that uses it (`/predict`, `/predict` GET history), not just the one the phone happened to hit.
- Committed `25d86a0` on `main`, pushed, redeployed Cloud Run (`gcloud run deploy server --source ./server --region asia-south1` → revision `server-00007-8w9`, 100% traffic).
- Verified: `curl -H "Authorization: this-is-a-bad-token" .../api/predict` → `200` (was `401` before).

**Note for later re-enabling login:** both guest-fallback spots in `auth.js` (missing token, invalid token) need their commented 401/original logic restored together, not just one.
- Parity gate PASSED on all 4,536 held-out images: identical argmax 100%, max |prob diff| 4.1e-5 (limit 1e-3), OOD decisions 100% identical; numpy Grad-CAM vs TensorFlow: heatmap ≤ 0.006, final pixels ≤ 4/255. Tooling: `train/export_onnx.py` (from_keras — from_function left the normalisation constants as graph inputs; outputs renamed to image→features/conv, features→probs; each .onnx tagged with its source sha), `train/check_onnx_parity.py`, `model_registry.json` (all 1.0.0), `predict.py` on ONNX Runtime (no TensorFlow), `/health` returns the registry, `model_version` in every response and stored as `Prediction.modelVersion`; server tests updated. pytest 39 passed.
- **Incident: C: drive hit 0 bytes free** during the Docker build of the old TensorFlow "before" image; Docker Desktop crashed (`read-only file system`). Cleanup (user asked to remove everything unused and report): pip cache 2.82 GB, npm cache 6.07 GB, WSL `~/staging` 5.5 GB + `~/tfgpu` 6.7 GB + WSL pip cache 3.7 GB (inside the WSL disk), Docker build cache 10.86 GB (inside Docker's disk), temporary git worktree. C: went 0 → 10.9 GB free. The two virtual disks (WSL `ext4.vhdx` 21.4 GB, Docker `docker_data.vhdx` 20.4 GB) do not shrink when files inside are deleted (WSL disk switched to sparse + fstrim, no blocks released) — reclaiming that space needs admin compaction or moving them to D:.
- Docker benchmark (`train/bench_docker.py`, 2 CPU / 4 GB, same 6 crops, 2 runs each), deployed TF image `ml-service:v1` → new ONNX image: compressed size 924 → 184 MB (on disk 3.98 GB → 699 MB), cold start to first prediction 6.4-11.9 s → 2.6-4.3 s, RAM 588-615 → 148-161 MiB, p50 942-993 → 197-207 ms, p95 1,023-1,337 → 211-308 ms. The v1 image had no gate, ran as root and had unpinned requirements. The new image is multi-stage (TensorFlow only in the export stage), runs as non-root `app` and uses exact pins.
- Grad-CAM decision: closed-form gradient in numpy (the head is only GAP → Dense-ReLU → Dense-softmax), over keeping TensorFlow in the image or exporting a gradient graph. Written up with the parity table and the benchmark in `docs/SERVING.md`. README updated (export step before running the service or tests; `/health` and `model_version`).
- Tests: pytest 39 passed, Jest 10 passed, Vitest 9 passed. Committed on `main`, not pushed. Not deployed: Cloud Run still runs `ml-service:v1`.
- WSL Ubuntu disk moved to `D:\wsl\Ubuntu` by the user (`wsl --manage Ubuntu --move`, 21.4 GB, about 6 min to the D: HDD). Ubuntu verified working (user anshu, files intact). C: free 10.9 → 32.3 GB. Next: Docker Desktop disk image location → D:. Note: the GPU env `~/tfgpu` was deleted during the cleanup and must be recreated before any new GPU training.
- Docker Desktop disk image moved to `D:\wsl\docker\DockerDesktopWSL` by the user (Settings → Resources → Advanced, 20.4 GB). The engine stayed in the error state left over from the WSL move; `docker desktop restart` fixed it. All 5 images intact, and the `plant-ml:onnx` container answers /health. **C: free 0 → 52.7 GB.**
- **Deployed (by the user), 26 Sep ~15:10 IST:** Cloud Run `ml-service-00002-sx6` = `ml-service:v2` (ONNX) and `server-00008-6f5`, each with 100% of traffic. Live check: /health lists all 10 heads at 1.0.0; all 10 golden photos give the same disease and confidence as local (±0.02), each with Grad-CAM and `model_version`, ~150-400 ms warm. Before this, live ran the July v1 (6 crops, no gate), so the 4 new crops failed on the live site. Rollback: `gcloud run services update-traffic ml-service --region asia-south1 --to-revisions ml-service-00001-jfd=100`.

## Task 7 — Security hardening of the public deployment (login still disabled)

Brief: helmet/CORS/body limit, rate limits, upload validation + EXIF strip, generic errors, ML shared secret, guest history scoping, env validation, `docs/SECURITY.md`. The brief said branch `feat/security`; done on `main` per the user's standing preference. `server/middleware/auth.js` untouched.

Checked the brief's claims against the code first. All true except "errors return error.message": predict/history already returned generic messages; only `authController` (login disabled) still leaked it. The guest leak was real: every guest shares user id `000…000`, so history returned every guest's photos and diagnoses. A live count was blocked by the permission classifier (reading other people's data), so the finding stands on the code. The ML service was confirmed publicly callable.

What was done:
- **Guest history** (`middleware/guestDevice.js`, `client/src/services/api.js`): the browser keeps a `crypto.randomUUID()` in localStorage and sends `X-Device-Id`. Guest predictions save `Prediction.deviceId` (indexed); guest history filters on it. No id = empty history, malformed = 400. Old guest records (no id) are now visible to nobody. Marked `TODO(auth)` for migration.
- **Rate limits** (`middleware/rateLimit.js`, express-rate-limit 8.7): POST /api/predict 20 per 10 min, global 300 per 15 min, per IP, both env-configurable; `trust proxy 1` for Cloud Run. In-memory per instance (`ponytail` note). The user set Cloud Run `--max-instances 3` on ml-service.
- **Uploads** (`utils/image.js`, sharp 0.35): the real format comes from the bytes (libvips), so file-type wasn't needed; jpeg/png/webp only, ≤ 4000 px per side. The Cloudinary copy is auto-oriented and re-encoded without metadata (EXIF/GPS). The ML service still gets the original bytes, so predictions are unchanged. GPS hook marked `HOOK` (the field-location feature isn't built yet).
- **ML shared secret**: FastAPI `/predict-disease` checks `X-ML-Token` against `ML_SERVICE_TOKEN` with `hmac.compare_digest` (unset = open plus a startup warning); `/health` stays open. Express sends the header.
- **helmet**, CORS allowlist from `CLIENT_ORIGINS` (unset = any, local only), `express.json` 10 kB; body-parser errors return a generic 4xx.
- **Fail-fast env check** in `server.js`: base vars always; in production (Dockerfile now sets `NODE_ENV=production`) also `CLIENT_ORIGINS` and `ML_SERVICE_TOKEN`. `.env.example` updated. Server Dockerfile: `npm ci --omit=dev`, `USER node`.
- `docs/SECURITY.md` (covered / known limits / waiting for auth / GPS hook); README env section and limitations updated.

Tests:
- New server tests: text-as-JPEG, GIF-as-JPEG and >4000 px each give 400 with no ML call; PNG/WebP accepted; EXIF stripped; the ML call carries the token (nock `matchHeader`); history scoped per device (upper/lower-case id, other guest, legacy guest, signed-in user); no id = []; malformed id = 400; new prediction visible only to its device. `hardening.test.js` loads the app with limit 3: the 4th POST gives 429, /health is unaffected, CORS allows only listed origins, helmet headers present, 20 kB JSON gives 413 with a generic message.
- ML: shared-secret test. Client: device-id interceptor test.
- Totals: pytest 40, Jest 21, Vitest 10 passed.
- Docker smoke test of the server image: missing vars list all 8 names and exit; headers present; a fake JPEG is rejected by sharp in the container; runs as `node`.
- **Deployed by the user (26 Sep, 15:47 / 15:49 IST, server first, then ML):**
  - `server-00009-crl` has `ML_SERVICE_TOKEN` and `CLIENT_ORIGINS`; `ml-service-00004-f8c` = `ml-service:v3` with `ML_SERVICE_TOKEN`; `main` pushed and Vercel serving the new client (bundle sends `x-device-id`).
  - Live checks:
    - ML `/predict-disease` without token or with a wrong one → 401; `/health` still 200.
    - Server sends HSTS, nosniff and RateLimit-Policy 300/15 min.
    - CORS preflight from the Vercel origin → 204 and allows `x-device-id`; other origin → no allow-origin header.
    - A fake JPEG → 400 before any ML, Cloudinary or DB work.
  - Not checked by me: a real prediction through the site (it would write to prod MongoDB and Cloudinary) — left to the user.

## Task 8 — Free-tier deployment readiness

Brief: production Dockerfiles, `docs/DEPLOY.md`, Grad-CAM out of MongoDB, cold-start handling, Vercel, a GitHub deploy workflow (WIF), and a demo-mode banner. Done on `main` (the user's preference) instead of `feat/deploy`.

Assessment first: the app was already live on exactly this stack, so Vercel (#5) was done. Measured the base64 Grad-CAM stored per record at 75–127 KB (average 106), which fills the 512 MB Atlas M0 after about 4,800 predictions, and every history call shipped all of it. Also found the Cloudinary photo copy stored at up to 4000 px (2–4 MB), plus 1.7 GB in Artifact Registry (free: 0.5 GB; the TF `v1` image alone is 923 MB). Live Cloud Run config: server timeout 60 s (same as its ML call timeout), ML 2 CPU / 4 GiB / concurrency 1.

What was done:
- **Grad-CAM → Cloudinary** (`plant-disease/gradcam`), uploaded in parallel with the photo; `Prediction.gradcam` now holds the URL (the client accepts URL or legacy base64). History excludes `gradcam`, returns 50 per page, `?before=<createdAt>` for older pages (client "Load older checkups"). `server/scripts/migrate-gradcam.js`: dry run by default, `--apply` uploads each legacy heatmap and replaces it with the URL; idempotent (dry run checked on an in-memory DB: counted 2 legacy records, skipped URL, null and missing).
- **Stored photo downsized** to ≤ 1280 px (the ML service still gets the original bytes).
- **Cold starts**: the server retries the ML call once after 1 s on 429/502/503/504 or a connection error, never after its own 60 s timeout; the form is rebuilt per attempt. The client shows "Waking up the model…" after 8 s.
- **Demo-mode banner** in `App.jsx` (`TODO(auth)`).
- **ML Dockerfile** honours `$PORT` (shell-form `exec uvicorn`). A Docker HEALTHCHECK was skipped: Cloud Run ignores it.
- **`docs/DEPLOY.md`**:
  - a beginner PowerShell path: the manual-steps list, APIs, Artifact Registry with a cleanup policy (`docs/artifact-cleanup-policy.json`), Atlas, Cloudinary, Secret Manager helpers (no trailing newline, random generation for JWT/ML token), IAM secretAccessor;
  - deploy flags chosen from the benchmark: ML 2 vCPU / 1 GiB / concurrency 4 / 0–3 instances / cpu-boost; server 1 vCPU / 512 MiB / timeout 180;
  - Vercel, checks, the upgrade path for the live deployment, rollback, cold starts;
  - the cost table: about $0 at 1,000 predictions/month;
  - GitHub Actions + WIF left as a documented TODO.
- Tests:
  - new Jest: heatmap uploaded to Cloudinary and saved as a URL; a cold-start 503 retried once; a second 503 not retried; photo downsized to 1280×853; history drops `gradcam`, pages 50 + 5, bad `before` gives 400;
  - new Vitest: the waking-up note appears at 8 s and clears with the result;
  - totals: pytest 40, Jest 25, Vitest 11; client build OK; banner checked in the browser.
- **Deployed by the user (26 Sep, ~16:05 IST).** My own deploy attempt was blocked by the auto-mode classifier (Production Deploy).
  - `ml-service-00005-mcn` runs `ml-service:ba8e527`: 2 CPU, 1 GiB, concurrency 4, timeout 60, cpu-boost, max 3.
  - `server-00010-nt6`: 1 CPU, 512 MiB, timeout 180, cpu-boost, max 3; env vars kept.
  - CI green on `ba8e527`.
- Live checks:
  - ML /health 200 in 0.27 s (10 heads);
  - /predict-disease without the token → 401;
  - server /health 200;
  - history `?before=nonsense` → 400 (the new code is live);
  - Vercel bundle has the banner and the waking-up note.
- Migration dry run against prod: 0 records still hold base64 (all old heatmaps now in Cloudinary).
- Still optional (DEPLOY.md Part C): secrets → Secret Manager; registry cleanup policy (about 1.7 GB against 0.5 GB free).
- **Live check by the user:** a wheat photo on the live site gave HealthyLeaf 98.4% with treatment and the heatmap (served from Cloudinary). Works end to end.
- **Registry cleanup (run by the user, 26 Sep; I only prepared the list, since deleting is irreversible):**
  - Deleted: ML `v1` (923 MB) and `v2`, the July server `v1`, and 3 older source-deploy server builds.
  - Kept: the live images plus one rollback each — ML `ba8e527` and `v3`; server `15d89f3` and `aba1923`.
  - Cleanup policies are active on both repositories: keep the 6 newest versions (one ML push = image + attestation + index), delete older than 14 days.
  - Right after the deletion, `describe` still reported 1,221 MB for `plant-disease`; the layers of deleted images are garbage-collected asynchronously. Expected about 0.2 GB + 0.17 GB once collected.
  - Both services healthy after the cleanup.

## Task 9 — Monitoring and the feedback loop

Brief: structured logs with request ids, Sentry, uptime and drift report, "Was this correct?" feedback, and a relabel export. Done on `main` instead of `feat/monitoring-feedback`.

Assessment first: feedback and relabeling are the most valuable part, since in-field accuracy was never measured. Sentry is needed only in the browser: on Cloud Run, Error Reporting already groups structured error logs for free. UptimeRobot pings also keep the instances warm, at no cost.

What was done:
- **Feedback**:
  - `Prediction.feedback` (correct / incorrect / unsure), `correctedLabel`, `feedbackAt`.
  - `PATCH /api/predict/:id/feedback`, scoped to the owner (a guest only reaches their own device's records; others get 404). Label validation: the crop's class or "Other", and only with "incorrect". Re-answering replaces the earlier answer.
  - `GET /api/predict/classes` comes from the treatment map; a test checks it equals `ml-service/data/label_maps.json`.
  - Client `Feedback.jsx` under a diagnosis: Yes / No / Not sure; "No" opens a native select with the crop's classes plus "Other".
- **Relabel export**: `ml-service/train/export_relabel_queue.py` (pymongo 4.18.2 in `requirements-export.txt`). It exports incorrect/unsure feedback and uncertain predictions to CSV, with reviewer columns and no device ids. The reviewed-CSV-to-training steps are in `docs/MONITORING.md`.
- **Logging**:
  - Server: pino JSON (`severity`/`message`/`time` for Cloud Logging) and my own request-id middleware (pino-http's default serializers would log headers and IPs). The browser sends `x-request-id`; the server reuses or validates it and forwards it to ML. `prediction` and `feedback` log lines; errors carry `stack_trace` for Error Reporting.
  - FastAPI: JSON formatter, request middleware, prediction log; uvicorn access log off (`--no-access-log`, it logged client IPs).
- **Bug found in the local e2e run and fixed**: the prediction log field `severity` (disease severity, e.g. "early") overwrote the log-level `severity` in both services. Renamed to `diseaseSeverity`; the ML formatter now writes reserved keys last; tests assert both.
- **Drift report**: `server/scripts/drift_report.js` (`driftReport()` + CLI; `--sample` runs on an in-memory DB). Per crop per day: count, mean confidence, uncertain and rejected shares, incorrect feedback. Flags a crop when it is more than 10 points below its 14-day baseline, needing at least 5 predictions on each side; exit code 2 when flagged.
- **Sentry**: client only, lazy `import('@sentry/react')` only when `VITE_SENTRY_DSN` is set (no chunk built otherwise; 30 kB gzip chunk when set), `sendDefaultPii: false`.
- `docs/MONITORING.md` covers log fields and queries, Error Reporting, Sentry setup, UptimeRobot monitors, the drift report and the relabel loop. README links it.

Tests and checks:
- New: Jest `feedback.test.js` (12 cases: classes = label maps, correct / incorrect / Other / replace, 5 invalid bodies, other device, no device, signed-in record, malformed id, log without image or device) and `drift.test.js` (2 cases); the predict tests check request-id propagation and log privacy. pytest: request id, JSON format, prediction log without image, `to_row`. Vitest: `Feedback.test.jsx` (3 cases).
- Totals: pytest 46, Jest 43, Vitest 14; lint unchanged (10 old warnings); build OK.
- **Local end-to-end** (nothing left the machine: in-memory MongoDB, a Cloudinary stand-in via the SDK's `upload_prefix`, local ML on 8010, server on 4010, client on 5180):
  - predict wheat golden photo → BlackPoint → "No" → WheatBlast → PATCH 200 → thank-you note;
  - the same request id appears in the server and ML logs;
  - the drift report on that DB shows `feedbackIncorrect: 1`; the relabel export CSV has the row with the correction and model versions.
- `npm audit` shows 3 old high findings (nanoid, react-router); split off as a separate task.

## Client dependency security fixes (npm audit)

`npm audit --omit=dev` in `client/` reported 3 high-severity findings:
- `nanoid` < 3.3.18 (custom generators can loop forever when size is 0), pulled in by vite → postcss;
- `react-router` / `react-router-dom` 7.12.0–7.18.1 (RSC-mode CSRF bypass; the app doesn't use RSC mode but was still in range).

Fixed with `npm audit fix`, patch releases only:
- react-router and react-router-dom 7.18.1 → 7.18.4;
- nanoid 3.3.16 → 3.3.19;
- `package.json` minimum raised to `react-router-dom ^7.18.4`, so a lock-less install can't resolve a vulnerable version.

`npm audit` (incl. dev) now reports 0 vulnerabilities. lint exit 0 (the 10 old warnings only), Vitest 4 files / 14 tests pass, build OK.

Note: `npm audit fix --omit=dev` also prunes devDependencies from `node_modules` (oxlint disappeared). The lockfile was fine; `npm install` restored them. `npm ci` couldn't wipe `node_modules` while the running Vite dev server on :5173 held Tailwind's native `.node` file.

## Task 10 — Hindi + English UI

Brief: i18next with a language switcher, farmers' Hindi names for crops/diseases/severity marked `needs_review`, Hindi treatment advice via Accept-Language with an English fallback (never machine-translated at runtime), Noto Sans Devanagari, a 360 px check, and `docs/TRANSLATION_REVIEW.csv`. Done on `main` instead of `feat/i18n-hi`.

What was done:
- **Client**:
  - i18next 26.4 + react-i18next 17.0. `src/i18n.js`: the choice is saved in localStorage `lang`, the default comes from `navigator.language`, `<html lang>` is set.
  - `locales/en.json` + `hi.json`: every user-facing string of Home, Diagnose, the result card, retake tips, Feedback, History, Navbar, the banner and the sign-in-disabled page. The Login/Register forms aren't routed while login is off, so they stay English (TODO(auth)).
  - `locales/terms.json` + `terms.js`: crop, disease and severity names (`en`, `hi`, `source`, `needs_review`), keys = ML label maps.
  - Navbar switcher `EN | हिं`, always visible (also next to the phone menu button).
  - Axios sends `Accept-Language`.
  - Result card shows a "not yet checked by an expert" note when `treatmentNeedsReview`.
- **Hindi content**, all drafted by Claude and flagged honestly, with sources as "drafted from general knowledge" / "transliteration" / "descriptive" (no invented citations):
  - farmer terms: e.g. अगेती/पछेती झुलसा, झोंका, टिक्का रोग, कंडुआ, रतुआ (गेरुई), उकठा, पीला मोज़ेक, चूर्णिल आसिता;
  - 53 treatment texts plus the fallback. Chemical and product names stay in Latin script, and doses are unchanged.
- **Server**:
  - `utils/treatmentMap.hi.js` (per entry `text`, `needs_review`, `source`);
  - `localizedTreatment(crop, disease, lang)`; the controller answers the advice in the `req.acceptsLanguages('en','hi')` language with `treatmentLanguage` / `treatmentNeedsReview`, `Content-Language` and `Vary: Accept-Language`;
  - MongoDB keeps English and no other field changes. History is localized too.
- **Review list**: `server/scripts/translation_review.js` (`npm run translation-review`) → `docs/TRANSLATION_REVIEW.csv`, 121 open entries, UTF-8 with BOM for Excel, LF (per `.gitattributes`). A test fails if the CSV is stale.
- **Font / layout**:
  - Noto Sans Devanagari added second in every font stack.
  - `:lang(hi)` rules: no letter-spacing (it breaks conjuncts), 10–11 px labels raised to 12 px, taller headings (matras), no fake italic, body font instead of monospace (wide spaces between Hindi words, noticed in the 360 px check).
  - History stat labels kept together with their values.
- Checks:
  - Tests:
    - Vitest `i18n.test.jsx`: hi keys = en keys; terms cover the label maps; switcher + localStorage + `<html lang>`; browser default vs saved choice; Hindi result card + review note; Accept-Language header.
    - Jest `i18n.test.js`: coverage, **every number/dose in each English text appears in its Hindi text** (53 cases), chemical names kept and no invented Latin words (53 cases), fallback, CSV freshness. `predict.test.js`: hi / en / fr / no header, and history in Hindi.
    - Totals: Vitest 21, Jest 158, pytest 46; lint and build OK.
  - Local offline end-to-end run at 360 px (in-memory DB, Cloudinary stand-in, local ML):
    - Hindi home, Diagnose (crop buttons, potato → अगेती झुलसा, Hindi advice + review note, heatmap, yield, feedback picker with Hindi disease names → "धन्यवाद…"), History, sign-in-disabled page and the phone menu;
    - English after switching back;
    - no horizontal overflow on any page.

## Task 11 — Disease map with consent-first location (first geospatial feature)

Brief: consent-first location (GPS, EXIF fallback, skip); a private GeoJSON point + 2dsphere index; an H3 aggregation API with suppression; a Leaflet/OSM map page; a privacy note + DELETE; a demo seed. Done on `main` instead of `feat/geo-map`.

**Three changes agreed with the user, for privacy:**
1. Suppression counts **distinct browsers** (at least 3), not reports: one farmer checking 3 leaves would otherwise be alone on the map. Guests without a device id count as one.
2. **Fixed time windows** (7 / 30 / 90 days): free-form windows could be subtracted to isolate one report.
3. The "done when" goal (one real prediction shows up) contradicts suppression, so it was proved with 3 browsers instead.

**Server**:
- `utils/geo.js`: `parseLocation` (range and NaN checks, `none` stores nothing), H3 resolution 7 (5.16 km²), `cellPolygon` (h3-js 4.5 already returns a closed ring; a double closing point was caught by a test).
- `Prediction`: `location` (GeoJSON Point, 2dsphere), `locationAccuracyM`, `locationSource`, `geoCell` (indexed), `demo`.
- The predict route validates the location before the ML call.
- `toResponse` strips location, accuracy and cell from every response, including history.
- `GET /api/map/reports`: returns a FeatureCollection of hexagons with only `{reports}`; `Cache-Control: public, max-age=60`. It counts `ok` diagnoses; healthy leaves only when asked for by name. `crop`/`disease`/`days` are validated, and repeated params (arrays) are rejected.
- `DELETE /api/predict`: this browser's records + Cloudinary photos/heatmaps (`publicIdFromUrl` + `uploader.destroy`, allSettled). A failed image delete is logged, never a lost record.
- `scripts/seed_demo_map.js`: seeded RNG, 15 real farming districts with fake farmers, `demo: true`, placeholder image; refuses non-local URIs and production; `--clear`.
- The drift report and relabel export skip demo records.

**Client**:
- `components/LocationConsent.jsx`: why, what's public, Share / Skip, the choice remembered, "Change" at any time.
- `services/location.js`: GPS (10 s timeout) → EXIF via lazily imported exifr → none; only called after consent.
- `pages/MapPage.jsx`:
  - loaded lazily (Leaflet 153 kB only on /map);
  - OSM tiles + attribution (tile policy noted);
  - hexagons coloured in 4 bins from 3, a legend, crop/disease/time filters;
  - fits to the reported areas (max zoom 9);
  - dots on hexagon centres below zoom 8 (a 5 km² hex is a few pixels at country zoom; the centre is already public);
  - no wheel zoom (it hijacked page scrolling, found while testing);
  - a demo-data warning.
- `pages/Privacy.jsx`: stored / public / location / delete, with a two-step confirmation.
- Nav gets Map + Privacy. All new strings are in en + hi, with i18next plurals ("1 checkup").

**Tests**:
- Jest `map.test.js` (30 cases):
  - aggregation GeoJSON without raw points or device counts;
  - suppression by browsers vs reports; null device = one browser;
  - crop/disease/window filters; healthy and uncertain excluded;
  - 400s for bad days/crop/disease/array params;
  - demo excluded / included only non-prod;
  - location stored but never returned (predict + history); `none` ignores coordinates; EXIF without accuracy; 6 invalid inputs → 400 before ML;
  - DELETE removes only own records + calls Cloudinary destroy, and the map re-suppresses; no device → 400;
  - `isLocalMongo` cases; seeded data flagged and partly suppressed.
- Vitest: consent flow (asked, sent only after Share, remembered, Skip → none, never read without consent); `getLocation` GPS / EXIF / none; map colour bins; Privacy two-step delete + failure.
- Totals: Jest 187, Vitest 28, pytest 46; lint and build OK.

**Local offline end-to-end run** (in-memory DB, Cloudinary stand-in, local ML):
1. The map was empty; 2 browsers reported near Ludhiana via the API and the map stayed empty (suppressed).
2. A 3rd, real prediction through the UI (consent → Share; geolocation replaced in the page with a fixed test point, so no real location was read) returned `locationSource: gps` with no coordinates in the response.
3. /map after one load showed the Ludhiana hexagon, popup "3 reports in this area".
4. Privacy → delete → "Deleted 1 checkup", and the map is empty again.
5. Demo mode: the seed refused an Atlas URI (exit 1), inserted 267 demo records locally; with `MAP_INCLUDE_DEMO`, 7 district cells are shown (the rest suppressed) under a Hindi demo warning.
6. At 360 px in Hindi, the map, privacy page and consent box have no horizontal overflow.


## Task 12 — Field health from space (Earth Engine)

Brief: GEE setup doc; a field-health endpoint (ALU or 30 m buffer; S2 SR harmonized + SCL mask; per-date field NDVI/NDRE with ≥60% clear; a 1 km WorldCover-cropland neighbourhood; z-score + plain flag; Mongo cache; EECU logging); a client chart; mocked-EE tests + a geemap notebook; REDSI stretch; no credentials in git; cloudy kharif handled; the endpoint working for 3 real coordinates. Done on `main` instead of `feat/field-health`.

**Setup with the user (26 Sep):**
- Earth Engine registered noncommercial via BBDU, Community tier, on `plant-disease-503711`. The first attempt was on the wrong project (`crop-yield-prediction`), caught from a screenshot.
- `earthengine authenticate` was blocked by Google, so local sign-in uses gcloud ADC with the earthengine scope.
- `geo-service` service account with `earthengine.viewer` + `serviceUsageConsumer`; no key file anywhere; `.gitignore` blocks `*-key.json`.
- Daily quota: EECU-seconds per day = 18,000 (the month ÷ 30). 7,200 would have been too tight.
- ALU: not available (it needs a Workspace GWCID), so the 30 m buffer is used and reported as `geometry_source`.
- Coordinates: the user picked points on Google Maps; each was checked against WorldCover. Anantapur's first point was grassland (4% cropland), so a cropland point 12 km SE was found with Earth Engine and the user confirmed it on the map.

**Design:**
- A **separate geo-service** (FastAPI, earthengine-api 1.7.45): Earth Engine calls take 2–30 s and use their own credentials; inside ml-service they would block the CPU-bound diagnosis workers.
- The Express server owns the cache (it already has MongoDB); the geo-service stays stateless, with no DB secrets.
- **POST** with the location in the body, because Cloud Run logs every URL. GET stays for the notebook.
- Public route `GET /api/predict/:id/field-health`: owner-only, reads the private location from Mongo, so no coordinates appear in any public URL.
- Cache: key = `sha256(lat, lon to 4 decimals, date, 120 d, crop)`, 30-day TTL. "Delete my data" removes the entries.
- `fieldLimiter`: 10 per 10 min per IP.

**Method** (`geo-service/field_health.py`, docs/FIELD_HEALTH.md):
- One EE request per answer: per image, the field clear fraction (SCL 4/5/6/7) and mean NDVI (B8, B4), NDRE (B8A, B5), plus REDSI (B4/B5/B7, Zheng 2018 eq. 5; lower = more rust) for wheat only.
- Ring 100 m – 1 km, WorldCover class 40, p25/p50/p75 + count.
- Plain-Python `summarize`: merges same-day tiles (keeps the clearer), requires ≥60% clear, ≥50 ring pixels, robust z = (field − median)/(IQR/1.349).
- Flags: `below` (2+ consecutive z ≤ −1, since the first), `below_once`, `normal`, `above`, `no_neighbours`, `no_clear`; stale if the last clear image is more than 20 days old.
- The REDSI formula was verified from the paper (PMC5877331), not from memory.

**Client**: `FieldHealth.jsx`
- Loaded only on click, so no quota is spent unasked.
- A dependency-free SVG chart: NDVI line, dashed NDRE, grey neighbours' band, a dot per clear image.
- The flag sentence (clay when below), a stale note, and "the satellite shows stress, not which disease; the leaf photo tells which disease", the clear-image count and the 30 m-circle note.
- A REDSI mini-chart for wheat labelled experimental; en + hi strings.

**Real Earth Engine results** (window 29 May – 26 Sep 2026, all HTTP 200 in 2.4–7.4 s):

| Field | Images | Clear | Latest NDVI | z | Verdict |
|---|---|---|---|---|---|
| Mullanpur Dakha paddy | 31 | 16 | 0.60 | 0.01 | normal |
| Kolhapur sugarcane | 31 | 10 | 0.81 | 0.73 | normal |
| Anantapur groundnut | 30 | 6 | 0.28 | 0.82 | normal |
| Samrala | 55 | 29 | 0.65 | 0.10 | normal |
| Ludhiana city field | 31 | 15 | 0.26 | −0.44 | normal (only 1.8–6.1 k cropland px) |
| Kolhapur 1 Jul – 10 Aug | 11 | 0 | — | — | `no_clear` ("No clear satellite view") |

- The Punjab series shows a real paddy cycle: transplanting flood in late June (NDVI 0.08), a monsoon gap mid-July to mid-August, a peak of 0.85 in September.
- **Measured cost: about 3 EECU-seconds per check** (Cloud Monitoring, workload tag `field-health`: 24.3 EECU-s for ~9 calls). docs/GEE_SETUP.md updated with this.

**Tests and checks:**
- geo-service pytest 22: logic on a **recorded real EE answer** (paddy fixture, statistics only) and synthetic rows (same-day merge, cloudy skip, robust z, each flag, stale, REDSI only when asked); API tests for GET/POST, clamped future date, 6 invalid inputs, token, EE timeout → 502 / quota → 503, no credentials → 503.
- Two failures found and fixed on the way: the endpoint built an EE geometry just to name the geometry source (it needed an initialised EE), so `query_rows` now returns it.
- Server Jest 193 (+6): POST body + token, then cache hit; no location → 409; other device / no device / bad id → 404; geo 503/500 → friendly 503/502 with nothing cached; unconfigured → 503; delete purges the cache.
- Client Vitest 33 (+5): loads only on click; verdict, chart and explanation; cloudy → no chart; wheat REDSI; error message; offered only with a location.
- `geo-service/notebooks/explore_field.ipynb` (geemap): field/ring/cropland map layers, SCL, the index table, the same chart; executed end to end with outputs saved.
- Browser, local stack at 360 px: rice checkup with location → "See this field from space" → real EE via local server + geo-service → "In line with neighbouring fields", NDVI/NDRE chart, 16 of 31 clear; Hindi renders (text checked, no overflow).
- CI: new `geo-service` job (mocked EE, no credentials).
- Totals: ml-service pytest 46 unaffected by the geemap install; lint + build OK.

**Live check by the user (26 Sep, 19:50 IST)**, a phone on the live site: the field-health card worked end to end (the verdict "Below neighbouring fields since 9/6/2026", chart, 6 of 31 clear). It revealed 2 problems, both fixed:
1. **Not a field.** The "field" NDVI stayed at 0.07–0.23 all season, so the location was most likely a home or town, not a field. The "below" verdict was confident but meaningless.
   - Fix: measure the farmland share of the 30 m circle (WorldCover) in the same single EE request; under 50% gives `not_farmland` with no verdict.
   - Apple and banana count tree cover (class 10) as farmland, for the field and its ring.
   - A bug found while testing this: a FeatureCollection nested in an `ee.Dictionary` comes back from getInfo() without features (every farm turned `no_clear` in 0.5 s). It's now a property on the FC, still one request.
   - Real re-check: Mullanpur 0.94 → normal; Kolhapur 1.0 → normal; Anantapur 1.0 → normal; Ludhiana town centre 0.0 → `not_farmland`.
2. **"9/6/2026" was ambiguous** (read as 9 June in India, meant 6 Sep). Dates are now `en-IN` with the month name ("6 Sept 2026").

Also: the server cache key now includes `FIELD_METHOD_VERSION = 2`, so the old cached "below" answers are not served; the notebook is updated and re-run; FIELD_HEALTH.md has an "Is it a field at all?" section. Tests: geo 24, server 193, client 34.
**Needs a redeploy:** geo-service (new logic) + server (cache version), then a push (client).

## Task 13 — Weather-based disease risk: potato late blight, rice blast (26 Sep 2026)

Brief: a daily risk indicator with a 3-day outlook for potato late blight and rice blast, from **published models, not invented rules**; research and cite first (docs/DISEASE_RISK.md); Open-Meteo hourly + past days, cached per location per hour; `GET /disease-risk?lat=&lon=&crop=` with per-day level, driving conditions and citation; a strip on the result page and the map page labelled "risk indicator, not a forecast of infection"; unit tests on every threshold edge; an unsourced rule is not shipped. Done on `main`.

**Research first** (committed alone as `5630668`, docs/DISEASE_RISK.md, every rule with its source link and limits):
- **Potato, drives the level: INDO-BLIGHTCAST** (ICAR-CPRI, Govindakrishnan et al. 2016, Int J Pest Management 62(4)). 7-day sum of P-days > 52.5 and 7-day sum of night mean RH > 525; 7 consecutive favourable days = high, favourable today = medium. P-days per Sands et al. 1979 (7/21/30 °C, weights 5/8/8/3). Needs 13 days of history → 14 past days fetched.
- **Potato, supporting: Wallin severity values / BLITECAST** (UMaine Bulletin #2418): SV per RH ≥ 90% period, 7-day total → spray interval (5-day / 7-day / 10+ day, lower thresholds with ≥ 30 mm rain). The flattened UMaine table was reconstructed; its rows are one formula, SV = floor((h−1)/3) − k (k = 4/3/2 by whole-°F band).
- **Rice, drives the level: Yoshino (1979) infection hours** (as used in Katsantonis et al. 2017; Nettleton 2019): 5-day mean 20–25 °C, rain < 4 mm/h, wet run ≥ base wet hours(T) + 4 h. Daily infection hours: < 3 low, 3–5 medium, ≥ 6 high. Leaf wetness proxy RH ≥ 90% or rain ≥ 0.1 mm (Sentelhas et al. 2008) because Open-Meteo has no measured wetness (its `leaf_wetness_probability` is undocumented, so unused).
- **Rice, supporting: Padmanabhan (1965), CRRI Cuttack** (now ICAR-NRRI): Tmin < 24 °C with high humidity for 4+ days.
- Researched and not used (reasons in the doc): Hyre, JHULSACAST, Kapoor 2004, BLASTAM, EPIBLA.

**Server:**
- `server/utils/diseaseRisk.js`: pure functions, no I/O: `dailyAggregates` (a day needs ≥ 20 hours; the night is 18:00–05:00 and needs ≥ 10 hours), `pRate`/`pDay`, `indoBlightcast`, `wallinSV`/`wallinDaily`/`blitecastInterval`, `baseWetHours`/`isWet`/`yoshinoHours`/`yoshinoLevel`, `padmanabhanStreaks`, `MODELS` (names, citations, links) and `assess(crop, weather, today)` → past 2 days, today, next 3, each with level + conditions. A day without enough data is `null` ("–"), never a guess.
- `server/services/openMeteo.js`: the point is snapped to a 0.05° grid (~5 km) before it leaves the server; hourly temperature, RH and rain with `past_days=14`, `forecast_days=5` (the 5th day completes the 3rd outlook day's night), `timezone=auto`; Mongo `WeatherCache` keyed by grid cell + UTC hour, 3 h TTL. Attribution string "Weather data by Open-Meteo.com (CC BY 4.0)".
- Routes: public `GET /api/disease-risk?lat=&lon=&crop=` (400 for a bad crop or coordinates) and owner-only `GET /api/predict/:id/disease-risk` (reads the checkup's private location; 404 not yours, 409 no location, 422 crop without a model). Open-Meteo down → 502 with a plain message. `riskLimiter` 60 per 10 min per IP (`RISK_RATE_LIMIT`).

**Bugs found while building:**
- `dailyAggregates` created a phantom day before the first date (early-morning hours belong to the previous night), shifting every window by one. Now only dates that have their own hours are kept.
- With `forecast_days=4` the last outlook day for potato was always "–" (its night was cut off), so it's now 5.
- Two test-arithmetic slips in my own expected values (base wet hours 9.928 at 24 °C, 11.202 at 20 °C); the code was right.

**Client:** `client/src/components/RiskStrip.jsx`
- 6 cells (past 2 dimmed, today outlined, 3 ahead), coloured low / medium / high / "–"; the label; a "Why?" section with today's driving numbers against their thresholds (P-days and night-RH sums, favourable run, Wallin SV + Blitecast interval; or infection hours and the Padmanabhan streak); the model citation link, the supporting model link and the Open-Meteo CC BY link.
- Result page: potato and rice checkups with a GPS/EXIF location. Map page: when the crop filter is potato or rice, for the map centre once zoomed to district level (zoom ≥ 7; otherwise "zoom in"); it reloads when the map stops moving.
- en + hi strings (`risk.*`), including the Blitecast intervals; the Privacy page now says a point rounded to ~5 km goes to Open-Meteo.

**Tests and checks:**
- Server Jest 249 (+56 in `diseaseRisk.test.js`), all on hand-made hourly series: P-day cardinal points; INDO exactly at the thresholds (14 °C → 52.5 and RH 75 → 525 are *not* favourable; 14.1 / 75.1 are), medium for runs 1–6, high at 7, a cold day resets the run, the night window; Wallin band edges in °F with rounding, the date a period is counted on, every Blitecast interval edge; wet-proxy edges; base wet hours; the first infection hour at 24 °C; 5-day mean 19.9 / 20 / 25 / 25.1; rain 3.9 vs 4.0; DIWH level edges; Padmanabhan streak edges; API: grid snapping, the per-cell-per-hour cache, 400s, 502, the checkup route 200 / 409 / 422 / 404 with no coordinates in any answer.
- Client Vitest 38 (+4): six cells, today, "–", label, the "Why?" numbers, links; rice conditions; the error message; the result card shows it only for potato/rice with a location.
- ml-service pytest 46, geo-service pytest 24 unchanged; client lint (only old warnings) + build OK.
- **Browser, local stack with real Open-Meteo:** Map → Potato (Hindi UI) → the zoom hint at country zoom; at district zoom over central India: high for all 6 days, "Why?" = 60.2 P-days, night RH 672, 9 favourable days, Wallin SV 20 with 71.4 mm → 5-day interval. Rice at the same point: high, high, high, then low as the wet spell ends. At 375 px: no horizontal scroll, all six cells fit (45 px each).
- Earlier real-weather sanity check: Shimla hills potato high; plains potato low (too hot, P-day sums 22–31); Cuttack and Kangra rice low (5-day mean above 25 °C). A known limit written in the doc: Yoshino was built in temperate Japan.

**Needs a deploy:** server only (new routes), then a push for the client. Nothing new in env; Open-Meteo needs no key.

**Live (26 Sep 2026):** server `00015` deployed and `main` pushed by the user. Checked: the public API answers (potato Shimla high ×6, rice Cuttack low ×6, wheat 400 with the list of supported crops), the Vercel bundle contains the strip, and the live Map page (Potato, district zoom over central India) shows six days, the label, the "Why?" numbers (24.4 P-days, too warm → low) and the citations.

## Task 14 — One-click PDF field report (26 Sep 2026)

Brief: a PDF per diagnosis for insurers, banks and FPOs. Header (report id, IST time, model_version); photo + Grad-CAM; diagnosis, confidence, status; severity; yield loss with its confidence tag and source note; rounded location with a small static map; NDVI/NDRE chart and last clear image date; weather risk; treatment; a limitations box; a SHA-256 for tamper evidence. Choose and justify the renderer for Cloud Run; `GET /api/predict/:id/report.pdf` (device-scoped); English, and Hindi since Task 10 is done; a template snapshot test and `docs/sample_report.pdf`. Done when the sample looks professional and every number traces to an API field. Done on `main` instead of `feat/field-report`.

**Agreed before building** (my assessment, the user said proceed):
- PDFKit, not Playwright (see below).
- The snapshot runs on the report content object, since there is no HTML template.
- `yieldLossConfidence` added to the API.
- A stored hash plus a public verify endpoint, because a printed hash alone proves nothing.
- The field section uses the cache only, so no Earth Engine quota is spent.

**Renderer: PDFKit** (measured):
- About +25 MB in node_modules plus 1.7 MB of fonts, against about +300–450 MB for Chromium.
- 0.12 s to import, 0.1–0.3 s per report, about 70 MB of memory while drawing: it fits the server's 512 MiB, where Chromium needs about 1 GiB.
- The risk was Hindi shaping. It was tested *first* with a scratch render: fontkit's Indic shaper got क्षेत्र, प्रतिशत, धर्म, कार्य, द्वारा, कि and ज़्यादा right. The only gap was Latin letters missing from the Devanagari font.
- Built the server Docker image and rendered a Hindi report inside it: works (fonts are bundled; the slim image has none).

**Server:**
- `utils/reportContent.js`: pure `buildReport()`. It is built from the same `publicView()` of the checkup that the API returns (refactored out of `toResponse`). Every row is `{label, value, source}` with its API route and field. It also has en + hi labels, IST times, the location rounded to 0.01°, a stable-JSON `contentHash()`, and `sourceRows()`.
- `utils/reportPdf.js`: PDFKit A4.
  - The header block, photo and Grad-CAM side by side, key-value tables, and the location table with the map beside it.
  - The NDVI/NDRE chart as vectors: solid line, dashed line, grey neighbours band.
  - The risk strip as words with white / light / dark grey fills and a thick border on today.
  - The limitations box, the "Where each value comes from" section, the hash with the verify text, a footer on every page (report id, short hash, page x of y), and an optional watermark.
  - Headings stay with their tables or text.
- Mixed Hindi/English: text is split into font runs by glyph coverage, and leading digits go with the first word.
  - Found by rendering: baselines were misaligned because each font uses its own ascender, so every run now uses one fixed baseline.
  - Also found by rendering: `→` and `≥` exist in neither font. They were replaced, and a test now checks glyph coverage for every character of both reports and all of `terms.json`.
- `services/staticMap.js`: OSM tiles at zoom 13 stitched with sharp, a dashed 1 km circle, identifying User-Agent, in-memory tile cache (OSM tile policy). No SVG text, because the slim image has no system fonts; the attribution is drawn by PDFKit on the map.
- `controllers/reportController.js`:
  - Owner check; 409 for rejected photos.
  - Language from `?lang` or `Accept-Language`.
  - In parallel: photo and heatmap (Cloudinary, or old base64), map, cached field health, weather risk. Each missing part becomes a note, never a failed report.
  - The id is `PG-` plus 72 random bits.
  - `Report` record: `contentSha256`, `pdfSha256` (hash of the exact bytes sent) and a summary.
  - Public `GET /api/reports/:reportId` returns the hashes and key values, with no location or device.
  - `reportLimiter` (20 per 10 min). "Delete my data" also deletes the reports.
- `assets/terms.json` is a copy of the client's crop/disease names, needed because the image is built from `server/` alone; a test checks the two are equal.
- Noto fonts come with their OFL licence.

**Client:**
- `ReportButton.jsx` on the result card: fetches as a blob with the device header, in the app language.
- A hint that the satellite section is included only if it was opened, and "not an official loss assessment".
- en + hi strings. The privacy page now mentions OSM tiles.

**Sample** (`docs/sample_report.pdf`, `docs/sample_report_hi.pdf`, `docs/sample_report_api.json`, made by `server/scripts/sample_report.js`):
- It went through the real local pipeline:
  - ML service on the golden test image `rice.jpg` gave Bacterialblight, early, 10% (high);
  - real Earth Engine for cropland next to PAU Ludhiana (95% cropland) gave normal, 14 of 31 clear, last clear 18 Sept;
  - real Open-Meteo (rice blast low ×6) and real OSM tiles.
- The server ran with `REPORT_WATERMARK="SAMPLE: test-set image"`.
- Checked: `sha256sum` of each sample equals the `pdfSha256` from its verify answer.
- Reviewed as images in colour and in greyscale over 4 rounds. Fixes from that review:
  - the map moved beside the location table;
  - headings kept with their content;
  - confidence ≥ 99.95% prints "> 99.9%", never a certain-looking "100.0%".

**Tests:**
- Server Jest 267 (+18 in `report.test.js`, 2 snapshots):
  - content snapshots in en and hi;
  - every row sourced; the numbers equal the API fields;
  - the location is rounded and the exact point appears nowhere;
  - each missing part gets its note;
  - the hash is stable under key order and changes on edits;
  - glyph coverage; the terms copy equals the client's;
  - the PDF is A4 and at most 3 pages (en and hi);
  - routes: the owner gets the PDF and the stored hash equals the bytes; the verify answer has no private data; missing parts still give a PDF; the cached field check is used and the geo-service is never called; 404 and 409 cases; delete makes the verify link 404.
- Client Vitest 40 (+2): download in the app language, and the error message.
- ml-service 46 and geo-service 24 unchanged. Lint (old warnings only) and build OK.

**Known limits:**
- English disease names are the raw class names from `terms.json` (for example "Bacterialblight"), the same as in the app. Better English names belong to the terms review.
- The sample's verify link points at localhost.
- The hash is a record we keep, not a signature (PAdES would be the upgrade).
- The weather risk is as of the report date, not the checkup date.

**Needs a deploy:** server (new routes, fonts, pdfkit), then a push for the client.

**Live (26 Sep 2026, 21:04 IST):** server `server-00016-krt` (100% traffic, 512 MiB, `REPORT_WATERMARK` not set) and `main` pushed at `c98b5d0`, deployed by the user. Checked:
- **Routes:** a bogus report id gives 404 JSON. A report with no device, another device's id or a bad id gives 404.
- **Website:** the Vercel bundle has "Download report (PDF)" and "रिपोर्ट डाउनलोड करें".
- **End-to-end run with my own test checkup** (golden `rice.jpg`, the PAU point, a fresh device id):
  - The checkup answered Bacterialblight, early, 10% (high), with the new `yieldLossConfidence` and no coordinates.
  - The English report was 286 KB in 3.0 s, cold; the Hindi one 311 KB in 1.9 s. Both came back as `application/pdf`, attachment, `no-store`, A4, 3 pages, no watermark.
  - The verify link printed in each is `https://server-…run.app/api/reports/PG-…`.
  - `sha256sum` of each downloaded file equals `pdfSha256` from its verify answer.
  - The verify answers hold the summary only: no coordinates, device or image URL.
  - Pages checked as images:
    - the Cloudinary photo and heatmap, and the OSM map fetched by Cloud Run;
    - the weather risk (rice blast, low ×6) and "satellite view not opened" for the field section;
    - Hindi advice with its not-yet-reviewed note.
  - Logs: two `report` lines (map true, risk true, fieldHealth false, 2.8 s / 1.7 s), no warnings or errors.
  - **Cleaned up:** "Delete my data" for that device deleted 1 checkup; both verify links now answer 404, and the history is empty.

