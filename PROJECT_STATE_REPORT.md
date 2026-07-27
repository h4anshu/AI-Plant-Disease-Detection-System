# AI Plant Disease Detection System — Complete Project State Report
### Last updated: July 27, 2026

> **Purpose of this document:** This is the single source of truth for the entire project's state — every decision made, every task completed, every known issue, and all remaining work. Upload this file at the start of any new conversation to give full context without re-explaining the project history.

---

## 1. Project Identity

**Official title (synopsis/report):** AI-Powered Plant Disease Detection with Severity-Based Yield Impact Estimation
**Research paper title:** CNN-Based Plant Disease Classification with Integrated Yield Loss Estimation for Indian Crops
**Demo tagline:** "From Leaf to Loss"

**Domain:** Artificial Intelligence & Machine Learning + Precision Agriculture / Smart Farming

**Problem statement:** Indian farmers lack an accessible AI-based system that can instantly detect crop diseases from leaf images, assess infection severity, and estimate the resulting yield loss — leading to delayed treatment decisions and significant economic damage.

**Core idea:** Farmer uploads a leaf photo → CNN detects disease + estimates severity (early/moderate/severe) → bridge layer converts severity → yield-loss % → existing Extra Trees yield model adjusted: `Adjusted Yield = Base Prediction × (1 − Loss Factor)` → farmer sees: diagnosis + treatment advice + adjusted yield + economic loss estimate.

---

## 2. Architecture

```
┌──────────────┐    image+crop   ┌──────────────┐   image+crop   ┌────────────────────┐
│   React      │ ─────────────▶  │  Node +       │ ─────────────▶ │  Python + FastAPI   │
│  (frontend)  │ ◀─────────────  │  Express API  │ ◀───────────── │  (ML inference)     │
└──────────────┘   JSON result   └──────┬───────┘   JSON result   └─────────┬──────────┘
                                        │                                    │
                                  ┌─────▼─────┐                    ┌─────────▼──────────┐
                                  │  MongoDB   │                    │ Shared EfficientNetB0│
                                  │  Atlas     │                    │ backbone + per-crop  │
                                  └───────────┘                    │ classification heads │
                                                                    └──────────────────────┘
```

**Key design decision:** ONE shared CNN backbone (EfficientNetB0, ImageNet weights, frozen) with a SEPARATE classification head per crop. The farmer selects crop in the UI (dropdown) — the model does NOT auto-detect crop from the image. This is deliberate: production agri-AI apps do this, avoids compounding errors. Adding a new crop later = add one head + fine-tune, not retrain everything.

**Request flow:** React → Express (`/api/predict`, multipart: image + crop) → FastAPI (`/predict-disease`) → backbone extracts features → crop-specific head classifies → severity computed via leaf-area analysis → Grad-CAM generated → result returned → Express uploads image to Cloudinary, applies treatment advice, saves to MongoDB → full result returned to React.

---

## 3. Tech Stack (as actually built)

| Layer | Technology | Notes |
|---|---|---|
| Frontend | React 19, Vite 8, Tailwind CSS v4 (`@tailwindcss/vite`), Axios, react-router-dom | Teammate-built UI ("Field Journal style"), merged into project |
| Backend | Node.js, Express 5 — **ESM modules** (`import`/`export`), flat `server/` layout (entry: `server.js`) | Adopted teammate's conventions (not the original plan's CommonJS/nested layout) |
| Auth | JWT (`jsonwebtoken` + **bcryptjs**, not `bcrypt`) | Raw JWT in Authorization header (no "Bearer" prefix) — matches frontend convention |
| Database | MongoDB Atlas (Mongoose) | Free M0 tier, env var: `MONGODB_URI` |
| Image Storage | Cloudinary | Free tier, images uploaded during predict flow |
| ML Service | Python 3.11 (pinned), FastAPI, TensorFlow/Keras, scikit-learn, scipy, matplotlib | Models loaded once at startup, not per-request |
| ML Model | Shared EfficientNetB0 backbone (frozen) + per-crop Dense heads | Cached feature extraction approach for training |
| Deploy (planned) | Vercel (React), Render (Express + FastAPI), MongoDB Atlas | Not yet deployed |

