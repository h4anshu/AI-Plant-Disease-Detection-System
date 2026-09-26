import io
from contextlib import asynccontextmanager

from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from PIL import Image

from predict import ACTIVE_CROPS, load_models, predict_disease, registry_summary

_state = {}


@asynccontextmanager
async def lifespan(app: FastAPI):
    _state["models"] = load_models()  # loaded once, kept in memory for the service's life
    yield
    _state.clear()


app = FastAPI(title="Plant Disease Detection ML Service", lifespan=lifespan)


@app.get("/health")
def health():
    return {"status": "ok", "models": registry_summary()}


@app.post("/predict-disease")
async def predict_disease_route(file: UploadFile = File(...), crop: str = Form(None)):
    if crop not in ACTIVE_CROPS:
        raise HTTPException(status_code=400, detail=f"crop must be one of {ACTIVE_CROPS}")

    image_bytes = await file.read()
    try:
        Image.open(io.BytesIO(image_bytes)).verify()  # header/structure check only, cheap
    except Exception:
        raise HTTPException(status_code=415, detail="file is not a readable image")
    return predict_disease(_state["models"], crop, image_bytes)
