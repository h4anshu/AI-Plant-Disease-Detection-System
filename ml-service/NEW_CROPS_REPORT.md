# New-crop expansion — dataset analysis and results (Sep 2026)

Nineteen raw archives (≈ 116,000 images, 20 candidate crops) were analysed one crop at a time to decide which could be added as new heads on the frozen EfficientNetB0 backbone. The six existing crops (wheat, rice, sugarcane, potato, maize, pigeonpea) were not touched.

**Outcome: 4 crops pass and are ready to go live — groundnut, blackgram, apple, banana.** Four more (grape, turmeric, tea, cotton) are technically trainable but fail on field photos or cover too few diseases; the product decision (26 Sep 2026) was **not to ship them**. The rest were rejected, each for a documented, evidence-backed reason.

Realistic accuracy on photos without augmentation artefacts (closest to a farmer's photo): groundnut 89.8%, banana 96.3%, apple 94.1%, blackgram 96.2% (no artefacts in that set).

Everything below is reproducible with `ml-service/train/new_crops.py` (per-crop artefacts — analysis JSON, confusion matrix, Grad-CAM grid, montages — are under `ml-service/data/new_crops/<crop>/`).

## Decision summary

Accuracy is 5-fold **grouped cross-validation over every independent image** (a physical leaf is never in both train and test), with a bootstrap 95% CI. "Weakest class" is the lowest per-class recall.

| Crop | Source(s) used | Independent images | Classes | CV accuracy [95% CI] | Weakest class | Decision |
|---|---|---|---|---|---|---|
| Groundnut | West Bengal field + Tamil Nadu field (merged) | 2,367 | 6 | 92.7% [91.6–93.7] | Leaf_Spot 89.6% | **Accept** |
| Blackgram | BPLD, Andhra Pradesh | 1,007 | 5 | 96.2% [95.0–97.4] | Powdery_Mildew 94% | **Accept** |
| Apple | Indigenous apple, J&K | 332 leaves (+5,012 aug. copies, train only) | 3 | 94.9% [92.5–97.0] | Alternaria 93% | **Accept** (limited source) |
| Banana | Tamil Nadu Multi-Crop | 4,634 (+2,291 aug. copies, train only) | 7 | 96.8% [96.3–97.3] | Pestalotiopsis 91.9% | **Accept** |
| Grape | NGLD, Nashik | 2,393 | 4 | 96.9% | Powdery_Mildew 94.5% | Not shipped — paper backdrop only |
| Turmeric | Bangladesh | 859 | 4 | 95.3% [94.0–96.7] | Leaf_Spot 91% | Not shipped — paper backdrop only |
| Tea | CS-D, Assam | 7,744 | 6 | 99.2% [98.9–99.3] | Tea_Mosquito_Bug 98.8% | Not shipped — paper backdrop only |
| Cotton | Pune severity set | 908 | 2 | 94.5% [93.0–95.9] | Bacterial_Blight 79% | Not shipped — only 2 classes |
| Chilli | — | — | — | (90.3% but not trustworthy) | — | Reject — web-scraped classes |
| Okra | — | 293 unique files | 6 | 55.3% | Phyllosticta 24% | Reject — too little real data |
| Tomato | — | 4,440 | 8 | 62.5% | Potassium_Def 26% | Reject — paper backdrop, label noise, 17% on field photos |
| Mango | — | 2,263 | 8 | 86.4% | Gall_Midge 59% | Reject — background removed, resolution shortcut |
| Cauliflower | — | 172 | 2 | 99.4% (meaningless) | — | Reject — "Healthy" is curds, diseases are leaves |
| Radish | — | ~43 leaves | — | — | — | Reject — leaves on black cloth, few real leaves |
| Bitter gourd, brinjal, mung bean, sesame, snake gourd, yard-long bean | — | 50–250 each | 1–3 | — | — | Reject — paper backdrop, 135–303 photos per crop, most lack a Healthy class |
| Sorghum | — | — | — | — | — | Reject — grain heads not leaves, no Healthy class |

## How "honest accuracy" was enforced

The previous round's lesson (Yellow_Rust: 100% test accuracy that was really photography style) drove every check here.

1. **Exact serving preprocessing.** Features are extracted with `PIL Image.resize((224,224))`, the same call `predict.py` makes. The old notebook used `tf.image.resize` (bilinear, no anti-aliasing), which diverges badly on the 4000–6000 px phone photos in the new datasets.
2. **Near-duplicate detection.** Embedding cosine alone failed (median nearest-neighbour cosine was 0.958 — different leaves look alike to ImageNet features). Instead: embedding kNN proposes candidate pairs, and ORB keypoints + RANSAC homography confirm whether two photos show the *same physical leaf* (robust to crop, zoom, rotation, flip, brightness). Threshold calibrated by eye on montages (`near_dup_montage.png`, `montage_low.png`): ≥ 8 inliers groups images for splitting; a cross-class match is called label noise (dropped) only at ≥ 25. Byte-identical files always collapse to one.
3. **Pre-augmented datasets.** Several archives ship augmented copies under different names (Roboflow exports, apple, tea). One medoid per physical leaf is used for validation/testing; the other copies may only join *training*, and only alongside their own leaf. Apple showed this is better than discarding them (test 92→94%, outside healthy leaves 42→55%).
4. **Grouped split and grouped 5-fold CV.** No near-duplicate group ever spans train/val/test (asserted in code). The small crops made a single 15% test split too noisy (apple: 50 images, ±7%), so the gate uses CV over every independent image, reported overall **and per source**.
5. **Gate:** CV accuracy ≥ 85%, every class ≥ 70% recall (overall and within each source for classes with ≥ 20 images), at least 2 classes, and a Healthy class (catalogue rule 1).
6. **Shortcut probes.** Per crop: can file size/shape, border colour, the image border alone, or the *source* predict the class? Plus a plain-backdrop measure (share of images shot on paper/cloth), Grad-CAM grids for every accepted head, and external tests on a different source where one exists (PlantDoc, other regional datasets).

## Per-crop findings

### Groundnut — accepted (merged sources)
- Two sources with completely different photography: West Bengal canopy scenes (4624×3472) and Tamil Nadu single-leaf close-ups (640×640). A model trained on either one alone collapses on the other (**West Bengal → Tamil Nadu 57.6%, Tamil Nadu → West Bengal 37.4%**; healthy recall 8–14%). Users will take both kinds of photo, so the head is trained on both.
- Tamil Nadu's 8,463 images are only **672 physical leaves** (Roboflow augmentation, ~7 copies per leaf); Rust alone is 3,194 files from ~104 leaves.
- **Tamil Nadu "Healthy" was dropped:** 409 files = about 5 physical leaves copied ~80 times, and one of the five has visible lesions (`groups_tn_Healthy.png`).
- Tightening duplicate grouping from 12 to 8 inliers moved test accuracy 96.9% → 94.7% — proof that looser grouping inflates results; the conservative setting is used.
- Per source (CV): Tamil Nadu 95.5%, West Bengal 91.6% (Leaf_Spot there 82.9% — often confused with Alternaria, both spot diseases). Grad-CAM sits on lesions/pustules.
- Caveats: Alternaria and Rosette exist only in West Bengal photos, Nutrition_Deficiency only in Tamil Nadu. ICRISAT reports groundnut rosette disease as African; the dataset authors labelled "Rosette" with a pathologist, so the advice treats it as rosette-type viral symptoms and its yield figure is tagged `low`.

### Blackgram — accepted
Clean, single source, 512×512 field photos; 914 independent leaf groups, no conflicts, no duplicates. Grad-CAM focuses on lesions, mosaic patches and powdery spots.

### Apple — accepted, limited
7,505 files are **332 physical leaves** (~22 augmented copies each, edge-stretch artefacts visible). Kashmir orchard field photos. Caveat: healthy apple leaves from PlantDoc (web photos, 71% on white stock backgrounds) are called Alternaria 40–58% of the time — a false-alarm risk outside Kashmir-style photos.

### Banana — accepted
- 8,949 files → 4,634 independent leaves (Roboflow copies removed from evaluation). Field photos (0–7% plain backdrop in most classes); Grad-CAM on lesion streaks for Sigatoka/Pestalotiopsis.
- **Source contamination fixed:** the `banana_sigatoka` class held 494 groundnut "Early-Leaf-Spot" images and one groundnut nutrition image (a Roboflow class-id mix-up); they are filtered out by original filename prefix.
- The source's `sigatoka` and `yb_sigatoka` ("Yellow-and-Black-Sigatoka") classes overlap by definition, so they are one `Sigatoka_Leaf_Spot` class. Cordana (34 real leaves) was dropped as too small.
- Augmentation artefacts appear evenly across classes (34–42%); accuracy on artefact-free test photos is 96.3%, the same as overall — no artefact shortcut.

### Grape, turmeric, tea — paper backdrop (not shipped)
All three are detached leaves photographed on white/grey paper (grape 93–99%, turmeric 100%, tea ~100%), which catalogue rule 3 says to reject or keep test-only. Evidence for grape: 99.0% on paper-backdrop test images but **12.5%** on the few in-field test images and **18.9%** on outside field photos — healthy vine leaves get called Powdery Mildew. They would only be safe with an in-app instruction such as "pluck the leaf and place it on plain white paper".
- Tea: 80,329 files are 9 augmentations of 1,500 raw photos per class. File *k* and *k*+1500·j are copies of one photo (nearest-neighbour offsets 1500/3000/4500/6000); that numbering is used as an exact grouping key. With that grouping: 7,744 independent photos, 99.2% CV — but all on paper, so the number says nothing about photos of leaves on the bush.

### Cotton — only a 2-class model is defensible (not shipped)
- Pune severity set: field photos, but only Bacterial_Blight (119) and Healthy (789) have ≥ 50 originals (Fusarium 47, Leaf Curl 25; the rest of the archive is augmentation).
- Bangladesh set: white-paper backdrop. Trained alone it fails on Pune field photos (Fusarium recall 2%, 159 healthy leaves → "Bacterial Blight").
- Merged: 91.8% overall but field Fusarium recall 20%, and Alternaria/Verticillium exist only on white paper — rejected.
- Pune-only 2-class head: 94.5% CV, Bacterial_Blight 79%. It transfers to the Bangladesh photos (Bacterial Blight 80%, Healthy 100%) but cannot recognise leaf curl virus or wilts, which it would force into "Blight" or "Healthy".

### Chilli — rejected
- Bangladesh set (8,814 images) is 98–100% white-paper backdrop with a per-class resolution shortcut (image size alone predicts the class 46% vs 17% chance). Trained on it, **344 of 424 healthy field leaves were called Leaf Curl Virus**.
- Tamil Nadu set: after removing copies, Leaf Curl 59, Leaf Spot 81, Whitefly 80, Yellowing 51 leaves. Visual review shows these small classes are **largely web-scraped** (Shutterstock watermarks, a microscope image, a collage, other plant species) while Healthy and Anthracnose are field photos from one farm — so provenance lines up with the label (the YR-19 trap). The 90.3% CV (without the non-specific Yellowing class) is therefore not trusted.

### Okra — rejected
Okra DiseaseNet ships 1,495 files but only **293 unique images** (31–72 per class); the copies span its own Training/Validation/Testing folders, so accuracy reported on its official split is leaked. With an honest split: 55% CV. The Bangladesh okra photos are white-paper backdrop, and Yellow Vein Mosaic exists only there, so it cannot become a class.

### Tomato-Village — rejected
Detached leaves on paper (rule 3), pre-rotated augmentations, 118 verified cases of the same leaf filed under two labels, and a JPEG-compression split by class (~245 KB vs ~11 KB for the same 256×256 size). 62.5% CV; **16.9%** on PlantDoc field/web tomato photos.

### Mango — rejected
Only background-removed leaves pasted on black ("process data"); no originals in the archive. Resolution differs by class (image size predicts class at 42% vs 12.5% chance); Cutting_Weevil is mostly bare twigs. 86.4% CV, Gall_Midge 59%.

### Cauliflower, radish — rejected
- Cauliflower: Healthy and Bacterial_Spot_Rot are photos of the **curd**, Black_Rot and Downy_Mildew of **leaves** — the model only learns leaf vs curd (99.4% "accuracy"). Every healthy leaf would be called diseased.
- Radish: every image is a detached leaf on the same black cloth; 2,739 files collapse to ~43 leaves.

### Six small Bangladesh vegetable crops — rejected
Bitter gourd, brinjal, mung bean, sesame, snake gourd, yard-long bean: detached leaves on white paper, 135–303 photos per crop, classes of 12–132 images. After the 50-image minimum most keep 1–2 classes and no Healthy class.

### Sorghum — rejected
Four of six classes are grain heads/panicles, many on a white floor; no Healthy class (`_rejected/sorghum_sample.png`).

## Data-quality problems found in the source datasets
- **Roboflow class-id mix-up** in the Tamil Nadu Multi-Crop set: `banana_sigatoka` contains 494 groundnut "Early-Leaf-Spot" images (and one groundnut nutrition image). Filtered by original filename prefix.
- **Hidden augmentation** at 7–80× in the Tamil Nadu set, apple and tea — without grouping, test sets would be full of copies of training leaves.
- **Split leakage in published datasets** (Okra DiseaseNet) and **same leaf under two labels** (Tomato-Village, 118 cases).
- The catalogue's "field" label was wrong for several sets (NGLD grape, CS-D tea, Bangladesh chilli are paper-backdrop).

## Rejected / unused archives
Moved to `_rejected_datasets/` (repo root; archives are git-ignored): Sorghum; `Cotton … Severity Levels (1).zip` (byte-identical duplicate); `Sugarcane Leaf Disease Dataset.zip` (existing crop — kept aside per instruction, not judged). Also moved as ineffective: Okra DiseaseNet, Mango, Tomato-Village, Bangladesh chilli, Bangladesh cotton, and the Bangladesh small-vegetables set (`Leaf Image Dataset …`); after the ship decision also NGLD grape, turmeric, tea (the .rar and the extracted folder) and the Pune cotton severity set — its severity grades remain useful for validating the severity module later. `_rejected_datasets/README.md` lists the reason for each; the pipeline config points there so every analysis can be re-run. The archives behind the shipped heads and the PlantDoc external test set were moved to `_dataset_backup/` (not needed at runtime; kept to re-run the analysis).

## Going live
- Heads: `ml-service/models/heads/<crop>_head.keras`; classes added (additively) to `ml-service/data/label_maps.json` and `class_weights.json`.
- `ml-service/predict.py` `ACTIVE_CROPS`, `client/src/pages/Predict.jsx` crop list, and the `crop` enum in `server/models/Prediction.js` (without it, saving history for a new crop fails validation).
- Treatment advice and yield-loss entries for every new class in `server/utils/treatmentMap.js` and `yieldLoss.js`, sourced from TNAU/ICRISAT (groundnut), ICAR-IIPR and Legume Research trials (blackgram), SKUAST-K/Kashmir trials (apple) and ICAR-NRC Banana (banana), with the same `high/med/low` confidence tags as before. **Have an agronomist review the advice text before a wide release.**
- Deployment: `data/label_maps.json` is git-ignored but copied into the Docker image, so rebuild the ML-service image from this checkout.

## Limitations
- Every accepted crop except groundnut comes from a single region/source; accuracy is measured on photos like the training ones. Real-world accuracy on other regions will be lower (apple's PlantDoc result shows how much).
- Duplicate detection relies on image keypoints; a shared textured backdrop (radish's black cloth) can chain different leaves together. That only makes splits more conservative, and the large groups of accepted crops were checked by eye.
- Severity is still the image-statistics heuristic (44% agreement on YR-19); it was not re-validated for the new crops.
