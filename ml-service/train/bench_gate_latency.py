"""CPU latency added by the quality + OOD gate (docs/OOD_GATE.md). Run from ml-service/:
    ../.venv/Scripts/python.exe train/bench_gate_latency.py
Times, per image, the gate's own work (quality metrics + OOD score) and the full predict_disease call."""
import io
import sys
import time
from pathlib import Path

import numpy as np
from PIL import Image

ML = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ML))
from predict import ACTIVE_CROPS, IMG_SIZE, embed, load_models, predict_disease  # noqa: E402

models = load_models()
label_maps, gate = models.label_maps, models.gate
rng = np.random.default_rng(0)
samples = []
for crop in ACTIVE_CROPS:
    files = [p for d in (ML / "data" / "test" / crop).iterdir() if d.name in label_maps[crop] for p in d.iterdir()]
    samples += [(crop, files[i].read_bytes()) for i in rng.choice(len(files), 5, replace=False)]

predict_disease(models, *samples[0])  # warm-up
gate_ms, total_ms = [], []
for crop, raw in samples:
    image = Image.open(io.BytesIO(raw)).convert("RGB")
    resized = image.resize(IMG_SIZE)
    feats = embed(models, np.expand_dims(np.array(resized), 0))[0]
    t = time.perf_counter()
    gate.check_quality(image, resized)
    gate.ood(crop, feats)
    gate_ms.append((time.perf_counter() - t) * 1000)
    t = time.perf_counter()
    predict_disease(models, crop, raw)
    total_ms.append((time.perf_counter() - t) * 1000)

g, tot = np.array(gate_ms), np.array(total_ms)
print(f"images: {len(samples)} (5 per crop)")
print(f"gate added work  : median {np.median(g):.1f} ms, p95 {np.quantile(g, .95):.1f} ms, max {g.max():.1f} ms")
print(f"full predict call: median {np.median(tot):.0f} ms, p95 {np.quantile(tot, .95):.0f} ms")
