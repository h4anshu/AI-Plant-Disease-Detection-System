"""Add NEW crop heads from raw source datasets. Never touches the 6 existing crops.

Run inside WSL (GPU):  ~/tfgpu/bin/pygpu ml-service/train/new_crops.py <stage> <crop>

  ingest   copy the configured source images into data/raw/<crop>/<class>/ + manifest.csv
  analyze  integrity check, backbone features (exact serving preprocessing), near-duplicate
           groups, cross-class conflicts, metadata / border / source shortcut probes
  train    group-aware 70/15/15 split, same head recipe as 03_train_local.ipynb,
           test report + confusion matrix + Grad-CAM grid + cross-source external test
  promote  copy the accepted head into models/heads/ and add the crop to label_maps.json
           and class_weights.json (additive only)

Differences from the original pipeline, both deliberate:
  * features are extracted with PIL `Image.resize((224,224))`, the exact call predict.py
    makes at serving time (the old tf.image.resize bilinear path aliases badly on the
    4000px phone photos in the new datasets);
  * the split is grouped by near-duplicate clusters, so augmented copies / burst shots
    of one leaf can never sit in both train and test.
"""
import csv
import hashlib
import json
import re
import shutil
import subprocess
import sys
import time
import zipfile
from collections import Counter, defaultdict
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw

ML = Path(__file__).resolve().parents[1]
ROOT = ML.parent
DATA = ML / "data"
RAW = DATA / "raw"
WORK = DATA / "new_crops"
MODELS = ML / "models"
BACKBONE_PATH = MODELS / "backbone" / "efficientnetb0_backbone.keras"
STAGING = Path.home() / "staging"  # nested archives unpack here (native WSL fs, fast)

EXISTING = {"wheat", "rice", "sugarcane", "potato", "maize", "pigeonpea"}
IMAGE_EXTS = {".jpg", ".jpeg", ".png", ".bmp", ".tif", ".tiff", ".webp"}
SEED = 42
RATIOS = {"train": 0.70, "val": 0.15, "test": 0.15}
IMG_SIZE = (224, 224)
INLIER_MIN = 8  # ORB+RANSAC inliers to GROUP images for splitting (conservative: a false merge only
                # costs split flexibility, a missed copy leaks). Groundnut: 12 -> 8 cut test acc 96.9 -> 94.7.
CONFLICT_INLIERS = 25  # a cross-class match is only called label noise (dropped) above this
MIN_CLASS = 50  # originals per class after dedup, else the class is dropped

MULTICROP_NAMES = [
    "banana_bract_mosaic_virus", "banana_cordana", "banana_healthy", "banana_insectpest",
    "banana_moko", "banana_panama", "banana_pestalotiopsis", "banana_sigatoka",
    "banana_yb_sigatoka", "cauliflower_Blackrot", "cauliflower_bacterial _spot _rot",
    "cauliflower_downy_mildew", "cauliflower_healthy", "chilli_anthracnose", "chilli_healthy",
    "chilli_leafcurl", "chilli_leafspot", "chilli_whitefly", "chilli_yellowish",
    "groundnut_early_leaf_spot", "groundnut_early_rust", "groundnut_healthy",
    "groundnut_late_leaf_spot", "groundnut_nutrition_deficiency", "groundnut_rust",
    "radish_black_leaf_spot", "radish_downey_mildew", "radish_flea_beetle", "radish_healthy",
    "radish_mosaic",
]

