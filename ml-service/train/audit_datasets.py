"""
Read-only dataset inventory audit.
Walks all 12+ extracted dataset folders, reports class structure,
image counts, duplicate detection across rice/sugarcane sources,
Master dataset overlap analysis, and Yellow-Rust-19 search.
"""

import os
import sys
import json
import hashlib
import csv
import zipfile
from pathlib import Path
from collections import defaultdict, Counter

BASE_DIR = Path(r"D:\AI Plant Disease Detection System")
OUTPUT_JSON = BASE_DIR / "ml-service" / "data" / "audit_report.json"

IMAGE_EXTS = {".jpg", ".jpeg", ".png", ".bmp", ".tif", ".tiff", ".webp", ".gif"}


def is_image(path):
    return Path(path).suffix.lower() in IMAGE_EXTS


def file_hash(filepath, block_size=8192):
    h = hashlib.md5()
    with open(filepath, "rb") as f:
        while True:
            chunk = f.read(block_size)
            if not chunk:
                break
            h.update(chunk)
    return h.hexdigest()


def avg_hash_file(filepath, hash_size=8):
    """Fast average perceptual hash using PIL. Falls back to md5 if PIL unavailable."""
    try:
        from PIL import Image
        img = Image.open(filepath).convert("L").resize((hash_size, hash_size), Image.BILINEAR)
        pixels = list(img.getdata())
        avg = sum(pixels) / len(pixels)
        return "".join("1" if p > avg else "0" for p in pixels)
    except Exception:
        return file_hash(filepath)


def hamming_distance(h1, h2):
    return sum(c1 != c2 for c1, c2 in zip(h1, h2))


def walk_classes(root, max_depth=5):
    """Detect class-label folders (leaf directories containing images)."""
    root = Path(root)
    classes = {}
    non_image_files = []

    for dirpath, dirnames, filenames in os.walk(root):
        depth = len(Path(dirpath).relative_to(root).parts)
        if depth > max_depth:
            dirnames.clear()
            continue

        images = [f for f in filenames if is_image(f)]
        others = [f for f in filenames if not is_image(f) and not f.startswith(".")]

        if images:
            rel = str(Path(dirpath).relative_to(root))
            classes[rel] = len(images)

        if others:
            rel = str(Path(dirpath).relative_to(root))
            non_image_files.extend(f"{rel}/{f}" for f in others)

    return classes, non_image_files


def walk_classes_in_zip(zip_path):
    """Peek inside a zip to find class folders and image counts."""
    classes = defaultdict(int)
    non_image = []
    with zipfile.ZipFile(zip_path, "r") as zf:
        for info in zf.infolist():
            if info.is_dir():
                continue
            p = Path(info.filename)
            if is_image(p.name):
                parent = str(p.parent)
                classes[parent] += 1
            else:
                non_image.append(info.filename)
    return dict(classes), non_image


def folder_size_bytes(root):
    total = 0
    for dirpath, _, filenames in os.walk(root):
        for f in filenames:
            try:
                total += os.path.getsize(os.path.join(dirpath, f))
            except OSError:
                pass
    return total


def human_size(nbytes):
    for unit in ("B", "KB", "MB", "GB"):
        if nbytes < 1024:
            return f"{nbytes:.1f} {unit}"
        nbytes /= 1024
    return f"{nbytes:.1f} TB"


def sample_hashes(root, sample_size=200):
    """Collect avg-hash of up to sample_size images from a folder tree."""
    hashes = {}
    count = 0
    for dirpath, _, filenames in os.walk(root):
        for f in sorted(filenames):
            if not is_image(f):
                continue
            fp = os.path.join(dirpath, f)
            hashes[fp] = avg_hash_file(fp)
            count += 1
            if count >= sample_size:
                return hashes
    return hashes


def sample_hashes_md5(root, sample_size=500):
    """Collect md5 of up to sample_size images for exact-duplicate detection."""
    hashes = {}
    count = 0
    for dirpath, _, filenames in os.walk(root):
        for f in sorted(filenames):
            if not is_image(f):
                continue
            fp = os.path.join(dirpath, f)
            hashes[fp] = file_hash(fp)
            count += 1
            if count >= sample_size:
                return hashes
    return hashes


