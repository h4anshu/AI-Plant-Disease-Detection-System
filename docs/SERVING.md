# Model serving: registry, ONNX Runtime, Grad-CAM

The ML service no longer runs TensorFlow in production. The Keras weights in `ml-service/models/` stay the
source of truth (training, calibration); they are exported to ONNX at build time and served with ONNX
Runtime. Every response carries the version of each model that produced it, and Express stores it with the
prediction.

## Model registry and versioning

`ml-service/models/model_registry.json` lists each artifact: the backbone, one head per crop and the
quality/OOD gate. For each one it records the version, file, sha256, classes, training data, a metrics
pointer (`metrics.json#<crop>`) and the date. Everything starts at `1.0.0`.

| Bump | When |
|---|---|
| MAJOR | class list or input contract changes (new/removed class, image size, preprocessing) |
| MINOR | retrained on new or different data |
| PATCH | same weights, re-exported or recalibrated (for example new OOD thresholds) |

- `tests/test_registry.py` fails when a weight file's sha256 no longer matches the registry. You can't
  retrain a head and forget the bump.
- The same test fails when a crop is missing from `label_maps.json` or `metrics.json`, or a version isn't
  semver.
- `GET /health` returns `{"status": "ok", "models": {"backbone": {...}, "heads": {crop: version}, "gate": version}}`.
- Every `/predict-disease` response has `model_version: {backbone, head, gate}`. This includes rejected
  (`retake` / `uncertain`) responses.
- Express saves it as `Prediction.modelVersion`. Records made before this change have `modelVersion: null`.

## How the ONNX files are built

`python train/export_onnx.py` needs `requirements-export.txt`, which includes TensorFlow and tf2onnx. It
writes these files to `models/onnx/` (gitignored, about 29 MB):

| File | Inputs → outputs |
|---|---|
| `backbone.onnx` | `image` (N,224,224,3 float32 0-255) → `features` (N,1280), `conv` (N,7,7,1280, the `top_activation` map, for Grad-CAM) |
| `heads/<crop>.onnx` | `features` → `probs` |
| `head_weights.npz` | the two Dense layers of each head as numpy arrays (for Grad-CAM) |

- It uses `tf2onnx.convert.from_keras` with opset 17. `from_function` left the normalization constants
  as extra graph inputs, so the script asserts that `image` is the only input.
- Every file stores the sha256 of the `.keras` file it came from. At startup `predict.py` compares it with
  the registry and refuses to serve a stale export (`StaleExport`).
- The files are never committed. The Docker build creates them in its first stage. In CI and locally, run
  the script before pytest or before starting the service.

## Parity gate

`python train/check_onnx_parity.py` runs every held-out test image (`data/test/`, 4,536 images) through
both Keras and ONNX Runtime. It fails when argmax agreement is below 99.9% or the max |prob diff| is
1e-3 or more. It also checks that the OOD gate makes the same accept/reject decision on the features from
both runtimes. It compares the numpy Grad-CAM against the original TensorFlow implementation on 5 images
per crop.

| Crop | Images | Same argmax | Max \|prob diff\| | Same OOD decision | Grad-CAM heat diff | Grad-CAM pixel diff (0-255) |
|---|---|---|---|---|---|---|
| wheat | 240 | 100% | 5.4e-6 | 100% | 1.6e-4 | 2 |
| rice | 927 | 100% | 2.7e-6 | 100% | 3.6e-5 | 2 |
| sugarcane | 1,014 | 100% | 9.0e-6 | 100% | 1.8e-5 | 2 |
| potato | 323 | 100% | 3.3e-6 | 100% | 8.8e-6 | 2 |
| maize | 629 | 100% | 5.6e-6 | 100% | 5.9e-3 | 4 |
| pigeonpea | 148 | 100% | 1.9e-6 | 100% | 4.7e-6 | 2 |
| groundnut | 355 | 100% | 1.5e-5 | 100% | 9.0e-6 | 2 |
| blackgram | 152 | 100% | 9.0e-6 | 100% | 1.4e-3 | 2 |
| apple | 50 | 100% | 7.2e-6 | 100% | 5.5e-6 | 2 |
| banana | 698 | 100% | 4.1e-5 | 100% | 1.0e-5 | 2 |
| **all** | **4,536** | **100%** | **4.1e-5** | **100%** | | |

**Gate: passed.** No prediction changed. `tests/test_units.py::test_onnx_matches_keras_on_golden_fixtures`
repeats the check on the 10 golden photos when TensorFlow is installed, as it is in CI.

## Grad-CAM without TensorFlow

Grad-CAM needs the gradient of the class score with respect to the last conv map. ONNX Runtime doesn't
compute gradients for inference graphs, so there were two obvious options:

