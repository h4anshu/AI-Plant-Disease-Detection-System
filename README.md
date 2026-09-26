# AI Plant Disease Detection System

[![CI](https://github.com/h4anshu/AI-Plant-Disease-Detection-System/actions/workflows/ci.yml/badge.svg)](https://github.com/h4anshu/AI-Plant-Disease-Detection-System/actions/workflows/ci.yml)

CNN-based disease classification for ten Indian field crops, with per-image severity estimation and a literature-backed yield-loss lookup. Demo name: "From Leaf to Loss."

A farmer photographs a leaf, picks the crop from a dropdown, and gets back a disease diagnosis, a severity grade, treatment advice, and an estimated yield-loss percentage — all in one request.

## What it does

A user uploads a leaf photo and selects the crop (wheat, rice, sugarcane, potato, maize, pigeonpea, groundnut, blackgram, apple, or banana). The image first passes a photo-quality check and an out-of-distribution gate: a blurry, dark or leafless photo gets a "please retake" answer, and a photo that doesn't look like that crop's training images gets "not sure" instead of a guessed disease ([docs/OOD_GATE.md](docs/OOD_GATE.md)). Otherwise the image goes to a Python inference service, which runs it through a crop-specific classification head to identify the disease, then runs a separate leaf-area analysis on the same image to estimate how far the infection has progressed (early, moderate, or severe). A Grad-CAM heatmap is generated alongside the prediction so it's possible to see which part of the leaf the model actually used to make its decision, rather than trusting the confidence score blindly.

Once the disease and severity are known, the backend looks up treatment advice and an estimated yield-loss percentage from two static tables keyed by (crop, disease) and (crop, disease, severity) respectively. That second point is worth being explicit about: yield-loss estimation here is a **lookup table**, not a trained yield-prediction model. It doesn't take soil, weather, sowing date, or variety into account — it maps a classification result to a published percentage range from agronomy literature. Building an actual regression model for yield (the kind that would use satellite/weather/soil inputs) was out of scope for this project; the lookup table was a deliberate scope decision to keep the "severity → economic impact" link grounded in real numbers without pretending to be a full crop-yield model.

The result — disease name, confidence, severity, treatment text, yield-loss %, the Grad-CAM overlay, and the uploaded image URL — is saved to the user's history and returned to the frontend in one response.

## Architecture

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

React handles the UI and talks to Express; Express handles auth, Cloudinary upload, and MongoDB persistence, and forwards the actual inference work to FastAPI. The three services are split because the ML dependencies (ONNX Runtime, numpy and the model files) don't belong in the same runtime as the web API, and because it lets the inference service scale or restart independently.

The model side uses one shared EfficientNetB0 backbone (ImageNet weights, frozen) with a separate small classification head per crop, instead of one flat 32-class model or an auto-detected crop. The backbone is never fine-tuned — it's used purely as a feature extractor, and each crop's head is a small Dense network trained independently on cached 1280-dim feature vectors. This was also a deliberate fix: an earlier attempt at fine-tuning the backbone per crop corrupted the shared weights across crops, since the backbone was being mutated by whichever crop trained last. Freezing it and caching features solved that, and also cut head-training time from roughly an hour per crop to seconds.

The crop is selected by the user, not inferred from the image. That's intentional — production agri-AI apps do the same thing, and it avoids compounding two error sources (wrong crop guess *and* wrong disease guess) into one unreliable prediction. Adding a seventh crop later means training and dropping in one new head, not retraining anything else.

## Crops and disease coverage

| Crop | Disease classes | Accuracy [95% CI] | Macro F1 | Weakest-class recall | Images evaluated | Evaluation |
|---|---|---|---|---|---|---|
| Wheat | 5 | 99.58% [98.8–100.0] | 0.996 | 98.3% | 240 | holdout split |
| Rice | 5 | 99.78% [99.5–100.0] | 0.994 | 94.7% | 927 | holdout split |
| Sugarcane | 11 | 92.70% [91.0–94.3] | 0.890 | 52.1% | 1,014 | holdout split |
| Potato | 3 | 98.14% [96.6–99.4] | 0.964 | 96.0% | 323 | holdout split |
| Maize | 4 | 94.28% [92.4–96.0] | 0.925 | 79.1% | 629 | holdout split |
| Pigeonpea | 4 | 81.08% [74.3–87.8] | 0.839 | 63.6% | 148 | holdout split |
| Groundnut | 6 | 92.69% [91.6–93.7] | 0.934 | 89.6% | 2,367 | 5-fold grouped CV |
| Blackgram | 5 | 96.23% [95.0–97.4] | 0.962 | 94.4% | 1,007 | 5-fold grouped CV |
| Apple | 3 | 94.88% [92.5–97.0] | 0.951 | 93.3% | 332 | 5-fold grouped CV |
| Banana | 7 | 96.76% [96.3–97.3] | 0.957 | 91.8% | 4,634 | 5-fold grouped CV |

Numbers come from [ml-service/models/metrics.json](ml-service/models/metrics.json). The two evaluation methods are not directly comparable: "holdout split" scores one random 15% test split (the original six crops), while "5-fold grouped CV" tests every independent image once and never lets near-duplicate or augmented copies of the same leaf sit on both sides of the split, so it is the stricter of the two. Seventeen other candidate crops were analysed and not shipped; see [ml-service/NEW_CROPS_REPORT.md](ml-service/NEW_CROPS_REPORT.md).

Pigeonpea is the weakest crop by a wide margin, and the reason is unglamorous: it has the smallest dataset of the six (973 raw images total, versus 16,000+ for wheat). Sugarcane's lower accuracy relative to wheat/rice/potato is a more normal effect of having the most classes (11) with real inter-disease visual overlap, not a dataset-size problem.

Two crops were deliberately left out. Chickpea was dropped entirely — the only usable disease dataset (FUSARIUM-22) is resistance-grading data with no healthy-leaf class, and a model that can never say "this leaf is fine" isn't useful. Mustard was deferred rather than dropped: the dataset that looked right turned out to be Indonesian fruit-ripeness labels, not disease data, and mustard is a Rabi crop (October–February), so there was no way to self-collect field photos in the middle of the year either. The architecture (one backbone, add-a-head) means mustard can be added later without touching the other six.

## The Yellow_Rust finding

Wheat's dataset originally had six classes, including Yellow_Rust sourced from a separate dataset (YR-19). The head trained on it hit 100% test accuracy on that class, which is the kind of number that should make you suspicious rather than pleased. Running Grad-CAM on it confirmed why: the model wasn't keying off rust lesions at all, it was recognizing YR-19's photography style — dark macro backgrounds, distinct from the natural field-lighting photos in the other five classes. It had learned "this photo came from the YR-19 folder," not "this leaf has rust."

Yellow_Rust was removed from wheat's classification head and the model was retrained as 5-class. The YR-19 data wasn't wasted, though — it has real expert-assigned severity grades (0/R/MR/MRMS/MS/S) that are still used to validate the severity-estimation method (see below), which was always a legitimate use of that dataset independent of the classification shortcut. Catching this before it shipped, rather than reporting a false 100%, is the point of running Grad-CAM on every crop in the first place, not just as a nice-to-have visualization.

## Severity estimation

Severity (early / moderate / severe, plus a separate `healthy` state for non-diseased predictions) is computed per uploaded image, not looked up from a table. The current method (v4) does an Excess Green Index + Otsu threshold to separate leaf pixels from background, converts the leaf region to Lab color space, and flags a pixel as diseased if its color is a statistical outlier from *that image's own* median and MAD (median absolute deviation) — no cross-image reference. The percentage of outlier pixels maps to early (<15%), moderate (15–40%), or severe (>40%).

This was not the first approach tried. Three earlier methods were built and discarded before landing on v4:
- v1 (HSV hue/saturation thresholding) scored 49% agreement against YR-19's expert grades, but its source code was accidentally overwritten by v2 with no backup, so it's a historical number only, not something that can be reproduced or shipped.
- v2 (Otsu leaf mask + k-means with k=2) dropped to 15.8% — forcing exactly two clusters manufactures a fake "diseased" region even on healthy leaves.
- v3 (per-crop healthy-color reference + percentile threshold) reached 40.8% — better, but a single cross-image reference washes out real localized disease under normal lighting variation between photos.
- v4 (per-image median + MAD, the current method) reaches 44.0% agreement — the best reproducible result, though still below the 49% v1 achieved before its code was lost.

44% agreement against expert grades is the honest number, and it's stated here as a known limitation rather than something to round up. The severity shown to a user is a heuristic signal from image statistics, not a validated clinical grade. It's useful directionally — a leaf with 60% of its area flagged as an outlier is almost certainly worse off than one with 5% — but it shouldn't be read as a precise measurement.

## Yield-loss estimation

`server/utils/yieldLoss.js` maps (crop, disease, severity) to a yield-loss percentage, sourced from ICAR institute publications, IRRI data, state agricultural university extension bulletins, and peer-reviewed plant pathology studies. Each entry also carries a confidence tag: `high` for India-specific or severity-resolved data, `med` for solid international data without an India-specific figure, and `low` for cases where the literature didn't have a matching entry and a proxy was used — for example, sugarcane's `Viral_Disease` class is ambiguous about which virus, so mosaic (SCMV) figures were used as the closest match, and pigeonpea's `Leaf_Spot` loss figures are proxied from Alternaria data since Cercospora-specific numbers weren't available. A few entries are legitimately 0% by design rather than missing data — sugarcane's Banded_Chlorosis is cold-injury, not a disease, and wheat's BlackPoint is a grain-quality defect that doesn't reduce tonnage.

To restate the scope point from earlier: this is a lookup table, not a model. It has no concept of a farmer's actual field conditions, and two farmers with the same diagnosis and severity get the same percentage regardless of variety, soil, or weather. That's a real constraint, not an implementation detail to gloss over — it's the difference between "this class of disease at this severity typically costs X% of yield in the literature" and "your field will lose X%."

## Tech stack

| Layer | Technology |
|---|---|
| Frontend | React 19.2, Vite 8.1, Tailwind CSS 4.3 (`@tailwindcss/vite`), Axios 1.18, react-router-dom 7.18 |
| Backend | Node.js, Express 5.2 (ESM, `import`/`export`), Mongoose 9.8, JWT (`jsonwebtoken` 9.0 + `bcryptjs` 3.0), Multer 2.2, Cloudinary SDK 2.10 |
| ML service | Python 3.11 (pinned), FastAPI, Uvicorn, ONNX Runtime, numpy, scipy, Pillow. TensorFlow/Keras, tf2onnx, scikit-learn and matplotlib only for training and the ONNX export ([docs/SERVING.md](docs/SERVING.md)) |
| Model | EfficientNetB0 backbone (frozen, ImageNet weights) + one Dense(128)→Dropout(0.3)→Dense(softmax) head per crop |
| Database | MongoDB Atlas |
| Image storage | Cloudinary |

## Project structure

```
client/          React frontend — pages, components, Axios API layer
server/          Express API — auth, predict orchestration, Mongo models, treatment/yield lookups
ml-service/      FastAPI inference service — model loading, prediction, severity, Grad-CAM
mock-ml-service/ Stub FastAPI replacement used for early frontend development, no longer wired in
```

Inside `ml-service/`, `train/` holds the notebooks and scripts that produced the dataset splits, class weights, severity labels, and trained heads; `models/` holds the trained backbone and per-crop head weights; `data/` holds the dataset index, label maps, and (locally, gitignored) the actual image files.

## Running locally

Requires Python 3.11 specifically (pinned for TensorFlow compatibility — later versions have had wheel gaps) and Node.js.

Environment variables needed:

`server/.env`:
```
MONGODB_URI
PORT
JWT_SECRET
FASTAPI_URL
CLOUDINARY_CLOUD_NAME
CLOUDINARY_API_KEY
CLOUDINARY_API_SECRET
```

`client/.env`:
```
VITE_API_URL
```

Three terminals:

```bash
# ML service
cd ml-service
python -m venv venv && venv\Scripts\activate   # or source venv/bin/activate on Linux/macOS
pip install -r requirements.txt -r requirements-export.txt
python train/export_onnx.py   # builds models/onnx/ from the .keras weights (once, and after any retrain)
uvicorn app:app --port 8000

# Express API
cd server
npm install
node server.js

# React frontend
cd client
npm install
npm run dev
```

The FastAPI service loads the ONNX backbone and all ten heads once at startup (not per request); `/health` responds after about 2-3 s and lists the version of every model from `models/model_registry.json`. It refuses to start if `models/onnx/` is older than the `.keras` weights — re-run the export. Serving details, the Keras↔ONNX parity check and the before/after benchmark are in [docs/SERVING.md](docs/SERVING.md).

## Running tests

Each package has its own suite; GitHub Actions (`.github/workflows/ci.yml`) runs all three on every push and pull request. No test touches the network: MongoDB is in-memory, and Cloudinary and the ML service are mocked.

```bash
# ML service: API contract, golden regression per crop (fixed held-out photo -> same class,
# confidence within 0.02), severity, Grad-CAM PNG, quality/OOD gate
cd ml-service
pip install -r requirements.txt -r requirements-export.txt -r requirements-dev.txt
python train/export_onnx.py
pytest

# Express API: Jest + supertest, mongodb-memory-server, Cloudinary/ML mocked with nock
cd server
npm install
npm test

# React frontend: Vitest + React Testing Library, lint, production build
cd client
npm install
npm run lint && npm test && npm run build
```

The golden tests need the ONNX files built from the tracked weights; without them they are skipped with a reason. `tests/test_registry.py` fails if a weight file changes without its version being bumped in `models/model_registry.json`. After a head is retrained on purpose, regenerate the fixtures with `python tests/make_golden.py` and review the diff of `tests/golden_expected.json`.

## API overview

**Express (`server/`, port 4000):**

| Method | Route | Purpose |
|---|---|---|
| POST | `/api/auth/register` | Create account |
| POST | `/api/auth/login` | Log in, returns JWT |
| POST | `/api/predict` | multipart `image` + `crop` → orchestrates the ML call, uploads to Cloudinary, saves the record |
| GET | `/api/predict` | Authenticated user's prediction history |
| GET | `/health` | Health check |

Auth uses the raw JWT in the `Authorization` header, with no `Bearer` prefix — this matches how the frontend's Axios interceptor sends it, so don't "fix" it to add the prefix without updating both sides.

**FastAPI (`ml-service/`, port 8000):**

| Method | Route | Purpose |
|---|---|---|
| POST | `/predict-disease` | image + crop → disease, confidence, severity, Grad-CAM PNG (base64), `model_version` |
| GET | `/health` | Health check + model registry summary |

## Known limitations

- Tests run against fixtures and mocks; there is still no automated end-to-end test through a real browser, database and Cloudinary (that path was checked manually, see `docs/OOD_GATE.md`).
- Severity grading is a 44%-agreement heuristic against expert-labeled ground truth, not a validated clinical measurement (see above).
- Pigeonpea's 81.08% test accuracy is the weakest of the six original crops, directly tied to its small dataset (973 images).
- Training data leans heavily toward controlled/lab-style photography — uniform backgrounds, staged lighting. How the models perform on photos taken by an actual farmer's phone in a field, with variable lighting and background clutter, hasn't been separately measured.
- Yield-loss is a static lookup table, not a trained model — see the scope note above. There's no soil, weather, or variety input anywhere in the pipeline.
- Data augmentation is defined in the preprocessing notebook but isn't actually applied during training, since the cached-feature-extraction approach reads from raw images before augmentation would happen. Head training would likely benefit from it, particularly for pigeonpea.

## Deployment

FastAPI and Express are containerized (see the `Dockerfile` in each) and deployed to Google Cloud Run in the `asia-south1` region; React is deployed to Vercel. MongoDB Atlas and Cloudinary are used as-is, no self-hosting. Two things came up during the Cloud Run deploy that are worth keeping on record: the FastAPI image originally installed `libgl1-mesa-glx` for OpenCV/Pillow's system dependencies, which no longer exists in current Debian package repos and had to be swapped for `libgl1`; and the MongoDB URI's password contains characters that don't survive being passed as a plain `--set-env-vars` flag on the `gcloud run deploy` command line, which needed an `env.yaml` file instead.
