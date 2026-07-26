"""v1 RECONSTRUCTION — the original HSV-thresholding script was overwritten
in place when compute_severity.py was rewritten to v2 (no git history exists,
this project has no commits, so there is no way to recover the exact original
bytes). This is a faithful reconstruction of the documented v1 approach (HSV
saturation/hue thresholding, fixed global thresholds, no Otsu/no Lab/no
per-crop or per-image reference) and its correctness is checked by re-running
the same Yellow-Rust gate — if it doesn't land close to the recorded 49.0%,
that must be reported honestly rather than silently trusted.

1. LEAF-VS-BACKGROUND: fixed HSV saturation+value thresholds (not adaptive
   Otsu — this fixed-threshold approach is the documented root cause of v1's
   known background-misclassification problem on real-field photos).
2. DISEASED-VS-HEALTHY (within leaf mask): pixels outside the healthy green
   hue band, or desaturated (faded/brown/rust-colored) below a fixed
   saturation floor, are counted diseased.
3. % diseased pixels / total leaf pixels -> severity bucket (unchanged
   thresholds: early<15%, moderate 15-40%, severe>40%).
"""
import csv
import json
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(r"D:\AI Plant Disease Detection System")
DATA = ROOT / "ml-service" / "data"
RAW = DATA / "raw"
IMAGE_EXTS = {".jpg", ".jpeg", ".png", ".bmp", ".tif", ".tiff", ".webp", ".gif"}
SPLITS = ["train", "val", "test"]
METHOD_VERSION = "v1_hsv_restored"

THUMB_SIZE = 200
EARLY_MAX = 15
MODERATE_MAX = 40

# Fixed HSV thresholds (PIL's HSV mode: H, S, V all 0-255)
LEAF_SAT_MIN = 25
LEAF_VAL_MIN = 20
HEALTHY_HUE_LOW = 60
HEALTHY_HUE_HIGH = 110
DISEASE_SAT_MAX = 60

GRADE_TO_SEVERITY = {
    "0": "early", "R": "early",
    "MR": "moderate", "MRMS": "moderate",
    "MS": "severe", "S": "severe",
}
ACTIVE_CROPS = ["wheat", "rice", "sugarcane", "potato", "maize", "pigeonpea"]


def bucket(percent_affected):
    if percent_affected < EARLY_MAX:
        return "early"
    if percent_affected <= MODERATE_MAX:
        return "moderate"
    return "severe"


def load_thumb(path):
    img = Image.open(path).convert("RGB")
    img.thumbnail((THUMB_SIZE, THUMB_SIZE))
    return img


def leaf_mask_hsv(hsv):
    s, v = hsv[:, :, 1], hsv[:, :, 2]
    mask = (s > LEAF_SAT_MIN) & (v > LEAF_VAL_MIN)
    if mask.sum() == 0:
        mask = np.ones_like(mask)
    return mask


def segmentation_severity(path):
    img = load_thumb(path)
    hsv = np.array(img.convert("HSV")).astype(np.float32)
    mask = leaf_mask_hsv(hsv)

    h, s = hsv[:, :, 0][mask], hsv[:, :, 1][mask]
    total = mask.sum()
    if total < 2:
        return 0.0, "early"

    diseased = ((h < HEALTHY_HUE_LOW) | (h > HEALTHY_HUE_HIGH)) | (s < DISEASE_SAT_MAX)
    percent_affected = 100.0 * diseased.sum() / total
    return percent_affected, bucket(percent_affected)


def is_healthy_class(cls_name):
    return "healthy" in cls_name.lower()


def gate_check():
    yr_grades = {}
    with open(DATA / "wheat_severity_labels.csv", encoding="utf-8") as f:
        for row in csv.DictReader(f):
            yr_grades[row["filename"]] = row["grade"]

    yr_dir = RAW / "wheat" / "Yellow_Rust"
    images = [f for f in yr_dir.iterdir() if f.suffix.lower() in IMAGE_EXTS and f.name in yr_grades]
    print(f"=== v1-restored gate check: {len(images)} Yellow-Rust images ===")

    agree, total = 0, 0
    for i, f in enumerate(images):
        expert_severity = GRADE_TO_SEVERITY[yr_grades[f.name]]
        _, seg_severity = segmentation_severity(f)
        total += 1
        if seg_severity == expert_severity:
            agree += 1
        if (i + 1) % 2000 == 0:
            print(f"  ...{i+1}/{len(images)} processed")

    pct = 100.0 * agree / total
    print(f"\nReconstructed v1 agreement: {agree}/{total} = {pct:.1f}%  (recorded original v1 = 49.0%)")
    return pct


def full_run():
    rng_unused = None
    records = []
    dist = {}
    yr_grades = {}
    with open(DATA / "wheat_severity_labels.csv", encoding="utf-8") as f:
        for row in csv.DictReader(f):
            yr_grades[row["filename"]] = row["grade"]

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

    print("\n=== Severity distribution per crop (v1_hsv_restored, full run) ===")
    for crop, counts in sorted(dist.items()):
        total = sum(counts.values())
        print(f"\n{crop}/  ({total} images)")
        for sev in ("healthy", "early", "moderate", "severe"):
            print(f"  {sev}: {counts[sev]}")

    print(f"\n=== Yellow-Rust final agreement (full run): {yr_agree}/{yr_total} = {agreement_pct:.1f}% ===")

    out = {
        "method_version": METHOD_VERSION,
        "thresholds": {"early_max_pct": EARLY_MAX, "moderate_max_pct": MODERATE_MAX},
        "yellow_rust_validation": {
            "compared": yr_total,
            "agreed": yr_agree,
            "agreement_pct": agreement_pct,
            "note": "v1 reconstructed from documented approach after original script was overwritten by v2 rewrite (no backup/git history existed); validated via gate_check() before this full run.",
        },
        "distribution": dist,
        "images": records,
    }
    out_path = DATA / "severity_labels.json"
    json.dump(out, open(out_path, "w", encoding="utf-8"), indent=2, ensure_ascii=False)
    print(f"\nWritten: {out_path} ({len(records)} image records)")


if __name__ == "__main__":
    pct = gate_check()
    if pct >= 45.0:
        print(f"\nGate check close enough to recorded 49.0% ({pct:.1f}%) — proceeding to full 6-crop run.")
        full_run()
    else:
        print(f"\nGate check {pct:.1f}% is NOT close to recorded 49.0% — reconstruction diverges too much from "
              f"the original. STOPPING before full run; severity_labels.json left untouched (still v2's results).")
