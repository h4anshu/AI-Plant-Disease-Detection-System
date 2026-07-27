# Codebase Audit Report

**Date:** 2026-07-27
**Scope:** `client/`, `server/`, `ml-service/` (read-only inventory — nothing modified, fixed, or created except this file)
**Method:** every claim below is backed by a command run or a file actually read during this audit, not by memory of prior sessions in this project.

---

## 1. Directory Structure

### `server/` (full tree, `node_modules/` excluded)
```
server/.env
server/.env.example
server/config/cloudinary.js
server/config/db.js
server/controllers/authController.js
server/controllers/predictController.js
server/middleware/auth.js
server/middleware/upload.js
server/models/Prediction.js
server/models/User.js
server/package-lock.json
server/package.json
server/routes/auth.routes.js
server/routes/predict.routes.js
server/server.js
server/utils/treatmentMap.js
server/utils/yieldLoss.js
server/vercel.json
```
**MATCHES documentation** — `implementation-plan.md` §5's described flat ESM layout (`config/`, `models/`, `routes/`, `controllers/`, `middleware/`, `utils/`, `server.js` entry) is exactly what's on disk.

### `client/` (full tree, `node_modules/`, `dist/` excluded)
```
client/.env
client/.gitignore
client/.oxlintrc.json
client/README.md
client/index.html
client/package-lock.json
client/package.json
client/public/favicon.svg
client/public/icons.svg
client/src/App.jsx
client/src/assets/hero.png
client/src/assets/react.svg
client/src/assets/vite.svg
client/src/components/HistoryList.jsx
client/src/components/Navbar.jsx
client/src/components/ResultCard.jsx
client/src/components/UploadBox.jsx
client/src/context/AuthContext.jsx
client/src/index.css
client/src/main.jsx
client/src/pages/History.jsx
client/src/pages/Home.jsx
client/src/pages/Login.jsx
client/src/pages/Predict.jsx
client/src/pages/Register.jsx
client/src/services/api.js
client/vercel.json
client/vite.config.js
```
Pages: Home, Login, Register, Predict, History (5). Components: Navbar, UploadBox, ResultCard, HistoryList (4). One context: `AuthContext.jsx`.

### `ml-service/` (excluding `venv/`, `data/raw|train|val|test`, `__pycache__/`)
```
ml-service/app.py
ml-service/predict.py
ml-service/severity.py
ml-service/gradcam.py
ml-service/requirements.txt
ml-service/models/backbone/efficientnetb0_backbone.keras
ml-service/models/heads/{maize,pigeonpea,potato,rice,sugarcane,wheat}_head.keras
ml-service/models/test_results.csv, test_results.json, training_history.json
ml-service/data/label_maps.json, class_weights.json, dataset_index.csv,
              split_report.json, raw_placement_report.json, audit_report.json,
              severity_labels.json, wheat_severity_labels.csv, PlantDiseaseData.zip
ml-service/data/eda_figures/ (13 PNGs + 1 summary CSV)
ml-service/data/features/ (18 .npz cached-feature files — 6 crops × 3 splits)
ml-service/train/01_eda.ipynb, 02_preprocessing.ipynb, 03_train_local.ipynb,
              04_gradcam_diagnostic.ipynb, audit_datasets.py, compute_severity.py,
              consolidate_raw_data.py, severity_v1_restore.py, severity_v3_diagnose.py,
              severity_v3_gate.py, severity_v4_gate.py, split_data.py
```

### Excluded-from-listing dirs — existence + top-level counts (verified via `find`/`ls`)
| Dir | Top-level entries | File count |
|---|---|---|
| `ml-service/data/raw/` | `chickpea, maize, mustard, pigeonpea, potato, rice, sugarcane, wheat` (8 crop dirs — includes the 2 out-of-scope crops) | wheat 16603, sugarcane 6748, rice 6184, chickpea 4339, maize 4188, potato 2152, mustard 1950, pigeonpea 973 |
| `ml-service/data/train/` | `maize, pigeonpea, potato, rice, sugarcane, wheat` (6 active crops only) | 25,791 files |
| `ml-service/data/val/` | same 6 | 5,526 files |
| `ml-service/data/test/` | same 6 | 5,531 files |
| `ml-service/venv/` | exists (Python 3.11.15, TensorFlow 2.21.0 confirmed installed) | not enumerated |

