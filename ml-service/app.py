import hmac
import io
import logging
import os
from contextlib import asynccontextmanager

from fastapi import FastAPI, File, Form, Header, HTTPException, UploadFile
from PIL import Image

from predict import ACTIVE_CROPS, load_models, predict_disease, registry_summary

_state = {}


@asynccontextmanager
async def lifespan(app: FastAPI):
    _state["models"] = load_models()  # loaded once, kept in memory for the service's life
    if not os.environ.get("ML_SERVICE_TOKEN"):
        logging.warning("ML_SERVICE_TOKEN is not set: /predict-disease accepts calls from anyone (docs/SECURITY.md)")
    yield
    _state.clear()


app = FastAPI(title="Plant Disease Detection ML Service", lifespan=lifespan)


@app.get("/health")
def health():
    return {"status": "ok", "models": registry_summary()}


@app.post("/predict-disease")
async def predict_disease_route(file: UploadFile = File(...), crop: str = Form(None),
                                x_ml_token: str = Header("")):
    # only the Express server knows the shared secret; unset = open (local dev and tests)
    token = os.environ.get("ML_SERVICE_TOKEN")
    if token and not hmac.compare_digest(x_ml_token.encode(), token.encode()):
        raise HTTPException(status_code=401, detail="unauthorized")
    if crop not in ACTIVE_CROPS:
        raise HTTPException(status_code=400, detail=f"crop must be one of {ACTIVE_CROPS}")

    image_bytes = await file.read()
    try:
        Image.open(io.BytesIO(image_bytes)).verify()  # header/structure check only, cheap
    except Exception:
        raise HTTPException(status_code=415, detail="file is not a readable image")
    return predict_disease(_state["models"], crop, image_bytes)
