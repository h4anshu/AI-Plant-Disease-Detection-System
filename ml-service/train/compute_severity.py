"""Severity labeling v2 for every split image in ml-service/data/{train,val,test}/.

v1 (HSV saturation/hue thresholding) validated at only 49% agreement against
Yellow-Rust-19 expert grades — root cause was background misclassification on
real-field photos (rice, sugarcane, wheat "Original Dataset"). This version:

1. LEAF-VS-BACKGROUND: Excess Green Index (ExG = 2G - R - B) per pixel, Otsu's
   threshold (implemented directly with numpy, no opencv/skimage needed) to
   split leaf from background, then binary opening+closing (scipy.ndimage) to
   remove speckle noise and fill small holes.

2. DISEASED-VS-HEALTHY (within the leaf mask only): convert to L*a*b (Pillow's
   built-in 'LAB' conversion). Each crop gets its own healthy-tissue Lab
   reference centroid, built once from ALL of that crop's raw Healthy-class
   images (no cross-contamination between crops). For each diseased image,
   k-means (k=2) clusters that image's leaf-mask Lab pixels; whichever
   cluster centroid sits farther from the crop's healthy reference is called
   "diseased". % diseased pixels / total leaf pixels -> severity bucket.

Bucket thresholds (early<15%, moderate 15-40%, severe>40%) are unchanged from
v1 — the v1 exercise already showed tuning these doesn't move the needle when
the underlying mask is wrong; the fix here is the mask/clustering itself, not
the bucket edges.

Special case (method: expert_label): wheat/Yellow_Rust uses real expert grades
from data/wheat_severity_labels.csv as ground truth, unchanged. Segmentation
(v2) is additionally run on the same images purely to measure fresh agreement.
"""
import csv
import json
from pathlib import Path

import numpy as np
from PIL import Image
from scipy import ndimage
from sklearn.cluster import KMeans

ROOT = Path(r"D:\AI Plant Disease Detection System")
DATA = ROOT / "ml-service" / "data"
RAW = DATA / "raw"
IMAGE_EXTS = {".jpg", ".jpeg", ".png", ".bmp", ".tif", ".tiff", ".webp", ".gif"}
SPLITS = ["train", "val", "test"]
METHOD_VERSION = "v2_exg_labclustering"

THUMB_SIZE = 200
MORPH_STRUCT = np.ones((3, 3))
KMEANS_SAMPLE_MAX = 2000
HEALTHY_REF_SAMPLE_PER_IMG = 1500
EARLY_MAX = 15
MODERATE_MAX = 40

GRADE_TO_SEVERITY = {
    "0": "early", "R": "early",
    "MR": "moderate", "MRMS": "moderate",
    "MS": "severe", "S": "severe",
}

ACTIVE_CROPS = ["wheat", "rice", "sugarcane", "potato", "maize", "pigeonpea"]
OLD_AGREEMENT_PCT = 49.0


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


def build_healthy_reference(crop, healthy_class_dir):
    files = [f for f in healthy_class_dir.iterdir() if f.suffix.lower() in IMAGE_EXTS]
    rng = np.random.default_rng(42)
    pooled = []
    for f in files:
        img = load_thumb(f)
        mask = leaf_mask_for(img)
        pixels = lab_pixels(img, mask)
        if len(pixels) > HEALTHY_REF_SAMPLE_PER_IMG:
            idx = rng.choice(len(pixels), HEALTHY_REF_SAMPLE_PER_IMG, replace=False)
            pixels = pixels[idx]
        pooled.append(pixels)
    all_pixels = np.concatenate(pooled, axis=0)
    return all_pixels.mean(axis=0)


def segmentation_severity(path, healthy_ref, rng, debug=False):
    img = load_thumb(path)
    mask = leaf_mask_for(img)
    pixels = lab_pixels(img, mask)

    if len(pixels) < 2:
        return 0.0, "early"

    fit_pixels = pixels
    if len(pixels) > KMEANS_SAMPLE_MAX:
        idx = rng.choice(len(pixels), KMEANS_SAMPLE_MAX, replace=False)
        fit_pixels = pixels[idx]

    km = KMeans(n_clusters=2, n_init=3, random_state=42).fit(fit_pixels)
    centers = km.cluster_centers_
    dists = np.linalg.norm(pixels[:, None, :] - centers[None, :, :], axis=2)
    labels_full = np.argmin(dists, axis=1)

    d0 = np.linalg.norm(centers[0] - healthy_ref)
    d1 = np.linalg.norm(centers[1] - healthy_ref)
    diseased_cluster = 0 if d0 > d1 else 1
    diseased_count = int((labels_full == diseased_cluster).sum())
    percent_affected = 100.0 * diseased_count / len(pixels)

    if debug:
        c0_n = int((labels_full == 0).sum())
        c1_n = int((labels_full == 1).sum())
        print(f"    leaf_px={len(pixels)} centers={np.round(centers,1).tolist()} "
              f"sizes=[{c0_n},{c1_n}] d0={d0:.1f} d1={d1:.1f} diseased_cluster={diseased_cluster} "
              f"pct={percent_affected:.1f}")

    return percent_affected, bucket(percent_affected)


def is_healthy_class(cls_name):
    return "healthy" in cls_name.lower()


def build_all_healthy_references():
    print("=== Building per-crop healthy Lab reference centroids ===")
    healthy_refs = {}
    for crop in ACTIVE_CROPS:
        crop_dir = RAW / crop
        if not crop_dir.is_dir():
            continue
        healthy_dir = next((d for d in crop_dir.iterdir() if d.is_dir() and is_healthy_class(d.name)), None)
        if healthy_dir is None:
            print(f"  {crop}: NO healthy class found — skipping reference (segmentation will be unavailable for this crop)")
            continue
        ref = build_healthy_reference(crop, healthy_dir)
        healthy_refs[crop] = ref
        print(f"  {crop}: reference built from raw/{crop}/{healthy_dir.name}/, Lab centroid = {np.round(ref, 1)}")
    return healthy_refs


def main():
    healthy_refs = build_all_healthy_references()

    yr_grades = {}
    with open(DATA / "wheat_severity_labels.csv", encoding="utf-8") as f:
        for row in csv.DictReader(f):
            yr_grades[row["filename"]] = row["grade"]

    rng = np.random.default_rng(42)
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
            healthy_ref = healthy_refs.get(crop)

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
                    seg_pct, seg_severity = segmentation_severity(f, healthy_ref, rng)

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

    print("\n=== Severity distribution per crop (v2) ===")
    for crop, counts in sorted(dist.items()):
        total = sum(counts.values())
        print(f"\n{crop}/  ({total} images)")
        for sev in ("healthy", "early", "moderate", "severe"):
            print(f"  {sev}: {counts[sev]}")

    print("\n=== Yellow-Rust: segmentation (v2) vs expert-label agreement ===")
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
        "yellow_rust_validation": {
            "compared": yr_total,
            "agreed": yr_agree,
            "agreement_pct": agreement_pct,
            "v1_agreement_pct": OLD_AGREEMENT_PCT,
        },
        "distribution": dist,
        "images": records,
    }
    out_path = DATA / "severity_labels.json"
    json.dump(out, open(out_path, "w", encoding="utf-8"), indent=2, ensure_ascii=False)
    print(f"\nWritten: {out_path} ({len(records)} image records)")


if __name__ == "__main__":
    main()
