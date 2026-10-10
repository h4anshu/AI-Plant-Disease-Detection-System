# Work log

Running record of work on the AI Plant Disease Detection System: what was done, how, and why. Newest entries at the bottom of each section; each task lists its outcome and where the evidence lives.

## Pending (user to do later)

Added 26 Sep 2026. Tick an item off when it's done.

**Landing page redesign (added 9 Oct 2026):**
- [ ] **Approve the colour system v2** (Task 16; it is already adopted and built in Tasks 17-22, so this is now a final sign-off): it now uses the palette of your generated hero image (Pine, Leaf, Sage, Parchment, Rust). Read `docs/COLOUR_SYSTEM.md` §1 and §3.11, open `docs/colour-system/preview.html?theme=t2` (`&sheet=1` for swatches). Decide: (1) approve `t2` (recommended) or ask for `t3` / `t1`; (2) keep `butter` (my one addition to your palette) or not; (3) how the hero art is used (recommended: plant illustration only as an image, text and cards built in code for Hindi, hero background `#F2EAD6`). After that: tokens into `client/src/index.css`, fix today's contrast failures (RiskStrip, `text-sage`, `text-clay`, `text-wheat`), build the real landing sections (plan in §4.2). Nothing in `client/` has been changed yet.
- [ ] **Review the Hindi text of the landing page** (`home.*`, `how.*`, `honest.*`, `mapsec.*`, `beyond.*`, `repsec.*`, `finale.*` in `client/src/locales/hi.json`, AI-drafted) together with the agronomist review below.
- [ ] **Review the Hindi text of the My Field workspace** (`ws.*` and `nav.myField` in `client/src/locales/hi.json`, AI-drafted 10 Oct 2026), together with the Hindi review above.
- [ ] **Look at the workspace on a real phone and in Firefox / Safari** (only Chromium with a mocked API was tested; `docs/WORKSPACE.md` §7).
- [ ] **Decide the fonts** for the redesign (separate from colour). The preview keeps Fraunces / Inter / IBM Plex Mono so that colour is the only variable; a design linter flags Fraunces and Inter as very common.

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
- [ ] **Deploy the context layer (Task 15), in this order, then push `main`:**
  1. **geo-service** (new `POST /context`): `$REPO = "asia-south1-docker.pkg.dev/plant-disease-503711/plant-disease"; $TAG = git rev-parse --short HEAD`, then `docker build -t "$REPO/geo-service:$TAG" geo-service`, `docker push "$REPO/geo-service:$TAG"`, `gcloud run deploy geo-service --image "$REPO/geo-service:$TAG" --region asia-south1` (existing service account, token and env vars carry over). Check: `/health` still `earth_engine: true`.
  2. **ml-service** (top-3 on every answer; backward compatible): `docker build -t "$REPO/ml-service:$TAG" ml-service`, `docker push "$REPO/ml-service:$TAG"`, `gcloud run deploy ml-service --image "$REPO/ml-service:$TAG" --region asia-south1`.
  3. **server** (`/context`, soil-test route, report v2): `gcloud run deploy server --source server --region asia-south1`. No new env vars are needed. `FUSION_MODE` must stay unset (or `explain`): the server refuses to start with anything else in production. Optional: `CONTEXT_RATE_LIMIT` (default 30 per 10 min).
  4. `git push origin main` → Vercel builds the client with the context card (push last: the new card calls `/context`).
  - Check: a checkup with location shows "Weather, soil and season here" with numbers within a few seconds; opening it again is instant; "Download report (PDF)" has the Environment context section; Privacy has the new paragraph; Cloud Monitoring shows the workload tag `context` at ~4 EECU-s per new checkup.
- [ ] **Hindi context strings** (`context.*` and `privacy.context*` in `client/src/locales/hi.json`, the Hindi `ctx` labels in `server/utils/reportContent.js`, AI-drafted): include them in the agronomist review.
- [ ] **Agronomist review of the disease rules** (Task 15): 62 rows in `docs/RULES_REVIEW.csv` (40 rules + 22 classes without rules). Fill `reviewer` / `verdict` (ok, change, reject) / `corrected_value`, then `cd server && npm run rules-review -- --apply <file>`. Steps in `docs/DISEASE_RULES.md`. Until then the app marks every rule "not yet checked by an expert".
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
2. `server/config/db.js` swallows the real Mongo error (`console.log("DB Error...")` only) — ran a standalone `mongoose.connect()` with the same `.env` to surface it: `querySrv ENOTFOUND _mongodb._tcp.<cluster>.mongodb.net`. Confirmed with `nslookup` that general DNS works (`google.com` resolves) but that specific Atlas cluster hostname is NXDOMAIN — the cluster itself no longer exists (deleted/renamed in Atlas), not a network/DNS-provider issue. User was told to get a fresh connection string from the Atlas dashboard and update `MONGODB_URI`.
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

## GitHub secret-scanning alert #1 (26 Sep 2026)

GitHub flagged "MongoDB Atlas Database URI with credentials" in `server/tests/map.test.js:211` (commit `33d06ef`).

**What it is:** a made-up URI in a test that checks the demo-seed script refuses to run against a remote database. The string is `mongodb+srv://user:pw@cluster0.abcd.mongodb.net/prod`: user "user", password "pw", cluster "abcd". It is not a leaked secret. Checked, without printing the real values:
- It is not the real URI, and not the real cluster host.
- `server/.env` is gitignored and was never committed.
- The real password appears in no commit.

**What was changed:**
- The test now uses `mongodb+srv://cluster0.example.mongodb.net/prod`. It is still a remote Atlas-style URI (same test meaning, 29/29 pass) but has no credentials, so the scanner has nothing to match.
- While checking, the **real cluster hostname** turned up in one place: an old error message in this file (Task 1 DB debugging, committed in `9ea8f0a`). It is masked now (`<cluster>.mongodb.net`). A hostname alone gives no access (it needs the user and password).

**For the user:**
- Close the alert on GitHub as "Used in tests" (or false positive).
- Nothing to rotate.
- Git history is not rewritten: both old strings are harmless, and rewriting a public repo's history is disruptive.


## Task 15 — Context layer v1: environment-aware diagnosis (27 Sep 2026, Phase A)

Brief: prompt 12 (context snapshot per located checkup: weather, rain anomaly, SoilGrids soil, cached field health, season; a sourced rule knowledge base for all 53 classes; a pure fit engine; explain-only, offline rerank evaluation; card, PDF section, privacy). Done on `main`.

**Phase A (read + live checks, no code)**, plan in `docs/CONTEXT_LAYER_PLAN.md`, waiting for approval:
- Catalogue sheet "Context Data Sources" present (CX-01…CX-13).
- SoilGrids assets readable from the project; ISRIC conversion factors taken from the ISRIC FAQ.
- Latest dates: ERA5-Land 2026-09-19 (8 days lag, not ~3 months); CHIRPS 2026-08-31 (~4 weeks lag).
- Open-Meteo: `past_days` max 92 (docs); `start_date` accepted back to 93 days, so it covers every accepted photo date (≤ 60 days).
- EECU (Cloud Monitoring, per workload tag, 3 probe runs): soil 0.04, CHIRPS 30-day + 20-year baseline 0.38, ERA5 17 days 0.34, latest-date via full sort 1.6 (to be replaced by a windowed max) EECU-s per call.
- Open questions for the user: R1 (SoilGrids total N 11–18 g/kg and SOC 13–38 g/kg at the 3 test fields do not match Indian available-N / Walkley-Black OC thresholds) and R2 (CHIRPS lag: ERA5-Land anomaly fallback?).
- **Approved by the user (27 Sep 2026).** Decisions: R1 (SoilGrids pH + texture in rules; total N / SOC shown only), a new optional Soil Health Card entry (farmer-typed values, private, card overrides SoilGrids, nutrient rules only from the card), R2(b) (CHIRPS, else an ERA5-Land anomaly, else unknown), no context on training data (confirmed), context-aware advice deferred to after v1. Recorded at the top of `docs/CONTEXT_LAYER_PLAN.md`.

### Phase B — knowledge-base research (started 27 Sep 2026)
- **Result:** `server/knowledge/disease_rules.json` with all 53 classes:
  - 21 classes have 40 sourced rules;
  - 2 reuse the published models (potato late blight → INDO-BLIGHTCAST, rice blast → Yoshino);
  - 10 are healthy;
  - 20 have `rules: []` with the reason written down (vector-borne viruses/insects, generic dataset classes, qualitative-only sources, nothing found).
- Every rule cites a page or paper that was opened. The quote/numbers and section are stored with it.
- Sources:
  - TNAU Agritech (CX-12), IRRI Rice Knowledge Bank, ICAR Journal of Wheat Research, ICAR Journal of Sugarcane Research, ICRISAT (pigeonpea handbook, groundnut rust/leaf-spot papers);
  - GoI Methods Manual Soil Testing in India (2011) for the Soil Health Card limits;
  - peer-reviewed papers via PMC/Europe PMC/Crossref;
  - season calendar from the Indian Economic Service (GoI); Soil Health Card retest gap (2 years) from PIB.
- **Research findings worth knowing:**
  - TNAU's wheat and sugarcane pages have no numeric conditions, so ICAR journals and peer-reviewed papers were used there.
  - Many sources state RH / leaf wetness only; wetness is approximated by hours at RH ≥ 90% (as in Task 13).
  - Soil nutrient rules read only Soil Health Card values (decision R1).
  - The IMD rainy-day definition could not be opened on an IMD page, and no rule needs it, so rainy-day counts were dropped from the plan.