### Other root items found (not in `implementation-plan.md`'s tree)
- **`mock-ml-service/`** — teammate's Express stub (`index.js`, has its own `node_modules/`). Read `index.js`: returns a random canned response from a 4-item array, `crop` accepted but ignored, `gradcam` hardcoded `null`. Confirmed **not wired into the real chain** — `server/.env`'s `FASTAPI_URL=http://localhost:8000` points at the real FastAPI service, not this stub.
- **`.venv/`** at project root — a second, separate Python venv, distinct from `ml-service/venv/`. Self-ignored via its own internal `.venv/.gitignore` (`*`), not by the project's `.gitignore`. Appears to be a stray/unused environment (nothing in the codebase references a root-level venv).
- **`.env`** at project root — see §4, this is an anomaly (client-shaped content in the wrong place).
- **`package-lock.json`** at project root — `{"name": "AI Plant Disease Detection System", "lockfileVersion": 3, "requires": true, "packages": {}}`. Empty lockfile, no `package.json` beside it at root. Dead/orphaned file, not used by any of the three services.

---

## 2. Git State

- **Current branch:** `master`
- **Remote:** `origin https://github.com/h4anshu/AI-Plant-Disease-Detection-System.git` (fetch + push)
- **Remote default branch:** `origin/HEAD -> origin/main`

**`git log --oneline -20`:**
```
ff6f42a feat: add treatment recommendation mapping utility for crop diseases
eea47a2 feat: initialize axios instance and implement authentication and prediction API services
d666a74 feat: implement prediction controller and model for disease inference and history storage
5962f36 feat: add environment variable template for server configuration
1b8dafa feat: implement production ML inference service with FastAPI, cached backbone feature extraction, and per-crop model heads
37b94f9 feat: add crop model heads, test result metrics, and training history logs
3ac4990 feat: add model heads and diagnostic Grad-CAM notebook for plant disease classification
5b85bd9 Merge branch 'main' of https://github.com/h4anshu/AI-Plant-Disease-Detection-System
2339317 Align crop scope
1bbee39 feat: implement v4 intra-image MAD-based severity segmentation to replace unreliable cross-image references
23a21d3 Merge remote-tracking branch 'origin/main'
3aa90ae project structure and basic ML work done
bb870e8 Redesign UI: Field Journal style
71bd847 Add Express backend (auth, predict, models) + React frontend (pages, components, routing) + mock ML service for local dev
2e43e4f Initial setup: Express + MongoDB connection
eb25682 first commit
```
(16 total commits exist — fewer than 20.)

**`git status --porcelain`:**
```
 M server/controllers/predictController.js
```
One uncommitted change. `git diff` shows it is the fix from this project's most recent completed task: switching `getTreatment` from a (stale) default import to the named import `{ getTreatment }`, and calling it as `getTreatment(crop, disease)` instead of `getTreatment(disease)`. **This is a real, not-yet-committed change** — not noise.

**`main` vs `master` — still messy, not resolved:**
- `master` vs `origin/master`: fully in sync (0 ahead, 0 behind).
- `master` vs `origin/main`: **master is 2 commits ahead** of `origin/main` (`eea47a2`, `ff6f42a` are on `master`/`origin/master` but not yet on `origin/main`).
- Local `main` branch: 13 commits **behind** `origin/main`, 0 ahead — it's stale and not being used; all real work is happening on `master`.
- **Conclusion:** the earlier "push master to main" step was done once but is now 2 commits stale, plus there's an uncommitted file. GitHub's default branch (`main`) does not currently reflect the tip of active development.

---

## 3. Server (`server/`)

### Registered routes (read directly from `server.js` + `routes/*.js`)
| Method | Path | Handler | Auth? |
|---|---|---|---|
| GET | `/` | inline in `server.js` | no |
| GET | `/health` | inline in `server.js` | no |
| POST | `/api/auth/register` | `authController.register` | no |
| POST | `/api/auth/login` | `authController.login` | no |
| POST | `/api/predict` | `predictController.predict` (via `predictRouter.post('/', authMiddleware, upload.single('image'), predict)`) | yes |
| GET | `/api/predict` | `predictController.getHistory` | yes |

**MATCHES documentation** — `implementation-plan.md` §7 lists exactly these Express endpoints (it calls the history route `/api/predictions` in prose, but the actual registered route is `GET /api/predict`, same router as the POST — this is a naming inconsistency in the plan doc, not a bug in the code).

Note: `upload.single('image')` — the multipart field name the server expects is **`image`**, matching `client/src/services/api.js`'s `formData.append('image', file)`. (Any documentation/test script using a field named `file` would fail against this route.)

