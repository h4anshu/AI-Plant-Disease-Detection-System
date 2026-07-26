"""Severity labeling v4 for every split image in ml-service/data/{train,val,test}/.

History:
- v1 (HSV saturation/hue thresholding, fixed global thresholds) — 49.0% Yellow-Rust
  agreement. Root cause of its errors: fixed thresholds misclassified background on
  real-field photos (rice, sugarcane, wheat "Original Dataset"). Its source was later
  overwritten by v2 with no backup; a best-effort reconstruction only reached 40.0%
  and was not trusted as a faithful restoration.
- v2 (ExG+Otsu leaf mask + Lab k-means(2), per-crop healthy reference) — 15.8%.
  Forcing exactly 2 clusters on every image manufactures a "diseased" cluster even
  on near-immune leaves (natural shading splits into two clusters ~50/50).
- v3 (per-crop healthy Lab mean+std, percentile-derived distance threshold) — 40.8%
  best case (P97.5). Fixed v2's false-positive problem on healthy leaves, but a
  single cross-image reference sets a noise floor from inter-image lighting
  variation that swallows real but localized/moderate disease signal.
- v4 (THIS VERSION): per-IMAGE median Lab + MAD, no cross-image reference at all —
  44.0% best case (4x MAD), the best of any reproducible method. Still below 70%
  confidence and below the original (unreproducible) v1 number; kept as the current
  best-validated method per explicit user decision after v1 could not be restored.

LEAF-VS-BACKGROUND (unchanged from v2/v3): Excess Green Index (ExG = 2G - R - B)
per pixel, Otsu's threshold (numpy, no opencv/skimage) to split leaf from
background, then binary opening+closing (scipy.ndimage) to remove speckle noise.

DISEASED-VS-HEALTHY (v4, within the leaf mask only): convert to L*a*b (Pillow's
built-in 'LAB' conversion). Compute THIS image's own median Lab color and MAD
(median absolute deviation) per channel — no cross-image reference, so it's
robust to inter-image lighting/camera differences by construction. A pixel is
"diseased" if its per-channel-MAD-normalized distance from the image's own
median exceeds 4x (validated best multiplier; 3x scored lower on the gate).
% diseased pixels / total leaf pixels -> severity bucket.

Bucket thresholds (early<15%, moderate 15-40%, severe>40%) are unchanged.

Special case (method: expert_label): wheat/Yellow_Rust uses real expert grades
from data/wheat_severity_labels.csv as ground truth, unchanged. Segmentation
(v4) is additionally run on the same images purely to measure fresh agreement.
"""
import csv
import json
from pathlib import Path

import numpy as np
from PIL import Image
from scipy import ndimage

ROOT = Path(r"D:\AI Plant Disease Detection System")
DATA = ROOT / "ml-service" / "data"
RAW = DATA / "raw"
IMAGE_EXTS = {".jpg", ".jpeg", ".png", ".bmp", ".tif", ".tiff", ".webp", ".gif"}
SPLITS = ["train", "val", "test"]
METHOD_VERSION = "v4_intraimage_mad"

THUMB_SIZE = 200
MORPH_STRUCT = np.ones((3, 3))
EARLY_MAX = 15
MODERATE_MAX = 40
MAD_MULTIPLIER = 4  # validated best of {3, 4} on the Yellow-Rust gate (44.0% vs 37.0%)

GRADE_TO_SEVERITY = {
    "0": "early", "R": "early",
    "MR": "moderate", "MRMS": "moderate",
    "MS": "severe", "S": "severe",
}

ACTIVE_CROPS = ["wheat", "rice", "sugarcane", "potato", "maize", "pigeonpea"]
OLD_AGREEMENT_PCT = 49.0  # recorded historical v1 number; v1's source is unrecoverable


def bucket(percent_affected):
    if percent_affected < EARLY_MAX:
        return "early"
    if percent_affected <= MODERATE_MAX:
        return "moderate"
    return "severe"


def otsu_threshold(values):
    hist, edges = np.histogram(values, bins=256)
    hist = hist.astype(np.float64)
    centers = (edges[:-1] + edges[1:]) / 2
    w1 = np.cumsum(hist)
    w2 = np.cumsum(hist[::-1])[::-1]
    m1 = np.cumsum(hist * centers) / np.where(w1 == 0, 1, w1)
    m2 = (np.cumsum((hist * centers)[::-1])[::-1]) / np.where(w2 == 0, 1, w2)
    inter_class_var = w1[:-1] * w2[1:] * (m1[:-1] - m2[1:]) ** 2
    if not np.any(inter_class_var):
        return float(centers[0])
    return float(centers[np.argmax(inter_class_var)])


def load_thumb(path):
    img = Image.open(path).convert("RGB")
    img.thumbnail((THUMB_SIZE, THUMB_SIZE))
    return img


def leaf_mask_for(img):
    rgb = np.array(img).astype(np.float32)
    exg = 2 * rgb[:, :, 1] - rgb[:, :, 0] - rgb[:, :, 2]
    thresh = otsu_threshold(exg.flatten())
    mask = exg > thresh

    total = mask.size
    if 0 < mask.sum() < total:
        opened = ndimage.binary_opening(mask, structure=MORPH_STRUCT)
        closed = ndimage.binary_closing(opened, structure=MORPH_STRUCT)
        if closed.sum() > 0:
            mask = closed

    if mask.sum() == 0:
        mask = np.ones_like(mask)
    return mask


