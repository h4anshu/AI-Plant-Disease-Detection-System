# ---- stage 1: build the ONNX files from the tracked Keras weights (TensorFlow lives only in this stage)
FROM python:3.11-slim AS export
WORKDIR /build
COPY requirements.txt requirements-export.txt ./
RUN pip install --no-cache-dir -r requirements.txt -r requirements-export.txt
COPY models/ ./models/
COPY train/export_onnx.py ./train/
RUN python train/export_onnx.py

# ---- stage 2: serving image - ONNX Runtime + numpy, no TensorFlow, no .keras files (docs/SERVING.md)
FROM python:3.11-slim
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1
WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt \
    && useradd --create-home --uid 10001 app

COPY app.py predict.py gate.py gradcam.py severity.py ./
COPY models/model_registry.json models/ood_thresholds.json models/ood_stats.npz ./models/
COPY --from=export /build/models/onnx ./models/onnx
COPY data/label_maps.json ./data/label_maps.json

USER app
EXPOSE 8000

CMD ["uvicorn", "app:app", "--host", "0.0.0.0", "--port", "8000"]