# Per crop: list of sources. A source is either
#   archive (+ optional nested `inner` path list) or `dir`, with `classes` mapping a path
#   component -> class name, optional `exclude` regex on the member path; or
#   `yolo` (Roboflow export) with a class-name `prefix`, mapped through `classes`.
# `dedup`: source ships pre-augmented copies -> keep one medoid per near-duplicate group
#   (default on for Roboflow/yolo exports, which hide ~7 augmented copies per leaf).
# `role`: "train" (candidate training data) or "external" (evaluation only).
CROPS = {
    "groundnut": [
        dict(id="wb", archive="_dataset_backup/A novel groundnut leaf dataset for detection and classification of groundnut leaf diseases.zip",
             classes={"ALTERNARIA LEAF SPOT": "Alternaria_Leaf_Spot", "HEALTHY": "Healthy",
                      "LEAF SPOT (EARLY AND LATE)": "Leaf_Spot", "ROSETTE": "Rosette", "RUST": "Rust"}),
        dict(id="tn", yolo="_dataset_backup/Multi-Crop Disease Dataset.zip", prefix="groundnut_",
             classes={"early_leaf_spot": "Leaf_Spot", "late_leaf_spot": "Leaf_Spot", "early_rust": "Rust",
                      "rust": "Rust", "nutrition_deficiency": "Nutrition_Deficiency"}),
        # TN "healthy" left out: 409 images = ~5 physical leaves x ~80 Roboflow copies, and one of the
        # five has visible lesions (see new_crops/groundnut/groups_tn_Healthy.png).
    ],
    "blackgram": [
        dict(id="bpld", archive="_dataset_backup/Blackgram Plant Leaf Disease Dataset.zip",
             inner=["Blackgram Plant Leaf Disease Dataset/BPLD Dataset.zip"],
             classes={"Anthracnose 230": "Anthracnose", "Healthy 220": "Healthy", "Leaf Crinckle 150": "Leaf_Crinkle",
                      "Powdery Mildew 180": "Powdery_Mildew", "Yellow Mosaic 220": "Yellow_Mosaic"}),
    ],
    "grape": [
        dict(id="ngld", archive="_rejected_datasets/Niphad Grape Leaf Disease Dataset (NGLD).zip",
             classes={"Bacterial Rot": "Bacterial_Rot", "Downey Mildew": "Downy_Mildew",
                      "Healthy Leaves": "Healthy", "Powdery Mildew": "Powdery_Mildew"}),
        dict(id="plantdoc", role="external", archive="_dataset_backup/PlantDoc-Dataset-master.zip",
             classes={"grape leaf": "Healthy"}),
    ],
    "apple": [
        dict(id="jk", dedup=True,  # ~22 augmented copies per leaf (edge-stretch artifacts visible)
             archive="_dataset_backup/Indigenous Dataset for Apple Leaf Disease Detection and Classification.zip",
             classes={"Alternaria": "Alternaria_Leaf_Blotch", "Apple_Mosaic": "Mosaic", "Healthy": "Healthy"}),
        dict(id="plantdoc", role="external", archive="_dataset_backup/PlantDoc-Dataset-master.zip",
             classes={"Apple leaf": "Healthy"}),
    ],
    "okra": [
        dict(id="dnet", archive="_rejected_datasets/Okra DiseaseNet Dataset.zip",
             classes={"re:alternaria": "Alternaria_Leaf_Spot", "re:cercospora": "Cercospora_Leaf_Spot",
                      "re:downy": "Downy_Mildew", "re:^class 3 - healthy$": "Healthy",
                      "re:leaf curly virus": "Leaf_Curl_Virus", "re:phyllosticta": "Phyllosticta_Leaf_Spot"}),
        dict(id="bd", role="external", archive="_rejected_datasets/Leaf Image Dataset for Plant disease Classificatio.zip",
             inner=["Leaf Image Dataset for Plant disease Classificatio/Resize plant_leaves dataset(1545).zip"],
             classes={"Cercospora Leaf Spot(41)": "Cercospora_Leaf_Spot", "Healty leaf(46)": "Healthy",
                      "Leaf curl(68)": "Leaf_Curl_Virus", "Yellow Vein Mosaic Virus (YVMV)(97)": "Yellow_Vein_Mosaic"},
             exclude=r"^(?!.*Ladies finger).*$"),
    ],
    "turmeric": [
        dict(id="bd", archive="_rejected_datasets/Image Dataset for Turmeric Plant Leaf Disease Detection.zip",
             classes={"Aphids_Disease": "Aphids", "Blotch": "Leaf_Blotch", "Healthy_Leaf": "Healthy",
                      "Leaf_Spot": "Leaf_Spot"}, exclude=r"Augmented DataSet"),
    ],
    "tomato": [
        dict(id="village", archive="_rejected_datasets/Tomato-Village-main.zip", exclude=r"^(?!.*Variant-a).*$",
             classes={"Early_blight": "Early_Blight", "Healthy": "Healthy", "Late_blight": "Late_Blight",
                      "Leaf Miner": "Leaf_Miner", "Magnesium Deficiency": "Magnesium_Deficiency",
                      "Nitrogen Deficiency": "Nitrogen_Deficiency", "Pottassium Deficiency": "Potassium_Deficiency",
                      "Spotted Wilt Virus": "Spotted_Wilt_Virus"}),
        dict(id="plantdoc", role="external", archive="_dataset_backup/PlantDoc-Dataset-master.zip",
             classes={"Tomato leaf": "Healthy", "Tomato Early blight leaf": "Early_Blight",
                      "Tomato leaf late blight": "Late_Blight"}),
    ],
    "chilli": [
        *[dict(id="bd", archive="_rejected_datasets/Chilli Leaf Disease Image Dataset for Classificati.zip",
               inner=[f"Chilli Leaf Disease Image Dataset for Classificati/{c}.zip"],
               classes={"Bacterial_Spot": "Bacterial_Spot", "Cercospora_Leaf_Spot": "Cercospora_Leaf_Spot",
                        "Curl_Virus": "Leaf_Curl_Virus", "Healthy_Leaf": "Healthy"})
          for c in ("Bacterial_Spot", "Cercospora_Leaf_Spot", "Curl_Virus", "Healthy_Leaf")],
        dict(id="bd", archive="_rejected_datasets/Chilli Leaf Disease Image Dataset for Classificati.zip",
             classes={"Nutrition_Deficiency": "Nutrition_Deficiency", "Powdery_Mildew": "Powdery_Mildew"}),
        dict(id="tn", yolo="_dataset_backup/Multi-Crop Disease Dataset.zip", prefix="chilli_",
             classes={"anthracnose": "Anthracnose", "healthy": "Healthy", "leafcurl": "Leaf_Curl_Virus",
                      "leafspot": "Leaf_Spot", "whitefly": "Whitefly", "yellowish": "Yellowing"}),
    ],
    "cotton": [
        dict(id="pune", archive="_rejected_datasets/Cotton Leaf Disease Dataset with Severity Levels.zip",
             inner=["Cotton Leaf Disease Dataset with Severity Levels/Cotton-Original-Augmented.zip"],
             classes={"bacterial blight": "Bacterial_Blight", "curl virus": "Leaf_Curl_Virus",
                      "fussarium wilt": "Fusarium_Wilt", "healthy": "Healthy"}, exclude=r"augment_result"),
        dict(id="bd", archive="_rejected_datasets/Cotton Leaf Image Dataset for Disease Classificati.zip",
             inner=["Cotton Leaf Image Dataset for Disease Classificati/Cotton_Original_Dataset.zip"],
             classes={"Alternaria Leaf Spot": "Alternaria_Leaf_Spot", "Bacterial Blight": "Bacterial_Blight",
                      "Fusarium Wilt": "Fusarium_Wilt", "Healthy Leaf": "Healthy",
                      "Verticillium Wilt": "Verticillium_Wilt"}),
    ],
    "mango": [
        dict(id="bd", archive="_rejected_datasets/Mango Leaf Disease Dataset.zip",
             inner=["Mango Leaf Disease Dataset/Mango Dataset.zip", "Mango Dataset/process data.zip"],
             classes={"Anthracnose": "Anthracnose", "Bacterial Canker": "Bacterial_Canker",
                      "Cutting Weevil": "Cutting_Weevil", "Die Back": "Die_Back", "Gall Midge": "Gall_Midge",
                      "Healthy": "Healthy", "Powdery Mildew": "Powdery_Mildew", "Sooty Mould": "Sooty_Mould"}),
    ],
    "tea": [
        # 13,500 files per class = 1,500 raw photos x 9 augmentations; file k and k+1500j are copies of
        # one photo (nearest-neighbour offsets 1500/3000/4500/6000 dominate - new_crops/tea analysis).
        dict(id="csd", dir="_rejected_datasets/Tea Leaf Dataset/_extracted", dedup=True, hint_mod=1500,
             classes={"Blister_Blight": "Blister_Blight", "Brown_Blight": "Brown_Blight",
                      "Leaf_Red_Rust": "Red_Rust", "Red_Spider_Mite": "Red_Spider_Mite",
                      "Tea_Mosquito_Bug": "Tea_Mosquito_Bug", "Healthy_leaves": "Healthy"}),
    ],
    "banana": [
        dict(id="tn", yolo="_dataset_backup/Multi-Crop Disease Dataset.zip", prefix="banana_",
             classes={"bract_mosaic_virus": "Bract_Mosaic_Virus", "cordana": "Cordana_Leaf_Spot",
                      "healthy": "Healthy", "insectpest": "Insect_Pest", "moko": "Moko_Wilt",
                      "panama": "Panama_Wilt", "pestalotiopsis": "Pestalotiopsis_Leaf_Spot",
                      # "yb_sigatoka" = "Yellow-and-Black-Sigatoka" (file prefix): both source classes
                      # are the Sigatoka leaf-spot complex, so they are one class here
                      "sigatoka": "Sigatoka_Leaf_Spot", "yb_sigatoka": "Sigatoka_Leaf_Spot"},
             expect={"sigatoka": r"sigatoka", "yb_sigatoka": r"yellow-and-black-sigatoka",
                     "moko": r"moko", "panama": r"panama", "healthy": r"img",
                     "bract_mosaic_virus": r"bract", "cordana": r"cordana", "insectpest": r"insect",
                     "pestalotiopsis": r"pestalotiopsis"}),
    ],
    "radish": [
        dict(id="tn", yolo="_dataset_backup/Multi-Crop Disease Dataset.zip", prefix="radish_",
             classes={"black_leaf_spot": "Black_Leaf_Spot", "downey_mildew": "Downy_Mildew",
                      "flea_beetle": "Flea_Beetle", "healthy": "Healthy", "mosaic": "Mosaic_Virus"}),
    ],
    "cauliflower": [
        dict(id="tn", yolo="_dataset_backup/Multi-Crop Disease Dataset.zip", prefix="cauliflower_",
             classes={"Blackrot": "Black_Rot", "bacterial _spot _rot": "Bacterial_Spot_Rot",
                      "downy_mildew": "Downy_Mildew", "healthy": "Healthy"}),
    ],
}