def compare_hash_sets(hashes_a, hashes_b, threshold=5):
    """Compare two sets of perceptual hashes. Returns (matches, total_compared)."""
    matches = 0
    vals_b = list(hashes_b.values())
    for h_a in hashes_a.values():
        for h_b in vals_b:
            if len(h_a) == len(h_b) and len(h_a) == 64:
                if hamming_distance(h_a, h_b) <= threshold:
                    matches += 1
                    break
            elif h_a == h_b:
                matches += 1
                break
    return matches, len(hashes_a)


def compare_md5_sets(hashes_a, hashes_b):
    """Exact duplicate check via md5."""
    set_b = set(hashes_b.values())
    matches = sum(1 for h in hashes_a.values() if h in set_b)
    return matches, len(hashes_a)


# ──────────────────────────────────────────────
# Main audit
# ──────────────────────────────────────────────

def audit_standard_folder(name, folder_path, crop):
    print(f"\n{'='*60}")
    print(f"  {name}")
    print(f"{'='*60}")

    classes, non_images = walk_classes(folder_path)
    total_images = sum(classes.values())
    size = folder_size_bytes(folder_path)

    print(f"  Crop: {crop}")
    print(f"  Total images: {total_images:,}")
    print(f"  Total size: {human_size(size)}")
    print(f"  Classes ({len(classes)}):")
    for cls, cnt in sorted(classes.items()):
        print(f"    {cls}: {cnt:,}")
    if non_images:
        print(f"  Non-image files ({len(non_images)}):")
        for f in non_images[:20]:
            print(f"    {f}")
        if len(non_images) > 20:
            print(f"    ... and {len(non_images)-20} more")

    return {
        "name": name,
        "path": str(folder_path),
        "crop": crop,
        "total_images": total_images,
        "total_size_bytes": size,
        "total_size_human": human_size(size),
        "num_classes": len(classes),
        "classes": {k: v for k, v in sorted(classes.items())},
        "non_image_files": non_images,
    }


def audit_zip_folder(name, folder_path, crop):
    """For datasets stored as zips inside a folder (Mendaly Sugarcane)."""
    print(f"\n{'='*60}")
    print(f"  {name}")
    print(f"{'='*60}")

    all_classes = {}
    all_non_images = []
    total_images = 0
    size = folder_size_bytes(folder_path)

    for zf in sorted(Path(folder_path).glob("*.zip")):
        cls_map, ni = walk_classes_in_zip(zf)
        for cls, cnt in cls_map.items():
            all_classes[cls] = cnt
            total_images += cnt
        all_non_images.extend(ni)

    # Also check for non-zip extracted folders
    for item in Path(folder_path).iterdir():
        if item.is_dir():
            cls_sub, ni_sub = walk_classes(item)
            for cls, cnt in cls_sub.items():
                key = f"{item.name}/{cls}" if cls != "." else item.name
                all_classes[key] = cnt
                total_images += cnt
            all_non_images.extend(ni_sub)

    print(f"  Crop: {crop}")
    print(f"  Total images: {total_images:,}")
    print(f"  Total size (on disk, zipped): {human_size(size)}")
    print(f"  Classes ({len(all_classes)}):")
    for cls, cnt in sorted(all_classes.items()):
        print(f"    {cls}: {cnt:,}")
    if all_non_images:
        print(f"  Non-image files ({len(all_non_images)}):")
        for f in all_non_images[:10]:
            print(f"    {f}")

    return {
        "name": name,
        "path": str(folder_path),
        "crop": crop,
        "total_images": total_images,
        "total_size_bytes": size,
        "total_size_human": human_size(size),
        "num_classes": len(all_classes),
        "classes": {k: v for k, v in sorted(all_classes.items())},
        "non_image_files": all_non_images,
        "note": "Images stored in zip archives (not extracted)",
    }


