"""One-time copy of finalized source datasets into ml-service/data/raw/<crop>/<class>/.

Read-only on sources: only ever reads from the extracted dataset folders / zips
and writes into data/raw/. Never deletes or moves anything at the source.
"""
import csv
import hashlib
import json
import shutil
import zipfile
from pathlib import Path

ROOT = Path(r"D:\AI Plant Disease Detection System")
RAW = ROOT / "ml-service" / "data" / "raw"
IMAGE_EXTS = {".jpg", ".jpeg", ".png", ".bmp", ".tif", ".tiff", ".webp", ".gif"}


def file_hash(path: Path) -> str:
    return hashlib.md5(path.read_bytes()).hexdigest()


def copy_class_dir(src_dir: Path, dest_dir: Path) -> int:
    """Copy all images from src_dir into dest_dir. Collision-safe: same-content
    collisions are skipped, different-content collisions are suffixed so no
    image is ever silently overwritten."""
    dest_dir.mkdir(parents=True, exist_ok=True)
    existing_hashes = {}
    for f in dest_dir.iterdir():
        if f.suffix.lower() in IMAGE_EXTS:
            existing_hashes[f.name] = file_hash(f)

    copied = 0
    for f in sorted(src_dir.iterdir()):
        if f.suffix.lower() not in IMAGE_EXTS:
            continue
        target = dest_dir / f.name
        if f.name in existing_hashes:
            if existing_hashes[f.name] == file_hash(f):
                continue  # identical file already present, skip
            stem, suf = f.stem, f.suffix
            n = 2
            while (dest_dir / f"{stem}__dup{n}{suf}").exists():
                n += 1
            target = dest_dir / f"{stem}__dup{n}{suf}"
        shutil.copy2(f, target)
        existing_hashes[target.name] = file_hash(f)
        copied += 1
    return copied


def count_images(dir_: Path) -> int:
    if not dir_.exists():
        return 0
    return sum(1 for f in dir_.iterdir() if f.suffix.lower() in IMAGE_EXTS)


warnings = []
summary = {}  # crop -> {class: count}


# ---- potato (PlantVillage, dedupe root vs nested PlantVillage/PlantVillage) ----
pv = ROOT / "PlantVillage"
potato_map = {
    "Potato___Early_blight": "Early_blight",
    "Potato___Late_blight": "Late_blight",
    "Potato___healthy": "healthy",
}
summary["potato"] = {}
for src_name, dest_name in potato_map.items():
    n = copy_class_dir(pv / src_name, RAW / "potato" / dest_name)
    summary["potato"][dest_name] = n

maize_classes = [d for d in pv.iterdir() if d.is_dir() and "corn" in d.name.lower() or d.is_dir() and "maize" in d.name.lower()]
if not maize_classes:
    warnings.append("MAIZE: no maize/corn class found anywhere in PlantVillage/ (only Pepper, Potato, Tomato present) — maize skipped, nothing copied under data/raw/maize/.")


# ---- wheat (Original Dataset only) + Yellow_Rust collapse ----
wheat_src = ROOT / "Mandely_Wheat Disease" / "Original Dataset"
summary["wheat"] = {}
for cls_dir in sorted(wheat_src.iterdir()):
    if cls_dir.is_dir():
        n = copy_class_dir(cls_dir, RAW / "wheat" / cls_dir.name)
        summary["wheat"][cls_dir.name] = n

yr_src = ROOT / "YELLOW-RUST-19" / "YELLOW-RUST-19"
yr_dest = RAW / "wheat" / "Yellow_Rust"
yr_dest.mkdir(parents=True, exist_ok=True)
severity_csv = ROOT / "ml-service" / "data" / "wheat_severity_labels.csv"
grades = ["0", "MR", "MRMS", "MS", "R", "S"]
with open(severity_csv, "w", newline="", encoding="utf-8") as fh:
    writer = csv.writer(fh)
    writer.writerow(["filename", "grade"])
    yr_count = 0
    for grade in grades:
        grade_dir = yr_src / grade
        for f in sorted(grade_dir.iterdir()):
            if f.suffix.lower() not in IMAGE_EXTS:
                continue
            writer.writerow([f.name, grade])
            shutil.copy2(f, yr_dest / f.name)
            yr_count += 1
summary["wheat"]["Yellow_Rust"] = yr_count


