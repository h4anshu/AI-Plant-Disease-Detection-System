"""Severity from a single image: v4 method (per-image median+MAD), extracted from
train/compute_severity.py so predict.py can reuse it without duplicating the logic.
See that file's module docstring for why v4 (not v1-v3) is the validated method.
"""
import numpy as np
from PIL import Image
from scipy import ndimage

THUMB_SIZE = 200
MORPH_STRUCT = np.ones((3, 3))
EARLY_MAX = 15
MODERATE_MAX = 40
MAD_MULTIPLIER = 4  # validated best of {3, 4} on the Yellow-Rust gate


def _bucket(percent_affected):
    if percent_affected < EARLY_MAX:
        return "early"
    if percent_affected <= MODERATE_MAX:
        return "moderate"
    return "severe"


def _otsu_threshold(values):
    hist, edges = np.histogram(values, bins=256)
    hist = hist.astype(np.float64)
    centers = (edges[:-1] + edges[1:]) / 2
    w1 = np.cumsum(hist)
    w2 = np.cumsum(hist[::-1])[::-1]
    m1 = np.cumsum(hist * centers) / np.where(w1 == 0, 1, w1)
    m2 = (np.cumsum((hist * centers)[::-1])[::-1]) / np.where(w2 == 0, 1, w2)
    inter_class_var = w1[:-1] * w2[1:] * (m1[:-1] - m2[1:]) ** 2
    if not np.any(inter_class_var):
        return float(centers[0])
    return float(centers[np.argmax(inter_class_var)])


def _leaf_mask(img):
    rgb = np.array(img).astype(np.float32)
    exg = 2 * rgb[:, :, 1] - rgb[:, :, 0] - rgb[:, :, 2]
    mask = exg > _otsu_threshold(exg.flatten())

    total = mask.size
    if 0 < mask.sum() < total:
        opened = ndimage.binary_opening(mask, structure=MORPH_STRUCT)
        closed = ndimage.binary_closing(opened, structure=MORPH_STRUCT)
        if closed.sum() > 0:
            mask = closed

    if mask.sum() == 0:
        mask = np.ones_like(mask)
    return mask


def _percent_affected(pixels):
    if len(pixels) < 2:
        return 0.0
    median = np.median(pixels, axis=0)
    mad = np.median(np.abs(pixels - median), axis=0)
    mad = np.where(mad < 1e-6, 1e-6, mad)
    dist = np.sqrt((((pixels - median) / mad) ** 2).sum(axis=1))
    return 100.0 * (dist > MAD_MULTIPLIER).sum() / len(pixels)


def compute_severity(image: Image.Image) -> str:
    """Given one PIL image (any size, any mode), return 'early' | 'moderate' | 'severe'."""
    img = image.convert("RGB").copy()
    img.thumbnail((THUMB_SIZE, THUMB_SIZE))

    mask = _leaf_mask(img)
    lab = np.array(img.convert("LAB")).astype(np.float32)
    pixels = lab[mask]

    if len(pixels) < 2:
        return "early"
    return _bucket(_percent_affected(pixels))


if __name__ == "__main__":
    # ponytail check: the median+MAD outlier math directly (bucket thresholds +
    # outlier-distance formula), plus one end-to-end call through compute_severity.
    uniform_pixels = np.tile([50.0, 50.0, 50.0], (1000, 1))
    assert _percent_affected(uniform_pixels) == 0.0

    outlier_pixels = uniform_pixels.copy()
    outlier_pixels[:450] += 500  # 45% of pixels now far from the majority (still >50% intact)
    assert _bucket(_percent_affected(outlier_pixels)) == "severe"

    uniform_leaf = Image.new("RGB", (200, 200), (40, 120, 40))
    assert compute_severity(uniform_leaf) == "early"

    print("severity.py self-check passed")
