"""v4 gate test: intra-image robust outlier detection. No cross-image
reference at all (v3's global healthy-distribution approach still washed out
moderate/localized disease because real inter-image lighting variation set a
noise floor comparable to mild disease signal). v4 instead uses each image's
OWN median Lab color + MAD as the "healthy-looking" baseline for that photo,
so it's robust to lighting/camera differences between photos by construction.

Leaf-vs-background masking (ExG+Otsu) reused unchanged from compute_severity.
"""
import csv

import numpy as np

from compute_severity import DATA, RAW, IMAGE_EXTS, load_thumb, leaf_mask_for, lab_pixels, bucket

MAD_MULTIPLIERS = [3, 4]

GRADE_TO_SEVERITY = {
    "0": "early", "R": "early",
    "MR": "moderate", "MRMS": "moderate",
    "MS": "severe", "S": "severe",
}


def percent_affected_per_multiplier(path, multipliers):
    img = load_thumb(path)
    mask = leaf_mask_for(img)
    pixels = lab_pixels(img, mask)
    if len(pixels) < 2:
        return {m: 0.0 for m in multipliers}

    median = np.median(pixels, axis=0)
    mad = np.median(np.abs(pixels - median), axis=0)
    mad = np.where(mad < 1e-6, 1e-6, mad)
    z = (pixels - median) / mad
    dist = np.sqrt((z ** 2).sum(axis=1))

    n = len(pixels)
    return {m: 100.0 * (dist > m).sum() / n for m in multipliers}


def main():
    yr_grades = {}
    with open(DATA / "wheat_severity_labels.csv", encoding="utf-8") as f:
        for row in csv.DictReader(f):
            yr_grades[row["filename"]] = row["grade"]

    yr_dir = RAW / "wheat" / "Yellow_Rust"
    images = [f for f in yr_dir.iterdir() if f.suffix.lower() in IMAGE_EXTS and f.name in yr_grades]
    print(f"=== Scoring {len(images)} Yellow-Rust images (v4 intra-image MAD, no cross-image reference) ===")

    agree = {m: 0 for m in MAD_MULTIPLIERS}
    total = 0
    for i, f in enumerate(images):
        expert_severity = GRADE_TO_SEVERITY[yr_grades[f.name]]
        pct_by_m = percent_affected_per_multiplier(f, MAD_MULTIPLIERS)
        total += 1
        for m, pct in pct_by_m.items():
            if bucket(pct) == expert_severity:
                agree[m] += 1
        if (i + 1) % 2000 == 0:
            print(f"  ...{i+1}/{len(images)} processed")

    print(f"\n=== v4 agreement by MAD multiplier (compared {total}) ===")
    best_m, best_acc = None, -1
    for m in MAD_MULTIPLIERS:
        pct = 100.0 * agree[m] / total
        print(f"  {m}x MAD: {agree[m]} agree = {pct:.1f}%")
        if pct > best_acc:
            best_acc, best_m = pct, m

    print(f"\nBest: {best_m}x MAD = {best_acc:.1f}%")
    print(f"v1 (HSV) = 49.0%   v2 (k-means) = 15.8%   v3 (P97.5 dist) = 40.8%   v4 ({best_m}x MAD) = {best_acc:.1f}%")
    if best_acc > 49.0:
        print("PASS: v4 clearly beats v1 — proceed to full re-run + overwrite severity_labels.json (v4_intraimage_mad).")
    else:
        print("STOP: v4 does not clearly beat v1 — per decision rule, restore v1 (HSV) as the official method instead.")


if __name__ == "__main__":
    main()