def lab_pixels(img, mask):
    lab = np.array(img.convert("LAB")).astype(np.float32)
    return lab[mask]


def segmentation_severity(path):
    img = load_thumb(path)
    mask = leaf_mask_for(img)
    pixels = lab_pixels(img, mask)

    if len(pixels) < 2:
        return 0.0, "early"

    median = np.median(pixels, axis=0)
    mad = np.median(np.abs(pixels - median), axis=0)
    mad = np.where(mad < 1e-6, 1e-6, mad)
    z = (pixels - median) / mad
    dist = np.sqrt((z ** 2).sum(axis=1))

    diseased = dist > MAD_MULTIPLIER
    percent_affected = 100.0 * diseased.sum() / len(pixels)
    return percent_affected, bucket(percent_affected)


def is_healthy_class(cls_name):
    return "healthy" in cls_name.lower()


def main():
    yr_grades = {}
    with open(DATA / "wheat_severity_labels.csv", encoding="utf-8") as f:
        for row in csv.DictReader(f):
            yr_grades[row["filename"]] = row["grade"]

    records = []
    dist = {}
    yr_agree, yr_total = 0, 0

    for split in SPLITS:
        split_dir = DATA / split
        if not split_dir.is_dir():
            continue
        for crop_dir in sorted(split_dir.iterdir()):
            if not crop_dir.is_dir() or crop_dir.name not in ACTIVE_CROPS:
                continue
            crop = crop_dir.name
            dist.setdefault(crop, {"early": 0, "moderate": 0, "severe": 0, "healthy": 0})

            for class_dir in sorted(crop_dir.iterdir()):
                if not class_dir.is_dir():
                    continue
                cls = class_dir.name
                images = [f for f in class_dir.iterdir() if f.suffix.lower() in IMAGE_EXTS]

                if is_healthy_class(cls):
                    for f in images:
                        records.append({"crop": crop, "class": cls, "split": split,
                                         "severity": "healthy", "method": "segmentation",
                                         "method_version": METHOD_VERSION})
                        dist[crop]["healthy"] += 1
                    continue

                is_yellow_rust = (crop == "wheat" and cls == "Yellow_Rust")
                for f in images:
                    seg_pct, seg_severity = segmentation_severity(f)

                    if is_yellow_rust and f.name in yr_grades:
                        expert_severity = GRADE_TO_SEVERITY[yr_grades[f.name]]
                        records.append({"crop": crop, "class": cls, "split": split,
                                         "severity": expert_severity, "method": "expert_label",
                                         "method_version": METHOD_VERSION})
                        dist[crop][expert_severity] += 1
                        yr_total += 1
                        if seg_severity == expert_severity:
                            yr_agree += 1
                    else:
                        records.append({"crop": crop, "class": cls, "split": split,
                                         "severity": seg_severity, "method": "segmentation",
                                         "method_version": METHOD_VERSION})
                        dist[crop][seg_severity] += 1

    agreement_pct = (100.0 * yr_agree / yr_total) if yr_total else None

    print("\n=== Severity distribution per crop (v4) ===")
    for crop, counts in sorted(dist.items()):
        total = sum(counts.values())
        print(f"\n{crop}/  ({total} images)")
        for sev in ("healthy", "early", "moderate", "severe"):
            print(f"  {sev}: {counts[sev]}")

    print("\n=== Yellow-Rust: segmentation (v4) vs expert-label agreement ===")
    if yr_total:
        print(f"Compared {yr_total} images: {yr_agree} agree = {agreement_pct:.1f}%  (v1 was {OLD_AGREEMENT_PCT:.1f}%)")
        delta = agreement_pct - OLD_AGREEMENT_PCT
        print(f"Change vs v1: {delta:+.1f} percentage points")
        if agreement_pct < 70:
            print(f"** STILL BELOW 70% ({agreement_pct:.1f}%) — segmentation approach remains "
                  f"low-confidence for crops/diseases without expert ground truth. **")
    else:
        print("No Yellow_Rust images with matching expert grades found.")

    out = {
        "method_version": METHOD_VERSION,
        "thresholds": {"early_max_pct": EARLY_MAX, "moderate_max_pct": MODERATE_MAX},
        "mad_multiplier": MAD_MULTIPLIER,
        "yellow_rust_validation": {
            "compared": yr_total,
            "agreed": yr_agree,
            "agreement_pct": agreement_pct,
            "v1_agreement_pct": OLD_AGREEMENT_PCT,
            "note": "v1's original source was overwritten by the v2 rewrite with no backup; its 49.0% "
                    "is a recorded historical number only. v4 is the best result among all reproducible "
                    "methods tried (v2=15.8%, v3=40.8%, v1-reconstruction=40.0%, v4=44.0%).",
        },
        "distribution": dist,
        "images": records,
    }
    out_path = DATA / "severity_labels.json"
    json.dump(out, open(out_path, "w", encoding="utf-8"), indent=2, ensure_ascii=False)
    print(f"\nWritten: {out_path} ({len(records)} image records)")


if __name__ == "__main__":
    main()
