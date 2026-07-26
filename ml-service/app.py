from contextlib import asynccontextmanager

from fastapi import FastAPI, File, Form, HTTPException, UploadFile

from predict import ACTIVE_CROPS, load_models, predict_disease

_models = {}


@asynccontextmanager
async def lifespan(app: FastAPI):
    backbone, heads, label_maps = load_models()  # loaded once, kept in memory for the service's life
    _models["backbone"] = backbone
    _models["heads"] = heads
    _models["label_maps"] = label_maps
    yield
    _models.clear()


app = FastAPI(title="Plant Disease Detection ML Service", lifespan=lifespan)


@app.get("/health")
def health():
    return {"status": "ok"}


@app.post("/predict-disease")
async def predict_disease_route(file: UploadFile = File(...), crop: str = Form(None)):
    if crop not in ACTIVE_CROPS:
        raise HTTPException(status_code=400, detail=f"crop must be one of {ACTIVE_CROPS}")

    image_bytes = await file.read()
    return predict_disease(_models["backbone"], _models["heads"], _models["label_maps"], crop, image_bytes)