# Small Bangladesh vegetable crops (one source, 135-303 originals per crop).
_BD_SMALL = "_rejected_datasets/Leaf Image Dataset for Plant disease Classificatio.zip"
_BD_SMALL_INNER = ["Leaf Image Dataset for Plant disease Classificatio/Resize plant_leaves dataset(1545).zip"]
for _crop, _folder in (("bitter_gourd", "Bitter gourd"), ("brinjal", "Brinjal"), ("mung_bean", "Mung bean"),
                       ("sesame", "Sesame"), ("snake_gourd", "Snake gourd"), ("yard_long_bean", "Yard long bean")):
    CROPS[_crop] = [dict(id="bd", archive=_BD_SMALL, inner=_BD_SMALL_INNER, exclude=rf"^(?!.*/{_folder}\(\d+\)/).*$",
                         classes="folder")]


# ----------------------------------------------------------------- utilities

def sh(*a):
    print(*a, flush=True)


def safe_name(s):
    return re.sub(r"[^A-Za-z0-9._-]+", "_", s).strip("_")


def crop_dir(crop):
    d = WORK / crop
    d.mkdir(parents=True, exist_ok=True)
    return d


def read_manifest(crop):
    with open(crop_dir(crop) / "manifest.csv", encoding="utf-8") as fh:
        return list(csv.DictReader(fh))


def unpack_nested(archive: Path, inner: list) -> Path:
    """Extract nested zips one level at a time into STAGING; returns the innermost zip path."""
    current = archive
    for i, member in enumerate(inner):
        out = STAGING / f"{safe_name(archive.stem)}__{i}__{safe_name(Path(member).name)}"
        if not out.exists():
            STAGING.mkdir(parents=True, exist_ok=True)
            with zipfile.ZipFile(current) as zf, zf.open(member) as src, open(out, "wb") as dst:
                shutil.copyfileobj(src, dst, 1 << 22)
        current = out
    return current


def class_from_path(member, classes):
    """Deepest path component that matches a key; keys starting with 're:' are
    case-insensitive regexes (for sources whose folder names drift between splits).
    classes="folder": the image's own folder, cleaned ("Healty leaf(46)" -> "Healthy")."""
    if classes == "folder":
        name = re.sub(r"\s*\(.*$", "", Path(member.replace("\\", "/")).parent.name).strip()
        name = re.sub(r"(?i)^heal?t?h?y.*", "Healthy", name.replace("Healty", "Healthy").replace("curll", "curl").replace("Yelllow", "Yellow"))
        return "_".join(w.capitalize() for w in re.split(r"[\s_]+", name) if w)
    for part in reversed(Path(member.replace("\\", "/")).parts[:-1]):
        for key, cls in classes.items():
            if key.startswith("re:") and re.search(key[3:], part, re.I):
                return cls
            if key == part.strip():
                return cls
    return None


def iter_source(src):
    """Yield (member_path, class_name, group_hint, opener) for every image of one source."""
    if "yolo" in src:
        zf = zipfile.ZipFile(ROOT / src["yolo"])
        names = set(zf.namelist())
        for n in sorted(names):
            if Path(n).suffix.lower() not in IMAGE_EXTS or "/images/" not in n:
                continue
            lab = n.replace("/images/", "/labels/").rsplit(".", 1)[0] + ".txt"
            if lab not in names:
                continue
            ids = {int(l.split()[0]) for l in zf.read(lab).decode().splitlines() if l.strip()}
            if len(ids) != 1:
                continue  # multi-class or empty image: no single image-level label
            name = MULTICROP_NAMES[ids.pop()]
            if not name.startswith(src["prefix"]):
                continue
            raw = name[len(src["prefix"]):]
            cls = src["classes"].get(raw)
            if cls is None:
                continue
            # Roboflow class-id mix-ups: the original filename prefix must match the class
            # (banana_sigatoka holds 494 groundnut "Early-Leaf-Spot" images)
            if raw in src.get("expect", {}) and not re.match(src["expect"][raw], Path(n).name, re.I):
                continue
            stem = re.sub(r"\.rf\..*$", "", Path(n).name)  # roboflow copies share this stem
            yield n, cls, f"{src['id']}:{stem}", (lambda n=n: zf.read(n))
        return

    if "dir" in src:
        base = ROOT / src["dir"]
        for p in sorted(base.rglob("*")):
            if p.suffix.lower() not in IMAGE_EXTS:
                continue
            rel = p.relative_to(base).as_posix()
            if src.get("exclude") and re.search(src["exclude"], rel):
                continue
            cls = class_from_path(rel, src["classes"])
            if cls:
                hint = ""
                if "hint_mod" in src:  # augmented copies numbered original + j*hint_mod
                    k = int(re.findall(r"\d+", p.stem)[-1])
                    hint = f"{src['id']}:{cls}:{(k - 1) % src['hint_mod']}"
                yield rel, cls, hint, (lambda p=p: p.read_bytes())
        return

    path = unpack_nested(ROOT / src["archive"], src.get("inner", []))
    zf = zipfile.ZipFile(path)
    for info in sorted(zf.infolist(), key=lambda i: i.filename):
        n = info.filename
        if info.is_dir() or Path(n).suffix.lower() not in IMAGE_EXTS:
            continue
        if src.get("exclude") and re.search(src["exclude"], n):
            continue
        cls = class_from_path(n, src["classes"])
        if cls:
            yield n, cls, "", (lambda n=n: zf.read(n))


# -------------------------------------------------------------------- ingest

def ingest(crop):
    assert crop not in EXISTING, f"{crop} is an existing crop - this script never touches it"
    out_root = RAW / crop
    if out_root.exists():
        shutil.rmtree(out_root)  # only ever a new-crop folder this script created
    rows, seen_names = [], set()
    for src in CROPS[crop]:
        n_src = Counter()
        for member, cls, hint, opener in iter_source(src):
            stem = safe_name(Path(member).stem)[:80]
            ext = Path(member).suffix.lower()
            fname = f"{src['id']}__{stem}{ext}"
            k = 2
            while (cls, fname) in seen_names:
                fname = f"{src['id']}__{stem}__{k}{ext}"
                k += 1
            seen_names.add((cls, fname))
            dest = out_root / cls / fname
            dest.parent.mkdir(parents=True, exist_ok=True)
            dest.write_bytes(opener())
            rows.append({"path": dest.relative_to(DATA).as_posix(), "class": cls,
                         "source": src["id"], "role": src.get("role", "train"),
                         "dedup": int(src.get("dedup", "yolo" in src)), "group_hint": hint,
                         "member": member})
            n_src[cls] += 1
        sh(f"  source {src['id']}: {sum(n_src.values())} images  {dict(sorted(n_src.items()))}")
    with open(crop_dir(crop) / "manifest.csv", "w", newline="", encoding="utf-8") as fh:
        w = csv.DictWriter(fh, fieldnames=list(rows[0]))
        w.writeheader()
        w.writerows(rows)
    sh(f"{crop}: {len(rows)} images ingested -> {out_root}")