# ---- sugarcane (Mendaly_Sugarcane Leaf Dataset, classes are zipped) ----
sc_src = ROOT / "Mendaly_Sugarcane Leaf Dataset"
summary["sugarcane"] = {}
for zip_path in sorted(sc_src.glob("*.zip")):
    class_name = zip_path.stem.replace(" ", "_")
    dest_dir = RAW / "sugarcane" / class_name
    dest_dir.mkdir(parents=True, exist_ok=True)
    n = 0
    with zipfile.ZipFile(zip_path) as zf:
        for member in zf.namelist():
            if Path(member).suffix.lower() not in IMAGE_EXTS:
                continue
            out_path = dest_dir / Path(member).name
            if out_path.exists():
                continue
            with zf.open(member) as src, open(out_path, "wb") as out:
                shutil.copyfileobj(src, out)
            n += 1
    summary["sugarcane"][class_name] = n


# ---- rice (Mendeley_Rice Leaf Disease Images only) ----
rice_src = ROOT / "Mendeley_Rice Leaf Disease Images"
summary["rice"] = {}
for cls_dir in sorted(rice_src.iterdir()):
    if cls_dir.is_dir():
        n = copy_class_dir(cls_dir, RAW / "rice" / cls_dir.name)
        summary["rice"][cls_dir.name] = n


# ---- chickpea (FUSARIUM-22/dataset_raw only, NOT dataset_augmented) ----
chickpea_src = ROOT / "FUSARIUM-22" / "dataset_raw"
summary["chickpea"] = {}
for cls_dir in sorted(chickpea_src.iterdir()):
    if cls_dir.is_dir():
        dest_name = cls_dir.name.replace("(", "_").replace(")", "")
        n = copy_class_dir(cls_dir, RAW / "chickpea" / dest_name)
        summary["chickpea"][dest_name] = n
warnings.append(
    "CHICKPEA: dataset_raw classes are Fusarium-resistance grades (1_HR, 3_R, 5_MR, 7_S, 9_HS) — "
    "no healthy/uninfected class exists in this source, so none was fabricated."
)


# ---- pigeonpea (all 4 classes) ----
pp_src = ROOT / "Mendeley_A novel pigeonpea leaf dataset"
summary["pigeonpea"] = {}
for cls_dir in sorted(pp_src.iterdir()):
    if cls_dir.is_dir():
        n = copy_class_dir(cls_dir, RAW / "pigeonpea" / cls_dir.name)
        summary["pigeonpea"][cls_dir.name] = n


# ---- mustard (900 MUSTARD LEAF DATASET, merge TEST+TRAIN per class) ----
mustard_src = ROOT / "900 MUSTARD LEAF DATASET"
summary["mustard"] = {}
mustard_classes = {"BELUM SIAP": "BELUM_SIAP", "SIAP PANEN": "SIAP_PANEN"}
for src_name, dest_name in mustard_classes.items():
    dest_dir = RAW / "mustard" / dest_name
    total = 0
    for split in ("TRAIN", "TEST"):
        total += copy_class_dir(mustard_src / split / src_name, dest_dir)
    summary["mustard"][dest_name] = count_images(dest_dir)
    if total != count_images(dest_dir):
        warnings.append(
            f"MUSTARD/{dest_name}: {total - count_images(dest_dir)} file(s) skipped as exact "
            f"duplicates when merging TEST+TRAIN (same filename, identical content)."
        )
warnings.append(
    "MUSTARD: '900 MUSTARD LEAF DATASET' labels are ripeness/harvest-readiness stages "
    "(BELUM_SIAP='not ready', SIAP_PANEN='ready to harvest'), not a disease taxonomy — "
    "confirm this belongs in a disease-detection pipeline before training on it."
)
warnings.append(
    "MUSTARD: source TEST and TRAIN splits overlap by ~31-55 filenames per class, mostly "
    "identical images (train/test leakage in the original download) — a few were "
    "differently-named collisions and were kept as '__dupN' rather than dropped."
)


# ---- skipped entirely ----
warnings.append("wheat_leaf/ (407 images, 3 classes): SKIPPED — taxonomy unresolved, needs manual review before inclusion.")
warnings.append("Master Plant Disease Dataset/: EXCLUDED ENTIRELY per instructions (known aggregation, overlaps with standalone sources).")
warnings.append("Sugarcane Leaf Disease Dataset/ (5-class) and Sugarcane_leafs/ (6-class): EXCLUDED ENTIRELY per instructions.")
warnings.append("Kaggle_Rice Leaf Diseases Dataset/ (120 img): EXCLUDED ENTIRELY per instructions.")


# ---- sanity check vs audit_report.json ----
audit = json.load(open(ROOT / "ml-service" / "data" / "audit_report.json", encoding="utf-8"))
audit_by_name = {d["name"]: d for d in audit["datasets"]}

mismatches = []


def audit_count(dataset_name, prefix):
    d = audit_by_name.get(dataset_name)
    if not d:
        return None
    return {k.split("\\")[-1]: v for k, v in d["classes"].items() if k.startswith(prefix)}