---

## 4. Project Structure (as built on disk)

```
AI Plant Disease Detection System/
│
├── client/                          # React frontend (teammate-built, merged)
│   ├── src/
│   │   ├── components/              # UploadBox, ResultCard, Navbar, etc.
│   │   ├── pages/                   # Home, Predict, History, Login, Register
│   │   ├── services/api.js          # Axios calls, baseURL from VITE_API_URL
│   │   ├── context/AuthContext.jsx
│   │   └── App.jsx
│   ├── .env                         # VITE_API_URL=http://localhost:4000/api
│   └── package.json
│
├── server/                          # Node + Express — FLAT layout, ESM
│   ├── config/
│   │   ├── db.js                    # MongoDB connection (MONGODB_URI)
│   │   └── cloudinary.js
│   ├── models/
│   │   ├── User.js                  # { name, email, passwordHash, createdAt }
│   │   └── Prediction.js            # { userId, imageUrl, crop, disease, confidence,
│   │                                #   severity (enum: healthy/early/moderate/severe),
│   │                                #   yieldLossPercent (null until Phase 5),
│   │                                #   treatment, gradcam, createdAt }
│   ├── routes/
│   │   ├── auth.routes.js
│   │   └── predict.routes.js
│   ├── controllers/
│   │   ├── authController.js
│   │   └── predictController.js     # Forwards crop+image to FastAPI, applies
│   │                                # getTreatment(crop, disease), saves to Mongo
│   ├── middleware/
│   │   ├── auth.js                  # JWT verify
│   │   └── upload.js                # Multer
│   ├── utils/
│   │   ├── treatmentMap.js          # REAL advice (26 diseases + 6 healthy), nested
│   │   │                            # treatmentMap[crop][disease], sourced from ICAR/
│   │   │                            # state ag university literature
│   │   └── yieldLoss.js             # Phase 5 placeholder — not built yet
│   ├── server.js                    # Entry point, port 4000
│   ├── .env                         # Real credentials (gitignored)
│   ├── .env.example                 # Placeholder template (committed)
│   └── package.json
│
├── mock-ml-service/                 # Teammate's stub for frontend dev
│   └── (kept for reference, accepts crop field, returns stub responses)
│
├── ml-service/                      # Python FastAPI — real ML service
│   ├── app.py                       # FastAPI app, lifespan loads models once at startup
│   ├── predict.py                   # load_models(), predict_disease() orchestrator
│   ├── severity.py                  # v4 intra-image median+MAD severity computation
│   ├── gradcam.py                   # Grad-CAM generation, caches grad-model per head
│   ├── requirements.txt             # fastapi, uvicorn, tensorflow, scikit-learn, scipy, matplotlib
│   │
│   ├── models/
│   │   ├── backbone/                # (backbone rebuilt from ImageNet weights at startup,
│   │   │                            #  not stored as a file — the training notebook's
│   │   │                            #  saved backbone was discarded)
│   │   └── heads/
│   │       ├── wheat_head.keras     # 5-class (Yellow_Rust REMOVED — see §8)
│   │       ├── rice_head.keras      # 5-class
│   │       ├── sugarcane_head.keras # 11-class
│   │       ├── potato_head.keras    # 3-class
│   │       ├── maize_head.keras     # 4-class
│   │       └── pigeonpea_head.keras # 4-class
│   │
│   ├── data/
│   │   ├── raw/<crop>/<class>/      # Consolidated, cleaned source images (5.2GB+)
│   │   ├── train/<crop>/<class>/    # 70% split
│   │   ├── val/<crop>/<class>/      # 15% split
│   │   ├── test/<crop>/<class>/     # 15% split
│   │   ├── features/<crop>_<split>.npz  # Cached backbone features (one-time extraction)
│   │   ├── eda_figures/             # All EDA + training + Grad-CAM PNGs (300 DPI)
│   │   ├── dataset_index.csv        # 36,848 rows, master index of all images
│   │   ├── label_maps.json          # crop → {class_name: int_index} (wheat is 5-class)
│   │   ├── class_weights.json       # Per-crop inverse-frequency class weights
│   │   ├── severity_labels.json     # 36,848 records, v4 method, 44% YR agreement
│   │   ├── wheat_severity_labels.csv # 15,000 rows, real YR-19 expert grades (0/R/MR/MRMS/MS/S)
│   │   ├── split_report.json
│   │   └── audit_report.json
│   │
│   └── train/                       # Scripts and notebooks
│       ├── 01_eda.ipynb             # Complete, executed — class distribution, samples,
│       │                            # image properties, severity distribution, split balance
│       ├── 02_preprocessing.ipynb   # Complete — tf.data pipeline, augmentation, label maps
│       ├── 03_train_local.ipynb     # Complete — cached-feature training + wheat 5-class
│       │                            # correction appended at end
│       ├── 04_gradcam_diagnostic.ipynb  # Complete — wheat Yellow_Rust shortcut confirmed
│       ├── consolidate_raw_data.py
│       ├── audit_datasets.py
│       ├── split_data.py
│       ├── compute_severity.py      # v4 canonical version
│       ├── severity_v1_restore.py
│       ├── severity_v3_gate.py
│       ├── severity_v3_diagnose.py
│       └── severity_v4_gate.py
│
├── implementation-plan.md           # Updated plan (reflects all decisions)
├── UI_Implementation_Plan.md        # Frontend guide for teammate
├── .gitignore                       # Covers: data/, venv/, .env, *.zip, *.h5, *.pkl, etc.
└── README                           # Not yet written
```

