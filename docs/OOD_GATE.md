# Photo-quality check and out-of-distribution (OOD) gate

Before this gate, `predict_disease()` returned the most likely class for *any* image: a church photo sent as "blackgram" or a wheat field sent as "banana" came back as a confident disease diagnosis with treatment advice. The gate makes the service say "please retake" or "not sure" instead.

Code: `ml-service/gate.py` (runtime), `ml-service/train/calibrate_ood.py` (calibration), `ml-service/train/bench_gate_latency.py` (latency). Calibrated values: `ml-service/models/ood_thresholds.json` (thresholds plus every number that justifies them) and `ml-service/models/ood_stats.npz` (per-crop prototypes, 5.9 MB, float16). The heads and backbone are unchanged.

## How a request flows

1. **Photo quality** (before the model). Metrics are measured on the 224×224 copy the model already sees, so they do not depend on camera resolution and cost no extra resize; the size rule uses the original photo.
   - too small (short side), blurry (variance of the Laplacian), too dark / too bright (mean grey level) → `rejected_quality`
   - otherwise, too little plant-coloured area (share of pixels with hue 15–170°, saturation ≥ 0.15, value ≥ 0.12: yellow through green, so chlorotic and diseased leaves still count) → `not_leaf`
   - an unreadable file → `rejected_quality` / `unreadable_image` (was an HTTP 500)
   Rejected photos stop here: no backbone, no Grad-CAM, no severity.
2. **OOD score** on the backbone features and head outputs, with the method chosen per crop (below). Above the crop's threshold → `uncertain` (Grad-CAM, severity and the top class are still computed, plus the top-3 classes); otherwise `ok`.

### API contract (`POST /predict-disease`)

| Field | ok | uncertain | rejected_quality / not_leaf |
|---|---|---|---|
| `status` | `"ok"` | `"uncertain"` | `"rejected_quality"` / `"not_leaf"` |
| `reasons` | `[]` | `["unfamiliar_image"]` (feature-distance methods) or `["low_confidence"]` | e.g. `["blurry"]`, `["too_dark","too_small"]`, `["no_leaf"]`, `["unreadable_image"]` |
| `ood_score` | float (higher = more unusual) | float | `null` (not computed) |
| `quality` | metrics dict | metrics dict | metrics dict (`null` if unreadable) |
| `disease`, `confidence`, `severity`, `gradcam`, `crop` | yes | yes | only `crop` |
| `top3` | — | `[{disease, probability}]` ×3 | — |

Server (`server/controllers/predictController.js`): the ML call now happens before the Cloudinary upload (no orphan uploads when the ML call fails); treatment and yield-loss are looked up only when `status == "ok"`; `status`, `reasons`, `oodScore`, `quality`, `top3` are stored in `Prediction` (records saved before the gate have no `status` and read as `"ok"` via the schema default). Client: `ResultCard` shows a retake card per status with reason-specific tips (light, distance, one leaf, focus); for `uncertain` no disease is shown as a diagnosis — the model's leanings sit behind a collapsed "not a diagnosis" toggle, with no treatment or yield figure. `HistoryList` shows "Not sure" / "Retake" instead of a disease name.

## Quality cut-offs — chosen from data

Distributions were measured on 20,545 train/val images of all 10 crops (the same images the heads were trained on). Each cut-off sits at the 0.4% tail **of the most lenient crop**, and the calibration asserts that no crop loses 2% or more of its photos.

| Rule | Cut-off | Why |
|---|---|---|
| Short side | < 212 px | Data-derived instead of the fixed 224 px in the brief: 3.8% of rice training photos are 209–223 px and the model classifies those **100% correctly** (32/32 test images) — it resizes to 224 anyway. A 224 cut would have rejected 3.8% of good rice photos. Capped at 224. |
| Blur (Laplacian variance) | < 7.71 | 0.4% tail |
| Brightness (mean grey 0–255) | < 47.53 or > 195.23 | 0.4% tails |
| Plant-coloured share | < 1.29% | 0.4% tail — kept lenient because sugarcane's *Dried_Leaves* class is brown with almost no green |

Result: **0.45% of train/val photos rejected overall; worst crop rice 1.06%, maize 0.99%** (a single global cut-off first rejected 4.9% of rice, 4.2% of maize and 2.7% of sugarcane, so it was replaced by the per-crop-fair rule). On non-plant photos the quality rules alone catch about 15% of Imagenette (9.5% as `not_leaf`, 5% as bad photos — measured with the size rule off, since Imagenette-160 photos are 160 px); everything else is left to the OOD stage, which flags 100% of Imagenette for every crop.

## OOD score — methods compared

Evaluated per crop on the calibration cache (features computed with the exact serving code path):

- **In-distribution:** the crop's held-out test split (threshold is set on the separate validation split, keeping 95% of it).
- **Near-OOD, other crops:** up to 300 test photos of each of the other 9 crops (the "wrong crop selected" case).
- **Near-OOD, PlantDoc:** 2,578 PlantDoc web photos of 13 species, excluding the same species (apple, corn, potato) for those crops.
- **Far-OOD:** 1,000 Imagenette validation photos (non-plant objects), downloaded from fast.ai (`imagenette2-160.tgz`).

