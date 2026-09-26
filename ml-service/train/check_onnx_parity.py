"""Parity gate: the ONNX serving path must reproduce the Keras models (docs/SERVING.md).

    cd ml-service && python train/check_onnx_parity.py        # needs requirements-export.txt + data/test/

On every held-out test image of every crop: identical argmax on >= 99.9% and max |prob diff| < 1e-3.
Grad-CAM (numpy, gradcam.py) is compared with the original TensorFlow implementation on a sample.
Exits non-zero if the gate fails; writes data/onnx_parity.json.
"""
import base64
import io
import json
import sys
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import numpy as np
from PIL import Image

ML = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ML))
import gradcam as np_gradcam  # noqa: E402
from predict import ACTIVE_CROPS, IMG_SIZE, MODELS, REGISTRY, embed, load_models  # noqa: E402

import matplotlib.cm as cm  # noqa: E402
import tensorflow as tf  # noqa: E402
from tensorflow import keras  # noqa: E402

ARGMAX_MIN, PROB_DIFF_MAX = 0.999, 1e-3
CAM_SAMPLE = 5
IMG_EXTS = {".jpg", ".jpeg", ".png", ".bmp", ".webp"}


def tf_gradcam_reference(backbone, head, resized, class_idx):
    """The original TensorFlow implementation (gradcam.py before ONNX serving), for comparison."""
    conv_layer = next(l for l in reversed(backbone.layers) if len(l.output.shape) == 4)
    conv_out = backbone.get_layer(conv_layer.name).output
    grad_model = keras.Model(backbone.input, [conv_out, head(keras.layers.GlobalAveragePooling2D()(conv_out))])
    orig = np.array(resized.convert("RGB"))
    batch = np.expand_dims(orig.astype(np.float32), 0)  # efficientnet preprocess_input is the identity
    with tf.GradientTape() as tape:
        conv, preds = grad_model(batch)
        loss = preds[:, class_idx]
    pooled = tf.reduce_mean(tape.gradient(loss, conv), axis=(0, 1, 2))
    heat = tf.squeeze(conv[0] @ pooled[..., tf.newaxis])
    heat = tf.maximum(heat, 0) / (tf.reduce_max(heat) + 1e-8)
    heat224 = tf.image.resize(heat[..., tf.newaxis], IMG_SIZE).numpy().squeeze()
    overlay = (0.6 * orig + 0.4 * (cm.jet(heat224)[:, :, :3] * 255)).astype("uint8")
    return heat.numpy(), heat224, overlay


def load(path):
    return np.asarray(Image.open(path).convert("RGB").resize(IMG_SIZE), dtype=np.uint8)


def main():
    models = load_models()
    kbackbone = keras.models.load_model(MODELS / REGISTRY["backbone"]["file"])
    report, ok = {}, True
    for crop in ACTIVE_CROPS:
        khead = keras.models.load_model(MODELS / REGISTRY["heads"][crop]["file"])
        files = [p for c in models.label_maps[crop] for p in sorted((ML / "data" / "test" / crop / c).iterdir())
                 if p.suffix.lower() in IMG_EXTS]
        with ThreadPoolExecutor(8) as pool:
            imgs = np.stack(list(pool.map(load, files)))
        kf, of, kp, op = [], [], [], []
        for s in range(0, len(imgs), 64):
            b = imgs[s:s + 64].astype(np.float32)
            kfeat = kbackbone.predict(b, verbose=0)
            ofeat, _ = embed(models, b)
            kf.append(kfeat), of.append(ofeat)
            kp.append(khead.predict(kfeat, verbose=0))
            op.append(models.heads[crop].run(["probs"], {"features": ofeat})[0])
        kf, of, kp, op = map(np.concatenate, (kf, of, kp, op))
        agree = float((kp.argmax(1) == op.argmax(1)).mean())
        prob_diff = float(np.abs(kp - op).max())
        ood_k = np.array([models.gate.ood(crop, kf[i:i + 1])[0] for i in range(len(kf))])
        ood_o = np.array([models.gate.ood(crop, of[i:i + 1])[0] for i in range(len(of))])
        thr = models.gate.crops[crop]["threshold"]
        # Grad-CAM: numpy (ONNX conv map) vs the original TensorFlow implementation
        cam_heat, cam_px = [], []
        for i in np.linspace(0, len(files) - 1, CAM_SAMPLE).astype(int):
            resized = Image.fromarray(imgs[i])
            cls = int(op[i].argmax())
            t_heat, _, t_overlay = tf_gradcam_reference(kbackbone, khead, resized, cls)
            ofeat, oconv = embed(models, imgs[i:i + 1])
            n_heat = np_gradcam.heatmap(oconv[0], ofeat[0], models.weights[crop], cls)
            png = base64.b64decode(np_gradcam.generate_gradcam(oconv[0], ofeat[0], models.weights[crop], resized, cls))
            n_overlay = np.array(Image.open(io.BytesIO(png)))
            cam_heat.append(float(np.abs(t_heat - n_heat).max()))
            cam_px.append(int(np.abs(t_overlay.astype(int) - n_overlay.astype(int)).max()))
        report[crop] = {"n": len(files), "argmax_agreement": round(agree, 5), "max_abs_prob_diff": float(f"{prob_diff:.2e}"),
                        "max_abs_feature_diff": float(f"{float(np.abs(kf - of).max()):.2e}"),
                        "ood_decision_agreement": round(float(((ood_k > thr) == (ood_o > thr)).mean()), 5),
                        "gradcam_max_heat_diff": float(f"{max(cam_heat):.2e}"), "gradcam_max_pixel_diff": max(cam_px)}
        passed = agree >= ARGMAX_MIN and prob_diff < PROB_DIFF_MAX
        ok &= passed
        print(f"{crop:10s} {'PASS' if passed else 'FAIL'} {report[crop]}", flush=True)
    total = sum(r["n"] for r in report.values())
    report["_all"] = {"n": total, "argmax_agreement": round(sum(r["argmax_agreement"] * r["n"] for r in report.values()) / total, 5),
                      "max_abs_prob_diff": max(r["max_abs_prob_diff"] for r in report.values() if isinstance(r, dict) and "n" in r),
                      "gate": {"argmax_min": ARGMAX_MIN, "prob_diff_max": PROB_DIFF_MAX, "passed": bool(ok)}}
    print("ALL", report["_all"])
    (ML / "data" / "onnx_parity.json").write_text(json.dumps(report, indent=1), encoding="utf-8")
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