- `docs/DISEASE_RULES.md`: schema, factors, reading conventions, scoring, how to review.
- Review loop:
  - `docs/RULES_REVIEW.csv` (62 rows);
  - `npm run rules-review` writes it; `-- --apply <csv>` applies an agronomist's ok / change / reject verdicts and stamps the reviewer.
- Tests: `server/tests/knowledge.test.js` (104 tests: all 53 classes, factors/units/windows/sources, models reused, no rule reads modelled N/OC, CSV fresh, apply round-trip and bad input). Server suite 371 passed.

### Phases C–E: build, checks, docs (27 Sep 2026)

**geo-service**
- `context.py`:
  - SoilGrids: 8 properties × 3 depths; ISRIC conversion factors; 0–30 cm thickness-weighted mean; USDA texture class, from the Soil Survey Manual 2017 ch. 3 definitions, opened and quoted.
  - Rain vs 2001–2020: CHIRPS if it covers the 30 days, else ERA5-Land ending ≤ 10 days before (R2), else unknown.
  - ERA5-Land daily rows: K→°C, m→mm with negatives clipped, RH from FAO-56 eqs. 10/11/14.
  - Latest dates via a windowed `aggregate_max`, cached per day.
- `POST /context` in `app.py`: shares the token / request-id / Earth Engine error mapping with `/field-health` (refactored into helpers); workload tag `context`; logs without coordinates. The Dockerfile now copies `context.py`, which would otherwise have broken the image.
- Recorded real Earth Engine fixture: `tests/fixtures/ee_context_punjab_2026-09-27.json` (numbers only).
- pytest 62 (+38).

**Server**
- `utils/environmentFit.js`: pure rule engine.
  - 70% day coverage per window; exact thirds for the levels (0.67/0.33 missed an exact 2/3, found by a test); ≥ half the weight missing → unknown.
  - `combine: any` for nutrient deficiency; `model_ref` → the stored model level; missing reasons as codes so the app can translate them.
