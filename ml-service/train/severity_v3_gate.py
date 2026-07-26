"""v3 gate test: distribution-based diseased-vs-healthy classification,
validated on Yellow-Rust ONLY before touching all 6 crops or overwriting
severity_labels.json. Leaf-vs-background (ExG+Otsu) is reused unchanged from
compute_severity.py — only the diseased/healthy step changes here.

v2 (forced k-means k=2) scored 15.8%, worse than v1's 49%, because it always
finds 2 clusters even in near-healthy leaves. This version instead builds a
per-channel Lab mean+std from the crop's healthy images, derives a distance
threshold from the healthy pixels' OWN distribution (no forced split, no
arbitrary fixed cutoff), and classifies a pixel diseased only if it exceeds
that threshold. Tests several percentile cutoffs in one pass (distance calc
is cheap; leaf-masking is the expensive part) and reports agreement for each.
"""
import csv
from pathlib import Path

import numpy as np

from compute_severity import DATA, RAW, IMAGE_EXTS, load_thumb, leaf_mask_for, lab_pixels, bucket

HEALTHY_REF_SAMPLE_PER_IMG = 1500
CANDIDATE_PERCENTILES = [90, 95, 97.5, 99]


def build_healthy_distribution(healthy_class_dir):
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
    mean = all_pixels.mean(axis=0)
    std = all_pixels.std(axis=0)
    std = np.where(std < 1e-6, 1e-6, std)

    z = (all_pixels - mean) / std
    healthy_dist = np.sqrt((z ** 2).sum(axis=1))
    thresholds = {p: float(np.percentile(healthy_dist, p)) for p in CANDIDATE_PERCENTILES}
    return mean, std, thresholds


def percent_affected_per_threshold(path, mean, std, thresholds):
    img = load_thumb(path)
    mask = leaf_mask_for(img)
    pixels = lab_pixels(img, mask)
    if len(pixels) < 2:
        return {p: 0.0 for p in thresholds}
    z = (pixels - mean) / std
    dist = np.sqrt((z ** 2).sum(axis=1))
    n = len(pixels)
    return {p: 100.0 * (dist > t).sum() / n for p, t in thresholds.items()}


def main():
    print("=== v3 gate: wheat healthy distribution ===")
    healthy_dir = RAW / "wheat" / "HealthyLeaf"
    mean, std, thresholds = build_healthy_distribution(healthy_dir)
    print(f"  Lab mean={np.round(mean,1)} std={np.round(std,1)}")
    print(f"  candidate distance thresholds (from healthy pixels' own percentiles): "
          f"{ {p: round(t,2) for p,t in thresholds.items()} }")

    yr_grades = {}
    with open(DATA / "wheat_severity_labels.csv", encoding="utf-8") as f:
        for row in csv.DictReader(f):
            yr_grades[row["filename"]] = row["grade"]

    GRADE_TO_SEVERITY = {
        "0": "early", "R": "early",
        "MR": "moderate", "MRMS": "moderate",
        "MS": "severe", "S": "severe",
    }

    yr_dir = RAW / "wheat" / "Yellow_Rust"
    images = [f for f in yr_dir.iterdir() if f.suffix.lower() in IMAGE_EXTS and f.name in yr_grades]
    print(f"\n=== Scoring {len(images)} Yellow-Rust images against expert grades ===")

    agree = {p: 0 for p in thresholds}
    total = 0
    for i, f in enumerate(images):
        expert_severity = GRADE_TO_SEVERITY[yr_grades[f.name]]
        pct_by_p = percent_affected_per_threshold(f, mean, std, thresholds)
        total += 1
        for p, pct in pct_by_p.items():
            if bucket(pct) == expert_severity:
                agree[p] += 1
        if (i + 1) % 2000 == 0:
            print(f"  ...{i+1}/{len(images)} processed")

    print(f"\n=== v3 agreement by percentile threshold (compared {total}) ===")
    best_p, best_acc = None, -1
    for p in CANDIDATE_PERCENTILES:
        pct = 100.0 * agree[p] / total
        print(f"  P{p}: {agree[p]} agree = {pct:.1f}%")
        if pct > best_acc:
            best_acc, best_p = pct, p

    print(f"\nBest: P{best_p} = {best_acc:.1f}%")
    print(f"v1 (HSV) = 49.0%   v2 (k-means) = 15.8%   v3 (P{best_p}) = {best_acc:.1f}%")
    if best_acc > 49.0:
        print("PASS: v3 clearly beats v1 — proceed to full re-run + overwrite severity_labels.json.")
    else:
        print("STOP: v3 does not clearly beat v1 — do not overwrite. Report diagnostics.")


if __name__ == "__main__":
    main()