---

## 5. Crop Scope & Dataset Sources

### Active crops (6):

| Crop | Source | Raw images | Train | Val | Test | Disease classes | Notes |
|---|---|---|---|---|---|---|---|
| Wheat | Mendely_Wheat (Original only, 5 classes) + Yellow-Rust-19 (collapsed to 1 class, but REMOVED from classification — see §8) | 16,603 → effectively 1,603 after YR removal from classification | 11,622 | 2,491 | 2,490 | 5 (was 6, Yellow_Rust removed) | YR-19 expert grades still used for severity validation only |
| Rice | Mendeley Sethy et al. (4 disease classes) + RiceLeafBD Healthy (252 images added) | 6,184 | 4,329 | 928 | 927 | 5 | Healthy class from a different source — Grad-CAM confirmed no leakage |
| Sugarcane | Mendaly 11-class (Maharashtra, India) | 6,748 | 4,723 | 1,011 | 1,014 | 11 | Two other sugarcane sources excluded (taxonomy conflicts / likely pre-augmented) |
| Potato | PlantVillage subset (deduped nested folder issue) | 2,152 | 1,506 | 323 | 323 | 3 | Single-source, no leakage concern |
| Maize | Kaggle/HuggingFace (smaranjitghose, Corn/Maize Leaf Disease) | 4,188 | 2,931 | 628 | 629 | 4 | PlantVillage locally had no corn — needed separate source |
| Pigeonpea | Mendeley | 973 | 680 | 145 | 148 | 4 | Smallest dataset, lowest accuracy |

**Total: 36,848 images across 6 crops, 32 disease classes (including Healthy per crop)**

### Excluded / deferred crops:

| Crop | Reason | Status |
|---|---|---|
| Mustard | Downloaded dataset was WRONG DATA (Indonesian ripeness labels, not disease). Real disease dataset (HDMLS) is not publicly downloadable. Mustard is a Rabi crop (Oct-Feb), so self-collection impossible in July. | Deferred to Nov-Feb season. Email sent to HDMLS authors. Architecture supports adding as 7th head later. |
| Chickpea | FUSARIUM-22 dataset is resistance-grading only (5 severity classes), NO healthy class at all. No healthy-chickpea leaf dataset exists online. Model can't say "no disease detected" without one. | Permanently excluded. Data kept on disk in backup, not in active pipeline. |