- `utils/context.js` (pure) and `services/contextSnapshot.js` (I/O):
  - reference date: EXIF `captured_at` if believable, else the checkup's IST date;
  - weather: Open-Meteo hourly (the same cached query as the risk strip when the date is today, a date range for older EXIF dates) or ERA5-Land days for checkups older than 92 days;
  - one geo-service call (soil only when its ~250 m cell isn't cached);
  - the cached field-health verdict and the season;
  - the published model's level for the reference day;
  - provenance: sources, attributions, measured EECU.
  - All or nothing; stored once, immutable until `CONTEXT_VERSION` changes.
- `GET /api/predict/:id/context` (owner-only, `contextLimiter` 30/10 min) and `PATCH /api/predict/:id/soil-test` (farmer's card values, validated, private).
- `captured_at` on predict (`parseCapturedAt`).
- **Bug found:** JavaScript accepts 30 February as a date, so a strict round-trip check (`isIsoDate`) is used for dates.
- History no longer carries the ~5 KB snapshot.
- "Delete my data" also deletes the cached soil of the user's cells.
- Weather cache keys are now hashed. Brief rule 7; they held the 0.05° point in plain text.
- ml-service returns `top3` with every diagnosis. The PDF shows other possibilities only for uncertain results.
- Fusion offline only:
  - `utils/fusion.js` implements p·f^α renormalised; it never touches `ok`.
  - `scripts/eval_fusion.js` prints "insufficient data" below 200 labelled checkups.
  - The server refuses `FUSION_MODE` ≠ explain in production.
- PDF: "Environment context" section from the stored snapshot only, en + hi, report version 2. The PDF can now be 4 pages (test limit raised from 3).
- Jest 437 (+66 incl. `environmentFit` 36, `context` 19, `fusion`/eval/sanity 8, report +3, predict +1).

**Client**
- `ContextCard.jsx`: loads once, also under StrictMode; states loading / favourable / mixed / unfavourable / can't tell / error.
  - Content: rules shown as value vs threshold with ▲/▽ plus screen-reader text; weather, rain, soil ("modelled") and season lines; the draft note; the "explains, never changes" note; the Soil Health Card form; sources and attributions.
  - Uncertain results show every leaning's fit, labelled "not a diagnosis".
- EXIF date (`getCapturedDate`) is sent only with a location.
- Privacy page has a new section. en + hi.
- **Bug found in the browser check:** Hindi uses the plural "one" form for 0, so three Hindi strings hard-coding "1" (including the Task 11 delete message) said "1" for zero. Fixed with `{{count}}`, plus a test for every Hindi `_one` string.
- Vitest 54 (+14). Lint: the same 11 old warnings. Build OK. ml-service pytest 46 (golden tests now check top-3).

**Measured**
- Earth Engine cost (Cloud Monitoring, 5 calls per request shape):
  - soil ~0.05 EECU-s; rain vs normal ~1.6 (CHIRPS) or ~4.0 (ERA5-Land); 17 ERA5 days ~0.8; latest dates ~0.01.
  - **A new checkup today ≈ 4.1 EECU-s** (ERA5 rain, since CHIRPS lags 4 weeks) → ~4,400 new located checkups/day under the 18,000 cap. Repeat views cost 0.
  - Earlier Phase A probe numbers (0.38) were for simpler queries; the plan doc now says so.
- Open-Meteo: 0 or 1 call per checkup.

**Local end-to-end run** (real Earth Engine via the local geo-service, real Open-Meteo, in-memory DB, local ML):
- rice golden photo at the Mullanpur test field → "Favours it" for bacterial blight: 7-day 28.2 °C (25–34), RH 74.6% (> 70), weather 24.4–32 °C, rain 21% of normal (ERA5-Land to 19 Sep), loam pH 7.8.
- One `/context` request, 971 ms. No coordinates in the server or geo-service logs.
- Hindi at 360 px: no horizontal overflow.
- Soil Health Card saved from the form.
- PDF: the Environment context section's numbers equal the API answer, 3 pages.
- "Delete my data" → 2 deleted, `/context` 404.
- The temporary `client/public/__e2e` photo was removed.

**Sanity check (report only):**
- DS-09 groundnut, Purba Medinipur, Jan–Apr 2022/2023. `geo-service/sanity_check.py` (ERA5-Land hourly + CHIRPS) → `docs/sanity/DS-09.json` → `node scripts/sanity_rules.js`.
- Rust favourable on most days; leaf spot favourable in Jan–Feb 2022 but not Mar–Apr → its 12 h wetness threshold is flagged for the reviewer (rule note + CSV).
- The other datasets have no documented dates.

**Docs:** `docs/CONTEXT_LAYER.md` (every factor, formula, source, cost and limit in plain words), `docs/DISEASE_RULES.md` (thirds), `docs/REPORT.md` (v2), README section, plan status.

---

## Task 16 — Landing page redesign: colour system research (9 Oct 2026)

**Goal:** the landing page has only a hero. Before building the other sections, decide the colours of the whole site by research and experiment (not by guessing), from the colour lists in the brief (greens/gradient, ink blue + eucalyptus, chocolate/butter/olive/latte, the blues, stone/Red Inferno/palm leaf), and explain every choice.

**Outcome:** a proposed system, "Herbarium" (warm paper, one deep evergreen family, butter as the only bright accent), written up in `docs/COLOUR_SYSTEM.md`. Waiting for approval; **`client/` is untouched, nothing committed.**

**What was done and how**
1. Read the site (Home, Navbar, `index.css`, RiskStrip, FieldHealth, `mapStyle.js`, README): the colours the product must express are leaf, disease severity (4 levels), weather risk (3), map counts (4 bins), chart lines (NDVI/NDRE/REDSI), water/rain.
2. **Measured the subject** (`experiments/leaf_palette.py`): k-means in OKLab on 326 PlantDoc photos from `_dataset_backup/`. Leaf green = hue 118–131°, chroma ≤ 0.14; lesions = hue 62–76° (brown/ochre/tan), chroma 0.06–0.08.
3. **Audited competitors** (`experiments/audit_sites.py`, homepage CSS): Plantix/Fasal blue, DeHaat/BigHaat "app green", Cropin neon lime, Syngenta amber+blue. The palette database's own "Agriculture/Farm Tech" answer (`#15803D`) is ΔE 0.4 from DeHaat: the generic answer is a competitor's colour.
4. **Built a zero-dependency colour lab** (`experiments/colour.mjs` + `colour_lab.mjs`, experiments E0–E11): OKLab/OKLCH, WCAG, APCA, Machado colour-blindness simulation, seeded optimisers. Cross-checked against `culori` and `apca-w3` (identical for OKLCH, WCAG, APCA; **culori applies the CVD matrices to gamma-encoded RGB, the paper says linear**, so I kept the paper's and report the other as a robustness check).
5. Rules were declared first, then every colour from the brief was measured against them (names like "Evergreen", "Eucalyptus", "Butter" have no standard hex: values and sources are listed in the lab).
6. **Solved the gaps by search** instead of by eye: the four severity colours (Red Inferno fixed), the chart-line trio, a map ramp.
7. **Tested in context**: `docs/colour-system/preview.html`, a mock landing page (real copy, the project's own fixture photos) with three dark-hue finalists, colour-blind/grayscale/squint filters, a swatch sheet; rendered with headless Chrome. Evergreen chosen.
8. **Contract**: 28 text/surface pairs + status/map/chart separation + chroma cap asserted for all three finalists (`node colour_lab.mjs e10`).

**Results worth remembering**
- The site fails its own targets today: `text-sage` 3.18:1, `text-clay` 3.76:1, RiskStrip "high" chip 2.97:1, `text-wheat` 2.11:1; body `ink/70` is 4.54:1 and falls to 3.4:1 under a glare model.
- Traffic-light severity colours (and today's) are only ΔE 4.3 apart for deuteranopes. The final set is ≥ 10.7 under every vision type; map bins ≥ 13.9 (today 9.1); chart lines 12.7 (today 6.3).
- A dark olive band reads as khaki-brown, i.e. the colour of the disease, so the brand dark is evergreen (hue 160°). Ink-sea (205°) is the runner-up.
- Decorative status tints are ΔE 0.3 apart under deuteranopia: meaning never rides on a tint (glyph + word + border + lightness carry it).
- `client/src/assets/hero.png` is the unused purple Vite template art.

**Rules bent or corrected along the way (all written up in COLOUR_SYSTEM.md §5):** chip-dot contrast 3:1 → 2.5:1 (3:1 and ΔE ≥ 10 cannot both hold); a wrong "tint ≥ 1.05:1" rule dropped; `rust` → `sienna` to respect the chroma cap; two APCA exemptions removed by darkening `ink-2` and the dark-band secondary text; one wrong sentence of mine in the glare output fixed; the first CVD screenshots were re-rendered with the final tokens.

**Not done / limits:** no real-device or sunlight test, no users, Hindi legibility not tested separately; Itten/Albers/Munsell books not read (secondary summaries only); trend evidence is mostly interiors/agency blogs; the final dark-hue choice (`t2` over `t3`) is my visual judgement; fonts held fixed; no motion/interaction work. Details: COLOUR_SYSTEM.md §6.

**Files:** `docs/COLOUR_SYSTEM.md`, `docs/colour-system/preview.html`, `docs/colour-system/experiments/{colour.mjs, colour_lab.mjs, leaf_palette.py, audit_sites.py, RESULTS.txt}`.

### Task 16, update: your hero image palette (9 Oct 2026, later the same day)

**Question:** the generated hero image uses Pine `#193D2B`, Leaf `#6C854D`, Sage `#DCE4D1`, Parchment `#F5F0E2`, Rust `#D85D2D`. Is it professionally fit, and can it go into the system?

**Answer:** yes, adopted as **system v2**, with three adjustments. The doc was rewritten (`docs/COLOUR_SYSTEM.md`, §3.11 is the verdict).
- **Measured the image itself** (`experiments/hero_image_probe.py`, image saved as `docs/colour-system/hero-reference.jpg`): CTA/cards are Pine (ΔE 0.7), the MODERATE badge `#D96129` and eyebrow `#D36637` are Rust, the lesions are drawn ochre (hue 92°), and the flat background is `#F2EAD6`–`#F3EBD8`, not the stated Parchment (ΔE 1.6–1.9).
- **Pine, Parchment, Sage, Leaf fit** (Pine 10.6:1, ΔE ≥ 21.6 from competitors; Leaf 3.6:1 on paper, better than the old Palm leaf's 3.0).
- **Rust needs two jobs.** As the image uses it, the eyebrow (3.34:1) and the white-on-Rust badge (3.79:1) fail 4.5:1, and as a status colour it collapses against Leaf for protan users (ΔE 4.7). So `rust #D85D2D` = illustration, display numbers ≥ 24px, shapes, map bin; `rust-deep #98370C` (same 40° hue, 6.4:1) = small text, badges, "moderate", the REDSI line (ΔE 15.1 vs today's 6.3). Search showed a dark rust passes (ΔE 10.0) where a bright one cannot.
- **Chroma rule bent, openly:** Rust (0.166) alone may exceed the 0.14 cap (≤ 0.18); it is the one saturated accent of the hero.
- **Seam:** the illustration's own background is ΔE ~1.9 off Parchment, so a raw crop shows a faint box. Tested three treatments (raw / matched hero background `#F2EAD6` / feathered edge); recommended matched background (the layout already has a hairline under the hero) or regenerate on a flat background.
- **Name collision caught:** the hero's Sage vs today's `--color-sage #7A8B6F` (a text colour). Named `sage-wash` so `text-sage` labels cannot go pale.
- **Map ramp** bin 3 is now Rust (every step ≥ ΔE 12 under any vision; today 9.1). Status ladder: Leaf, ochre `#AE9900`, rust-deep, Inferno, min ΔE 10.04 (thin: it is pinned to your exact Leaf). Contract: 33 pairs + separation, all three finalists pass.
- **Noted for later:** the image bakes English text into the raster (headline, "SCAN ACTIVE", "LEAF ANATOMY", cards); the site is bilingual with live numbers, so build text/cards in code and use only the plant illustration as an asset. `butter` is the only colour not from your palette; optional.
- Not done: nothing in `client/`, nothing committed; preview re-rendered with v2 tokens (desktop, deutan, token sheet).

## Task 17 — Landing page: hero section (9 Oct 2026)

**Goal:** build the hero to match the approved reference (`assests/PlantGuard Field Clinic_ Leaf Health Scan.png`, mobile: `assests/PlantGuard Field Clinic Landing Page.png`) with the colour system v2, without clutter.

**Built** (client only, not committed; the colour decision "ok done" was taken as approval of `t2` + the hero palette with my defaults):
- `client/src/components/Hero.jsx` (hero + the 3-step strip, `id="how"`), `components/heroIcons.jsx`, `pages/Home.jsx` now just renders `<Hero />`.
- Navbar: leaf mark, non-italic wordmark, "Field Clinic" label, "Start a check" button (to /predict), links in `ink-2` (the old `ink/70` failed contrast). Same links as before; the reference's "Field guide" does not exist in the app, so it is not there.
- `index.css`: colour tokens added (pine, leaf, leaf-text, sage-wash, rust, rust-deep, butter, latte, ink-2), `parchment` and `ink` moved by ΔE < 3. Old tokens (`field`, `clay`, `wheat`, `sage`…) are untouched because other pages still use them. Hero CSS sizes everything in "units" so the stage keeps its proportions at any width; scan line, rust-dot ping and card rise-in only run without `prefers-reduced-motion`.
- Assets: `client/src/assets/hero/plant-560.webp` (123 KB), `plant-840.webp` (243 KB), `rust-thumb.webp` (42 KB), made from `assests/` (plant cutout: edge colour fixed, alpha untouched; an alpha clean-up I tried shredded the wheat awns, so it was dropped). The raw PNGs stay in `assests/` (about 20 MB, not used by the app).
- Copy: reused the existing keys (title, intro, cta, example card, steps); new keys in en + hi (`nav.start`, `home.howLink/trust/scanActive/exampleSureWord/planTitle/plan1-3`); step titles lost their "1. " prefix; the CTA lost its built-in "→". **Hindi strings are AI-drafted like the rest of the UI, not reviewed.**
- Headline: the existing "Take a photo. Know the disease." in the reference's 3-line layout with the italic last line, not "clean bill of health" (an idiom that does not translate).
- Test: `src/test/Hero.test.jsx` (heading, CTA to /predict, 3 steps, EN + HI, decorative stage hidden from screen readers). Vitest 56 pass (+2), build OK.

**Checked in a browser** (headless Chrome, dev server on :5199, now stopped; `client/public/__e2e` removed): desktop 1440, phone 390 (iframe), Hindi desktop. Bugs found and fixed on the way: the unit variable was on the stage but the cards are a sibling (cards piled up top-left); the CTA showed two arrows; the leader line stuck out on phones; Hindi 12px text too small and the Hindi care-plan card clipped its third step.

**Not done:** the rest of the page (sections 3–9 of COLOUR_SYSTEM.md 4.2); other pages still use the old tokens and have the contrast failures from COLOUR_SYSTEM.md 3.1; `butter` is not used yet; no real-device check; the plant is a raster, so LCP on slow networks is untested; the demo-mode banner above the nav is unchanged.

**Task 17 follow-up (9 Oct 2026): the hero now fits one viewport on desktop.** Reported on a 1920x930 browser view: the steps strip fell below the fold. Fix in `Hero.jsx`: on `lg` the section is `min-h: 100svh - 8.25rem` (demo banner 41px + nav 91px) as a flex column, the plant stage is capped by the available height (`max-w: max(580px, (100svh - 18rem) x 1.13)`), the h1 and the spacing scale with `svh`, the intro is `max-w-lg` (3 lines), the steps strip is tighter and sits at the bottom of the same view. Checked in headless Chrome: 1920x930 and 1440x800 show everything in one view; 1366x657 shows everything except the steps strip (just below the fold; the 580px stage minimum keeps the cards from clipping). Phone layout unchanged. If the banner or the nav height changes, update the `8.25rem`.

**Task 17 follow-up 2 (9 Oct 2026): hero rebuilt to match the reference.** Reported: too much side spacing, too few elements, structure and visuals differed from the reference. Changes:
- **Layout:** full-width (container up to 2000px, gutters `clamp(1.25rem, 4.2vw, 5.5rem)`, same in the Navbar); the stage is a 1100 x 820 canvas (700u wide on phones, cropped to the plant) so everything keeps its proportions.
- **Elements added (all from the reference, code-drawn SVG/HTML, no downloads needed):** scan badge (leaf-in-ring over a "Scan active" pill), leaf-anatomy sketch with label, wheat label with the Latin name, crosshairs, tick/measure marks, faint leaf badge, "Healthier crops, brighter tomorrows" tagline, faded corner sprig, numbered care-plan card with the bottle icon, "Leaf check / Example" card header, dotted leaf connectors between the 3 steps, "Made for the field" badge with a divider. Paper texture from `assests/` (`assets/hero/paper.webp`, 6 KB) behind the whole hero.
- **Copy now matches the reference** (English and Hindi, AI-drafted): "Every leaf deserves a clean bill of health.", the reference sub-line, "Scan a leaf", "Potential leaf rust / Moderate", steps Photograph / Diagnose / Treat with the reference descriptions. Deviations kept on purpose: "See how it works" instead of "Explore the field guide" (no such page), real nav links, "Example" instead of a fake case number "# 004", "sure" instead of "match" (the app's own word). The "clean bill of health" idiom does not translate well to Hindi; the Hindi line is a loose rendering. To revert to the plain headline, change `home.title1/2/titleEm` and `home.intro` in en.json and hi.json (old text: "Take a photo. / Know the / disease.").
- Phone: the left/right decor is hidden, the cards stack under the plant, steps in a column, "Made for the field" below.
- Tried and dropped: a wider 1300u canvas on big screens (the plant is height-limited, so it only spread the decor thin and clipped a card); on wide screens the left decor now drifts toward the text instead.
- Checked in headless Chrome at 1920x930, 1440x800, 1280x720, phone 390 and Hindi 1440; vitest 56 pass; build OK; dev server stopped, `client/public/__e2e` removed.

## Task 18 — Landing page: "How it works" section (9 Oct 2026)

**Goal:** build the section from the reference (`From Leaf to Health, in 3 Simple Steps`) with the generated art, structured to the screen.

**Built** (client only, not committed): `components/HowItWorks.jsx` (rendered after the hero in `pages/Home.jsx`), CSS block `How it works` in `index.css`, keys `how.*` in en + hi (Hindi AI-drafted), assets in `client/src/assets/how/`. The hero's own 3-step strip now has `id="steps"`; "See how it works" scrolls to the new `#how`.
- **Art processing:** the two foliage/island images came with a *fake transparency checkerboard baked into the pixels* (plain RGB), so they were matted properly (alpha from lightness/saturation, white de-matte, speck removal) and split: `foliage-tl/tr` (corner branches, bled past the section edge because the generator clipped them flat), `leaf-a…e` (floating leaves placed by hand, gentle float animation), `islands.webp` (3 rock islands + vines, 166 KB), `scan-leaf.webp` (macro rust leaf, from `assests/`). Total about 330 KB.
- **Desktop:** a 1672 x 1010 canvas of layers sized in units (`--u`), same technique as the hero: header, three staggered steps, glass result card with glowing rings, scan frame + camera, wooden board with the care list and a ladybug, CTA on the centre island.
- **Phone:** three stacked steps; each crops its own island out of the same layer image (no extra downloads); the card uses a tighter crop (`--bwm`) so it stays readable.
- **Stand-ins:** the camera, wooden board and CTA log are not generated yet, so they are drawn in code (SVG camera, CSS wood board). They are replaced automatically when `camera.webp`, `board.webp` or `log.webp` (transparent) appear in `assets/how/` (picked up by `import.meta.glob`; no code change).
- **Copy changed from the reference because the app cannot claim it:** "Works Offline" (needs the server) and "Supports All Crops" (10 crops) became "Free to use / English and Hindi / 10 crops supported"; "expert advice" became a plain "treatment plan"; the example is potato early blight (tomato is not a supported crop) and is labelled "Example"; the care list is generic advice (spray the recommended fungicide, remove badly affected leaves, improve air circulation, recheck in a week), to be checked by an agronomist.
- **Checked** with a real scrolling browser (Playwright) at 1920x930 and 390x844, no horizontal overflow on the phone; vitest 56 pass; build OK. Bugs found on the way: desktop unit sizes leaked into phones (squeezed text, collapsed button), brackets of the scan frame drawn as boxes, CTA text wrapped, floating leaf over text, corner branches 40% too big. A transient "out of memory" in the test runner happened only while two browsers and a dev server were running; it passes with them closed.
- **Not done:** bottom-corner foliage and the soft bokeh background from the reference (CSS gradients stand in), the real camera/board/log art (prompts given), Hindi layout check of this section, and a check on a real phone.

**Task 18 follow-up (9 Oct 2026): real art wired in, section fits one viewport.** New transparent PNGs in `assests/` (camera, signboard, log, bottom foliage, ladybug, bokeh) were cropped and exported to `client/src/assets/how/` (camera 92 KB, board 126, log 200, foliage-bl 115, ladybug 20, bokeh 21). They replace the code-drawn stand-ins automatically; the board text is rotated to the plaque's tilt. Reported: view too zoomed. Cause: the 1672x1010 canvas was sized by width only. Now `--u = min(width / 1672, (100svh - 4.6rem) / 1010)` (floor 0.7px), the section is `min-height: 100svh - navbar`, the canvas is centred; the bokeh image is the background, corner foliage is mirrored bottom-left/right. Measured in a real browser: section height 857 at 1920x930, 726 at 1440x800, 707 at 1366x657 (the bottom CTA is cut off by about 50px there: below ~700px of height the canvas hits the readability floor), phone stacks with no horizontal overflow. Hindi: global heading line-height pushed the subtitle into step 2; fixed with a scoped rule and a lower step-2 position. Board text shortened ("Spray recommended fungicide" etc.). Tests 56 pass; the earlier "out of memory" did not recur. Not done: tablet-width (768-1023) check, real-device check.

**Task 18 follow-up 2 (9 Oct 2026): code-made background, hero strip removed.** Reported: the blurry bokeh photo made the section look like a different site, and the hero's own "how it works" strip duplicated it.
- **Background:** `bokeh.webp` deleted. `.how-bg` is now the hero's paper texture (`assets/hero/paper.webp`) with a transparent-to-sage vertical gradient (green deepens towards the bottom), a soft white glow behind the headline and leaf-green glows in the lower corners. The top edge is transparent so the hero's grain continues straight through (no seam). A first version had an invalid `background` shorthand (`url() repeat / 640px`) and the browser silently dropped it; caught by looking at the render.
- **Hero:** the Photograph/Diagnose/Treat strip and the "Made for the field" badge are removed (the new section is the step explainer); the plant stage got the freed height (`100svh - 11rem`), the corner sprig moved down; the `home.step*` and `home.madeFor` locale keys were removed; the test no longer counts steps. The hero's "See how it works" link still scrolls to the section. The hero now fits one viewport even at 1366x657 (bottom edge 642 of 658).
- Checked in a real browser at 1920x930, 1366x657 and phone 390 (no horizontal overflow). Vitest 56 pass, build OK, my dev server stopped.

## Task 19 — Landing page: "Honest by design" section (9 Oct 2026)

Built `components/Honest.jsx` (dark band after "How it works"), `data/accuracy.js`, CSS block `Honest by design` in `index.css`, `honest.*` keys in en + hi (Hindi AI-drafted), `test/Honest.test.jsx`. **Process note:** I built a first version when the user had only asked which of four reference designs was best; the user said so; the section was kept and reworked to the chosen Design 1 after they confirmed.
- **Chosen reference:** Design 1 (cream table with error-bar whiskers on a dark green band). Rejected: the all-dark table (low contrast, no interval drawn), the blue mountain/waterfall one (off palette).
- **What it shows:** header + intro, scan panel (macro rust leaf with scan grid, heat overlay, three thumbnails: photo, heatmap, grayscale; all code/CSS over `how/scan-leaf.webp`), three cards (quality gate, see what it saw, error bars), and a table of **all 10 crops** with accuracy, 95% CI text and a drawn range (end caps, accuracy dot); pigeonpea (lowest) in rust-deep with "our weakest". A footnote says which crops were tested with 5-fold grouped CV (marked *) and that the two methods are not comparable.
- **Numbers:** `data/accuracy.js` is a copy of `ml-service/models/metrics.json`; `Honest.test.jsx` fails if they differ and checks 10 rows + the weakest marker. Vitest 58 pass.
- **Layout:** canvas 1672 x 1050 units scaled by `min(width, viewport height)`, so it fits one viewport (table bottom 916 of 930 at 1920x930); phone stacks (checked: no horizontal overflow). Hindi needed its own heading size / line-height / header font (global Hindi rules are too tall and too small here).
- **Optional art slots** (drop transparent webp into `client/src/assets/honest/`, no code change): `crop-<crop>.webp` x10, `badge-camera|leaf|bars.webp`, `board.webp`, `scan.webp`, `soil.webp`. Until then: leaf glyphs, parchment circles, the paper-texture card and the code-made scan panel are used.
- **Not done / not checked:** English view after the last spacing change was not re-screenshotted (numbers only for Hindi); 1366x657 clips the bottom as in the other sections; the soil strip and moss-stump are not drawn; no real-device check; Hindi strings unreviewed.

**Task 19 follow-up (9 Oct 2026): generated art wired in.** From the new `assests/` files: `scan.webp` (glass scanner + diseased leaf + mossy stump, 251 KB), `board.webp` (bark/moss parchment frame, 232 KB, applied with `border-image` nine-slice so the corner vines and bark stay crisp at any table height; the table has inner padding to stay clear of them), `soil.webp` (292 KB, under the board), all in `client/src/assets/honest/`. Canvas now 1672 x 1110; rows 38 units. The board's top moss edge sits behind the three cards (z-index, DOM order stays header, scan, cards, table so phones and screen readers read in order). Phone: stacked, no horizontal overflow, board art is desktop-only (phones keep the paper card). Measured at 1920x930: board bottom 928 of 930.
- **Received but NOT used yet:** `Woodland Camera Emblem` (only the camera badge arrived, so the other two badges would not match) and two rice images (only rice, so the crop icons would be inconsistent). Still missing: `badge-leaf`, `badge-bars`, and 9 crop icons (wheat, potato, banana, blackgram, apple, maize, sugarcane, groundnut, pigeonpea). Drop them in `assets/honest/` as `badge-camera|leaf|bars.webp` and `crop-<crop>.webp` and they appear with no code change. The camera emblem and a rice icon can be saved there when the rest are ready.
- Checked: English desktop 1920x930, phone 390 (order and overlaps measured), Hindi desktop earlier. Vitest 58 pass, build OK.

**Task 19 redesign (9 Oct 2026): "Honest by design" restructured.** Reported (screenshots of the live page): cluttered, poor structure, background too different from the other sections. Cause: everything (header, scan, 3 cards, 10-row board) was squeezed into one viewport on a unit canvas, so pieces overlapped, and the dark-green band was a different scene from the light sections around it.
- **Layout:** the canvas is gone; `Honest.jsx` is now ordinary responsive HTML (no `--u` units). Row 1: header + intro (left), scan art (right); row 2: the three points in one line, no card boxes (pine icon circle + title + text, hairlines above and below); row 3: the bark-and-moss board with the 10-row table, soil strip tucked under it. The section is now its natural height (1587 px at 1920 wide, about 1974 on a phone), no longer one viewport: ten rows cannot be read in one screen without crowding. Say so if you want it back to one screen.
- **Background:** light. The top stop is the exact bottom colour of the "How it works" gradient (sage-wash with 12% leaf), then it fades to the same paper texture as the hero, with a soft white glow top-right and a leaf glow bottom-left. Text is ink / ink-2, eyebrow rust-deep, accent word leaf-text. The dark band from the colour plan is not used here; it stays available for the final CTA / footer.
- **Fixes while checking:** table header and footnote were colliding with the board's corner vines (padding now in cqw inside the nine-sliced board), soil strip was floating below the board (pulled up 5.5%).
- Checked in a real browser: 1920x930 (top join, points, full board), phone 390 in Hindi (no horizontal overflow, rows stack as name + percent / interval / range). Vitest 58 pass, lint clean, build OK.

**Task 19 one-viewport version (9 Oct 2026).** Asked: everything on one screen like the reference, with sizes/spacing/typography decided properly. The responsive-flow version (previous entry) was taller than a screen, so `Honest.jsx` is back on a canvas, but this time the reference's own 16:9 size (1672 x 941 units, `--u = min(width/1672, (100svh - navbar)/941)`, floor 0.72px) with every block placed on a budget: header+intro y 40-290 (heading 70, intro 21), scan art top-right (410 wide), the three points y 318-400 as a plain row (title 25, text 17), the nine-sliced bark board y 416-932 with a 26-unit header row, ten 33.5-unit rows (crop 25, accuracy 24, interval 19) and a 2-line footnote. The board frame is thinner (50/55/42/58 units) to give the table the height. Light background kept (same top colour as "How it works"). Measured: 1920x930 section 857 (board bottom 849); 1440x800 section 726 (board bottom 719), no overlaps in English or Hindi (Hindi heading/intro scaled down by a scoped rule). **Limit:** below about 720 px of viewport height (e.g. 1366x657) the 0.72 floor keeps text readable, so the section is ~90 px taller than the screen and scrolls a little. Phone: stacked, no horizontal overflow. `soil.webp` is not used in this version (it would sit mostly hidden below the board); kept for a later section. Vitest 58 pass, build OK.

**Task 19 re-layout (9 Oct 2026): board right, text left, scan floating.** Reported (screenshot of the live page): the centred board crowded the points and left dead space. New canvas layout (same 1672 x 941 units, one viewport): heading + intro top-left (x 100, w 1010); the three points as a compact vertical list in the left column (x 100-620, 56-unit icon, title 25, text 17, hairlines between); the bark board shifted right (x 700-1630, y 296-924, 10 rows of 43 units, columns 240/106/148/lane); the scan art small (300 units) floating on the board's top-right corner (z-index above it). The free bottom-left corner got the soil strip (`soil.webp`), a faint sprig (SVG), and two single leaves (`how/leaf-a|b.webp`). The footnote has right padding so it stays clear of the corner vines; "CROP" got extra left padding to clear the top-left vine. Measured at 1920x930: section 857, board 270-841 inside it, no overlaps in English or Hindi; footnote 2 lines. Phone: stacked in reading order header, scan, points, table, no horizontal overflow (the DOM order is header, points, board, decor; `order-*` classes arrange the phone view). Bugs found while checking: the sprig SVG ignored its position props and covered the whole section (now wrapped in a sized span). Vitest 58 pass, build OK. Not re-checked at 1440x800 / 1366x657 after this layout (same canvas rules as before, so the earlier limits apply: below ~720 px of height the section scrolls a little).

**Task 19 re-layout 2 (9 Oct 2026): content left, longer board, soil under it.** Reported: content still too far in, board could be longer, soil should sit under the board. Changes: canvas widened from 1672 to 1900 x 941 units (the 16:9 canvas left ~190 px of dead margin each side at 1920 wide; text now starts at x=151 px instead of 282); heading/points at x=70, intro limited to 580 units so it stays clear of the board's top-left vine; board x 690-1840 (1150 wide, was 930), y 258-833, rows 39 units, columns 290/108/152/lane; `soil.webp` (1250 wide) now sits behind the bottom of the board (board z-10) so the board stands on it; scan art 300 units on the board's top-right corner; points opened up (64-unit icons, 28/19 type, 22-unit padding); sprig and two leaves moved to the free bottom-left, leaf-a top middle; "CROP" padding-left 84 so the vine no longer covers the C; footnote right padding 160 so it clears the bottom-right leaves (2 lines). Measured: 1920x930 section 857, no overlaps in English or Hindi; 1440x800 section 726, intro 30 px clear of the board; phone stacked (header, scan, points, table), no horizontal overflow. Vitest 58 pass, build OK. Not re-checked at 1366x657 (same ~720 px height floor as before).

**Task 19 nudge (9 Oct 2026):** whole right-hand group (board, soil, scan) moved up by 44 units (board y 214, soil y 708, scan y 36) and the scan moved 72 units left (x 1488) so the stump's wood no longer sticks out past the board's right edge. Measured at 1920x930: board 195-718 px in the 857 px section, scan right edge 1715 inside the board's right edge 1763. Vitest 58 pass.

**Task 19 crop icons + visible bars (9 Oct 2026).** `assests/Glossy Harvest Crop Sticker Collection.png` (10 crop icons in a 5x2 grid, transparent, good quality) cut into `client/src/assets/honest/crop-<crop>.webp` (160 px, 7-16 KB each; rice, wheat, sugarcane, potato, maize / pigeonpea, groundnut, blackgram, apple, banana). The icons touch each other, so connected-component cutting failed (6 pieces); they were cut at the empty columns plus a per-column row split, then stray fragments from neighbours (45 px at maize, 35 at apple) were removed. Table rows show them automatically (38 units). **Bars:** the thin track with a short CI segment hid behind the dot. Now: a darker track, a filled bar from 70% to the accuracy (leaf to pine; rust for the weakest), the 95% interval as a dark range with end caps drawn over it, and a ringed butter dot. The axis starts at 70%, as labelled. Checked in headless Chrome at 1920x930 (Playwright could not start after the session restart, so I used a headless screenshot through a temporary iframe page, since removed). Vitest 58 pass, build OK. Not re-checked: Hindi and phone after these two changes. Still missing: `badge-leaf`, `badge-bars` (and the camera emblem and rice sprigs received earlier remain unused).

**Seam between "How it works" and "Honest by design" (9 Oct 2026).** Reported: the join looked odd and unprofessional. Causes found by sampling pixels and zooming with 5-8x contrast: (1) the two backgrounds ended/started on different tones (How had leaf glows in its bottom corners, Honest a white glow near its top), (2) a slope kink (one gradient deepens right up to the edge, the next lightens straight away), (3) the generated bottom foliage image has a flat bottom edge, so the leaves looked sliced at the section line. Fixes in `index.css`: glows moved off the seam (How's corner glows 92% to 70%, Honest's white glow 14% to 34%); a flat plateau on both sides (How's last 12%, Honest's first 9% hold the identical colour `sage-wash 88% + leaf 12%`); `.how-bg` is `overflow-x: clip` with `z-index: 2` so the bottom foliage hangs over the seam; the foliage got a bottom-fade mask and is smaller (250 units / 11.5vw, was 330 / 17vw) so it no longer covers the "H" of the eyebrow. Measured: pixels either side of the join differ by at most 1 level, and an 8x contrast-boosted strip across the join shows no step. Vitest 58 pass, build OK. Checked at 1920x930 only (headless Chrome through a temporary iframe page, removed); the phone view has no bottom foliage so it was not re-screenshotted.

## Task 20 — Landing page: "The map" section (9 Oct 2026)

Built from the reference comp (`The Map`, 16:9) and six generated visuals in `assests/`. Not committed.
- **Files:** `components/MapSection.jsx` (after "Honest" in `pages/Home.jsx`), CSS block "The map section" in `index.css`, `mapsec.*` keys in en + hi (Hindi AI-drafted), assets in `client/src/assets/map/` (diorama 445 KB, hex-glass 246, rings 182, magnifier 67, leaf-pin 50, privacy-badge 58), `test/MapSection.test.jsx`.
- **Two of the six images had the fake checkerboard baked in** (hexagon cluster, shield medallion; 7 px squares, two grey tones). Removed by flood-filling the neutral-grey range from the border, so the white glass tiles inside the cluster stay intact. For the section the white tiles were made ~78% transparent (`hex-glass.webp`) so they read as glass over the fields, as in the reference; coloured tiles and green rims stay solid.
- **Layout:** 1900 x 941 unit canvas scaled to fit one viewport (same technique as "Honest"): left column (eyebrow, headline, intro, 3 features, two selects, button); the picture group (slab, tilted hexagon glass, rings, lens) as one 940 x 720 unit block so it scales as a unit on phones; example card with the leaf pin; filters card; legend; privacy card; dotted connector lines with travelling dots; soil strip, foliage, potato and leaves along the bottom. Alive: slab and lens float, rings pulse, a glow pulses on the darkest hexagon, leaves drift, dots travel (all off under `prefers-reduced-motion`).
- **Honest content, not decoration:** the legend uses the real map's `BINS`; `mapStyle.js` colours were updated to the v2 ramp (`#F2D98B #D9A441 #D85D2D #700004`, was the older yellow-to-brown ramp) so the landing legend and the live map match; the two left selects are real and "Open the map" goes to `/map?crop=..&days=..`, and `MapPage.jsx` now reads those params (validated against its own crop list and 7/30/90). The example card is labelled "Example data" and uses a real class (potato, early blight): the reference comp's "wheat leaf rust" is not a class of the wheat model. The right-hand filter card is illustration only (aria-hidden).
- **Copy changes from the reference:** "Shown only when 3+ farmers report" is now "3 or more people" (the rule is 3 different browsers); "Exact location never stored in public" was inaccurate (the exact point is stored privately, never returned by any API) so it reads "Your exact spot is never shown".
- **Seam with "Honest by design"** checked by pixel sampling and a contrast-boosted strip after moving both sections' corner glows off the join; bands above and below differ by 1-2 levels on the left and middle.
- **Checked** (Playwright): 1920x930 (section 857 tall, button ends at 757), 1440x800 (726), phone 390 (no horizontal overflow, stacked order text, picture, example card, legend, privacy), Hindi at 1920. Vitest 60 pass, lint clean for the new files, build OK.
- **Bugs found on the way:** crop/disease names were lower-case; leaf pin covered the card title, then was clipped by the navbar; legend overlapped the filter card; the CTA sat on the soil; a sage glow made the join to the previous section visible.
- **Noticed, not changed:** the hero's example "Wheat — Leaf Rust" (`home.exampleTitle`) is not one of the wheat model's classes (BlackPoint, FusariumFootRot, HealthyLeaf, LeafBlight, WheatBlast). It is labelled "Example" but the copy should use a real class.
- **Not done:** 1366x657 not checked; Hindi at 1440/phone not checked; no real device.

**Task 20 re-placement (9 Oct 2026).** Reported: visuals not placed like the reference; hexagons on the land and the magnifier cluttered. Compared geometry with the reference comp: the reference has a lens only (no handle) above the slab's top-left with one thin leader line, a flat hexagon cluster centred on the land, one thin white ellipse, and a bigger slab sitting higher. Fixes: `lens.webp` cut from the magnifier image (eroded core, circle fit, handle removed, 520 px); the 3D re-tilt of the hexagons was removed (the cluster is already drawn at the slab's angle) and the cluster scaled to 410 of 908 slab units and centred at the slab's centre; the thick glowing rings image was dropped (`rings.webp`, `magnifier.webp` deleted) for one SVG ellipse plus a fainter one; white glass tiles made ~89% transparent; slab moved up and 50 units left (vis block x 640, y 150) so its right corner clears the legend; left floating leaf moved beside the lens, right leaf at the slab edge; cards placed from the reference scaled to the 1900 canvas (example card x 1062 w 366, filter 1520, legend 1626, privacy 1560 w 320). Measured at 1440x800: section 726, cards 127-351 / 354-541 / 607-729 do not overlap, example title one line, lens 27 px clear of the card; 1920x930 checked by screenshot. Phone layout unchanged (same stacked picture block). Vitest 60 pass, build OK.

**Task 20, round 3 (9 Oct 2026): hexagons, lens connection, panels.** Reported: lens not connected, hexagons solid (fields hidden), floating panels odd. Changes in `MapSection.jsx`: the opaque `hex-glass.webp` is deleted; the hexagon cluster is now drawn as an SVG layer (`HexLayer`: 14 flat-top cells, squashed to the slab's angle, 7 filled at 55-62% opacity in the four real bin colours + 7 empty glass outlines, the darkest raised with a plate under it), so the crop fields show through. If a generated `assets/map/hex-clear.webp` (transparent, tinted glass) is dropped in, it replaces the drawn layer automatically (`import.meta.glob`). The lens is joined to the upper-left tile by a lit cord (white halo + gold line, knob on the lens rim, ring on the tile), and the slab/lens no longer bob (a moving slab would detach the cord); a second cord runs from the example card to the darkest tile with a travelling dot. Panels: filters, legend and privacy now sit in one flex column (same width 292, same glass, same radius, equal 22-unit gaps), each with the same header (pine icon disc + mono caps label); the example card has the same header plus an "Example data" pill inside instead of a floating tag, and its leaf pin was removed (`leaf-pin.webp` deleted). New keys `mapsec.filtersTitle`, `mapsec.cardLabel` (en + hi). Non-breaking spaces keep "5 km²" together. Test now counts the legend's swatches only. Measured: 1920x930 section 857; 1440x800 panels 129-381 / 397-589 / 606-744 (no overlap, section 726); phone stacked, no horizontal overflow. Vitest 60 pass, lint clean, build OK. Not re-checked: Hindi after this round, 1366x657.

**Task 20, round 4 (9 Oct 2026).** Reported (screenshot of the live page): the three right-hand panels had no visible connection to the map, the bottom-left leaf cluster looked cluttered, and the privacy panel overlapped the soil. Changes in `MapSection.jsx`: (1) cords from filters, legend and privacy to the map, same style as the lens cord (white halo, gold line, knob on the panel edge, ring on the target): filters to the upper-right butter tile, legend to the right ochre tile, privacy to the slab's front-right edge (counts for the whole map, never points); the example-card cord (with its travelling dot) is kept; all in a `CORDS` list in canvas units. (2) Bottom-left foliage cluster and the leaf that sat on the privacy panel removed (imports gone). (3) The panel column moved up (y 44) with 18-unit gaps and tighter insides; the privacy panel is now icon + title on one row with the text below (it was 5 lines tall); the legend header is shorter ("Reports per area", hi: "इलाके में रिपोर्टें") so it stays on one line. Measured in canvas units at 1920x930: panels 44-351 / 369-590 / 608-750, soil starts at 816 (before: privacy bottom 912); same in Hindi (44-353 / 371-593 / 611-753). Vitest 60 pass, lint clean, build OK. Not re-checked: phone after this round (the panel markup is shared, cords are desktop-only), 1366x657.

## Task 21 — Section edges: make the sections read as separate sheets (9 Oct 2026)

Reported: the sections felt like pages of one long rectangle stack. Asked for non-rectangular, asymmetric shapes and slightly different gradients, done separately from the sections' own designs. Only `index.css` changed (no component, text, image or layout change).
- **Mechanism:** the backgrounds of the four sections moved from the section element to a `::before` layer (z-index -1, under all content; the old `z-index: 2 / 1` on `.how-bg` / `.map-bg` were removed so the layers share the root stacking context and later sections paint over earlier ones). Every section after the hero has a layer that reaches `--edge-h` (44 to 92 px, `clamp(44px, 5.4vw, 92px)`) up over the bottom of the section above, masked at the top by its own SVG wave (`--edge-a` How: low hill left, long dip right; `--edge-b` Honest: one big sweep; `--edge-c` Map: double dip). The mask is a data-URI SVG, so no new files.
- **Tones (gradients changed a little, textures kept):** Hero warm parchment; How light sage at the top (it started as plain paper) down to the deeper sage; Honest warm latte instead of sage fading to paper; Map a cool sage-blue (`#D2EDF4` mixed into sage) fading to paper. The corner glows inside sections were left alone.
- **Checked** (Playwright): waves and tone changes at all three joints at 1920x930; phone 390 (44 px waves, no horizontal overflow). Vitest 60 pass, build OK. The foliage that hangs over the How/Honest seam still draws above the new layer.
- **Not done:** 1440 / 1366 not re-screenshotted; the colour system's contract (COLOUR_SYSTEM.md) was written for paper and does not cover the new section tones: they are decorative backgrounds only, text colours were not changed, but contrast of body text on the latte and sage-blue tops was not re-measured.

## Task 22 — Landing page: the remaining sections and the footer (9 Oct 2026)

Completed the plan of `docs/COLOUR_SYSTEM.md` 4.2. Built without reference images, from the real features and the existing generated art. Not committed.
- **Around the leaf** (`components/Beyond.jsx`, `#around`): three glass cards, all labelled "Example data": weather risk for potato late blight (6 chips: 2 past days, today, 3 ahead, each with glyph + word + border + tint from the status system, plus a legend), rain vs normal (two bars, +42% computed from the example 91 vs 64 mm), field from space (NDVI / NDRE / REDSI lines in the colour-blind-checked series colours and dash styles). A "Data from" line names the real sources. Values are illustrative; the real ones come from `/api/disease-risk`, the context layer and the geo-service. The card copy says it explains and never changes the diagnosis (that is the context layer's rule).
- **Language and report** (`components/ReportSection.jsx`, `#report`): the **real sample report** (`docs/sample_report.pdf` and the Hindi one, page 1 rendered with PyMuPDF to `assets/report/report-en|hi.webp`, cropped to header, photo and diagnosis) as two overlapping pages, the one in the reader's language in front; real language buttons (`LangButtons.jsx`, same state as the navbar); the download link points to the matching PDF copied to `client/public/samples/`. The sample is a test-set image with its own "SAMPLE" watermark and a rounded location; the caption says so.
- **Closing band + footer** (`components/Finale.jsx`, `<footer id="start">`): the only dark band (deep pine, butter button, the healthy "cheerful" wheat plant on the soil strip), then footer: brand, links to the four real pages, language buttons, the honest limits line ("Estimates, not a lab test. Treatment advice and the Hindi text are drafts until an agronomist has reviewed them."), data credits including OpenStreetMap, copyright. No claim about speed or sign-in (sign-in is disabled).
- **Look:** each new section has its own tone (Around: butter-sage meadow; Report: butter-cream; closing: pine) and its own asymmetric wave edge (`--edge-d/e/f`), same mechanism as Task 21. New tokens in `@theme`: `--color-bg-dark`, `--color-butter-wash` (the butter button's text colour was invisible until `bg-dark` existed as a token; caught in the screenshot).
- **Copy:** `beyond.*`, `repsec.*`, `finale.*` in en + hi (Hindi AI-drafted, not reviewed). Hindi mono labels get a 14 px floor.
- **Checked** (Playwright): 1920x930, all three sections one viewport (857 / 857; closing band 883 as an end cap); Hindi at 1920 for Around the leaf; phone 390 for Around and the closing band, no horizontal overflow. Vitest 63 pass (3 new in `Landing.test.jsx`), lint clean, build OK.
- **Not done / not checked:** Report section and the closing band in Hindi, 1440 / 1366 for the new sections, a real phone; contrast of the new tones was not re-measured (text colours unchanged). The privacy and "ten crops" parts of the plan are covered inside the Map and Honest sections instead of getting their own sections. Camera emblem and rice art remain unused.
- **Landing page is now complete** (9 parts: hero, how, honest, map, around, report, closing + footer, with the nav above).

## Task 23 — Landing page: final QA across devices, bug fixes, documentation (9 Oct 2026)

Not committed.
- **Bugs found and fixed:** navbar overflowed horizontally at 768 px (navbar breakpoint `md:` → `lg:`, mobile menu now has "Start a check"); canvas sections were wider than 1024-1366 px screens because the `--u` floor won over the width (clamped so the canvas never exceeds the screen; layout breakpoint moved to 1184 px via `--breakpoint-lg: 74rem`, all 6 media queries); tablet hero too large (capped at 34 rem); heading order, text under 11 px (hero labels floor 11 px), small tap targets (footer links, hero link, lang buttons); Honest footnote cut off at 1280×720 (copy shortened in en + hi, right padding 160 → 110 units); Around the leaf and Report 35-67 px taller than the viewport at 1366×768 (paddings and gaps tightened, now exactly one viewport); Honest points on phones were cramped (`max-lg:py-3`).
- **Checked (Playwright, Chromium):** 360×740, 768×1024, 1100×800, 1280×720, 1366×768, 1920×930, 2560×1300, Hindi at 1366×768 and 360: no horizontal overflow, no broken images; section heights in `docs/LANDING_PAGE.md` §7. Vitest 63 pass, build OK, lint shows only the old login-related warnings (App.jsx, Navbar.jsx, History.jsx).
- **Left as is (documented):** How is ~60 px taller than a 720-px-high screen (unit floor), the desktop nav text links are 20 px tall, Hindi was only checked at 1366×768, nothing was tested on a real device or in Firefox/Safari, contrast of text on the new section tones not re-measured. `assests/` (~60 MB raw art, untracked) is not used by the app: move it out of the repo before pushing.
- **Docs:** new `docs/LANDING_PAGE.md`; `docs/COLOUR_SYSTEM.md` status + §4.6 "As built"; README section; Pending list updated (Hindi landing-page review added; colour approval left for you to tick).

**Task 23, follow-up (9 Oct 2026): Map → Around the leaf joint and spacing.** Reported (screenshots at ~1905×930): the Map section and the one below it felt crowded with no differentiation. Honest assessment: my QA measured fit and overflow, not how the joins look at that size, and my own padding cut (`py-14` → `py-9`) had pushed "Around the leaf" right under the soil strip; its top tone was also almost the same cream as the bottom of the Map, so the wave edge was invisible. Fixes: Around the leaf now starts in a visibly greener sage (leaf 24% into sage-wash) and ends sage-tinted, so the wave into the Report section also shows; Around and Report got a real top padding (`clamp(64px, 6.4vw, 124px)`) and 48 px at the bottom; the leaves that sat on the heading and the intro text were moved. Checked by screenshot at 1905×930 (both sections 857, one viewport) and 1366×768 (Around 749, Report 748: about 55 px over the 694 available; I chose breathing room over squeezing). Vitest 63 pass, build OK. Not re-checked: this joint in Hindi and on phones, the Honest/How joints at 1905×930 by eye (only measured earlier).

## Task 24 — Landing page: motion and scroll animation, section by section (10 Oct 2026)

Asked: make every landing-page section feel alive (text, numbers, bars, lines, floating elements, scroll animation), following UI/UX rules. Not committed.
- **Mechanism (new `components/motion.jsx`, CSS block "Motion" at the end of `index.css`):** `useReveal()` (called once in `Home.jsx`) adds `.in` to every `[data-rv]` element when it scrolls into view (one IntersectionObserver, 15% visible). Markup picks the style with `data-rv="up|left|right|zoom|fade|wipe|t"` and a delay with `style={d(seconds)}`; `t` is a trigger only (its children `.rv-grow` / `.rv-pop` / `.rv-fade` animate when it gets `.in`). `<CountUp to dec prefix suffix delay />` counts a number up from 0 when seen. All reveals use the individual `translate` / `scale` / `rotate` properties so they stack with the layouts' own transforms; the existing `how-float` / `map-float` keyframes are untouched.
- **Per section:** Hero: eyebrow, headline lines, intro and buttons cascade in on load; ring grows and turns slowly; plant sways, cards and scan badge float; 87% counts up. How: header, divider lines grow from the centre, steps and islands rise in turn, bullets and plan list slide in, 92% counts up, foliage sways, button arrow nudges. Honest: rows cascade, each bar grows from 70%, then its interval caps fade in and the dot pops; every percentage and interval counts up in step with its bar; points slide in; board zooms in; scan badge and leaves float; soil and sprig drift on scroll (CSS scroll-driven, where supported). Map: text, features, selects cascade; hexagons pop in a wave from the centre; panels slide in from the right and the cords are wiped in after them; legend swatches pop. Around the leaf: three cards rise in turn (hover lift), risk chips pop in order and today's chip pulses, rain bars grow while 64 / 91 / +42% count up, the chart is wiped in left to right. Report: text and ticks cascade, front page slides in then the second page fades in, the badge pops, the pages float gently. Closing band: headline lines, button (pulsing butter glow, lift on hover), plant sways, footer columns fade in. Buttons across the page lift on hover with the arrow sliding (`.cta-lift`).
- **UI/UX rules kept:** everything is inside `prefers-reduced-motion: no-preference` (checked: with reduce, nothing is hidden, no animation runs, numbers show their final value at once); content is only hidden after the script adds `rv-js`, so a failed script cannot leave a blank page; only transform / opacity animate (no layout properties); durations .6–1.8 s with one ease-out curve; reveals run once, never repeat; the final text of every number is in the DOM at rest, so tests and screen readers see real values.
- **Bug found by the browser check:** the wipe effect first used `clip-path: inset(0 100% 0 0)`, which IntersectionObserver treats as fully hidden, so the chart and cords never appeared; now an animated mask.
- **Changed files:** `motion.jsx` (new), `index.css`, `Home.jsx`, all seven section components, `heroIcons.jsx` (LeafSketch / LeafCircle pass extra props through).
- **Checked:** Vitest 63 pass, build OK, lint: only 2 new "fast refresh" warnings for `motion.jsx` (it exports a hook, a helper and a component). Playwright at 1440×800: every in-view element reveals in all six sections, the counters run (58.66% mid-way, 99.78% at the end), How / Honest / Map look identical to before once settled; reduced-motion run; 390 px phone: no horizontal overflow. Dev server stopped, temp files removed.
- **Not done / not checked:** Firefox and Safari (individual transform properties and `animation-timeline` are modern; the drift simply stays still where unsupported), a real phone, Hindi with the new motion, 1366×768 and 1920×930 by eye, the animation timing felt by a person (checked in a throttled headless browser only).

## Task 25 — Design: "My Field" workspace (dashboard, result, log, profile) (10 Oct 2026)

Asked: a full, well-structured UI/UX design for the signed-in/guest area where images are uploaded, predictions happen and results are kept (tabs, pages, panels), reusing the codebase's design and colours. Design only, no app code changed. Not committed.
- **Deliverable:** one Design canvas (Claude Artifact) "PlantGuard My Field Workspace": https://claude.ai/artifact/1LRHv6EMuMSrP2msb6gzvj (private). 13 artboards: 00 Blueprint (page map, journey, real-vs-new data table), 01 Overview, 02 New check (interactive: crop, photo, location, analyze with progress), 03 Checkup result with 4 working tabs (Care plan, Field context, Satellite, Report & feedback; photo/heatmap switch), 04 Field log (interactive status tabs, crop filters, list/photo view, legend), 05 Profile & privacy (4 tabs, language, location switch, delete-my-data confirm, honest model card), 06 States (retake, no leaf, not sure, loading, slow start, error, empty log, first visit, no location, satellite messages, offline proposal), 07 Design system, sidebar and phone tab-bar components, three phone screens (overview, new check, result).
- **Structure:** left menu on desktop (Overview, New check, Field log, Map, Profile & privacy), bottom tab bar with a raised camera button on phones. New page: a checkup opens as its own page (today the result lives only inside /predict). /privacy folds into Profile & privacy.
- **Look:** the landing page's colour system v2, Fraunces / Inter / IBM Plex Mono, pine as the only strong button, the status system as shape + word + colour (healthy, early, moderate, severe, retake). Real crop icons and leaf photos from `client/src/assets` were uploaded to the canvas.
- **Data honesty:** every panel maps to an existing endpoint or to counts derived from the history; "small new" items are a recheck reminder (browser-only) and opening one checkup by link; sign-in/name/saved fields are drawn as disabled because sign-in is off; offline queue is marked "Proposal". Numbers in the mockups are labelled "Sample data". Rice blast treatment text and the crop accuracy figures are the real ones from the app.
- **Not done:** no code implementation yet; the Map page and Hindi versions of the new pages are not designed; the heatmap in the mockup is a drawn stand-in; I did not open the canvas in a browser to check it (the design tool's rules say not to verify unless asked), so layout slips are possible; the design hook flagged Inter/Fraunces as "overused fonts" (kept on purpose: they are the live site's fonts) and the camera-frame corner brackets as "border accent" (same frame as the landing hero).

## Task 26 — Build: the "My Field" workspace in the app (10 Oct 2026)

Built the Task 25 design in the React app. Not committed.
- **Routes (`App.jsx`):** two layouts. `SiteLayout` (banner + top navbar) for `/`, `/map`, `/privacy`, `/login`; `WorkspaceLayout` (left menu on desktop, bottom tab bar with a raised camera button on phones, language switch, guest card) for `/overview`, `/predict` (New check), `/history` (Field log), `/checkup/:id`, `/me`. Navbar gained a "My field" link. `components/DemoBanner.jsx` was split out of App.
- **Pages:** `Overview.jsx` (greeting, scan card, last checkup, four counts, needs-attention list with a recheck date 7 days after a disease result, weather-risk strip via the existing risk endpoint for the latest located potato/rice check, recent checkups, crop bars, accuracy of the user's crops); `History.jsx` rewritten as the Field log (status tabs with counts, crop chips, list or photo view, legend, load older); `Checkup.jsx` new (photo and heatmap switch, confidence ring, severity, yield, other classes; tabs Care plan, Field context, Satellite, Report & feedback reusing RiskStrip, ContextCard, FieldHealth, ReportButton, Feedback; a retake or not-sure result shows the existing ResultCard); `Profile.jsx` new (guest card with disabled sign-in, language, location switch, my data with delete confirm, model accuracy card); `Predict.jsx` restyled as the 4-step New check, and a saved result (has an `_id`) now navigates to `/checkup/:id` with the record in router state (results without an id still show inline, which the old tests rely on). `UploadBox` and `LocationConsent` restyled (same behaviour and texts). `HistoryList.jsx` deleted (unused).
- **Shared code (`components/workspace/`):** `status.jsx` (one status language: shape + word + colour, `levelOf`), `parts.jsx`, `useHistory.js`, `cropIcon.js`, `icons.jsx`, `WorkspaceLayout.jsx`. New CSS block "My Field workspace" at the end of `index.css`.
- **Backend:** new `GET /api/predict/:id` (owner only, with heatmap, never the exact location; 404 for others) so a checkup opens by link; `api.getPrediction`; test `server/tests/getOne.test.js`.
- **Strings:** new `ws.*` namespace in `en.json` and `hi.json` (plus `nav.myField`). The Hindi is AI-drafted and not reviewed (add to the Hindi review list).
- **Decisions:** no fake progress while analyzing (it shows the plain steps, not ticking ones); "rechecked" means a newer checkup of the same crop exists (comment in `Overview.jsx`: no field ids yet); the recheck reminder is just the computed due date (nothing stored); the offline queue and "download my data (JSON)" from the design are not built.
- **Checked:** client Vitest 67 pass (4 new in `Workspace.test.jsx`), server tests for the touched routes pass (getOne, feedback, predict, hardening), lint shows only fast-refresh warnings for the new helper files, build OK. Playwright with mocked API at 1440 (Overview, Field log, Checkup, New check, Profile) and 390 (Overview): layouts match the design; found and fixed a wrong i18n prefix on New check, list rows ignoring the grid, sidebar background ending early, hero text overlapping the plant.
- **Not done / not checked:** Hindi and the phone view of the other pages by eye; the Field context, Satellite and Report tabs with real data (they reuse the old components, so they still have the old square, mono look inside the new cards); the Map page is still in the old shell; real device, Firefox, Safari; the old `Navbar` and `/privacy` page unchanged; `client/src/assets/.impeccable/` appeared untracked (design-hook state, not mine).

**Task 26, follow-up (10 Oct 2026): "Back to the site" button.** Asked for a back button so people can return smoothly to where they came from. The workspace now has "Back to the site" at the top of the desktop menu and a back arrow in the phone header. It goes to the public page the visitor was on (landing page, map) and restores the scroll position there: `components/workspace/siteReturn.js` (the public layout keeps `{path, y}` in sessionStorage; the workspace reads it; falls back to `/`). New string `ws.menu.back` (en + hi, Hindi AI-drafted). Checked in Playwright: landing scrolled to 2600 px, into New check, Back: landing at 2600 px; phone arrow present. Vitest 67 pass, build OK. Not checked: the same round trip from `/map`, Safari.

## Task 27 — Fix the cut caption, test every layout across devices, document (10 Oct 2026)

Reported (screenshot at 1905×930): the sentence in the bottom right of the Report section is cut. Asked to fix it, test everything on different devices, make the layout adaptive, document, and finish. Not committed.
- **Cause:** the caption "Sample report, page 1 of 3 (a test-set photo)" sat inside the wave of the dark closing band (the band's `::before` reaches `--edge-h` up over the section above), so dark text sat on dark green. Report's bottom padding was only 3 rem. Fix in `ReportSection.jsx`: bottom padding `--edge-h + 1.5 rem` (`+ 2 rem` on phones). The caption now has 119 px of clear space at 1905×930 (ratio to the wave 1.29 or more at every size from 360 to 2560).
- **Sweep, landing** (Playwright, 360×740 to 2560×1300, 11 sizes): no horizontal overflow, no broken images, no text under 11 px. Also fixed: the hero badge "SCAN ACTIVE" wrapped onto two lines at 1280 to 1440 px (`Hero.jsx`: nowrap, width from `min-width`).
- **Sweep, workspace** (API mocked; `/overview`, `/predict`, `/history`, `/checkup/:id` ok and retake, `/me` four tabs; 360, 390, 768, 1024, 1280, 1440, 1920; Hindi at 360, 768, 1280, 1920): found a 6 px overflow on `/overview` at 360 px (risk card; fixed with `min-w-0` and smaller padding on phones), 10 px text in the older components (all `text-[10px]` raised to 11 px across the app, including Map, Login, Register), and low-contrast `text-sage` labels (now `text-ink-2`). Tablets (768 to 1183 px) get Needs attention and Weather risk side by side. Checked by screenshot at 390 (New check, Hindi Checkup), 768 (Overview), 1280×720 (hero) and 1905×930 (Report).
- **Docs:** new `docs/WORKSPACE.md` (routes, pages and data sources, shared code, scaling, tests, limits); `docs/LANDING_PAGE.md` (Report clearance, this sweep, new section 9 on motion); README (workspace section, `GET /api/predict/:id`); Pending list (Hindi `ws.*` review, real phone and other browsers).
- **Checked:** Vitest 67 pass, build OK, lint only fast-refresh notes. Server tests for the touched routes passed earlier (Task 26).
- **Not done:** real devices, Firefox, Safari; the workspace sweep used mocked data, so Field context and Satellite were not seen with real answers; the older components inside the Checkup tabs keep their older inner look.


## Task 28 — Live site down: billing was disabled on the Google project (10 Oct 2026)

Reported: New check on the live site (Vercel) answered "Diagnosis failed" for a wheat photo. Not a code bug.
- **Cause:** billing was disabled on `plant-disease-503711`: `gcloud billing projects describe` showed `billingEnabled: false`, and every Cloud Run log said "The request failed because billing is disabled for this project" (server 503, ml-service and geo-service 500). The frontend gets no JSON body then, so it shows the generic `predict.failed`.
- **Fix:** the user re-linked the billing account `019E94-58F9F7-0480AC` ("My Billing Account"). geo-service recovered by itself. server and ml-service stayed at 429 "Rate exceeded" / "no available instance" for ~35 minutes (the first start attempt had failed while billing was off), so I created new revisions from the same image with a label only: `gcloud run services update ml-service|server --region asia-south1 --update-labels restarted=1010` (ml-service-00009-xq8, server-00019-bp8). They answered 429 for about 5 more minutes after that, then both returned 200.
- **Verified:** `/health` 200 on all three, CORS preflight for the Vercel origin 204 with the right `access-control-allow-origin`, a real `POST /api/predict` (wheat photo from `ml-service/data/e2e`) returned 201 in 4 s; the test record (device id `11111111-…`) was deleted afterwards with `DELETE /api/predict`.
- **Not done / open:** the label `restarted=1010` stays on both services (harmless). The frontend still shows a generic error when the server is unreachable; a clearer "service not available, try again later" message was offered, not built. Budget alert ($1, `docs/DEPLOY.md` A2) was not checked; the cause of billing being unlinked (trial or credits ending) is not known: check Billing → Overview.
