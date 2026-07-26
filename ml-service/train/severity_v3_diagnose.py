"""Quick sample-level diagnostic for why v3 (distribution-based, P97.5) still
fails the Yellow-Rust gate at 40.8%. Prints per-image Lab stats vs the
healthy reference for a few images per grade, so the failure mode is visible
instead of just the aggregate number.
"""
import csv

import numpy as np

from compute_severity import DATA, RAW, IMAGE_EXTS, load_thumb, leaf_mask_for, lab_pixels, bucket
from severity_v3_gate import build_healthy_distribution

GRADE_TO_SEVERITY = {
    "0": "early", "R": "early",
    "MR": "moderate", "MRMS": "moderate",
    "MS": "severe", "S": "severe",
}
THRESHOLD_P = 97.5


def main():
    healthy_dir = RAW / "wheat" / "HealthyLeaf"
    mean, std, thresholds = build_healthy_distribution(healthy_dir)
    threshold = thresholds[THRESHOLD_P]
    print(f"healthy mean={np.round(mean,1)} std={np.round(std,1)} threshold(P{THRESHOLD_P})={threshold:.2f}\n")

    yr_grades = {}
    with open(DATA / "wheat_severity_labels.csv", encoding="utf-8") as f:
        for row in csv.DictReader(f):
            yr_grades[row["filename"]] = row["grade"]

    yr_dir = RAW / "wheat" / "Yellow_Rust"
    by_grade = {}
    for f in yr_dir.iterdir():
        if f.suffix.lower() in IMAGE_EXTS and f.name in yr_grades:
            by_grade.setdefault(yr_grades[f.name], []).append(f)

    for grade in ["0", "R", "MR", "MRMS", "MS", "S"]:
        files = by_grade.get(grade, [])[:3]
        expert_sev = GRADE_TO_SEVERITY[grade]
        print(f"=== grade {grade} (expert={expert_sev}), {len(files)} samples ===")
        for f in files:
            img = load_thumb(f)
            mask = leaf_mask_for(img)
            pixels = lab_pixels(img, mask)
            img_mean = pixels.mean(axis=0)
            z = (pixels - mean) / std
            dist = np.sqrt((z ** 2).sum(axis=1))
            pct_over = 100.0 * (dist > threshold).sum() / len(pixels)
            pred_sev = bucket(pct_over)
            match = "OK" if pred_sev == expert_sev else "MISS"
            print(f"  {f.name:45s} leaf_px={len(pixels):5d} img_Lab_mean={np.round(img_mean,1)} "
                  f"dist_mean={dist.mean():.2f} dist_p50={np.percentile(dist,50):.2f} "
                  f"dist_p90={np.percentile(dist,90):.2f} pct_over_thresh={pct_over:5.1f} "
                  f"pred={pred_sev:8s} {match}")
        print()


if __name__ == "__main__":
    main()