# ------------------------------------------------------------------- analyze

def load_for_serving(path):
    """Exactly predict.py's preprocessing up to preprocess_input: PIL RGB -> resize(224,224)."""
    raw = path.read_bytes()
    try:
        img = Image.open(path)
        img.load()
        w, h = img.size
        arr = np.asarray(img.convert("RGB").resize(IMG_SIZE), dtype=np.uint8)
    except Exception as e:  # corrupt / truncated file
        return None, {"error": repr(e)}
    ring = np.concatenate([arr[:22].reshape(-1, 3), arr[-22:].reshape(-1, 3),
                           arr[22:-22, :22].reshape(-1, 3), arr[22:-22, -22:].reshape(-1, 3)])
    meta = {"md5": hashlib.md5(raw).hexdigest(), "w": w, "h": h, "bytes": len(raw),
            "ring_mean": ring.mean(0).tolist(), "ring_std": ring.std(0).tolist()}
    return arr, meta


def border_only(arr):
    """Grey out the central 60% so only the photo's surroundings remain."""
    a = arr.copy()
    a[45:179, 45:179] = 128
    return a


def get_backbone():
    import tensorflow as tf
    from tensorflow import keras
    for g in tf.config.list_physical_devices("GPU"):
        try:
            tf.config.experimental.set_memory_growth(g, True)
        except RuntimeError:  # TF already initialised in this process (e.g. after training)
            pass
    return keras.models.load_model(BACKBONE_PATH)


def embed(backbone, arrs):
    from tensorflow.keras.applications.efficientnet import preprocess_input
    out = []
    for i in range(0, len(arrs), 32):  # 32 fits the 4 GB RTX 3050
        x = preprocess_input(np.stack(arrs[i:i + 32]).astype(np.float32))
        out.append(np.asarray(backbone.predict_on_batch(x)))
    return np.concatenate(out) if out else np.zeros((0, 1280), np.float32)


class UnionFind:
    def __init__(self, n):
        self.p = list(range(n))

    def find(self, a):
        while self.p[a] != a:
            self.p[a] = self.p[self.p[a]]
            a = self.p[a]
        return a

    def union(self, a, b):
        a, b = self.find(a), self.find(b)
        if a != b:
            self.p[max(a, b)] = min(a, b)


def knn_candidates(feats, k=10, min_cos=0.80):
    """Candidate duplicate pairs: each image's top-k cosine neighbours above min_cos."""
    f = feats / (np.linalg.norm(feats, axis=1, keepdims=True) + 1e-8)
    k = min(k, len(f) - 1)
    pairs, nn = set(), np.zeros(len(f), np.float32)
    for s in range(0, len(f), 1024):
        sim = f[s:s + 1024] @ f.T
        r = np.arange(sim.shape[0])
        sim[r, s + r] = -1
        nn[s:s + len(r)] = sim.max(1)
        top = np.argpartition(-sim, k, axis=1)[:, :k]
        for a in r:
            for j in top[a]:
                if sim[a, j] >= min_cos:
                    i = s + int(a)
                    pairs.add((min(i, int(j)), max(i, int(j))))
    return sorted(pairs), nn


def orb_keypoints(path, n_features=400):
    """ORB keypoints of the image and of its mirror image, at a normalised 320px scale."""
    import cv2
    g = cv2.imdecode(np.frombuffer(path.read_bytes(), np.uint8), cv2.IMREAD_GRAYSCALE)
    if g is None:
        return None
    sc = 320 / max(g.shape)
    g = cv2.resize(g, None, fx=sc, fy=sc, interpolation=cv2.INTER_AREA if sc < 1 else cv2.INTER_LINEAR)
    orb = cv2.ORB_create(n_features)
    out = []
    for im in (g, cv2.flip(g, 1)):
        kp, des = orb.detectAndCompute(im, None)
        out.append((np.float32([k.pt for k in kp]).reshape(-1, 2), des))
    return out


def ransac_inliers(a, b):
    """Max RANSAC-homography inliers between a and (b or mirrored b). The same physical leaf,
    re-shot or augmented (crop, zoom, rotate, flip, brightness), gives many inliers."""
    import cv2
    if a is None or b is None or a[0][1] is None or len(a[0][1]) < 8:
        return 0
    pa, da = a[0]
    matcher = cv2.BFMatcher(cv2.NORM_HAMMING)
    best = 0
    for pb, db in b:
        if db is None or len(db) < 8:
            continue
        good = [m[0] for m in matcher.knnMatch(da, db, k=2)
                if len(m) == 2 and m[0].distance < 0.75 * m[1].distance]
        if len(good) < 8:
            continue
        _, mask = cv2.findHomography(pa[[m.queryIdx for m in good]], pb[[m.trainIdx for m in good]],
                                     cv2.RANSAC, 4.0)
        if mask is not None:
            best = max(best, int(mask.sum()))
    return best


def group_cv_score(X, y, groups, model="lr"):
    from sklearn.linear_model import LogisticRegression
    from sklearn.ensemble import RandomForestClassifier
    from sklearn.model_selection import StratifiedGroupKFold
    from sklearn.pipeline import make_pipeline
    from sklearn.preprocessing import StandardScaler
    from sklearn.metrics import balanced_accuracy_score
    if len(set(y)) < 2:
        return None
    k = min(5, min(Counter(y).values()))
    if k < 2:
        return None
    pred = np.empty_like(y)
    for tr, te in StratifiedGroupKFold(k, shuffle=True, random_state=SEED).split(X, y, groups):
        clf = (make_pipeline(StandardScaler(), LogisticRegression(max_iter=3000, C=1.0))
               if model == "lr" else RandomForestClassifier(300, random_state=SEED, n_jobs=-1))
        clf.fit(X[tr], y[tr])
        pred[te] = clf.predict(X[te])
    return round(float(balanced_accuracy_score(y, pred)), 4)