1. **Keep TensorFlow in the image just for Grad-CAM.** This keeps the ~1 GB image, the ~600 MB of RAM and
   the slow cold start, which removes most of the reason to switch.
2. **Export a second ONNX graph with the gradient built in.** This is fragile: tf2onnx support for
   GradientTape graphs is limited, and every head would need its own gradient graph.

**Chosen: a closed-form gradient in numpy (`gradcam.py`).** After the conv map, the model is only
GlobalAveragePooling → Dense(128, relu) → Dense(softmax), and the gradient of that chain is a few lines
of matrix algebra:

```
dz = p_c * (onehot_c - p)            # softmax
dg = W1 @ ((W2 @ dz) * (pre > 0))    # Dense-ReLU-Dense back to the 1280 pooled features
pooled_grads = dg / (7 * 7)          # global average pooling spreads it evenly over the map
```

- The backbone's ONNX graph already outputs `conv`, and the head weights come from `head_weights.npz`.
- Resizing is bilinear with half-pixel centres, the same as `tf.image.resize`.
- The jet colormap is rebuilt from matplotlib's segment data, so neither TensorFlow nor matplotlib is
  needed at serving time.
- Tests check it against finite differences, `tf.image.resize` and `matplotlib.cm.jet` when those
  libraries are installed. The parity table above shows it matches the old TensorFlow output to within a
  few pixel values.
- Limit: this only works while the head stays a small dense stack on a frozen backbone. If the backbone is
  fine-tuned, or the head gets conv layers, Grad-CAM would need option 2.

## Benchmark: TensorFlow vs ONNX Runtime in Docker

`python train/bench_docker.py <image> [--crops ...]`

- Each image ran in a container limited to 2 CPUs and 4 GB of RAM.
- Measured: time from `docker run` to the first 200 on `/health` and to the first successful prediction,
  then 60 sequential `/predict-disease` requests over the golden photos (full pipeline: decode,
  quality/OOD gate, backbone, head, severity, Grad-CAM PNG), then RAM from `docker stats`.
- Host: Windows 10 laptop, Docker Desktop (WSL 2).
- **Before** is the image deployed on Cloud Run today (`ml-service:v1`: TensorFlow 2.21, 6 crops, no
  gate). **After** is this Dockerfile.
- Both were measured on the same 6 crops. The after image does more work per request (the gate), and it
  is still faster.
- Each image ran twice. The first run had a cold disk cache. Ranges show both runs.

| | Before: TensorFlow (`v1`) | After: ONNX Runtime | Change |
|---|---|---|---|
| Image, pull/compressed size | 924 MB | 184 MB | −80% |
| Image, on disk (`docker images`) | 3.98 GB | 699 MB | −82% |
| Cold start to `/health` | 5.1-10.1 s | 2.1-3.5 s | ~2.5-3× faster |
| Cold start to first prediction | 6.4-11.9 s | 2.6-4.3 s | ~2.5-3× faster |
| RAM after 60 requests | 588-615 MiB | 148-161 MiB | −75% |
| Latency p50 | 942-993 ms | 197-207 ms | ~4.8× faster |
| Latency p95 | 1,023-1,337 ms | 211-308 ms | ~4× faster |

With all 10 crops, the after image measured: health in 2.5 s, first prediction in 3.0 s, 152 MiB, p50
206 ms, p95 311 ms.

Most of the old per-request time was TensorFlow Grad-CAM, which ran eagerly with a GradientTape on every
request. Most of the new time is the PNG encoding and the HTTP upload of the photo.

## The serving image

`ml-service/Dockerfile` has two stages.

1. **`export` stage.** Installs `requirements.txt` + `requirements-export.txt`, copies `models/` and runs
   `train/export_onnx.py`. TensorFlow exists only in this stage.
2. **Final stage.**
   - Base image `python:3.11-slim`, with exact pins in `requirements.txt`: FastAPI, Uvicorn,
     python-multipart, onnxruntime, numpy, Pillow, scipy.
   - Copies only the service code, the registry, the OOD calibration files, `label_maps.json` and the
     `.onnx` files from stage 1. No `.keras` files, no TensorFlow, no matplotlib, no scikit-learn.
   - Runs as the non-root user `app` (uid 10001).
   - `.dockerignore` is an allowlist, so the multi-GB `data/` folder never enters the build context.

The v1 image ran as root and had unpinned requirements (`tensorflow`, `scikit-learn`, `matplotlib`,
`uvicorn[standard]` with no versions).

**Deploying.** Build and push the new image the same way as v1 (`docker build -t .../ml-service:v2
ml-service`, push, `gcloud run deploy`). The API stays the same, plus the extra `model_version` field.
Deploy the Express server from the same commit so the version gets stored. An older server ignores the
field, and a newer server against the older ML service stores `null`. Either order works.