### Excluded datasets (downloaded but not used):

| Dataset | Why excluded |
|---|---|
| Master Plant Disease Dataset (70,457 images, 42 crops) | Confirmed overlap with standalone PlantVillage and sugarcane sets; would double-count images |
| Kaggle_Rice Leaf Diseases (120 images, 3 classes) | Too small, different taxonomy from Mendeley rice |
| Sugarcane Leaf Disease Dataset (5-class) | Taxonomy conflict with the 11-class Mendaly source |
| Sugarcane_leafs (6-class, 19,926 images) | Likely pre-augmented (suspiciously high count for ~2,500-image dataset), different taxonomy |
| wheat_leaf (407 images) | Taxonomy overlap with Mendely wheat unresolved, too small to justify |
| Mandely_Wheat Augmented + Split folders | Pre-augmented/pre-split data creates train/test leakage risk — only Original folder used |
| FUSARIUM-22 augmented folder (15,000 images) | Same leakage risk — only raw 4,339 used (then excluded with chickpea entirely) |

### Raw data backup location:
`D:\AI-Plant-Disease-RAW-BACKUP\` — contains all 15 original downloaded dataset folders. Confirmed no `.git` folders inside. Completely outside the project tree.

---

## 6. Disease Classes Per Crop (final, matching trained models)

**Wheat (5 classes):**
BlackPoint, FusariumFootRot, HealthyLeaf, LeafBlight, WheatBlast

**Rice (5 classes):**
Bacterialblight, Blast, Brownspot, Healthy, Tungro

**Sugarcane (11 classes):**
Banded_Chlorosis, BrownRust, Brown_Spot, Dried_Leaves, Grassy_shoot, Healthy_Leaves, Pokkah_Boeng, Sett_Rot, Viral_Disease, Yellow_Leaf, smut

**Potato (3 classes):**
Early_blight, Late_blight, healthy

**Maize (4 classes):**
Blight, Common_Rust, Gray_Leaf_Spot, Healthy

**Pigeonpea (4 classes):**
Healthy, Leaf_Spot, Leaf_webber, Sterilic_mosaic

**Important notes:**
- Wheat's `Yellow_Rust` class was REMOVED after Grad-CAM diagnostic confirmed shortcut learning (see §8)
- Sugarcane's `Banded_Chlorosis` is NOT a disease — it's cold-injury (abiotic). treatmentMap.js handles this correctly with a "no fungicide needed" message
- Sugarcane's `Dried_Leaves` is a symptom, not a specific disease — treatmentMap.js provides a diagnostic checklist instead of a single treatment
- Pigeonpea's `Leaf_webber` is a pest (caterpillar), not a pathogen — treated with insecticides, not fungicides

---

## 7. Severity Labeling — Full History

Severity estimation is this project's stated differentiator. The goal: automatically grade each diseased image as early/moderate/severe based on how much leaf area is affected. Healthy-class images get `severity: "healthy"` (a distinct 4th state).

**Validation method:** Yellow-Rust-19 has REAL expert-assigned severity grades (0/R/MR/MRMS/MS/S, mapped to early/moderate/severe). Agreement % between automated method and these expert grades is the validation metric.

| Version | Method | YR Agreement | Status | Failure mode |
|---|---|---|---|---|
| v1 | HSV hue/saturation threshold | 49.0% | Best number ever, but source code LOST (overwritten by v2, no git history) | Naive saturation-based leaf mask fails on cluttered field backgrounds |
| v2 | ExG+Otsu leaf mask → Lab k-means(k=2) | 15.8% | Failed — worse than v1 | Forcing k=2 manufactures a fake "diseased" cluster on healthy tissue |
| v3 | Per-crop healthy Lab distribution + percentile threshold | 40.8% | Failed gate (didn't beat v1) | Cross-image healthy reference washes out localized/moderate disease |
| v4 | Per-image median + MAD outlier detection | 44.0% | **CURRENT OFFICIAL METHOD** | Under-triggers on severe cases where entire leaf is uniformly diseased (no localized outlier to detect) |
| v1-reconstruction | Best-effort rebuild of v1 from docstring | 40.0% | Discarded | Didn't validate close enough to trust as genuine v1 |

**Current state:** `severity_labels.json` has 36,848 records tagged with v4 method. These labels are **weak/heuristic signal** (44% validated agreement), NOT ground truth. Documented as a known limitation.

**Severity in live inference:** `severity.py` implements v4 (ExG+Otsu leaf mask → intra-image median+MAD outlier detection → % affected → early<15% / moderate 15-40% / severe>40%). Runs per-image at request time for new uploads. Healthy predictions skip severity computation entirely.

---

## 8. Model Training — Results & Known Issues

### Training approach:
- **Cached feature extraction:** backbone processes each image ONCE, saves 1280-dim feature vectors to `.npz` files. Per-crop heads then train on these cached vectors — seconds per crop instead of hours.
- **No fine-tuning of backbone:** backbone stays frozen (ImageNet weights). This prevents the shared-backbone-corruption bug found in Claude Code's earlier attempt, where fine-tuning wheat's head permanently altered backbone weights for all subsequent crops.
- **Head architecture:** Input(1280) → Dense(128, relu) → Dropout(0.3) → Dense(num_classes, softmax)
- **Training config:** batch_size=64, max epochs=30, early stopping patience=5, Adam lr=1e-3, ReduceLROnPlateau, class-weighted loss (inverse frequency)

### Test results:

| Crop | Test Accuracy | Test N | Classes | Notes |
|---|---|---|---|---|
| Wheat | 99.58% | ~240 (5-class subset) | 5 | Post Yellow_Rust removal; Grad-CAM validated — real lesion detection |
| Rice | 99.68% | 927 | 5 | Grad-CAM showed Healthy class confusion is real (not source-leakage) |
| Sugarcane | 92.31% | 1,014 | 11 | Most classes (11), expected lower accuracy; real inter-disease confusion |
| Potato | 98.76% | 323 | 3 | Single-source (PlantVillage), no leakage concern |
| Maize | 94.28% | 629 | 4 | Blight ↔ Gray_Leaf_Spot confusion (visually similar diseases) |
| Pigeonpea | 79.05% | 148 | 4 | Smallest dataset (~973 total), known weak point |

### Yellow_Rust shortcut-learning finding (CRITICAL):
- Grad-CAM diagnostic showed wheat's Yellow_Rust class (from YR-19 dataset) was achieving 100% accuracy by recognizing photography style (macro shots on dark backgrounds) rather than actual rust symptoms
- Yellow_Rust was REMOVED from wheat's classification head (retrained as 5-class)
- YR-19 data retained ONLY for severity-grade validation (its original, valid use)
- This finding is documented as a positive methodological contribution for report/viva — catching it via Grad-CAM rather than shipping a false 100%

### Known model limitations:
1. **Lab/controlled-condition photography bias:** most training data is from controlled settings (uniform backgrounds, staged lighting), not real farmer phone cameras. Performance on real-world field photos is unverified.
2. **Pigeonpea accuracy is low (79%)** due to smallest dataset size (~973 images). Known, documented limitation.
3. **Severity labels are weak signal** (44% validated agreement) — the severity shown to farmers is a heuristic estimate, not validated ground truth.
4. **No data augmentation was applied during training** — augmentation is defined in the preprocessing notebook but the cached-feature approach bypasses the augmentation pipeline (features are extracted from raw images, not augmented ones). This is a potential improvement area.

---

## 9. API Endpoints (as built and tested)

### Express (Node, port 4000):

| Method | Route | Purpose | Status |
|---|---|---|---|
| POST | `/api/auth/register` | Create account | ✅ Working (tested via curl) |
| POST | `/api/auth/login` | Login, return JWT | ✅ Working |
| POST | `/api/predict` | Upload image + crop → orchestrate ML → save → return result | ✅ Working end-to-end (all 6 crops, diseased + healthy cases) |
| GET | `/api/predictions` | User's prediction history | ✅ Working |
| GET | `/health` | Health check | ✅ Working |

### FastAPI (Python, port 8000):

| Method | Route | Purpose | Status |
|---|---|---|---|
| POST | `/predict-disease` | image + crop → disease, confidence, severity, gradcam | ✅ Working (models loaded at startup, not per-request) |
| GET | `/health` | Health check | ✅ Working |

### Prediction response shape:
```json
{
  "disease": "FusariumFootRot",
  "confidence": 0.9999,
  "severity": "early",
  "treatment": "Fusarium foot rot rots the crown and stem base...",
  "gradcam": "<base64 PNG, ~100-130K chars>",
  "yieldLossPercent": null,
  "imageUrl": "https://res.cloudinary.com/...",
  "crop": "wheat",
  "createdAt": "2026-07-27T..."
}
```

---

## 10. End-to-End Verification (completed)

The following was verified with real curl tests against running services:

| Test | Result |
|---|---|
| User registration (POST /api/auth/register) | ✅ 201, real user in MongoDB |
| User login (POST /api/auth/login) | ✅ JWT returned |
| Wheat diseased prediction (FusariumFootRot) | ✅ Correct class, 99.99% confidence, severity "early", real treatment text, Grad-CAM non-null, Cloudinary URL live |
| Sugarcane diseased prediction (Brown_Spot) | ✅ Correct class, real treatment, severity "moderate" |
| Potato diseased prediction (Late_blight) | ✅ Correct class, real treatment |
| Potato HEALTHY prediction | ✅ severity: "healthy", reassuring treatment message, no crash |
| Cloudinary URL verification | ✅ HTTP 200, real JPEG content (verified EXIF) |
| MongoDB record verification | ✅ Records match API responses field-for-field, including gradcam |
| Prediction history (GET /api/predictions) | ✅ Returns all predictions for authenticated user |

---

## 11. Treatment Advice (Phase 3 — COMPLETE)

`server/utils/treatmentMap.js` contains real, sourced agronomic treatment advice for all 32 disease classes (26 diseases + 6 healthy messages). Structured as nested object: `treatmentMap[crop][disease]` → advice string. Accessed via exported `getTreatment(crop, disease)` function with built-in fallback.

Sources: ICAR, state agricultural university extension bulletins (TNAU, GBPUAT, RPCAU, CPRI), Indian plant-pathology literature. Full sourced report with citations available separately.

Key design decisions in treatment content:
- Banded_Chlorosis explicitly says "NOT a disease, no fungicide needed" (cold injury)
- Dried_Leaves provides a diagnostic checklist ("split a stalk to check for red rot"), not a single treatment
- Viral/phytoplasma diseases (Tungro, Grassy_shoot, Viral_Disease, Yellow_Leaf, Sterilic_mosaic) lead with "no chemical cure" and emphasize resistant varieties + vector control
- Healthy messages are crop-specific, not generic

---

## 12. Git / Repository State

**Repo:** `github.com/h4anshu/AI-Plant-Disease-Detection-System`
**Branches:** `main` (primary), `master` (exists, needs cleanup — was created during a force-push incident, should be deleted once main is confirmed correct)
**Contributors:** h4anshu (ML/backend), learning-processs (teammate, frontend UI)

**.gitignore covers:** `ml-service/data/`, `node_modules/`, `venv/`, `.env`, `*.zip`, `*.rar`, `*.h5`, `*.pkl`, `*.pth`, `*.onnx`, `*.tflite`, `*.pb`, `*.savedmodel`, `.claude/`, OS junk

**What IS committed:** all code (client/, server/, ml-service/*.py scripts), notebooks, config files, package.json files, .env.example
**What is NOT committed (by design):** training data (~5.2GB in ml-service/data/), model weights (ml-service/models/heads/*.keras), cached features (ml-service/data/features/*.npz), .env files with real credentials

**Known issue:** `master` branch on GitHub may have stale/orphaned state from the force-push incident. The `main` branch is the real one. The merge was done via `git merge -s ours --allow-unrelated-histories` to preserve teammate's original commit history while adopting the merged project state.

---

## 13. Environment Setup (for anyone starting fresh)

### Server (.env — in server/ folder):
```
MONGODB_URI=<Atlas connection string>
PORT=4000
JWT_SECRET=<long random hex string, generate via: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))">
FASTAPI_URL=http://localhost:8000
CLOUDINARY_CLOUD_NAME=<from Cloudinary dashboard>
CLOUDINARY_API_KEY=<from Cloudinary dashboard>
CLOUDINARY_API_SECRET=<from Cloudinary dashboard>
```

### Client (.env — in client/ folder):
```
VITE_API_URL=http://localhost:4000/api
```
**CRITICAL:** Must be created with ASCII encoding (not UTF-16). Vite only reads .env at startup — must fully restart `npm run dev` after creating/changing this file.

### Starting all services:
```bash
# Terminal 1: ML service
cd ml-service
source venv/bin/activate  # or venv\Scripts\activate on Windows
uvicorn app:app --port 8000