def compute_features(crop, rows, border_per_class=200):
    """Backbone features for every manifest image (cached against the manifest's path list)."""
    cache = crop_dir(crop) / "features_all.npz"
    paths = [DATA / r["path"] for r in rows]
    if cache.exists():
        d = np.load(cache, allow_pickle=True)
        if list(d["paths"]) == [r["path"] for r in rows]:
            return d["feats"], list(d["border_rows"]), d["border_feats"], list(d["metas"]), list(d["bad"])
    rng = np.random.default_rng(SEED)
    by_cls = defaultdict(list)
    for i, r in enumerate(rows):
        by_cls[r["class"]].append(i)
    border_idx = set()
    for idx in by_cls.values():
        border_idx.update(rng.choice(idx, min(border_per_class, len(idx)), replace=False).tolist())

    backbone = get_backbone()
    feats = np.zeros((len(rows), 1280), np.float32)
    border_feats, border_rows, metas, bad = [], [], [None] * len(rows), []
    t0 = time.time()
    with ThreadPoolExecutor(12) as pool:
        for s in range(0, len(rows), 512):
            chunk = list(range(s, min(s + 512, len(rows))))
            loaded = list(pool.map(lambda i: load_for_serving(paths[i]), chunk))
            ok = [(i, a) for i, (a, m) in zip(chunk, loaded) if a is not None]
            for i, (a, m) in zip(chunk, loaded):
                metas[i] = m
                if a is None:
                    bad.append(i)
            if ok:
                feats[[i for i, _ in ok]] = embed(backbone, [a for _, a in ok])
                b = [(i, border_only(a)) for i, a in ok if i in border_idx]
                if b:
                    border_rows += [i for i, _ in b]
                    border_feats.append(embed(backbone, [a for _, a in b]))
            if (s // 512) % 10 == 0:
                sh(f"  features {min(s + 512, len(rows))}/{len(rows)}  {time.time() - t0:.0f}s")
    border_feats = np.concatenate(border_feats)
    np.savez(cache, paths=np.array([r["path"] for r in rows]), feats=feats, border_rows=np.array(border_rows),
             border_feats=border_feats, metas=np.array(metas, dtype=object), bad=np.array(bad, dtype=np.int64))
    return feats, border_rows, border_feats, metas, bad


def verified_pairs(crop, rows, feats):
    """Candidate pairs from embedding kNN, each scored by ORB+RANSAC inliers (cached)."""
    import cv2
    cache = crop_dir(crop) / "pairs.npz"
    if cache.exists():
        d = np.load(cache)
        if int(d["n"]) == len(rows):
            return d["pairs"], d["inliers"], d["cos"], d["nn"]
    cv2.setNumThreads(1)
    cv2.setRNGSeed(SEED)
    pairs, nn = knn_candidates(feats)
    need = sorted({i for p in pairs for i in p})
    t0 = time.time()
    with ThreadPoolExecutor(12) as pool:
        n_feat = 400 if len(need) < 20000 else 150  # 80k-image crops: keep keypoints within WSL RAM
        kps = dict(zip(need, pool.map(lambda i: orb_keypoints(DATA / rows[i]["path"], n_feat), need)))
        sh(f"  ORB keypoints for {len(need)} images {time.time() - t0:.0f}s; verifying {len(pairs)} pairs")
        inl = np.array(list(pool.map(lambda p: ransac_inliers(kps[p[0]], kps[p[1]]), pairs, chunksize=256)))
    f = feats / (np.linalg.norm(feats, axis=1, keepdims=True) + 1e-8)
    pairs = np.array(pairs, dtype=np.int64).reshape(-1, 2)
    cos = (f[pairs[:, 0]] * f[pairs[:, 1]]).sum(1) if len(pairs) else np.zeros(0)
    np.savez(cache, n=len(rows), pairs=pairs, inliers=inl, cos=cos, nn=nn)
    sh(f"  verification done {time.time() - t0:.0f}s")
    return pairs, inl, cos, nn


def analyze(crop, inlier_min=INLIER_MIN):
    rows = read_manifest(crop)
    feats, border_rows, border_feats, metas, bad = compute_features(crop, rows)
    pairs, inl, cos, nn = verified_pairs(crop, rows, feats)
    f = feats / (np.linalg.norm(feats, axis=1, keepdims=True) + 1e-8)

    # --- near-duplicate groups: geometric match OR identical bytes OR shared roboflow stem
    uf = UnionFind(len(rows))
    dup = pairs[inl >= inlier_min]
    for i, j in dup:
        uf.union(int(i), int(j))
    first, hint_first = {}, {}
    for i, m in enumerate(metas):
        if m and "md5" in m:
            if m["md5"] in first:
                uf.union(first[m["md5"]], i)
            else:
                first[m["md5"]] = i
    for i, r in enumerate(rows):
        if r["group_hint"]:
            if r["group_hint"] in hint_first:
                uf.union(hint_first[r["group_hint"]], i)
            else:
                hint_first[r["group_hint"]] = i
    # Union-find chains can link different leaves through one weak match, so a mixed-class
    # group is NOT treated as one conflicting leaf: only the endpoints of a verified
    # cross-class match (same leaf, two labels -> label noise) are dropped, and each class
    # keeps its own sub-group so copies still never straddle splits.
    root = [uf.find(i) for i in range(len(rows))]
    key_ids = {}
    gid = np.array([key_ids.setdefault((root[i], rows[i]["class"]), len(key_ids)) for i in range(len(rows))])
    cross = [(int(i), int(j)) for (i, j), n in zip(pairs, inl)
             if n >= CONFLICT_INLIERS and rows[i]["class"] != rows[j]["class"]]
    conflict_imgs = {i for e in cross for i in e}
    mixed_roots = {root[i] for e in cross for i in e}

    badset = set(bad)
    groups = defaultdict(list)
    for i, g in enumerate(gid):
        if i not in badset:
            groups[g].append(i)
    exact_dups = len(rows) - len(badset) - len({metas[i]["md5"] for i in range(len(rows)) if i not in badset})

    # --- per-image keep decision
    keep = np.ones(len(rows), bool)
    keep[list(badset)] = False
    keep[list(conflict_imgs)] = False
    # byte-identical files are one image, whatever the source (okra DiseaseNet: 1495 files, 293 unique)
    seen_md5 = set()
    for i in range(len(rows)):
        if keep[i]:
            if metas[i]["md5"] in seen_md5:
                keep[i] = False
            seen_md5.add(metas[i]["md5"])
    # pre-augmented sources: one medoid per physical leaf stays "independent"; the other
    # copies are flagged so train() may let them follow their leaf into TRAIN only.
    copies = np.zeros(len(rows), bool)
    for g, m in groups.items():
        d = [i for i in m if rows[i]["dedup"] == "1" and keep[i]]
        if len(d) > 1:
            medoid = d[int(np.argmax(f[d] @ f[d].mean(0)))]
            for i in d:
                if i != medoid:
                    keep[i] = False
                    copies[i] = True
    dedup_dropped = int(copies.sum())

    # --- shortcut probes (kept training-role images), pooled and per source
    b_map = {i: k for k, i in enumerate(border_rows)}

    def probes_for(idx):
        idx = np.array(idx)
        y = np.array([rows[i]["class"] for i in idx])
        meta_X = np.array([[metas[i]["w"], metas[i]["h"], metas[i]["w"] / metas[i]["h"],
                            metas[i]["bytes"] / (metas[i]["w"] * metas[i]["h"])]
                           + metas[i]["ring_mean"] + metas[i]["ring_std"] for i in idx])
        b_sel = np.array([i for i in idx if i in b_map])
        yb = np.array([rows[i]["class"] for i in b_sel])
        return {
            "n": int(len(idx)), "classes": int(len(set(y))), "chance": round(1 / max(1, len(set(y))), 4),
            "full_image_lr": group_cv_score(feats[idx], y, gid[idx]),
            "file_size_shape_rf": group_cv_score(meta_X[:, :4], y, gid[idx], "rf"),
            "metadata_plus_border_colour_rf": group_cv_score(meta_X, y, gid[idx], "rf"),
            "border_only_embedding_lr": group_cv_score(border_feats[[b_map[i] for i in b_sel]], yb, gid[b_sel])
            if len(b_sel) else None,
            "full_image_lr_same_sample": group_cv_score(feats[b_sel], yb, gid[b_sel]) if len(b_sel) else None,
        }

    tr_idx = [i for i in range(len(rows)) if keep[i] and rows[i]["role"] == "train"]
    sources = sorted({rows[i]["source"] for i in tr_idx})
    probes = {"pooled": probes_for(tr_idx)}
    if len(sources) > 1:
        probes["source_from_embedding_lr"] = group_cv_score(
            feats[tr_idx], np.array([rows[i]["source"] for i in tr_idx]), gid[tr_idx])
        for s in sources:
            idx = [i for i in tr_idx if rows[i]["source"] == s]
            if len({rows[i]["class"] for i in idx}) > 1:
                probes[f"source_{s}"] = probes_for(idx)

    per_src_cls = defaultdict(lambda: defaultdict(lambda: [0, 0]))
    per_src_groups = defaultdict(set)
    for i, r in enumerate(rows):
        per_src_cls[r["source"]][r["class"]][0] += 1
        per_src_cls[r["source"]][r["class"]][1] += int(keep[i])
        if keep[i]:
            per_src_groups[r["source"]].add(gid[i])
    sizes = Counter(len(m) for m in groups.values())
    res = [(metas[i]["w"], metas[i]["h"]) for i in range(len(rows)) if i not in badset]
    report = {
        "crop": crop, "images": len(rows), "corrupt": [rows[i]["path"] for i in bad],
        "exact_duplicate_files": exact_dups,
        "candidate_pairs": int(len(pairs)), "inlier_min": inlier_min,
        "inlier_hist": {f"{lo}-{hi}": int(((inl >= lo) & (inl < hi)).sum())
                        for lo, hi in ((0, 8), (8, 15), (15, 25), (25, 40), (40, 80), (80, 10**6))},
        "duplicate_pairs": int(len(dup)),
        "group_size_hist": dict(sorted(sizes.items())), "largest_group": max(sizes),
        "independent_groups_kept_per_source": {s: len(v) for s, v in per_src_groups.items()},
        "cross_class_verified_matches": len(cross),
        "cross_class_images_dropped": len(conflict_imgs),
        "mixed_class_chains": len(mixed_roots),
        "dedup_dropped": dedup_dropped,
        "nn_cosine_quantiles": {q: round(float(np.quantile(nn, q)), 4) for q in (.05, .25, .5, .75, .95)},
        "resolution_top": Counter(res).most_common(5),
        "per_source_class_total_kept": {s: dict(sorted(v.items())) for s, v in per_src_cls.items()},
        "probes_balanced_accuracy": probes,
    }
    np.savez(crop_dir(crop) / "analysis.npz", feats=feats, gid=gid, keep=keep, copies=copies)
    json.dump(report, open(crop_dir(crop) / "analysis.json", "w"), indent=2)
    sh(json.dumps(report, indent=2))
    dup_montage(crop, rows, pairs, inl, cos)


def dup_montage(crop, rows, pairs, inl, cos, per_bin=6):
    """Visual calibration of inlier_min: random verified pairs per inlier bin."""
    bins = [(8, 15), (15, 25), (25, 40), (40, 10**6)]
    rng = np.random.default_rng(SEED)
    T = 110
    canvas = Image.new("RGB", (per_bin * (2 * T + 10), len(bins) * (T + 18)), "white")
    dr = ImageDraw.Draw(canvas)
    for r, (lo, hi) in enumerate(bins):
        cand = np.nonzero((inl >= lo) & (inl < hi))[0]
        for c, k in enumerate(rng.choice(cand, min(per_bin, len(cand)), replace=False) if len(cand) else []):
            i, j = pairs[k]
            x, yy = c * (2 * T + 10), r * (T + 18)
            for q, idx in enumerate((i, j)):
                im = Image.open(DATA / rows[idx]["path"]).convert("RGB").resize((T, T))
                canvas.paste(im, (x + q * T, yy + 16))
            dr.text((x + 2, yy + 2), f"in={inl[k]} c={cos[k]:.2f} {rows[i]['class'][:6]}|{rows[j]['class'][:6]}",
                    fill="black")
    canvas.save(crop_dir(crop) / "near_dup_montage.png")


# --------------------------------------------------------------------- train

def group_split(idx_by_class, gid):
    """Per class, whole near-duplicate groups only: largest groups first (seeded shuffle breaks
    ties), each into the split furthest below its target share - keeps 70/15/15 even when a
    class has a few big groups, and gives every split every class."""
    split = {}
    rng = np.random.default_rng(SEED)
    for cls in sorted(idx_by_class):
        idx = idx_by_class[cls]
        groups = defaultdict(list)
        for i in idx:
            groups[gid[i]].append(i)
        order = sorted(groups, key=lambda g: min(groups[g]))
        rng.shuffle(order)
        order.sort(key=lambda g: -len(groups[g]))  # stable: shuffle order kept within equal sizes
        target = {s: len(idx) * r for s, r in RATIOS.items()}
        filled = Counter()
        for g in order:
            s = max(RATIOS, key=lambda s: (target[s] - filled[s]) / target[s])
            for i in groups[g]:
                split[i] = s
            filled[s] += len(groups[g])
    return split


def train(crop, drop_classes=(), rename=None, train_sources=None, tag="", train_copies=True):
    import tensorflow as tf
    from tensorflow import keras
    from tensorflow.keras import layers, Model
    from tensorflow.keras.callbacks import EarlyStopping, ReduceLROnPlateau
    from sklearn.utils.class_weight import compute_class_weight
    from sklearn.metrics import classification_report, confusion_matrix
    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.pyplot as plt

    rename = rename or {}
    rows = read_manifest(crop)
    for r in rows:
        r["class"] = rename.get(r["class"], r["class"])
        if train_sources is not None:
            r["role"] = "train" if r["source"] in train_sources else "external"
    d = np.load(crop_dir(crop) / "analysis.npz")
    feats, gid, keep, copies = d["feats"], d["gid"], d["keep"], d["copies"]

    cand = [i for i, r in enumerate(rows) if keep[i] and r["role"] == "train" and r["class"] not in drop_classes]
    counts = Counter(rows[i]["class"] for i in cand)
    small = {c for c, n in counts.items() if n < MIN_CLASS}
    cand = [i for i in cand if rows[i]["class"] not in small]
    classes = sorted({rows[i]["class"] for i in cand})
    label_map = {c: k for k, c in enumerate(classes)}
    by_cls = defaultdict(list)
    for i in cand:
        by_cls[rows[i]["class"]].append(i)
    split = group_split(by_cls, gid)  # decided on independent images only
    n_copies = 0
    if train_copies:
        train_groups = {gid[i] for i, s in split.items() if s == "train"}
        for i, r in enumerate(rows):
            if copies[i] and r["role"] == "train" and r["class"] in label_map and gid[i] in train_groups:
                split[i] = "train"
                n_copies += 1

    # leakage assertion: no near-dup group spans two splits
    g_split = defaultdict(set)
    for i, s in split.items():
        g_split[gid[i]].add(s)
    assert all(len(v) == 1 for v in g_split.values()), "near-duplicate group leaked across splits"

    # materialise data/{split}/<crop>/<class>/ exactly like split_data.py did for the old crops
    for s in RATIOS:
        shutil.rmtree(DATA / s / crop, ignore_errors=True)
    for i, s in split.items():
        src = DATA / rows[i]["path"]
        dst = DATA / s / crop / rows[i]["class"] / src.name
        dst.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(src, dst)

    XY = {}
    for s in RATIOS:
        ids = sorted(i for i, v in split.items() if v == s)
        XY[s] = (feats[ids], np.array([label_map[rows[i]["class"]] for i in ids], np.int32), ids)
        np.savez(DATA / "features" / f"{crop}_{s}.npz", features=XY[s][0], labels=XY[s][1])

    y_tr = XY["train"][1]
    cw_arr = compute_class_weight("balanced", classes=np.unique(y_tr), y=y_tr)
    cw = {int(k): float(v) for k, v in zip(np.unique(y_tr), cw_arr)}

    def fit_head(Xa, ya, Xv, yv, seed=SEED):
        """Same head + fit recipe as 03_train_local.ipynb."""
        keras.utils.set_random_seed(seed)
        inputs = keras.Input(shape=(1280,))
        x = layers.Dense(128, activation="relu")(inputs)
        x = layers.Dropout(0.3)(x)
        outputs = layers.Dense(len(classes), activation="softmax")(x)
        m = Model(inputs, outputs)
        m.compile(optimizer=keras.optimizers.Adam(1e-3), loss="sparse_categorical_crossentropy",
                  metrics=["accuracy"])
        present = np.unique(ya)
        w = {int(k): float(v) for k, v in zip(present, compute_class_weight("balanced", classes=present, y=ya))}
        h = m.fit(Xa, ya, validation_data=(Xv, yv), epochs=30, batch_size=64, class_weight=w, verbose=0,
                  callbacks=[EarlyStopping(monitor="val_loss", patience=5, restore_best_weights=True),
                             ReduceLROnPlateau(monitor="val_loss", factor=0.5, patience=2)])
        return m, h

    head, hist = fit_head(XY["train"][0], y_tr, *XY["val"][:2])
    head_path = crop_dir(crop) / f"{crop}_head.keras"
    head.save(head_path)

    # Grouped 5-fold CV over EVERY independent image: one 15% test split is too small to trust
    # for the little datasets (apple: n=50, CI +-7%). Copies (if any) only ever join train folds.
    from sklearn.model_selection import StratifiedGroupKFold
    ind = np.array(sorted(cand))
    y_ind = np.array([label_map[rows[i]["class"]] for i in ind])
    g_ind = gid[ind]
    copy_idx = [i for i in split if i not in set(cand)]
    n_folds = min(5, min(len(set(g_ind[y_ind == c])) for c in range(len(classes))))
    oof = np.full(len(ind), -1)
    for k, (tr, te) in enumerate(StratifiedGroupKFold(n_folds, shuffle=True, random_state=SEED)
                                 .split(ind, y_ind, g_ind)):
        itr, iva = next(StratifiedGroupKFold(max(2, min(6, n_folds)), shuffle=True, random_state=SEED + k)
                        .split(tr, y_ind[tr], g_ind[tr]))
        tr_rows = list(ind[tr[itr]])
        if copy_idx:
            tg = set(gid[tr_rows])
            tr_rows += [i for i in copy_idx if gid[i] in tg]
        ytr_k = np.array([label_map[rows[i]["class"]] for i in tr_rows])
        m, _ = fit_head(feats[tr_rows], ytr_k, feats[ind[tr[iva]]], y_ind[tr[iva]], seed=SEED + k)
        oof[te] = m.predict(feats[ind[te]], verbose=0).argmax(1)
    cv_acc = float((oof == y_ind).mean())
    cv_recall = {classes[c]: round(float((oof[y_ind == c] == c).mean()), 4) for c in range(len(classes))}
    rng_cv = np.random.default_rng(SEED)
    boots_cv = [float((oof[b] == y_ind[b]).mean()) for b in
                (rng_cv.integers(0, len(ind), len(ind)) for _ in range(2000))]
    cv = {"folds": n_folds, "n": int(len(ind)), "acc": round(cv_acc, 4),
          "acc_95ci": [round(float(np.quantile(boots_cv, .025)), 4), round(float(np.quantile(boots_cv, .975)), 4)],
          "recall": cv_recall, "min_recall": round(min(cv_recall.values()), 4),
          "confusion": confusion_matrix(y_ind, oof, labels=range(len(classes))).tolist()}
    # per source: a pooled number can hide a photo style the model fails on (chilli: field leaf curl)
    src_ind = np.array([rows[i]["source"] for i in ind])
    cv["per_source"] = {s: {"n": int((src_ind == s).sum()),
                            "acc": round(float((oof[src_ind == s] == y_ind[src_ind == s]).mean()), 4),
                            "recall": {classes[c]: round(float((oof[(src_ind == s) & (y_ind == c)] == c).mean()), 4)
                                       for c in np.unique(y_ind[src_ind == s])},
                            "support": {classes[c]: int(((src_ind == s) & (y_ind == c)).sum())
                                        for c in np.unique(y_ind[src_ind == s])}}
                        for s in sorted(set(src_ind))}
    sh(f"CV: {cv}")

    Xte, yte, ids_te = XY["test"]
    pred = head.predict(Xte, verbose=0).argmax(1)
    acc = float((pred == yte).mean())
    rng = np.random.default_rng(SEED)
    boots = [float((pred[b] == yte[b]).mean()) for b in (rng.integers(0, len(yte), len(yte)) for _ in range(2000))]
    rep = classification_report(yte, pred, labels=range(len(classes)), target_names=classes, digits=4,
                                output_dict=True, zero_division=0)
    sh(classification_report(yte, pred, labels=range(len(classes)), target_names=classes, digits=4, zero_division=0))
    cm = confusion_matrix(yte, pred, labels=range(len(classes)))

    fig, ax = plt.subplots(figsize=(1.1 * len(classes) + 3, 1.0 * len(classes) + 2.5))
    ax.imshow(cm, cmap="Blues")
    for a in range(len(classes)):
        for b in range(len(classes)):
            ax.text(b, a, cm[a, b], ha="center", va="center",
                    color="white" if cm[a, b] > cm.max() / 2 else "black")
    ax.set_xticks(range(len(classes)), classes, rotation=45, ha="right")
    ax.set_yticks(range(len(classes)), classes)
    ax.set_xlabel("Predicted"); ax.set_ylabel("True")
    ax.set_title(f"{crop} test (acc={acc:.3f}, n={len(yte)})")
    fig.tight_layout()
    fig.savefig(crop_dir(crop) / "confusion_matrix.png", dpi=150)
    plt.close(fig)

    # cross-source external test: any role=external image whose class the head knows
    ext = [i for i, r in enumerate(rows) if keep[i] and r["role"] == "external" and r["class"] in label_map]
    external = None
    if ext:
        ye = np.array([label_map[rows[i]["class"]] for i in ext])
        pe = head.predict(feats[ext], verbose=0).argmax(1)
        external = {"n": len(ext), "acc": round(float((pe == ye).mean()), 4),
                    "per_class_recall": {classes[c]: round(float((pe[ye == c] == c).mean()), 4)
                                         for c in np.unique(ye)},
                    "confusions": {f"{classes[a]}->{classes[b]}": int(((ye == a) & (pe == b)).sum())
                                   for a in np.unique(ye) for b in range(len(classes))
                                   if a != b and ((ye == a) & (pe == b)).sum() >= 3}}
        sh(f"external test: {external}")

    min_recall = min(rep[c]["recall"] for c in classes)
    src_te = np.array([rows[i]["source"] for i in ids_te])
    per_source = {s: {"n": int((src_te == s).sum()), "acc": round(float((pred[src_te == s] == yte[src_te == s]).mean()), 4),
                      "recall": {classes[c]: round(float((pred[(src_te == s) & (yte == c)] == c).mean()), 4)
                                 for c in np.unique(yte[src_te == s])}}
                  for s in sorted(set(src_te))}
    result = {
        "crop": crop, "classes": label_map, "dropped_small_classes": sorted(small),
        "dropped_by_choice": sorted(drop_classes),
        "split_counts": {c: {s: sum(1 for i in by_cls[c] if split[i] == s) for s in RATIOS} for c in classes},
        "class_weights": {str(k): v for k, v in cw.items()},
        "epochs_trained": len(hist.history["loss"]),
        "best_val_acc": round(max(hist.history["val_accuracy"]), 4),
        "test_acc": round(acc, 4), "test_n": int(len(yte)),
        "test_acc_95ci": [round(float(np.quantile(boots, .025)), 4), round(float(np.quantile(boots, .975)), 4)],
        "macro_f1": round(rep["macro avg"]["f1-score"], 4),
        "per_class": {c: {k: round(rep[c][k], 4) for k in ("precision", "recall", "f1-score", "support")}
                      for c in classes},
        "min_class_recall": round(min_recall, 4),
        "min_class_test_support": int(min(rep[c]["support"] for c in classes)),
        "cv": cv,
        # gate on the CV estimate (every independent image tested once); test split kept for reference
        # catalogue rule 1: a head that can never say "healthy" is not useful; one class is not a classifier
        "gate_pass": bool(len(classes) >= 2 and any("healthy" in c.lower() for c in classes) and
                          cv["acc"] >= 0.85 and cv["min_recall"] >= 0.70 and all(
            r >= 0.70 for s in cv["per_source"].values() for c, r in s["recall"].items() if s["support"][c] >= 20)),
        "external_test": external,
        "per_source_test": per_source,
        "train_copies_added": n_copies,
        "sources_used": sorted({rows[i]["source"] for i in cand}),
    }
    result["tag"] = tag
    json.dump(result, open(crop_dir(crop) / f"train_result{'_' + tag if tag else ''}.json", "w"), indent=2)
    sh(json.dumps({k: result[k] for k in ("test_acc", "test_acc_95ci", "macro_f1", "min_class_recall",
                                          "gate_pass", "split_counts")}, indent=2))
    gradcam_grid(crop, rows, ids_te, yte, pred, classes, head)


def gradcam_grid(crop, rows, ids_te, yte, pred, classes, head, n_ok=3, n_bad=2):
    sys.path.insert(0, str(ML))
    import base64, io
    from gradcam import generate_gradcam
    backbone = get_backbone()
    T = 150
    rng = np.random.default_rng(SEED)
    canvas = Image.new("RGB", ((n_ok + n_bad) * 2 * T + 20, len(classes) * (T + 16)), "white")
    dr = ImageDraw.Draw(canvas)
    for c, name in enumerate(classes):
        pos = np.nonzero(yte == c)[0]
        ok, bad = pos[pred[pos] == c], pos[pred[pos] != c]
        pick = list(rng.choice(ok, min(n_ok, len(ok)), replace=False)) + \
               list(rng.choice(bad, min(n_bad, len(bad)), replace=False))
        dr.text((2, c * (T + 16) + 2), name, fill="black")
        for k, p in enumerate(pick):
            img = Image.open(DATA / rows[ids_te[p]]["path"]).convert("RGB")
            cam = Image.open(io.BytesIO(base64.b64decode(generate_gradcam(backbone, head, img, int(pred[p])))))
            x, yy = k * 2 * T + (20 if k >= n_ok else 0), c * (T + 16) + 14
            canvas.paste(img.resize((T, T)), (x, yy))
            canvas.paste(cam.resize((T, T)), (x + T, yy))
            if pred[p] != c:
                dr.text((x + 2, yy + 2), f"-> {classes[pred[p]][:14]}", fill="red")
    canvas.save(crop_dir(crop) / "gradcam_grid.png")


# ------------------------------------------------------------------- promote

def promote(crop):
    assert crop not in EXISTING
    res = json.load(open(crop_dir(crop) / "train_result.json"))
    shutil.copy2(crop_dir(crop) / f"{crop}_head.keras", MODELS / "heads" / f"{crop}_head.keras")
    for fname, value in (("label_maps.json", res["classes"]), ("class_weights.json", res["class_weights"])):
        p = DATA / fname
        cur = json.load(open(p))
        cur[crop] = value
        json.dump(cur, open(p, "w"), indent=2)
    p = MODELS / "new_crops_results.json"
    allres = json.load(open(p)) if p.exists() else {}
    allres[crop] = {k: res[k] for k in ("classes", "test_acc", "test_n", "test_acc_95ci", "macro_f1",
                                        "min_class_recall", "per_class", "external_test", "sources_used")}
    json.dump(allres, open(p, "w"), indent=2)
    sh(f"promoted {crop}")


if __name__ == "__main__":
    stage, crop = sys.argv[1], sys.argv[2]
    extra = json.loads(sys.argv[3]) if len(sys.argv) > 3 else {}
    {"ingest": ingest, "analyze": analyze, "train": train, "promote": promote}[stage](crop, **extra)
