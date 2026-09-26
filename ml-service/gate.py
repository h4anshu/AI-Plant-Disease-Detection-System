"""Photo-quality check and out-of-distribution (OOD) gate in front of the crop heads.

Cut-offs and statistics come from train/calibrate_ood.py (models/ood_thresholds.json,
models/ood_stats.npz); docs/OOD_GATE.md explains how they were chosen. Every score here is
oriented "higher = more out-of-distribution", and an image is flagged when it is above the
crop's threshold.
"""
import json
from pathlib import Path

import numpy as np
from PIL import Image
from scipy import ndimage

MODELS = Path(__file__).resolve().parent / "models"
THRESHOLDS_PATH = MODELS / "ood_thresholds.json"
STATS_PATH = MODELS / "ood_stats.npz"


def quality_metrics(image: Image.Image, resized: Image.Image) -> dict:
    """`image` is the upload (for its size), `resized` the 224x224 RGB copy the model sees; measuring
    on the fixed-size copy makes blur/brightness comparable across camera resolutions."""
    gray = np.asarray(resized.convert("L"), dtype=np.float32)
    hsv = np.asarray(resized.convert("HSV"), dtype=np.float32) / 255.0
    hue, sat, val = hsv[..., 0] * 360.0, hsv[..., 1], hsv[..., 2]
    # plant-coloured pixel: yellow through green hues (covers chlorotic and many diseased
    # tissues), not grey/white/black; brown lesions on a green leaf still leave plenty of green
    plant = (hue >= 15) & (hue <= 170) & (sat >= 0.15) & (val >= 0.12)
    return {
        "short_side": int(min(image.size)),
        "blur": round(float(ndimage.laplace(gray).var()), 2),  # variance of Laplacian: low = blurry
        "brightness": round(float(gray.mean()), 2),
        "vegetation": round(float(plant.mean()), 4),
    }


def quality_verdict(q: dict, th: dict):
    """Return (status or None, reasons). A bad photo (size/blur/light) is 'rejected_quality' even if
    it also looks leafless, because darkness or blur can hide the leaf."""
    reasons = []
    if q["short_side"] < th["min_short_side"]:
        reasons.append("too_small")
    if q["blur"] < th["min_blur"]:
        reasons.append("blurry")
    if q["brightness"] < th["min_brightness"]:
        reasons.append("too_dark")
    if q["brightness"] > th["max_brightness"]:
        reasons.append("too_bright")
    if reasons:
        return "rejected_quality", reasons
    if q["vegetation"] < th["min_vegetation"]:
        return "not_leaf", ["no_leaf"]
    return None, []


def head_weights(head):
    """(W1, b1, W2, b2) of a Dense(128, relu) -> Dropout -> Dense(softmax) head, for logits in numpy."""
    dense = [l for l in head.layers if l.__class__.__name__ == "Dense"]
    (w1, b1), (w2, b2) = dense[0].get_weights(), dense[-1].get_weights()
    return w1, b1, w2, b2


def logits_from_features(weights, feats: np.ndarray) -> np.ndarray:
    w1, b1, w2, b2 = weights
    return np.maximum(feats @ w1 + b1, 0.0) @ w2 + b2


def maha_distance(stats: dict, feats: np.ndarray) -> np.ndarray:
    """Min over classes of the Mahalanobis distance in the crop's PCA space (shared covariance)."""
    # (z-mu)P(z-mu) = zPz - 2 zPmu + muPmu: one d x d product per image instead of one per class
    z = (feats - stats["mean"]) @ stats["components"].T
    mus, prec = stats["class_means"], stats["precision"]
    zp = z @ prec
    d = (zp * z).sum(1)[:, None] - 2 * zp @ mus.T + ((mus @ prec) * mus).sum(1)[None, :]
    return d.min(axis=1)


