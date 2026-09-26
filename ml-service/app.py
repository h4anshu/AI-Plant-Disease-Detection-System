import hmac
import io
import json
import logging
import os
import re
import sys
import time
import uuid
from contextlib import asynccontextmanager
from datetime import datetime, timezone

from fastapi import FastAPI, File, Form, Header, HTTPException, Request, UploadFile
from PIL import Image

from predict import ACTIVE_CROPS, load_models, predict_disease, registry_summary

_state = {}


class JsonFormatter(logging.Formatter):
    """One JSON object per line; Cloud Logging reads severity/message/time, Error Reporting stack_trace."""

    def format(self, record):
        # the reserved keys are written last so a field can never replace the log level or message
        entry = {**getattr(record, "fields", {}), "severity": record.levelname, "message": record.getMessage(),
                 "time": datetime.fromtimestamp(record.created, timezone.utc).isoformat(timespec="milliseconds")}
        if record.exc_info:
            entry["stack_trace"] = self.formatException(record.exc_info)
        return json.dumps(entry)


# never log image bytes, client IPs or tokens (uvicorn's own access log is off: --no-access-log)
log = logging.getLogger("ml")
_handler = logging.StreamHandler(sys.stdout)
_handler.setFormatter(JsonFormatter())
log.addHandler(_handler)
log.setLevel(logging.INFO)
log.propagate = False
REQUEST_ID = re.compile(r"[\w-]{1,64}")


@asynccontextmanager
async def lifespan(app: FastAPI):
    _state["models"] = load_models()  # loaded once, kept in memory for the service's life
    if not os.environ.get("ML_SERVICE_TOKEN"):
        log.warning("ML_SERVICE_TOKEN is not set: /predict-disease accepts calls from anyone (docs/SECURITY.md)")
    yield
    _state.clear()


app = FastAPI(title="Plant Disease Detection ML Service", lifespan=lifespan)


@app.middleware("http")
async def request_log(request: Request, call_next):
    # the Express server forwards the browser's x-request-id, so one id spans client -> server -> here
    rid = request.headers.get("x-request-id", "")
    if not REQUEST_ID.fullmatch(rid):
        rid = str(uuid.uuid4())
    request.state.request_id = rid
    start = time.perf_counter()
    fields = {"requestId": rid, "method": request.method, "path": request.url.path}
    try:
        response = await call_next(request)
    except Exception:
        log.exception("unhandled error", extra={"fields": fields})
        raise
    response.headers["x-request-id"] = rid
    fields.update(status=response.status_code, latencyMs=round((time.perf_counter() - start) * 1000))
    log.info("request", extra={"fields": fields})
    return response


@app.get("/health")
def health():
    return {"status": "ok", "models": registry_summary()}


@app.post("/predict-disease")
async def predict_disease_route(request: Request, file: UploadFile = File(...), crop: str = Form(None),
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
    start = time.perf_counter()
    result = predict_disease(_state["models"], crop, image_bytes)
    log.info("prediction", extra={"fields": {
        "requestId": request.state.request_id, "crop": crop, "status": result.get("status"),
        "disease": result.get("disease"), "confidence": result.get("confidence"),
        "diseaseSeverity": result.get("severity"),  # not "severity": that key is the log level
        "oodScore": result.get("ood_score"), "reasons": result.get("reasons"),
        "modelVersion": result.get("model_version"), "inferenceMs": round((time.perf_counter() - start) * 1000)}})
    return result
