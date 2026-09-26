"""Build the ONNX files the service runs on, from the tracked Keras weights (docs/SERVING.md).

    cd ml-service && pip install -r requirements-export.txt && python train/export_onnx.py

Writes (git-ignored, rebuilt in the Docker build stage):
  models/onnx/backbone.onnx      image (N,224,224,3 float 0-255) -> features (N,1280), conv (N,7,7,1280)
  models/onnx/heads/<crop>.onnx  features (N,1280) -> probs (N,K)
  models/onnx/head_weights.npz   <crop>/{w1,b1,w2,b2} for the OOD gate and Grad-CAM (numpy)
Each .onnx carries the sha256 of the .keras it came from; predict.py refuses to start if that
no longer matches models/model_registry.json (stale export).
"""
import hashlib
import json
import sys
from pathlib import Path

import numpy as np
import onnx
import tensorflow as tf
import tf2onnx
from tensorflow import keras

ML = Path(__file__).resolve().parents[1]
MODELS = ML / "models"
OUT = MODELS / "onnx"
OPSET = 17


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def tag(model_proto, source: Path, version: str):
    for k, v in (("source_file", source.relative_to(MODELS).as_posix()), ("source_sha256", sha256(source)),
                 ("model_version", version)):
        entry = model_proto.metadata_props.add()
        entry.key, entry.value = k, v
    return model_proto


def rename_outputs(proto, rule):
    """tf2onnx names outputs after Keras layers (dense_13, top_activation...); give them stable names."""
    for out in proto.graph.output:
        new = rule(out)
        for node in proto.graph.node:
            node.output[:] = [new if o == out.name else o for o in node.output]
            node.input[:] = [new if i == out.name else i for i in node.input]
        out.name = new
    return proto


def last_spatial_layer(model):
    for layer in reversed(model.layers):
        shape = getattr(layer, "output", None)
        if shape is not None and len(layer.output.shape) == 4:
            return layer
    raise ValueError("no 4-D layer in backbone")


def main():
    registry = json.loads((MODELS / "model_registry.json").read_text(encoding="utf-8"))
    (OUT / "heads").mkdir(parents=True, exist_ok=True)

    # backbone: features for classification + last conv map for Grad-CAM, in one forward pass
    bb_entry = registry["backbone"]
    bb_path = MODELS / bb_entry["file"]
    backbone = keras.models.load_model(bb_path)
    conv_layer = last_spatial_layer(backbone)
    both = keras.Model(backbone.input, {"features": backbone.output, "conv": conv_layer.output})
    spec = (tf.TensorSpec((None, 224, 224, 3), tf.float32, name="image"),)
    # from_keras freezes the normalisation layer's mean/variance; from_function left them as graph inputs
    proto, _ = tf2onnx.convert.from_keras(both, input_signature=spec, opset=OPSET)
    assert [i.name for i in proto.graph.input] == ["image"], [i.name for i in proto.graph.input]
    rank = lambda o: len(o.type.tensor_type.shape.dim)
    rename_outputs(proto, lambda o: "conv" if rank(o) == 4 else "features")
    onnx.save(tag(proto, bb_path, bb_entry["version"]), OUT / "backbone.onnx")
    print(f"backbone.onnx  (conv output = {conv_layer.name})")

    weights = {}
    hspec = (tf.TensorSpec((None, 1280), tf.float32, name="features"),)
    for crop, entry in registry["heads"].items():
        path = MODELS / entry["file"]
        head = keras.models.load_model(path)

        named = keras.Model(head.input, {"probs": head.output})
        proto, _ = tf2onnx.convert.from_keras(named, input_signature=hspec, opset=OPSET)
        rename_outputs(proto, lambda o: "probs")
        onnx.save(tag(proto, path, entry["version"]), OUT / "heads" / f"{crop}.onnx")
        dense = [l for l in head.layers if l.__class__.__name__ == "Dense"]
        (w1, b1), (w2, b2) = dense[0].get_weights(), dense[-1].get_weights()
        weights.update({f"{crop}/w1": w1, f"{crop}/b1": b1, f"{crop}/w2": w2, f"{crop}/b2": b2,
                        f"{crop}/source_sha256": np.array(sha256(path))})
        print(f"heads/{crop}.onnx")
    np.savez(OUT / "head_weights.npz", **weights)
    size = sum(p.stat().st_size for p in OUT.rglob("*") if p.is_file())
    print(f"done: {size / 1e6:.1f} MB in models/onnx/")


if __name__ == "__main__":
    sys.exit(main())