# potato vs PlantVillage root-level entries
pv_audit = audit_count("PlantVillage", "Potato___")
if pv_audit:
    for src_name, dest_name in potato_map.items():
        expected = pv_audit.get(src_name)
        actual = summary["potato"].get(dest_name)
        if expected is not None and expected != actual:
            mismatches.append(f"potato/{dest_name}: expected {expected} (audit), got {actual}")

# wheat vs Original Dataset
wheat_audit = audit_count("Mandely_Wheat Disease", "Original Dataset\\")
if wheat_audit:
    for cls, expected in wheat_audit.items():
        actual = summary["wheat"].get(cls)
        if expected != actual:
            mismatches.append(f"wheat/{cls}: expected {expected} (audit), got {actual}")

yr_audit = audit_by_name.get("YELLOW-RUST-19", {}).get("total_images")
if yr_audit is not None and yr_audit != summary["wheat"].get("Yellow_Rust"):
    mismatches.append(f"wheat/Yellow_Rust: expected {yr_audit} (audit total), got {summary['wheat'].get('Yellow_Rust')}")

# sugarcane vs Mendaly_Sugarcane Leaf Dataset
sc_audit = audit_by_name.get("Mendaly_Sugarcane Leaf Dataset", {}).get("classes", {})
for cls_key, expected in sc_audit.items():
    dest_name = cls_key.replace(" ", "_")
    actual = summary["sugarcane"].get(dest_name)
    if expected != actual:
        mismatches.append(f"sugarcane/{dest_name}: expected {expected} (audit), got {actual}")

# rice vs Mendeley_Rice Leaf Disease Images
rice_audit = audit_by_name.get("Mendeley_Rice Leaf Disease Images", {}).get("classes", {})
for cls, expected in rice_audit.items():
    actual = summary["rice"].get(cls)
    if expected != actual:
        mismatches.append(f"rice/{cls}: expected {expected} (audit), got {actual}")

# chickpea vs FUSARIUM-22 dataset_raw
fus_audit = audit_count("FUSARIUM-22", "dataset_raw\\")
if fus_audit:
    for cls_key, expected in fus_audit.items():
        dest_name = cls_key.replace("(", "_").replace(")", "")
        actual = summary["chickpea"].get(dest_name)
        if expected != actual:
            mismatches.append(f"chickpea/{dest_name}: expected {expected} (audit), got {actual}")

# pigeonpea
pp_audit = audit_by_name.get("Mendeley_A novel pigeonpea leaf dataset", {}).get("classes", {})
for cls, expected in pp_audit.items():
    actual = summary["pigeonpea"].get(cls)
    if expected != actual:
        mismatches.append(f"pigeonpea/{cls}: expected {expected} (audit), got {actual}")

# mustard: audit counts are per-split (TEST\.. / TRAIN\..), compare merged totals
mustard_audit = audit_by_name.get("900 MUSTARD LEAF DATASET", {}).get("classes", {})
mustard_expected_totals = {}
for k, v in mustard_audit.items():
    _, cls = k.split("\\", 1)
    mustard_expected_totals[cls] = mustard_expected_totals.get(cls, 0) + v
for src_name, dest_name in mustard_classes.items():
    expected = mustard_expected_totals.get(src_name)
    actual = summary["mustard"].get(dest_name)
    if expected is not None and expected != actual:
        mismatches.append(
            f"mustard/{dest_name}: expected {expected} (audit TEST+TRAIN sum), got {actual} "
            f"(difference is expected — duplicates between TEST/TRAIN were deduped, see warnings)"
        )


# ---- print final tree ----
print("\n=== ml-service/data/raw/ ===")
grand_total = 0
for crop in sorted(summary):
    crop_total = sum(summary[crop].values())
    grand_total += crop_total
    print(f"\n{crop}/  ({crop_total} images, {len(summary[crop])} classes)")
    for cls, n in sorted(summary[crop].items()):
        print(f"  {cls}: {n}")
print(f"\nGRAND TOTAL: {grand_total} images across {len(summary)} crops")

print("\n=== WARNINGS ===")
for w in warnings:
    print(f"- {w}")
if mismatches:
    print("\n=== COUNT MISMATCHES vs audit_report.json ===")
    for m in mismatches:
        print(f"- {m}")
else:
    print("\nNo unexplained count mismatches vs audit_report.json.")

report_out = ROOT / "ml-service" / "data" / "raw_placement_report.json"
json.dump(
    {"summary": summary, "warnings": warnings, "mismatches": mismatches},
    open(report_out, "w", encoding="utf-8"),
    indent=2,
    ensure_ascii=False,
)
print(f"\nWritten: {report_out}")