### `models/Prediction.js` — actual schema fields (verbatim, as it exists now)
```js
userId:  ObjectId, ref 'User', required
imageUrl: String, required
crop: String, required, enum: ['wheat', 'rice', 'sugarcane', 'potato', 'maize', 'pigeonpea']
disease: String, required
confidence: Number, required, min 0, max 1
severity: String, required, enum: ['healthy', 'early', 'moderate', 'severe']
yieldLossPercent: Number, default null
treatment: String, required
gradcam: String, default null
{ timestamps: true }
```
**MISMATCH vs `implementation-plan.md` §6** — the doc's schema sketch only lists `severity // early | moderate | severe` (no `healthy`) and doesn't mention a `gradcam` field at all. The doc is stale relative to the current schema; the current schema is correct for what `predict.py` actually returns (confirmed `severity: "healthy"` is a real value the ML service emits for Healthy-class predictions).

### `models/User.js` — actual schema fields
```js
name: String, required, trim
email: String, required, unique, lowercase, trim
passwordHash: String, required
{ timestamps: true }
```
**MATCHES documentation** — `implementation-plan.md` §6's `{ _id, name, email, passwordHash, createdAt }` sketch (timestamps gives `createdAt`/`updatedAt`).

### `utils/treatmentMap.js`
Confirmed **real nested version**, not the old placeholder. Structure: `treatmentMap[crop][disease] -> string`, exported as `{ treatmentMap, getTreatment, FALLBACK_TREATMENT }` (named exports, no default export).

Counted via a small Node script importing the module directly:
| Crop | Keys | Class names |
|---|---|---|
| wheat | 5 | BlackPoint, FusariumFootRot, HealthyLeaf, LeafBlight, WheatBlast |
| rice | 5 | Bacterialblight, Blast, Brownspot, Healthy, Tungro |
| sugarcane | 11 | Banded_Chlorosis, BrownRust, Brown_Spot, Dried_Leaves, Grassy_shoot, Healthy_Leaves, Pokkah_Boeng, Sett_Rot, Viral_Disease, Yellow_Leaf, smut |
| potato | 3 | Early_blight, Late_blight, healthy |
| maize | 4 | Blight, Common_Rust, Gray_Leaf_Spot, Healthy |
| pigeonpea | 4 | Healthy, Leaf_Spot, Leaf_webber, Sterilic_mosaic |
| **Total** | **32** | |

**MATCHES `ml-service/data/label_maps.json` exactly** — 5+5+11+3+4+4 = 32 keys in both files, same names, same casing, no leftover flat `Crop___Disease` keys anywhere (grepped `___` across all of `server/*.js` — zero hits).

**MISMATCH vs `implementation-plan.md` §10** — the doc still lists `treatmentMap.js` under "Known Placeholders / Non-Functional Pieces," saying its keys "don't match real trained class names, will be rebuilt in Phase 3." That has already happened; the doc is stale.

### `server/package.json` — actual dependencies
```json
"dependencies": {
  "axios": "^1.18.1",
  "bcryptjs": "^3.0.3",
  "cloudinary": "^2.10.0",
  "cors": "^2.8.6",
  "dotenv": "^17.4.2",
  "express": "^5.2.1",
  "form-data": "^4.0.6",
  "jsonwebtoken": "^9.0.3",
  "mongoose": "^9.8.0",
  "multer": "^2.2.0",
  "nodemon": "^3.1.14"
}
```
No `devDependencies` block. **MATCHES documentation** — `implementation-plan.md` §4's stack table (Express, Mongoose, JWT+bcryptjs not bcrypt, Cloudinary).

### `.env` presence (values redacted — key names only)
`server/.env` contains these key names (confirmed via `grep -oE '^[A-Z_]+='`):
```
MONGODB_URI=
PORT=
JWT_SECRET=
CLOUDINARY_CLOUD_NAME=
CLOUDINARY_API_KEY=
CLOUDINARY_API_SECRET=
FASTAPI_URL=
VITE_API_URL=
```
All 7 keys documented in `.env.example` are present with real (non-placeholder) values. **Anomaly found:** `server/.env` also has an 8th key, `VITE_API_URL=http://localhost:4000/api` — a **client-side Vite variable that doesn't belong in the server's env file**. Nothing in `server/*.js` reads `process.env.VITE_API_URL` (grepped, zero hits), so it's inert, but it's misplaced and suggests copy/paste drift between the three `.env` files in this repo (see §4 — the identical value also turned up in a stray root-level `.env`).

