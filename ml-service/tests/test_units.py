import base64
import json

import numpy as np
import pytest
from PIL import Image
from scipy import ndimage

import gate
from gradcam import generate_gradcam
from severity import _bucket, compute_severity

PNG_SIGNATURE = b"\x89PNG\r\n\x1a\n"


# ---------------------------------------------------------------- severity

def spotted_leaf(spot_density, size=200):
    """Green elliptical leaf on soil with scattered 3x3 yellow lesions."""
    rng = np.random.default_rng(0)
    a = np.zeros((size, size, 3), np.int16)
    a[:] = (90, 70, 50)
    yy, xx = np.mgrid[:size, :size]
    inside = ((yy - 100) / 80) ** 2 + ((xx - 100) / 60) ** 2 < 1
    a[inside] = (40, 140, 45)
    spots = ndimage.binary_dilation(inside & (rng.random((size, size)) < spot_density), np.ones((3, 3))) & inside
    a[spots] = (150, 150, 50)
    return Image.fromarray(np.clip(a + rng.integers(-5, 6, a.shape), 0, 255).astype(np.uint8))


@pytest.mark.parametrize("density, expected", [(0.0, "early"), (0.01, "early"), (0.03, "moderate"), (0.06, "severe")])
def test_severity_grows_with_lesion_share(density, expected):
    # lesion share of the leaf: 0%, 9%, 23%, 43%
    assert compute_severity(spotted_leaf(density)) == expected


def test_severity_bucket_edges():
    assert [_bucket(p) for p in (0, 14.9, 15, 40, 40.1, 100)] == ["early", "early", "moderate", "moderate", "severe", "severe"]


def test_severity_accepts_any_mode_and_size():
    assert compute_severity(Image.new("L", (37, 1000), 128)) in {"early", "moderate", "severe"}


# ---------------------------------------------------------------- gradcam

def test_gradcam_returns_valid_png():
    """Tiny fake backbone/head: exercises the tape -> heatmap -> overlay -> base64 PNG path without weights."""
    import tensorflow as tf
    from tensorflow.keras import Model, layers
    inputs = tf.keras.Input(shape=(224, 224, 3))
    backbone = Model(inputs, layers.Conv2D(4, 3, padding="same")(inputs))
    head_in = tf.keras.Input(shape=(4,))
    head = Model(head_in, layers.Dense(2, activation="softmax")(head_in))
    img = Image.fromarray((np.random.default_rng(0).random((300, 400, 3)) * 255).astype("uint8"))
    png = base64.b64decode(generate_gradcam(backbone, head, img, class_idx=1))
    assert png[:8] == PNG_SIGNATURE
    out = Image.open(__import__("io").BytesIO(png))
    assert out.size == (224, 224) and out.mode == "RGB"


# ---------------------------------------------------------------- quality / OOD gate

TH = {"min_short_side": 212, "min_blur": 7.7, "min_brightness": 47.5, "max_brightness": 195.2, "min_vegetation": 0.013}
GOOD = {"short_side": 512, "blur": 500.0, "brightness": 120.0, "vegetation": 0.8}


@pytest.mark.parametrize("change, status, reasons", [
    ({}, None, []),
    ({"vegetation": 0.0}, "not_leaf", ["no_leaf"]),
    ({"short_side": 100}, "rejected_quality", ["too_small"]),
    ({"blur": 1.0}, "rejected_quality", ["blurry"]),
    ({"brightness": 10.0}, "rejected_quality", ["too_dark"]),
    ({"brightness": 250.0}, "rejected_quality", ["too_bright"]),
    # a bad photo wins over "no leaf": darkness or blur can hide the leaf
    ({"blur": 1.0, "vegetation": 0.0}, "rejected_quality", ["blurry"]),
])
def test_quality_verdict(change, status, reasons):
    assert gate.quality_verdict({**GOOD, **change}, TH) == (status, reasons)


def test_quality_metrics_on_images():
    green = Image.new("RGB", (640, 480), (40, 140, 45))
    q = gate.quality_metrics(green, green.resize((224, 224)))
    assert q["short_side"] == 480 and q["vegetation"] == 1.0 and q["blur"] == 0.0
    grey = Image.new("RGB", (640, 480), (128, 128, 128))
    assert gate.quality_metrics(grey, grey.resize((224, 224)))["vegetation"] == 0.0


def test_mahalanobis_matches_direct_formula():
    rng = np.random.default_rng(0)
    st = {"mean": rng.normal(size=8), "components": np.linalg.qr(rng.normal(size=(8, 8)))[0][:5],
          "class_means": rng.normal(size=(3, 5)), "precision": np.eye(5) * 2.0}
    X = rng.normal(size=(6, 8))
    z = (X - st["mean"]) @ st["components"].T
    diff = z[:, None] - st["class_means"][None]
    assert np.allclose(gate.maha_distance(st, X), np.einsum("nkd,de,nke->nk", diff, st["precision"], diff).min(1))


def test_knn_and_softmax_scores():
    rng = np.random.default_rng(1)
    protos = rng.normal(size=(4, 16))
    protos /= np.linalg.norm(protos, axis=1, keepdims=True)
    scores = gate.ood_scores("knn4", np.vstack([protos[:1] * 5, -protos[:1]]), None, {"prototypes": protos})
    assert scores[0] == pytest.approx(0.0, abs=1e-6) and scores[1] > 0.3  # a prototype itself = in-distribution
    confident, flat = np.array([[10.0, 0, 0]]), np.array([[1.0, 1.0, 1.0]])
    assert gate.ood_scores("msp", None, confident)[0] < gate.ood_scores("msp", None, flat)[0]
    assert gate.ood_scores("energy", None, confident)[0] < gate.ood_scores("energy", None, flat)[0]


def test_committed_thresholds_cover_every_crop():
    from predict import ACTIVE_CROPS
    cfg = json.loads(gate.THRESHOLDS_PATH.read_text(encoding="utf-8"))
    assert set(cfg["crops"]) == set(ACTIVE_CROPS)
    stats = np.load(gate.STATS_PATH)
    for crop, c in cfg["crops"].items():
        for part in c["method"].split("+"):
            if part.startswith("knn"):
                assert f"{crop}/prototypes" in stats.files
            if part.startswith("maha"):
                assert f"{crop}/precision" in stats.files
        # the calibration kept roughly 95% of the crop's own held-out photos
        assert 0.9 <= c["test_tpr_at_threshold"] <= 1.0
    assert max(cfg["quality"]["train_val_rejected_per_crop"].values()) < 0.02
