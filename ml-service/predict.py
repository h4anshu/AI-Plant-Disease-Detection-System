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

from gradcam import generate_gradcam
from severity import compute_severity

ROOT = Path(__file__).resolve().parent
BACKBONE_PATH = ROOT / "models" / "backbone" / "efficientnetb0_backbone.keras"
HEADS_DIR = ROOT / "models" / "heads"
LABEL_MAPS_PATH = ROOT / "data" / "label_maps.json"

IMG_SIZE = (224, 224)
ACTIVE_CROPS = ["wheat", "rice", "sugarcane", "potato", "maize", "pigeonpea"]


def load_models():
    """Load the backbone, all crop heads, and label maps once. Call at app startup."""
    backbone = keras.models.load_model(BACKBONE_PATH)
    heads = {crop: keras.models.load_model(HEADS_DIR / f"{crop}_head.keras") for crop in ACTIVE_CROPS}
    label_maps = json.loads(LABEL_MAPS_PATH.read_text(encoding="utf-8"))
    return backbone, heads, label_maps


def _is_healthy(class_name: str) -> bool:
    return "healthy" in class_name.lower()


def predict_disease(backbone, heads: dict, label_maps: dict, crop: str, image_bytes: bytes) -> dict:
    head = heads[crop]
    idx_to_class = {idx: name for name, idx in label_maps[crop].items()}

    image = Image.open(io.BytesIO(image_bytes)).convert("RGB")
    resized = image.resize(IMG_SIZE)

    batch = np.expand_dims(preprocess_input(np.array(resized).astype(np.float32)), axis=0)
    features = backbone(batch, training=False)
    probs = head(features, training=False).numpy()[0]

    class_idx = int(np.argmax(probs))
    confidence = float(probs[class_idx])
    disease = idx_to_class[class_idx]

    severity = "healthy" if _is_healthy(disease) else compute_severity(image)
    gradcam_png = generate_gradcam(backbone, head, resized, class_idx)

    return {
        "disease": disease,
        "confidence": confidence,
        "severity": severity,
        "gradcam": gradcam_png,
        "crop": crop,
    }