`server/.env.example` — confirmed placeholder values only, no real secrets:
```
MONGODB_URI=your_mongodb_connection_string_here
PORT=4000
JWT_SECRET=your_jwt_secret_here
FASTAPI_URL=http://localhost:8000
CLOUDINARY_CLOUD_NAME=your_cloud_name
CLOUDINARY_API_KEY=your_api_key
CLOUDINARY_API_SECRET=your_api_secret
```
Correct — 7/7 are generic placeholders, and it correctly omits the stray `VITE_API_URL` key found in the real `.env`.

Both `server/.env` and the project-root `.env` are properly excluded from git via the blanket `.env` rule in `.gitignore` (confirmed with `git check-ignore -v`).

---

## 4. Client (`client/`)

### Pages present (`client/src/pages/`)
`Home.jsx`, `Login.jsx`, `Register.jsx`, `Predict.jsx`, `History.jsx`

### Components present (`client/src/components/`)
`Navbar.jsx`, `UploadBox.jsx`, `ResultCard.jsx`, `HistoryList.jsx`

Plus `context/AuthContext.jsx` and `services/api.js`.

### `services/api.js` — actual content (verbatim)
```js
import axios from 'axios';

const API_URL = import.meta.env.VITE_API_URL;
console.log('API_URL is:', API_URL);  // TEMPORARY - remove after debugging

const api = axios.create({
  baseURL: API_URL
})

// Attach token to every request automatically, if it exists
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers.authorization = token;
  }
  return config;
});

// --- Auth ---
export const registerUser = (data) => api.post('/auth/register', data);
export const loginUser = (data) => api.post('/auth/login', data);


// --- Predictions ---
export const predictDisease = (formData) =>
  api.post('/predict', formData, {
    headers: { 'Content-Type': 'multipart/form-data' }
  });

export const getPredictionHistory = () => api.get('/predict');


export default api;
```
Note: the auth interceptor sets `config.headers.authorization = token` (raw JWT, **no `Bearer` prefix**) — this is the project's actual, deliberate auth convention (confirmed working against `server/middleware/auth.js`, which reads `req.headers.authorization` directly with no prefix-stripping). Any documentation or test script assuming a `Bearer <token>` header will fail against this backend as currently written.

Also flagged in §7 below: line 4 is a debug `console.log` explicitly marked `// TEMPORARY - remove after debugging` — a genuine leftover, not yet cleaned up.

### `.env` presence
`client/.env` exists, ASCII/CRLF, single line: `VITE_API_URL=http://localhost:4000/api`. Set and points at the real Express server (not the mock). Not secret, safe to show in full — no anomaly here (the anomaly is the *duplicate* copy of this same value sitting in `server/.env` and the project-root `.env`, see §1 and §3).

### `client/package.json` — actual dependencies
```json
"dependencies": {
  "@tailwindcss/vite": "^4.3.3",
  "axios": "^1.18.1",
  "react": "^19.2.7",
  "react-dom": "^19.2.7",
  "react-router-dom": "^7.18.1",
  "tailwindcss": "^4.3.3"
},
"devDependencies": {
  "@types/react": "^19.2.17",
  "@types/react-dom": "^19.2.3",
  "@vitejs/plugin-react": "^6.0.3",
  "oxlint": "^1.71.0",
  "vite": "^8.1.1"
}
```
**MATCHES documentation** — `implementation-plan.md` §4 (React 18/19, Vite, Tailwind v4 via `@tailwindcss/vite`, Axios, react-router-dom).

---

## 5. ML-Service (`ml-service/`)

All four files confirmed present: `predict.py`, `severity.py`, `gradcam.py`, `app.py`.

### Function/class signatures (grepped `^def `/`^class `, not full bodies)

**`predict.py`:**
```python
def load_models():
def _is_healthy(class_name: str) -> bool:
def predict_disease(backbone, heads: dict, label_maps: dict, crop: str, image_bytes: bytes) -> dict:
```

**`severity.py`:**
```python
def _bucket(percent_affected):
def _otsu_threshold(values):
def _leaf_mask(img):
def _percent_affected(pixels):
def compute_severity(image: Image.Image) -> str:
```

**`gradcam.py`:**
```python
def _last_spatial_layer_name(backbone):
def _get_grad_model(backbone, head_model):
def generate_gradcam(backbone, head_model, image: Image.Image, class_idx: int) -> str:
```

