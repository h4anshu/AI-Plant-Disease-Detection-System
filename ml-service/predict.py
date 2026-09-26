"""Inference on ONNX Runtime: frozen EfficientNetB0 backbone (+GAP) -> per-crop head (docs/SERVING.md).

No TensorFlow at serving time: the ONNX files are built from the tracked Keras weights by
train/export_onnx.py, Grad-CAM is computed in numpy (gradcam.py). Models are loaded once by
load_models() at startup; every response says which model versions produced it.
"""
import io
import json
from dataclasses import dataclass
from pathlib import Path

import numpy as np
import onnxruntime as ort
from PIL import Image

from gate import Gate
from gradcam import generate_gradcam
from severity import compute_severity

ROOT = Path(__file__).resolve().parent
MODELS = ROOT / "models"
ONNX_DIR = MODELS / "onnx"
LABEL_MAPS_PATH = ROOT / "data" / "label_maps.json"
REGISTRY = json.loads((MODELS / "model_registry.json").read_text(encoding="utf-8"))

IMG_SIZE = (224, 224)
ACTIVE_CROPS = list(REGISTRY["heads"])  # wheat ... banana; the registry is the list of shipped heads


def registry_summary() -> dict:
    return {"backbone": {"name": REGISTRY["backbone"]["name"], "version": REGISTRY["backbone"]["version"]},
            "heads": {crop: h["version"] for crop, h in REGISTRY["heads"].items()},
            "gate": REGISTRY["gate"]["version"]}


@dataclass
class Models:
    backbone: ort.InferenceSession
    heads: dict        # crop -> InferenceSession
    weights: dict      # crop -> (w1, b1, w2, b2) numpy, for the OOD gate and Grad-CAM
    label_maps: dict
    gate: Gate | None


class StaleExport(RuntimeError):
    pass


def _session(path: Path, entry: dict) -> ort.InferenceSession:
    opts = ort.SessionOptions()
    opts.graph_optimization_level = ort.GraphOptimizationLevel.ORT_ENABLE_ALL
    session = ort.InferenceSession(str(path), opts, providers=["CPUExecutionProvider"])
    if session.get_modelmeta().custom_metadata_map.get("source_sha256") != entry["sha256"]:
        raise StaleExport(f"{path.name} was not exported from the weights listed in models/model_registry.json "
                          "- re-run train/export_onnx.py")
    return session


def load_models(with_gate: bool = True) -> Models:
    """Load the backbone, all crop heads, label maps and the OOD/quality gate once. Call at app startup.
    with_gate=False is for train/calibrate_ood.py, which creates the gate's thresholds file."""
    backbone = _session(ONNX_DIR / "backbone.onnx", REGISTRY["backbone"])
    heads = {crop: _session(ONNX_DIR / "heads" / f"{crop}.onnx", REGISTRY["heads"][crop]) for crop in ACTIVE_CROPS}
    npz = np.load(ONNX_DIR / "head_weights.npz")
    weights = {}
    for crop in ACTIVE_CROPS:
        if str(npz[f"{crop}/source_sha256"]) != REGISTRY["heads"][crop]["sha256"]:
            raise StaleExport("models/onnx/head_weights.npz is stale - re-run train/export_onnx.py")
        weights[crop] = tuple(npz[f"{crop}/{k}"] for k in ("w1", "b1", "w2", "b2"))
    label_maps = json.loads(LABEL_MAPS_PATH.read_text(encoding="utf-8"))
    return Models(backbone, heads, weights, label_maps, Gate(weights) if with_gate else None)


def embed(models: Models, batch: np.ndarray):
    """(N,224,224,3) 0-255 pixels -> (features (N,1280), conv (N,7,7,1280)); EfficientNet normalises inside."""
    features, conv = models.backbone.run(["features", "conv"], {"image": batch.astype(np.float32)})
    return features, conv


def _is_healthy(class_name: str) -> bool:
    return "healthy" in class_name.lower()


def predict_disease(models: Models, crop: str, image_bytes: bytes) -> dict:
    """status: "ok" | "uncertain" | "rejected_quality" | "not_leaf" (docs/OOD_GATE.md)."""
    idx_to_class = {idx: name for name, idx in models.label_maps[crop].items()}
    model_version = {"backbone": REGISTRY["backbone"]["version"], "head": REGISTRY["heads"][crop]["version"],
                     "gate": REGISTRY["gate"]["version"]}

    try:
        image = Image.open(io.BytesIO(image_bytes)).convert("RGB")
    except Exception:
        return {"status": "rejected_quality", "reasons": ["unreadable_image"], "ood_score": None,
                "quality": None, "crop": crop, "model_version": model_version}
    resized = image.resize(IMG_SIZE)

    # 1. photo quality, before the model: a bad or leafless photo gets no diagnosis at all
    quality, status, reasons = models.gate.check_quality(image, resized)
    if status:
        return {"status": status, "reasons": reasons, "ood_score": None, "quality": quality, "crop": crop,
                "model_version": model_version}

    features, conv = embed(models, np.expand_dims(np.array(resized), 0))
    probs = models.heads[crop].run(["probs"], {"features": features})[0][0]

    # 2. does this image look like this crop's training images?
    ood_score, uncertain, method = models.gate.ood(crop, features)

    class_idx = int(np.argmax(probs))
    confidence = float(probs[class_idx])
    disease = idx_to_class[class_idx]

    severity = "healthy" if _is_healthy(disease) else compute_severity(image)
    gradcam_png = generate_gradcam(conv[0], features[0], models.weights[crop], resized, class_idx)

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
        "model_version": model_version,
    }
    if uncertain:
        top = np.argsort(probs)[::-1][:3]
        result["top3"] = [{"disease": idx_to_class[int(i)], "probability": round(float(probs[i]), 4)} for i in top]
    return result
