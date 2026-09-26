# Work log

Running record of work on the AI Plant Disease Detection System: what was done, how, and why. Newest entries at the bottom of each section; each task lists its outcome and where the evidence lives.

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