**`app.py`:**
```python
@app.get("/health")
def health():
@app.post("/predict-disease")
async def predict_disease_route(file: UploadFile = File(...), crop: str = Form(None)):
```
Model loading happens in a `lifespan` async context manager (not per-request) — confirmed by reading the file, `load_models()` is called once at startup and stored in a module-level `_models` dict.

**MATCHES what was previously documented as built** — the signatures line up with the stated design: `predict_disease` takes crop + raw image bytes and returns a dict; `compute_severity` takes one PIL image and returns a bucket string; `generate_gradcam` takes backbone + head + image + class index and returns a string (base64 PNG).

### `models/heads/` — actual files and sizes
```
maize_head.keras      1,999,439 bytes
pigeonpea_head.keras  1,999,445 bytes
potato_head.keras     1,997,891 bytes
rice_head.keras       2,000,987 bytes
sugarcane_head.keras  2,010,275 bytes
wheat_head.keras      2,000,993 bytes
```
All 6 present, all ≈2 MB (head-only weights, no backbone bundled — matches training notebook's stated design). `models/backbone/efficientnetb0_backbone.keras` is 17,034,506 bytes (≈17 MB), present.

### `data/label_maps.json` — actual crop→class mappings, as they exist now
```json
{
  "wheat":     {"BlackPoint":0, "FusariumFootRot":1, "HealthyLeaf":2, "LeafBlight":3, "WheatBlast":4},
  "rice":      {"Bacterialblight":0, "Blast":1, "Brownspot":2, "Healthy":3, "Tungro":4},
  "sugarcane": {"Banded_Chlorosis":0, "BrownRust":1, "Brown_Spot":2, "Dried_Leaves":3, "Grassy_shoot":4,
                "Healthy_Leaves":5, "Pokkah_Boeng":6, "Sett_Rot":7, "Viral_Disease":8, "Yellow_Leaf":9, "smut":10},
  "potato":    {"Early_blight":0, "Late_blight":1, "healthy":2},
  "maize":     {"Blight":0, "Common_Rust":1, "Gray_Leaf_Spot":2, "Healthy":3},
  "pigeonpea": {"Healthy":0, "Leaf_Spot":1, "Leaf_webber":2, "Sterilic_mosaic":3}
}
```
Wheat is 5-class (no `Yellow_Rust` key) — **MATCHES the documented post-Grad-CAM correction**. `treatmentMap.js` (§3) has exactly these 32 class names with exactly these keys — verified 1:1, zero drift between the two files.

Reviewed every crop's Healthy-class detection in `predict.py`'s `_is_healthy()` (`"healthy" in class_name.lower()`) against all 32 class names above: every crop's healthy label (`HealthyLeaf`, `Healthy`, `Healthy_Leaves`, `healthy`, `Healthy`, `Healthy`) matches, and no disease class name in any crop accidentally contains the substring "healthy." (This was reviewed, not re-tested live for all 6 crops in this audit — see prior session's live test for potato only.)

### `requirements.txt` — actual contents
```
fastapi
uvicorn[standard]
tensorflow
scikit-learn
pillow
numpy
scipy
matplotlib
python-multipart
```

---

## 6. Data Verification

### `split_report.json` vs actual files on disk
Summed `split_report.json`'s per-class counts programmatically:
```
train: 25,791   val: 5,526   test: 5,531   (grand total: 36,848)
```
Recounted actual files on disk with `find`:
```
train: 25,791   val: 5,526   test: 5,531
```
**MATCHES exactly** — no drift between the report and the real file system.

Note: `split_report.json` still lists wheat's `Yellow_Rust` class (15,000 images: 10,500/2,250/2,250). This is **not a mismatch** — those images are still physically present in `data/{train,val,test}/wheat/Yellow_Rust/` (the split was never re-run). What changed is a *later*, model-training-level decision (documented in `04_gradcam_diagnostic.ipynb`) to drop `Yellow_Rust` from the wheat classification head due to a shortcut-learning diagnosis. `label_maps.json` and `wheat_head.keras` correctly reflect the 5-class post-correction state; `split_report.json` correctly reflects what's still on disk. Both are internally consistent, just describing different layers.

### `severity_labels.json`
```
method_version: v4_intraimage_mad
thresholds: {early_max_pct: 15, moderate_max_pct: 40}
mad_multiplier: 4
image records: 36,848
```
**MATCHES `severity.py`'s extracted constants exactly** (`EARLY_MAX=15`, `MODERATE_MAX=40`, `MAD_MULTIPLIER=4`) — confirms the production `severity.py` module is a faithful extraction of the validated v4 method, not a drifted reimplementation. Record count (36,848) matches the train+val+test total above.

