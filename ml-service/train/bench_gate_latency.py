"""CPU latency added by the quality + OOD gate (docs/OOD_GATE.md). Run from ml-service/:
    ../.venv/Scripts/python.exe train/bench_gate_latency.py
Times, per image, the gate's own work (quality metrics + OOD score) and the full predict_disease call."""
import io
import sys
import time
from pathlib import Path

import numpy as np
from PIL import Image
from tensorflow.keras.applications.efficientnet import preprocess_input

ML = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ML))
from predict import ACTIVE_CROPS, IMG_SIZE, load_models, predict_disease  # noqa: E402

backbone, heads, label_maps, gate = load_models()
rng = np.random.default_rng(0)
samples = []
for crop in ACTIVE_CROPS:
    files = [p for d in (ML / "data" / "test" / crop).iterdir() if d.name in label_maps[crop] for p in d.iterdir()]
    samples += [(crop, files[i].read_bytes()) for i in rng.choice(len(files), 5, replace=False)]

predict_disease(backbone, heads, label_maps, gate, *samples[0])  # warm-up (graph build, Grad-CAM model)
gate_ms, total_ms = [], []
for crop, raw in samples:
    image = Image.open(io.BytesIO(raw)).convert("RGB")
    resized = image.resize(IMG_SIZE)
    feats = backbone(np.expand_dims(preprocess_input(np.array(resized, np.float32)), 0), training=False).numpy()
    t = time.perf_counter()
    gate.check_quality(image, resized)
    gate.ood(crop, feats)
    gate_ms.append((time.perf_counter() - t) * 1000)
    t = time.perf_counter()
    predict_disease(backbone, heads, label_maps, gate, crop, raw)
    total_ms.append((time.perf_counter() - t) * 1000)

g, tot = np.array(gate_ms), np.array(total_ms)
print(f"images: {len(samples)} (5 per crop)")
print(f"gate added work  : median {np.median(g):.1f} ms, p95 {np.quantile(g, .95):.1f} ms, max {g.max():.1f} ms")
print(f"full predict call: median {np.median(tot):.0f} ms, p95 {np.quantile(tot, .95):.0f} ms")