def audit_master_dataset(folder_path):
    """Special audit for Master Plant Disease Dataset using its CSV metadata."""
    print(f"\n{'='*60}")
    print(f"  Master Plant Disease Dataset")
    print(f"{'='*60}")

    meta_dir = folder_path / "metadata" / "metadata"
    manifest = meta_dir / "dataset_manifest.csv"
    class_map_file = meta_dir / "class_id_map.csv"
    source_manifest = meta_dir / "source_manifest_full.csv"

    # Parse source manifest for source datasets and crops
    sources = set()
    crops = set()
    class_counts = Counter()
    source_class_map = defaultdict(set)
    crop_class_map = defaultdict(set)

    with open(source_manifest, "r", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for row in reader:
            src = row.get("source_dataset", "")
            crop = row.get("crop", "")
            canon = row.get("canonical_class", "")
            sources.add(src)
            crops.add(crop)
            class_counts[canon] += 1
            source_class_map[src].add(canon)
            crop_class_map[crop].add(canon)

    # Parse class_map for full list
    class_map = {}
    with open(class_map_file, "r", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for row in reader:
            class_map[row["canonical_class"]] = int(row["class_id"])

    size = folder_size_bytes(folder_path)
    total_images = sum(class_counts.values())

    print(f"  Total images (from manifest): {total_images:,}")
    print(f"  Total size: {human_size(size)}")
    print(f"  Source datasets ({len(sources)}):")
    for s in sorted(sources):
        print(f"    {s} ({len(source_class_map[s])} classes)")
    print(f"  Crops ({len(crops)}):")
    for c in sorted(crops):
        print(f"    {c} ({len(crop_class_map[c])} classes)")
    print(f"  Total canonical classes: {len(class_map)}")
    print(f"  Class breakdown (top 30):")
    for cls, cnt in class_counts.most_common(30):
        print(f"    {cls}: {cnt:,}")

    return {
        "name": "Master Plant Disease Dataset",
        "path": str(folder_path),
        "crop": "Multi-crop",
        "total_images": total_images,
        "total_size_bytes": size,
        "total_size_human": human_size(size),
        "num_classes": len(class_map),
        "source_datasets": sorted(sources),
        "crops": sorted(crops),
        "classes": {k: v for k, v in sorted(class_counts.items())},
        "source_class_breakdown": {k: sorted(v) for k, v in sorted(source_class_map.items())},
    }


def search_yellow_rust(base_dir):
    """Search all folder/file names for yellow rust / YR-19 variants."""
    print(f"\n{'='*60}")
    print(f"  Yellow-Rust-19 Search")
    print(f"{'='*60}")

    terms = ["yellow_rust", "yellow rust", "yellowrust", "yr-19", "yr19", "yellow-rust"]
    hits = []

    for dirpath, dirnames, filenames in os.walk(base_dir):
        rel = str(Path(dirpath).relative_to(base_dir))
        low = rel.lower()
        for t in terms:
            if t in low:
                hits.append(("directory", rel))
                break
        for f in filenames:
            fl = f.lower()
            for t in terms:
                if t in fl:
                    hits.append(("file", f"{rel}/{f}"))
                    break

    # Also check inside Master dataset metadata
    source_manifest = base_dir / "Master Plant Disease Dataset" / "metadata" / "metadata" / "source_manifest_full.csv"
    if source_manifest.exists():
        with open(source_manifest, "r", encoding="utf-8") as f:
            reader = csv.DictReader(f)
            for row in reader:
                for col in ["source_class", "canonical_class", "source_dataset"]:
                    val = row.get(col, "").lower()
                    for t in terms:
                        if t in val:
                            hits.append(("master_metadata", f"{col}={row[col]}"))

    # Check wheat_leaf classes (stripe_rust is related)
    wheat_leaf = base_dir / "wheat_leaf"
    if wheat_leaf.exists():
        for sub in wheat_leaf.iterdir():
            if "rust" in sub.name.lower() or "yellow" in sub.name.lower():
                hits.append(("wheat_leaf_class", sub.name))

    # Deduplicate
    unique_hits = list(set(hits))

    if unique_hits:
        print(f"  Found {len(unique_hits)} matches:")
        for kind, loc in sorted(unique_hits):
            print(f"    [{kind}] {loc}")
    else:
        print("  NO matches found for Yellow-Rust-19 / YR-19 anywhere.")

    return unique_hits


def run_duplicate_analysis():
    """Cross-source duplicate detection for rice and sugarcane pairs."""
    print(f"\n{'='*60}")
    print(f"  Duplicate Analysis")
    print(f"{'='*60}")

    results = {}

    # ── Rice sources ──
    rice_a = BASE_DIR / "Kaggle_Rice Leaf Diseases Dataset"
    rice_b = BASE_DIR / "Mendeley_Rice Leaf Disease Images"

    print("\n  Rice: Kaggle vs Mendeley (md5 exact match, up to 500 per source)...")
    ha = sample_hashes_md5(rice_a, 500)
    hb = sample_hashes_md5(rice_b, 500)
    matches, total = compare_md5_sets(ha, hb)
    pct = (matches / total * 100) if total else 0
    print(f"    Sampled {len(ha)} from Kaggle, {len(hb)} from Mendeley")
    print(f"    Exact matches: {matches}/{total} ({pct:.1f}%)")

    # Also try perceptual hash
    print("  Rice: perceptual hash check (avg hash, up to 200 per source)...")
    pa = sample_hashes(rice_a, 200)
    pb = sample_hashes(rice_b, 200)
    p_matches, p_total = compare_hash_sets(pa, pb, threshold=5)
    p_pct = (p_matches / p_total * 100) if p_total else 0
    print(f"    Perceptual matches: {p_matches}/{p_total} ({p_pct:.1f}%)")

    results["rice_kaggle_vs_mendeley"] = {
        "md5_matches": matches,
        "md5_sampled": total,
        "md5_pct": round(pct, 1),
        "phash_matches": p_matches,
        "phash_sampled": p_total,
        "phash_pct": round(p_pct, 1),
    }

    # ── Sugarcane sources ──
    sugar_sources = {
        "Sugarcane Leaf Disease Dataset": BASE_DIR / "Sugarcane Leaf Disease Dataset",
        "Sugarcane_leafs": BASE_DIR / "Sugarcane_leafs",
    }
    # Mendaly sugarcane is zipped — skip deep hash comparison for it
    # but note its classes for taxonomy comparison

    pairs = [
        ("Sugarcane Leaf Disease Dataset", "Sugarcane_leafs"),
    ]

    for name_a, name_b in pairs:
        path_a, path_b = sugar_sources[name_a], sugar_sources[name_b]
        print(f"\n  Sugarcane: {name_a} vs {name_b} (md5, up to 500)...")
        ha = sample_hashes_md5(path_a, 500)
        hb = sample_hashes_md5(path_b, 500)
        matches, total = compare_md5_sets(ha, hb)
        pct = (matches / total * 100) if total else 0
        print(f"    Sampled {len(ha)} from A, {len(hb)} from B")
        print(f"    Exact matches: {matches}/{total} ({pct:.1f}%)")

        pa = sample_hashes(path_a, 200)
        pb = sample_hashes(path_b, 200)
        p_matches, p_total = compare_hash_sets(pa, pb, threshold=5)
        p_pct = (p_matches / p_total * 100) if p_total else 0
        print(f"    Perceptual matches: {p_matches}/{p_total} ({p_pct:.1f}%)")

        key = f"sugarcane_{name_a}_vs_{name_b}".replace(" ", "_")
        results[key] = {
            "md5_matches": matches,
            "md5_sampled": total,
            "md5_pct": round(pct, 1),
            "phash_matches": p_matches,
            "phash_sampled": p_total,
            "phash_pct": round(p_pct, 1),
        }

    return results


def master_overlap_check(master_report):
    """Check Master dataset class names against standalone PlantVillage and Sugarcane."""
    print(f"\n{'='*60}")
    print(f"  Master <-> Standalone Overlap Check")
    print(f"{'='*60}")

    overlaps = {}

    # PlantVillage classes from standalone folder
    pv_dir = BASE_DIR / "PlantVillage"
    pv_classes = set()
    for sub in pv_dir.iterdir():
        if sub.is_dir():
            pv_classes.add(sub.name)
            if sub.name == "PlantVillage":
                for inner in sub.iterdir():
                    if inner.is_dir():
                        pv_classes.add(inner.name)
    pv_classes.discard("PlantVillage")

    # Master's PlantVillage source classes
    master_pv_classes = set()
    for src, classes in master_report.get("source_class_breakdown", {}).items():
        if "PlantVillage" in src:
            master_pv_classes.update(classes)

    # Sugarcane standalone classes
    sugar_dir = BASE_DIR / "Sugarcane Leaf Disease Dataset"
    sugar_classes = set()
    if sugar_dir.exists():
        for sub in sugar_dir.iterdir():
            if sub.is_dir():
                sugar_classes.add(sub.name)

    master_sugar_classes = set()
    for src, classes in master_report.get("source_class_breakdown", {}).items():
        if "Sugarcane" in src:
            master_sugar_classes.update(classes)

    print(f"\n  Standalone PlantVillage classes ({len(pv_classes)}):")
    for c in sorted(pv_classes):
        print(f"    {c}")

    print(f"\n  Master's PlantVillage-sourced classes ({len(master_pv_classes)}):")
    for c in sorted(master_pv_classes):
        print(f"    {c}")

    print(f"\n  Standalone Sugarcane classes ({len(sugar_classes)}):")
    for c in sorted(sugar_classes):
        print(f"    {c}")

    print(f"\n  Master's Sugarcane-sourced classes ({len(master_sugar_classes)}):")
    for c in sorted(master_sugar_classes):
        print(f"    {c}")

    overlaps["plantvillage"] = {
        "standalone_classes": sorted(pv_classes),
        "master_sourced_classes": sorted(master_pv_classes),
        "confirmed_overlap": bool(master_pv_classes),
    }
    overlaps["sugarcane"] = {
        "standalone_classes": sorted(sugar_classes),
        "master_sourced_classes": sorted(master_sugar_classes),
        "confirmed_overlap": bool(master_sugar_classes),
    }

    return overlaps


def main():
    report = {"datasets": [], "duplicate_analysis": {}, "master_overlap": {}, "yellow_rust_search": []}

    # 1. Standard folder-based datasets
    standard_datasets = [
        ("900 MUSTARD LEAF DATASET", "Mustard"),
        ("FUSARIUM-22", "Wheat (Fusarium resistance)"),
        ("Kaggle_Rice Leaf Diseases Dataset", "Rice"),
        ("Mandely_Wheat Disease", "Wheat"),
        ("Mendeley_A novel pigeonpea leaf dataset", "Pigeonpea"),
        ("Mendeley_Rice Leaf Disease Images", "Rice"),
        ("PlantVillage", "Multi-crop (Pepper/Potato/Tomato)"),
        ("Sugarcane Leaf Disease Dataset", "Sugarcane"),
        ("Sugarcane_leafs", "Sugarcane"),
        ("wheat_leaf", "Wheat"),
    ]

    for name, crop in standard_datasets:
        folder = BASE_DIR / name
        if folder.exists():
            r = audit_standard_folder(name, folder, crop)
            report["datasets"].append(r)
        else:
            print(f"  WARNING: {name} not found at {folder}")

    # 2. Zip-based dataset (Mendaly Sugarcane)
    r = audit_zip_folder(
        "Mendaly_Sugarcane Leaf Dataset",
        BASE_DIR / "Mendaly_Sugarcane Leaf Dataset",
        "Sugarcane",
    )
    report["datasets"].append(r)

    # 3. Master dataset (CSV-metadata based)
    master_r = audit_master_dataset(BASE_DIR / "Master Plant Disease Dataset")
    report["datasets"].append(master_r)

    # 4. Duplicate analysis (rice + sugarcane)
    report["duplicate_analysis"] = run_duplicate_analysis()

    # 5. Master overlap check
    report["master_overlap"] = master_overlap_check(master_r)

    # 6. Yellow-Rust-19 search
    report["yellow_rust_search"] = [
        {"type": h[0], "location": h[1]} for h in search_yellow_rust(BASE_DIR)
    ]

    # 7. Sugarcane taxonomy comparison
    print(f"\n{'='*60}")
    print(f"  Sugarcane Taxonomy Comparison (3 sources)")
    print(f"{'='*60}")
    sugar_taxonomies = {}
    for ds in report["datasets"]:
        if "sugarcane" in ds["name"].lower() or "Sugarcane" in ds.get("crop", ""):
            sugar_taxonomies[ds["name"]] = sorted(ds["classes"].keys())
    for name, classes in sorted(sugar_taxonomies.items()):
        print(f"\n  {name}:")
        for c in classes:
            print(f"    {c}")
    report["sugarcane_taxonomy_comparison"] = sugar_taxonomies

    # Save
    with open(OUTPUT_JSON, "w", encoding="utf-8") as f:
        json.dump(report, f, indent=2, ensure_ascii=False)
    print(f"\n\nReport saved to {OUTPUT_JSON}")


if __name__ == "__main__":
    main()