Yellow-Rust expert-label validation recorded in the same file: 15,000 compared, 6,601 agree = 44.0% agreement — consistent with the rationale in `compute_severity.py`'s docstring for why v4 was chosen over v1–v3.

Per-crop severity distribution (early/moderate/severe/healthy), summed and cross-checked against raw counts — wheat's 6,020+5,319+5,014+250 = 16,603 matches `raw/wheat/`'s file count exactly, confirming this file was computed over the full wheat set including Yellow_Rust (as expected, since severity computation is independent of the later classification-head correction).

---

## 7. TODOs / Placeholders / Not-Implemented

Searched `server/` (excl. `node_modules`), `client/src/`, and `ml-service/` (excl. `venv/`) for `TODO|FIXME|placeholder|not implemented|NotImplementedError|XXX|HACK` (case-insensitive).

**Real hits:**
| File:Line | Text |
|---|---|
| `client/src/services/api.js:4` | `console.log('API_URL is:', API_URL);  // TEMPORARY - remove after debugging` |

That is the **only** genuine leftover debug/placeholder marker found anywhere in the three services' source code. No `TODO`, `FIXME`, or `NotImplementedError` exists in any `.py` file under `ml-service/` (checked `*.py` only, separate from notebooks) or any `.js` file under `server/`.

**False positives (noted, not counted as real hits):**
- `server/package-lock.json:1556` — a base64 integrity hash (`sha512-...XXXevb...`) that happens to contain "XXX" as random hash characters, not a marker.
- `ml-service/train/*.ipynb` (6 files, ~180 line-hits) — all inside embedded base64 PNG image-output blobs in notebook JSON cells (matplotlib figure outputs), where random base64 bytes happen to spell `xxx`/`XXX`/`todo`/`hack` by chance. Manually inspected a sample; none are in actual code cells or markdown prose.

No `TODO`/`FIXME`/`placeholder` hits in `client/src/pages/`, `client/src/components/`, or `client/src/context/`.

---

## 8. Services Health Check

Neither service was running at the start of this audit (`curl` to both ports returned connection-refused). Per the task's instruction to start them briefly if not running, both were started, health-checked, and then stopped again to leave the environment as found:

- **FastAPI** (`uvicorn app:app --port 8000`): started clean, no import errors. Startup log showed the model-loading `lifespan` completing (`Application startup complete`), then:
  `GET http://127.0.0.1:8000/health` → `{"status":"ok"}` (200)
- **Express** (`node server.js`, port 4000 per `.env`): started clean —
  ```
  Server is Running on port : 4000
  DB Connected...
  ```
  `GET http://127.0.0.1:4000/health` → `{"status":"ok"}` (200)

Both torn down after the check (no lingering processes left on 4000/8000).

---

## Summary of flagged items (inventory only — not fixed)

1. **Uncommitted change**: `server/controllers/predictController.js` has one real, unstaged fix (named-import + 2-arg `getTreatment` call) not yet committed.
2. **`main` branch is 2 commits behind `master`/`origin/master`** (`eea47a2`, `ff6f42a` not pushed to `origin/main`); local `main` branch is stale by 13 commits and unused.
3. **`server/.env` has a stray `VITE_API_URL` key** that doesn't belong there (inert, but indicates env-file copy/paste drift). The same value also exists in an anomalous **project-root `.env`** file (UTF-16 encoded, containing only that one client-shaped variable) that duplicates `client/.env`'s real purpose.
4. **Stray root-level `.venv/`** — a second, apparently unused Python venv separate from `ml-service/venv/`.
5. **Dead root-level `package-lock.json`** — empty lockfile with no corresponding root `package.json`.
6. **`client/src/services/api.js:4`** has a debug `console.log` explicitly marked for removal, still present.
7. **`implementation-plan.md` is stale in three places**: (a) §6 DB schema sketch omits `severity: "healthy"` and the `gradcam` field, both of which are real, current schema fields; (b) §10 still lists `treatmentMap.js` and Grad-CAM as unbuilt placeholders, both of which are now fully implemented; (c) §10's "`yieldLossPercent` always null until Phase 5" is no longer accurate — it's populated via a static severity→percent map today (not the eventual ML-based Phase 5 model, but not always-null either).

No code, config, or data files were modified in the course of this audit.
