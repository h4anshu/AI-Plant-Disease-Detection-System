"""Real inference: frozen EfficientNetB0 backbone (+GAP) -> per-crop head.
Model loading is separated from prediction so app.py can load once at startup
and reuse the same objects for every request.
"""
import io
import json
from pathlib import Path

import numpy as np
from PIL import Image
from tensorflow import keras
from tensorflow.keras.applications.efficientnet import preprocess_input

from gate import Gate
from gradcam import generate_gradcam
from severity import compute_severity

ROOT = Path(__file__).resolve().parent
BACKBONE_PATH = ROOT / "models" / "backbone" / "efficientnetb0_backbone.keras"
HEADS_DIR = ROOT / "models" / "heads"
LABEL_MAPS_PATH = ROOT / "data" / "label_maps.json"

IMG_SIZE = (224, 224)
ACTIVE_CROPS = ["wheat", "rice", "sugarcane", "potato", "maize", "pigeonpea",
                "groundnut", "blackgram", "apple", "banana"]  # Sep 2026 additions: NEW_CROPS_REPORT.md


def load_models(with_gate: bool = True):
    """Load the backbone, all crop heads, label maps and the OOD/quality gate once. Call at app startup.
    with_gate=False is for train/calibrate_ood.py, which creates the gate's thresholds file."""
    backbone = keras.models.load_model(BACKBONE_PATH)
    heads = {crop: keras.models.load_model(HEADS_DIR / f"{crop}_head.keras") for crop in ACTIVE_CROPS}
    label_maps = json.loads(LABEL_MAPS_PATH.read_text(encoding="utf-8"))
    return backbone, heads, label_maps, (Gate(heads) if with_gate else None)


def _is_healthy(class_name: str) -> bool:
    return "healthy" in class_name.lower()


def predict_disease(backbone, heads: dict, label_maps: dict, gate: Gate, crop: str, image_bytes: bytes) -> dict:
    """status: "ok" | "uncertain" | "rejected_quality" | "not_leaf" (docs/OOD_GATE.md)."""
    head = heads[crop]
    idx_to_class = {idx: name for name, idx in label_maps[crop].items()}

    try:
        image = Image.open(io.BytesIO(image_bytes)).convert("RGB")
    except Exception:
        return {"status": "rejected_quality", "reasons": ["unreadable_image"], "ood_score": None,
                "quality": None, "crop": crop}
    resized = image.resize(IMG_SIZE)

    # 1. photo quality, before the model: a bad or leafless photo gets no diagnosis at all
    quality, status, reasons = gate.check_quality(image, resized)
    if status:
        return {"status": status, "reasons": reasons, "ood_score": None, "quality": quality, "crop": crop}

    batch = np.expand_dims(preprocess_input(np.array(resized).astype(np.float32)), axis=0)
    features = backbone(batch, training=False)
    probs = head(features, training=False).numpy()[0]

    # 2. does this image look like this crop's training images?
    ood_score, uncertain, method = gate.ood(crop, features.numpy())

    class_idx = int(np.argmax(probs))
    confidence = float(probs[class_idx])
    disease = idx_to_class[class_idx]

    severity = "healthy" if _is_healthy(disease) else compute_severity(image)
    gradcam_png = generate_gradcam(backbone, head, resized, class_idx)

    result = {
        "status": "uncertain" if uncertain else "ok",
        "reasons": [("unfamiliar_image" if ("maha" in method or "knn" in method) else "low_confidence")] if uncertain else [],
        "ood_score": round(ood_score, 4),
        "quality": quality,
        "disease": disease,
        "confidence": confidence,
        "severity": severity,
        "gradcam": gradcam_png,
        "crop": crop,
    }
    if uncertain:
        top = np.argsort(probs)[::-1][:3]
        result["top3"] = [{"disease": idx_to_class[int(i)], "probability": round(float(probs[i]), 4)} for i in top]
    return result
