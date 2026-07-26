"""Grad-CAM heatmap overlay, extracted from train/04_gradcam_diagnostic.ipynb
(validated on wheat — see data/eda_figures/gradcam_wheat_diagnostic.png).
"""
import base64
import io

import numpy as np
import tensorflow as tf
from tensorflow.keras import Model, layers
from tensorflow.keras.applications.efficientnet import preprocess_input
import matplotlib.cm as cm
from PIL import Image

IMG_SIZE = (224, 224)

_grad_models = {}  # (id(backbone), id(head_model)) -> grad_model, built once per crop head


def _last_spatial_layer_name(backbone):
    for layer in reversed(backbone.layers):
        try:
            shape = layer.output.shape
        except AttributeError:
            continue
        if shape is not None and len(shape) == 4:  # spatial (batch, H, W, channels)
            return layer.name
    raise ValueError("No spatial (4D) layer found in backbone")


def _get_grad_model(backbone, head_model):
    key = (id(backbone), id(head_model))
    grad_model = _grad_models.get(key)
    if grad_model is None:
        conv_output = backbone.get_layer(_last_spatial_layer_name(backbone)).output
        gap = layers.GlobalAveragePooling2D()(conv_output)
        final_output = head_model(gap)
        grad_model = Model(inputs=backbone.input, outputs=[conv_output, final_output])
        _grad_models[key] = grad_model
    return grad_model


def generate_gradcam(backbone, head_model, image: Image.Image, class_idx: int) -> str:
    """Return a base64-encoded PNG: `image` (any size) with the Grad-CAM heatmap for
    `class_idx` overlaid, resized to 224x224.
    """
    grad_model = _get_grad_model(backbone, head_model)

    orig = np.array(image.convert("RGB").resize(IMG_SIZE))
    batch = np.expand_dims(preprocess_input(orig.astype(np.float32)), axis=0)

    with tf.GradientTape() as tape:
        conv_outputs, predictions = grad_model(batch)
        loss = predictions[:, class_idx]
    grads = tape.gradient(loss, conv_outputs)
    pooled_grads = tf.reduce_mean(grads, axis=(0, 1, 2))
    conv_outputs = conv_outputs[0]
    heatmap = conv_outputs @ pooled_grads[..., tf.newaxis]
    heatmap = tf.squeeze(heatmap)
    heatmap = tf.maximum(heatmap, 0) / (tf.reduce_max(heatmap) + 1e-8)

    heatmap_resized = tf.image.resize(heatmap[..., tf.newaxis], IMG_SIZE).numpy().squeeze()
    heatmap_colored = cm.jet(heatmap_resized)[:, :, :3] * 255
    overlay = (0.6 * orig + 0.4 * heatmap_colored).astype("uint8")

    buf = io.BytesIO()
    Image.fromarray(overlay).save(buf, format="PNG")
    return base64.b64encode(buf.getvalue()).decode("ascii")


if __name__ == "__main__":
    # ponytail check: tiny fake backbone/head (no imagenet download) exercises the
    # tape/heatmap/overlay/base64 plumbing end-to-end.
    inputs = tf.keras.Input(shape=(224, 224, 3))
    conv = layers.Conv2D(4, 3, padding="same")(inputs)
    fake_backbone = Model(inputs, conv)

    head_inputs = tf.keras.Input(shape=(4,))
    head_outputs = layers.Dense(2, activation="softmax")(head_inputs)
    fake_head = Model(head_inputs, head_outputs)

    img = Image.fromarray((np.random.rand(224, 224, 3) * 255).astype("uint8"))
    png_b64 = generate_gradcam(fake_backbone, fake_head, img, class_idx=0)
    decoded = base64.b64decode(png_b64)
    assert decoded[:8] == b"\x89PNG\r\n\x1a\n"

    print(f"gradcam.py self-check passed ({len(png_b64)} base64 chars)")