Methods (all "higher = more unusual"): max softmax probability (`msp`), energy (−logsumexp of the head's logits), Mahalanobis distance to the nearest class mean in a per-crop PCA space of 64/128/256 dimensions (`maha*`; `maha_full` = all 1,280, reference only — too large to ship), cosine distance to the nearest of 256 k-means prototypes of the crop's training features (`knn256`), and combinations (each part normalised on the crop's validation photos, then max). The method with the lowest mean FPR@95%TPR over the two near-OOD sets is chosen per crop (AUROC breaks ties).

### Chosen method per crop

| Crop | Method | Threshold | Own test photos kept | AUROC other crops | AUROC PlantDoc | AUROC Imagenette | FPR@95%TPR other crops | FPR@95%TPR PlantDoc | FPR@95%TPR Imagenette | Flagged at threshold: other crops / PlantDoc / Imagenette |
|---|---|---|---|---|---|---|---|---|---|---|
| wheat | energy+knn256 | 1.267 | 95.8% (n=240) | 0.998 | 0.999 | 1.000 | 0.9% | 0.5% | 0.0% | 99% / 99% / 100% |
| rice | energy+knn256 | 1.192 | 94.6% (n=927) | 0.997 | 0.999 | 1.000 | 1.1% | 0.2% | 0.0% | 99% / 100% / 100% |
| sugarcane | knn256 | 0.1163 | 94.1% (n=1014) | 1.000 | 1.000 | 1.000 | 0.0% | 0.0% | 0.0% | 100% / 100% / 100% |
| potato | knn256 | 0.1911 | 96.9% (n=323) | 1.000 | 1.000 | 1.000 | 0.1% | 0.0% | 0.0% | 100% / 100% / 100% |
| maize | energy+knn256 | 1.163 | 93.8% (n=629) | 0.992 | 0.999 | 1.000 | 2.4% | 0.0% | 0.0% | 98% / 100% / 100% |
| pigeonpea | knn256 | 0.1957 | 96.6% (n=148) | 0.996 | 0.998 | 1.000 | 1.9% | 0.5% | 0.0% | 98% / 99% / 100% |
| groundnut | knn256 | 0.254 | 93.0% (n=355) | 0.996 | 0.989 | 1.000 | 1.9% | 6.7% | 0.0% | 99% / 95% / 100% |
| blackgram | knn256 | 0.2806 | 95.4% (n=152) | 0.988 | 0.974 | 1.000 | 7.5% | 13.6% | 0.0% | 91% / 85% / 100% |
| apple | knn256 | 0.3136 | 96.0% (n=50) | 0.991 | 0.973 | 1.000 | 2.8% | 9.4% | 0.0% | 93% / 77% / 100% |
| banana | knn256 | 0.3977 | 94.4% (n=698) | 0.986 | 0.992 | 1.000 | 6.6% | 3.6% | 0.0% | 94% / 97% / 100% |

FPR@95%TPR = share of OOD photos that pass when the threshold keeps 95% of the crop's own test photos. "Flagged at threshold" uses the deployed threshold (set on validation).

### All methods (AUROC: other crops / PlantDoc)

| Crop | msp | energy | maha64 | maha128 | maha256 | maha_full | knn256 | energy+maha256 | msp+maha256 | energy+knn256 |
|---|---|---|---|---|---|---|---|---|---|---|
| wheat | 0.951 / 0.957 | 0.975 / 0.981 | 0.956 / 0.966 | 0.977 / 0.984 | 0.987 / 0.994 | 0.994 / 0.998 | 0.998 / 0.999 | 0.989 / 0.995 | 0.972 / 0.979 | 0.998 / 0.999 |
| rice | 0.963 / 0.984 | 0.960 / 0.984 | 0.789 / 0.807 | 0.830 / 0.841 | 0.905 / 0.911 | 0.989 / 0.993 | 0.997 / 0.999 | 0.964 / 0.981 | 0.973 / 0.986 | 0.997 / 0.999 |
| sugarcane | 0.876 / 0.908 | 0.945 / 0.972 | 0.973 / 0.967 | 0.991 / 0.994 | 0.998 / 1.000 | 1.000 / 1.000 | 1.000 / 1.000 | 0.998 / 1.000 | 0.998 / 1.000 | 1.000 / 1.000 |
| potato | 0.957 / 0.939 | 0.965 / 0.938 | 0.995 / 0.993 | 0.999 / 0.998 | 0.999 / 0.999 | 1.000 / 0.999 | 1.000 / 1.000 | 0.999 / 0.998 | 0.987 / 0.983 | 1.000 / 1.000 |
| maize | 0.886 / 0.901 | 0.963 / 0.974 | 0.882 / 0.914 | 0.937 / 0.952 | 0.968 / 0.979 | 0.981 / 0.991 | 0.990 / 0.999 | 0.972 / 0.982 | 0.963 / 0.977 | 0.992 / 0.999 |
| pigeonpea | 0.739 / 0.691 | 0.788 / 0.666 | 0.960 / 0.967 | 0.982 / 0.987 | 0.990 / 0.993 | 0.994 / 0.997 | 0.996 / 0.998 | 0.982 / 0.989 | 0.980 / 0.987 | 0.994 / 0.998 |
| groundnut | 0.755 / 0.792 | 0.727 / 0.812 | 0.981 / 0.960 | 0.989 / 0.975 | 0.993 / 0.984 | 0.993 / 0.981 | 0.996 / 0.989 | 0.988 / 0.972 | 0.985 / 0.970 | 0.995 / 0.984 |
| blackgram | 0.858 / 0.872 | 0.862 / 0.885 | 0.906 / 0.890 | 0.938 / 0.919 | 0.957 / 0.940 | 0.962 / 0.944 | 0.988 / 0.974 | 0.948 / 0.953 | 0.945 / 0.930 | 0.976 / 0.973 |
| apple | 0.888 / 0.862 | 0.908 / 0.877 | 0.982 / 0.975 | 0.986 / 0.975 | 0.984 / 0.968 | 0.976 / 0.957 | 0.991 / 0.973 | 0.969 / 0.941 | 0.976 / 0.955 | 0.985 / 0.963 |
| banana | 0.910 / 0.915 | 0.953 / 0.959 | 0.697 / 0.699 | 0.796 / 0.799 | 0.853 / 0.865 | 0.939 / 0.960 | 0.986 / 0.992 | 0.948 / 0.953 | 0.901 / 0.906 | 0.986 / 0.992 |

Take-aways: the head's own confidence (`msp`, `energy`) is a weak wrong-crop detector for several crops (pigeonpea 0.74, groundnut 0.76) — a head only knows its own classes and is confidently wrong on other crops. Distance in feature space works much better, and nearest-prototype distance (`knn256`) is best or tied for every crop. The `knn256` method was added after the end-to-end check exposed a miss (below).

## End-to-end check (browser → Express → ML service → Cloudinary + MongoDB)

| Photo | Crop selected | Before the fix (energy for banana) | Final |
|---|---|---|---|
| Blackgram leaf with yellow mosaic (held-out test photo) | blackgram | ok — Yellow Mosaic 99.97%, treatment + 20% yield loss | ok — same |
| Blurred blackgram leaf | blackgram | rejected_quality (blurry) — "Photo not clear enough" + focus tip | same |
| Church (Imagenette photo not in the calibration sample) | blackgram | not_leaf — "No leaf found" | same |
| Wheat leaf-blight field photo | banana | **ok — "Moko Wilt 99.6%" (wrong)** | uncertain — "We're not sure about this one", no disease/treatment |

The fourth case failed with the first calibration (banana used `energy`, which let ~23% of other crops' photos through); adding `knn256` fixed banana (94% of other crops flagged) and improved every crop's near-OOD rate. History shows each gated record as "Not sure" / "Retake".

## Latency (CPU, production runtime)

`train/bench_gate_latency.py`, 50 held-out photos (5 per crop): the gate's own work (quality metrics + OOD score) takes **2.1 ms median, 5.0 ms p95, 9.4 ms max** — well under the 50 ms budget. A full `predict_disease` call is ~740 ms median, dominated by the backbone and Grad-CAM (unchanged). Rejected photos are now faster than before, since they skip the model entirely.

## Limitations

- **Thresholds come from the same datasets the heads were trained on.** The "own photos kept" rate (93–97%) is for photos like the training data; real farmer photos will look different, so more of them will be flagged `uncertain` until the thresholds are re-calibrated on field photos (see TODO). By design ~5% of genuine photos of the training kind are flagged.
- **Weakest spots:** apple lets 23% of PlantDoc web photos of other species through (apple's own evaluation split is only 50 images, because the dataset has just 332 real leaves), blackgram 15%. Wrong-crop detection is 91–100% per crop, not perfect.
- The vegetation rule is deliberately lenient (brown dried sugarcane leaves are a real class), so most non-leaf photos are stopped by the OOD stage rather than by `not_leaf`.
- Images from Imagenette-160 are small; the far-OOD numbers measure content, not resolution (the size rule was switched off for that measurement).

## TODO — re-calibrate on field photos (pending item P1)

Once the field-photo test set exists, re-run the calibration with those photos as the in-distribution set (or at least as an extra validation set), check the "own photos kept" rate on them, and re-commit `models/ood_thresholds.json` and `models/ood_stats.npz`. Also re-run after any head or backbone change.

```bash
cd ml-service
../.venv/Scripts/python.exe train/calibrate_ood.py        # Linux/Docker: python train/calibrate_ood.py
../.venv/Scripts/python.exe train/bench_gate_latency.py
```

Inputs it expects: `ml-service/data/{train,val,test}/<crop>/<class>/` (the saved splits), `_dataset_backup/PlantDoc-Dataset-master.zip`, and `ml-service/data/ood_external/imagenette2-160/val` (from `https://s3.amazonaws.com/fast-ai-imageclas/imagenette2-160.tgz`, 99 MB; only `val` is used). Features are cached in `ml-service/data/ood_cache/`; delete it after changing the backbone or preprocessing.