def ood_scores(method: str, feats: np.ndarray, logits: np.ndarray, stats: dict = None) -> np.ndarray:
    """Higher = more out-of-distribution."""
    if method == "msp":
        e = np.exp(logits - logits.max(axis=1, keepdims=True))
        return 1.0 - (e / e.sum(axis=1, keepdims=True)).max(axis=1)
    if method == "energy":  # -logsumexp(logits)
        m = logits.max(axis=1, keepdims=True)
        return -(m[:, 0] + np.log(np.exp(logits - m).sum(axis=1)))
    if method.startswith("maha"):
        return maha_distance(stats, feats)
    if method.startswith("knn"):  # cosine distance to the nearest k-means prototype of the crop's train features
        f = feats / np.linalg.norm(feats, axis=1, keepdims=True)
        return 1.0 - (f @ stats["prototypes"].T).max(axis=1)
    raise ValueError(method)


class Gate:
    """Loaded once at startup next to the models."""

    def __init__(self, heads: dict):
        cfg = json.loads(THRESHOLDS_PATH.read_text(encoding="utf-8"))
        self.quality = cfg["quality"]["thresholds"]
        self.crops = cfg["crops"]
        npz = np.load(STATS_PATH)
        self.stats = {c: {k.split("/", 1)[1]: npz[k].astype(np.float32) for k in npz.files if k.startswith(f"{c}/")}
                      for c in self.crops}
        self.weights = {c: head_weights(h) for c, h in heads.items()}

    def check_quality(self, image, resized):
        q = quality_metrics(image, resized)
        status, reasons = quality_verdict(q, self.quality)
        return q, status, reasons

    def ood(self, crop: str, feats: np.ndarray):
        """(ood_score, is_uncertain, method) for one image's backbone features (shape 1 x 1280)."""
        cfg = self.crops[crop]
        logits = logits_from_features(self.weights[crop], feats)
        if cfg.get("norm"):  # "a+b": each part normalised on the crop's validation images, then max
            score = max((float(ood_scores(m, feats, logits, self.stats.get(crop))[0]) - med) / scale
                        for m, (med, scale) in cfg["norm"].items())
        else:
            score = float(ood_scores(cfg["method"], feats, logits, self.stats.get(crop))[0])
        return score, score > cfg["threshold"], cfg["method"]


if __name__ == "__main__":
    # ponytail check: verdict precedence, the expanded Mahalanobis formula, kNN scoring, and the
    # live thresholds on a real leaf vs random noise. Run from ml-service/: python gate.py
    th = {"min_short_side": 212, "min_blur": 7.7, "min_brightness": 47.5, "max_brightness": 195.2, "min_vegetation": 0.013}
    ok_q = {"short_side": 512, "blur": 500.0, "brightness": 120.0, "vegetation": 0.8}
    assert quality_verdict(ok_q, th) == (None, [])
    assert quality_verdict({**ok_q, "vegetation": 0.0}, th) == ("not_leaf", ["no_leaf"])
    assert quality_verdict({**ok_q, "blur": 1.0, "vegetation": 0.0}, th) == ("rejected_quality", ["blurry"])
    rng = np.random.default_rng(0)
    X, st = rng.normal(size=(5, 8)), {"mean": rng.normal(size=8), "components": np.eye(8),
                                      "class_means": rng.normal(size=(3, 8)), "precision": np.eye(8) * 2}
    diff = (X - st["mean"])[:, None] - st["class_means"][None]
    assert np.allclose(maha_distance(st, X), np.einsum("nkd,de,nke->nk", diff, st["precision"], diff).min(1))
    p = rng.normal(size=(4, 8)); p /= np.linalg.norm(p, axis=1, keepdims=True)
    assert np.allclose(ood_scores("knn4", p[:1] * 3.0, None, {"prototypes": p}), 0.0)  # a prototype is in-distribution
    if THRESHOLDS_PATH.exists():
        q_th = json.loads(THRESHOLDS_PATH.read_text(encoding="utf-8"))["quality"]["thresholds"]
        leaf = next((Path(__file__).parent / "data" / "test" / "blackgram" / "Healthy").glob("*"), None)
        if leaf:
            img = Image.open(leaf).convert("RGB")
            assert quality_verdict(quality_metrics(img, img.resize((224, 224))), q_th)[0] is None
        noise = Image.fromarray((rng.random((300, 300, 3)) * 60).astype("uint8"))
        assert quality_verdict(quality_metrics(noise, noise.resize((224, 224))), q_th)[0] is not None
    print("gate.py self-check passed")
