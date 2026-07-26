"""Stratified 70/15/15 train/val/test split of ml-service/data/raw/ into
data/train/, data/val/, data/test/ (per active crop scope). Read-only on raw/:
only ever copies out of it. No augmentation here — that's a separate later
step applied to data/train/ only.
"""
import json
import random
import shutil
from pathlib import Path

ROOT = Path(r"D:\AI Plant Disease Detection System")
RAW = ROOT / "ml-service" / "data" / "raw"
DATA = ROOT / "ml-service" / "data"
IMAGE_EXTS = {".jpg", ".jpeg", ".png", ".bmp", ".tif", ".tiff", ".webp", ".gif"}

SEED = 42
SPLIT_RATIOS = {"train": 0.70, "val": 0.15, "test": 0.15}

# Active scope per implementation-plan.md Section 2 — chickpea (excluded
# permanently) and mustard (deferred) still physically sit in raw/ from
# before the scope was narrowed, but are not part of this split.
ACTIVE_CROPS = ["wheat", "rice", "sugarcane", "potato", "maize", "pigeonpea"]


def stratified_split(files):
    files = sorted(files, key=lambda f: f.name)
    rng = random.Random(SEED)
    rng.shuffle(files)
    n = len(files)
    n_train = round(n * SPLIT_RATIOS["train"])
    n_val = round(n * SPLIT_RATIOS["val"])
    n_test = n - n_train - n_val  # remainder, guarantees all files are placed
    return {
        "train": files[:n_train],
        "val": files[n_train:n_train + n_val],
        "test": files[n_train + n_val:],
    }


# Idempotent re-run: crops already split (non-empty in an existing report) are
# left untouched — their train/val/test assignments never get re-shuffled or
# re-copied. Only crops missing/empty (e.g. maize, added after the first run)
# get processed.
existing_report_path = DATA / "split_report.json"
existing = json.load(open(existing_report_path, encoding="utf-8")) if existing_report_path.exists() else {}
existing_splits = existing.get("splits", {})

report = {}
warnings = []

for crop in ACTIVE_CROPS:
    if existing_splits.get(crop):
        report[crop] = existing_splits[crop]
        continue

    crop_dir = RAW / crop
    if not crop_dir.is_dir():
        warnings.append(f"{crop}: no raw/{crop}/ folder found — 0 images, nothing split.")
        report[crop] = {}
        continue

    report[crop] = {}
    for class_dir in sorted(crop_dir.iterdir()):
        if not class_dir.is_dir():
            continue
        cls = class_dir.name
        files = [f for f in class_dir.iterdir() if f.suffix.lower() in IMAGE_EXTS]
        if not files:
            continue
        split = stratified_split(files)

        counts = {}
        for split_name, split_files in split.items():
            dest_dir = DATA / split_name / crop / cls
            dest_dir.mkdir(parents=True, exist_ok=True)
            for f in split_files:
                shutil.copy2(f, dest_dir / f.name)
            counts[split_name] = len(split_files)
        counts["total"] = len(files)
        report[crop][cls] = counts

skipped_in_raw = [d.name for d in RAW.iterdir() if d.is_dir() and d.name not in ACTIVE_CROPS]
if skipped_in_raw:
    warnings.append(
        f"raw/ also contains {skipped_in_raw} — outside active 6-crop scope, not split "
        f"(chickpea excluded permanently, mustard deferred per implementation-plan.md)."
    )

# ---- print summary ----
print("=== split_report.json summary ===")
grand = {"train": 0, "val": 0, "test": 0}
for crop, classes in report.items():
    crop_total = sum(c["total"] for c in classes.values())
    print(f"\n{crop}/  ({crop_total} images, {len(classes)} classes)")
    for cls, counts in sorted(classes.items()):
        print(f"  {cls}: train={counts['train']} val={counts['val']} test={counts['test']} (total={counts['total']})")
        grand["train"] += counts["train"]
        grand["val"] += counts["val"]
        grand["test"] += counts["test"]

print(f"\nGRAND TOTAL: train={grand['train']} val={grand['val']} test={grand['test']} "
      f"(sum={sum(grand.values())})")

if warnings:
    print("\n=== WARNINGS ===")
    for w in warnings:
        print(f"- {w}")

out_path = DATA / "split_report.json"
json.dump(
    {"seed": SEED, "ratios": SPLIT_RATIOS, "splits": report, "warnings": warnings},
    open(out_path, "w", encoding="utf-8"),
    indent=2,
    ensure_ascii=False,
)
print(f"\nWritten: {out_path}")