# Terminal 2: Express backend
cd server
node server.js

# Terminal 3: React frontend
cd client
npm run dev
```

---

## 14. Frontend State (teammate's work)

**Built by:** teammate (learning-processs on GitHub)
**UI style:** "Field Journal" design
**Pages:** Home, Predict, History, Login, Register
**Current state:** UI is functional and styled, but was developed against `mock-ml-service` (stub responses). Has NOT been tested against the real ML service yet.

### Known frontend issues to address:
1. **Predict page crop dropdown** — currently has only 4 crops (wheat, potato, mustard, sugarcane) hardcoded. Needs updating to the real 6: wheat, rice, sugarcane, potato, maize, pigeonpea
2. **API paths** — `getPredictionHistory` calls `api.get('/predict')` but the actual history route is `GET /api/predictions` (plural) — needs fixing to `api.get('/predictions')`
3. **Grad-CAM rendering** — Result card needs to handle and display the base64 Grad-CAM overlay image (currently may not render it since mock returned `gradcam: null`)
4. **Yield impact block** — should be hidden/conditional since `yieldLossPercent` is always `null` until Phase 5
5. **Severity badge** — should handle `severity: "healthy"` (green badge, not just early/moderate/severe)
6. **Frontend was given `UI_Implementation_Plan.md`** explaining the crop-aware architecture and API contract — teammate should follow that document for any future frontend work

---

## 15. Remaining Work (by phase)

### Phase 5 — Yield Impact Layer (NOT STARTED, the project's differentiator)
- Build yield-loss lookup table: for each (crop, disease, severity) → loss % — MUST be backed by real agronomy research papers (will be questioned in viva)
- `utils/yieldLoss.js`: `severity + crop + disease → lossPercent`
- Integrate existing Extra Trees yield model into FastAPI (`yield_model.pkl`)
- Bridge formula: `Adjusted Yield = Base Predicted Yield × (1 − lossFactor)`
- Extend Prediction schema: populate `yieldLossPercent` field (currently always null)
- Extend Result card: show base yield, estimated loss %, and economic impact estimate

### Phase 6 — Testing, Deploy, Docs (NOT STARTED)
- End-to-end testing through the actual React UI (not just curl)
- Deploy: React → Vercel, Express → Render, FastAPI → Render (separate service), DB → Atlas (already on Atlas)
- Write README
- Architecture diagram for report
- Prepare research paper section + evaluation graphs

### Frontend fixes needed (see §14):
- Update crop dropdown to 6 active crops
- Fix history endpoint path
- Handle Grad-CAM rendering
- Handle `severity: "healthy"` display
- Conditional yield-impact block

### Other open items:
- Mustard (7th crop) — pending data (HDMLS author email reply, or Nov-Feb self-collection season)
- `master` branch cleanup on GitHub (delete orphaned branch)
- Model weights not committed to git — need Git LFS setup or separate artifact storage for deployment
- Data augmentation not actually applied during training (cached features bypass augmentation pipeline) — potential improvement
- No automated tests exist (unit, integration, or e2e)

---

## 16. Key Decisions Log (chronological)

| Decision | Reasoning | Impact |
|---|---|---|
| 6 India/UP-relevant crops, not generic PlantVillage set | Differentiation — standalone tomato/pepper detection is saturated | Defines scope, dataset sourcing |
| Shared backbone + per-crop heads, not single flat model | Handles uneven data across crops, scalable to new crops | Core architecture |
| Crop selected by user in UI, not auto-detected | Production pattern (Plantix does this), avoids compounding errors | Frontend needs dropdown, backend forwards crop |
| ESM modules, flat server layout, bcryptjs, port 4000 | Adopted teammate's conventions (real working code > plan's conventions) | Server-wide convention |
| Use only original/raw dataset folders, discard pre-augmented | Prevents train/test leakage from pre-augmented copies | Data integrity |
| Mendaly 11-class for sugarcane (not 5-class or 6-class) | Most comprehensive taxonomy, backed by published data-in-brief | 11 classes instead of 5 |
| Severity via pixel-level leaf-area analysis (not confidence-band proxy) | Scientifically defensible, matches published methodology | Required 4 iterations (v1-v4), landed at 44% agreement |
| Remove Yellow_Rust from wheat classification | Grad-CAM confirmed shortcut learning (photography style, not disease) | Wheat head is 5-class, not 6 |
| Cached feature extraction for training | Enables CPU training in minutes instead of hours, prevents backbone corruption | Feature files cached to disk |
| Raw JWT (no "Bearer" prefix) | Matches teammate's existing frontend convention | Auth middleware expects raw token |

---

## 17. Files That Must Not Be Lost

| File | Why | Backed up? |
|---|---|---|
| `ml-service/models/heads/*.keras` (6 files) | Trained model weights — hours of work | On disk only, not in git |
| `ml-service/data/features/*.npz` | Cached backbone features — ~30-40 min to regenerate | On disk only |
| `ml-service/data/label_maps.json` | Maps class names to model output indices — mismatch = wrong predictions | In git |
| `ml-service/data/class_weights.json` | Training class weights — needed to reproduce training | In git |
| `ml-service/data/wheat_severity_labels.csv` | 15,000 real expert grades — irreplaceable validation data | On disk only |
| `server/utils/treatmentMap.js` | 26 diseases of researched advice — hours of research | In git |
| `ml-service/train/*.ipynb` (4 notebooks) | Complete training/analysis pipeline — reproduce results | Should be in git |
| `ml-service/train/compute_severity.py` | v4 canonical severity method — lost v1 already, don't repeat | Should be in git |

---

## 18. Summary — Where Things Stand

**What's DONE and WORKING:**
- ✅ Full ML pipeline: dataset collection → audit → consolidation → split → EDA → preprocessing → training → evaluation → Grad-CAM validation
- ✅ 6-crop disease classification model (shared backbone + per-crop heads)
- ✅ Real-time severity estimation (v4 method, per uploaded image)
- ✅ Real-time Grad-CAM heatmap generation
- ✅ FastAPI service with models loaded at startup
- ✅ Express backend: auth, predict, history, Cloudinary upload, MongoDB persistence
- ✅ Real treatment advice for all 32 classes (sourced from Indian agricultural literature)
- ✅ End-to-end verification: upload → Express → FastAPI → Cloudinary → MongoDB → response (all fields populated, multiple crops, diseased + healthy cases)
- ✅ Frontend scaffold (teammate-built, merged, building cleanly)

**What's NOT done:**
- ❌ Phase 5: Yield-loss layer (the project's differentiator — not started)
- ❌ Phase 6: Deployment (not started)
- ❌ Frontend pointed at real service (still on mock)
- ❌ Frontend fixes (crop dropdown, history endpoint, Grad-CAM rendering)
- ❌ README, research paper sections, evaluation graphs
- ❌ Mustard (7th crop, deferred to Nov-Feb)
- ❌ Automated testing of any kind
