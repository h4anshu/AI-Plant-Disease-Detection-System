"""Grad-CAM heatmap overlay without TensorFlow (docs/SERVING.md).

Each head sits on global-average-pooling of the backbone's last conv map A (7x7x1280):
    g = mean_ij A_ij,  h = relu(g W1 + b1),  p = softmax(h W2 + b2)
so the gradient of the class probability p_c w.r.t. A has a closed form:
    dp_c/dz = p_c (e_c - p),  dp_c/dg = W1 [(W2 dp_c/dz) * (g W1 + b1 > 0)],  dp_c/dA_ij = dp_c/dg / (H W)
The rest mirrors the original TensorFlow implementation (validated on wheat, see
train/04_gradcam_diagnostic.ipynb): channel weights = spatial mean of the gradient, ReLU, max-normalise,
bilinear resize to 224 (TensorFlow's half-pixel rule), matplotlib's 'jet' colours, 60/40 overlay.
train/check_onnx_parity.py compares it with the TensorFlow version.
"""
import base64
import io

import numpy as np
from PIL import Image

IMG_SIZE = (224, 224)

# matplotlib's 'jet' segment data -> the same 256-entry lookup table, so matplotlib isn't needed at runtime
_JET = {
    "red": ((0.00, 0.0), (0.35, 0.0), (0.66, 1.0), (0.89, 1.0), (1.00, 0.5)),
    "green": ((0.000, 0.0), (0.125, 0.0), (0.375, 1.0), (0.640, 1.0), (0.910, 0.0), (1.000, 0.0)),
    "blue": ((0.00, 0.5), (0.11, 1.0), (0.34, 1.0), (0.65, 0.0), (1.00, 0.0)),
}
_X = np.linspace(0.0, 1.0, 256)
JET_LUT = np.stack([np.interp(_X, [p[0] for p in _JET[c]], [p[1] for p in _JET[c]]) for c in ("red", "green", "blue")], 1)


def jet(values: np.ndarray) -> np.ndarray:
    """values in [0, 1] -> RGB in [0, 1], indexed exactly like matplotlib's Colormap.__call__."""
    idx = (np.asarray(values, dtype=np.float32) * 256).astype(np.int64)
    return JET_LUT[np.clip(idx, 0, 255)]


def resize_bilinear(a: np.ndarray, size: int) -> np.ndarray:
    """(h, w) float32 -> (size, size), matching tf.image.resize(method='bilinear') (half-pixel centres)."""
    def axis(n_in):
        x = (np.arange(size, dtype=np.float32) + 0.5) * np.float32(n_in / size) - 0.5
        lo = np.floor(x)
        return (np.clip(lo, 0, n_in - 1).astype(int), np.clip(np.ceil(x), 0, n_in - 1).astype(int),
                (x - lo).astype(np.float32))
    y0, y1, fy = axis(a.shape[0])
    x0, x1, fx = axis(a.shape[1])
    top = a[y0][:, x0] + (a[y0][:, x1] - a[y0][:, x0]) * fx
    bottom = a[y1][:, x0] + (a[y1][:, x1] - a[y1][:, x0]) * fx
    return top + (bottom - top) * fy[:, None]


def heatmap(conv: np.ndarray, features: np.ndarray, weights, class_idx: int) -> np.ndarray:
    """conv (H, W, C) and features (C,) of one image; weights = (w1, b1, w2, b2) of the crop head."""
    w1, b1, w2, b2 = weights
    pre = features @ w1 + b1
    z = np.maximum(pre, 0) @ w2 + b2
    p = np.exp(z - z.max())
    p /= p.sum()
    dz = -p[class_idx] * p
    dz[class_idx] += p[class_idx]
    dg = w1 @ ((w2 @ dz) * (pre > 0))
    pooled = (dg / (conv.shape[0] * conv.shape[1])).astype(np.float32)
    h = conv @ pooled
    return (np.maximum(h, 0) / (h.max() + 1e-8)).astype(np.float32)


def generate_gradcam(conv, features, weights, resized: Image.Image, class_idx: int) -> str:
    """Base64 PNG: the 224x224 model input with the Grad-CAM heatmap for class_idx overlaid."""
    orig = np.array(resized.convert("RGB"))
    heat = resize_bilinear(heatmap(conv, features, weights, class_idx), IMG_SIZE[0])
    overlay = (0.6 * orig + 0.4 * (jet(heat) * 255)).astype("uint8")
    buf = io.BytesIO()
    Image.fromarray(overlay).save(buf, format="PNG")
    return base64.b64encode(buf.getvalue()).decode("ascii")
