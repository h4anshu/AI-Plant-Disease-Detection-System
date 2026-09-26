"""geo-service: field health from Sentinel-2 via Earth Engine (docs/FIELD_HEALTH.md).

Internal service: only the Express server calls it (shared secret GEO_SERVICE_TOKEN, like the ML
service). It gets exact coordinates, so it never logs them, and its answer never contains them.
Why a separate service and not part of ml-service: Earth Engine calls take 5-30 s and need their own
library and credentials; inside ml-service they would tie up the CPU-bound diagnosis workers.
"""
import hmac
import json
import logging
import os
import re
import sys
import time
import uuid
from contextlib import asynccontextmanager
from datetime import date as Date, datetime, timedelta, timezone

import ee
import google.auth
from fastapi import FastAPI, Header, HTTPException, Query, Request
from pydantic import BaseModel, Field

import field_health as fh

PROJECT = os.environ.get("EE_PROJECT", "plant-disease-503711")
WORKLOAD_TAG = "field-health"  # EECU usage per tag: Cloud Monitoring, docs/GEE_SETUP.md section 4
_state = {"ee": False}


class JsonFormatter(logging.Formatter):
    def format(self, record):
        entry = {**getattr(record, "fields", {}), "severity": record.levelname, "message": record.getMessage(),
                 "time": datetime.fromtimestamp(record.created, timezone.utc).isoformat(timespec="milliseconds")}
        if record.exc_info:
            entry["stack_trace"] = self.formatException(record.exc_info)
        return json.dumps(entry)


log = logging.getLogger("geo")
_handler = logging.StreamHandler(sys.stdout)
_handler.setFormatter(JsonFormatter())
log.addHandler(_handler)
log.setLevel(logging.INFO)
log.propagate = False
REQUEST_ID = re.compile(r"[\w-]{1,64}")


def init_earth_engine():
    """Application Default Credentials: the service account on Cloud Run, your gcloud login locally.
    No key file anywhere (docs/GEE_SETUP.md section 3)."""
    credentials, _ = google.auth.default(scopes=["https://www.googleapis.com/auth/earthengine",
                                                 "https://www.googleapis.com/auth/cloud-platform"])
    ee.Initialize(credentials, project=PROJECT)
    ee.data.setDefaultWorkloadTag(WORKLOAD_TAG)


@asynccontextmanager
async def lifespan(app: FastAPI):
    try:
        init_earth_engine()
        _state["ee"] = True
    except Exception:  # the service still starts; /field-health answers 503 until credentials work
        log.exception("Earth Engine initialization failed")
    if not os.environ.get("GEO_SERVICE_TOKEN"):
        log.warning("GEO_SERVICE_TOKEN is not set: /field-health accepts calls from anyone")
    yield


app = FastAPI(title="Field health (Earth Engine)", lifespan=lifespan)


@app.get("/health")
def health():
    return {"status": "ok", "earth_engine": _state["ee"]}


class FieldQuery(BaseModel):
    lat: float = Field(ge=-90, le=90)
    lon: float = Field(ge=-180, le=180)
    date: str | None = None  # end of the window, YYYY-MM-DD (default: today)
    days: int = Field(120, ge=30, le=365)
    crop: str | None = Field(None, max_length=32)


# POST is what the Express server uses: coordinates in the body never reach Cloud Run's request logs,
# which record every URL. GET (same answer) is for the notebook and manual checks.
@app.post("/field-health")
def field_health_post(request: Request, q: FieldQuery, x_geo_token: str = Header("")):
    return _field_health(request, q, x_geo_token)


@app.get("/field-health")
def field_health_get(request: Request,
                     lat: float = Query(..., ge=-90, le=90), lon: float = Query(..., ge=-180, le=180),
                     date: str | None = Query(None), days: int = Query(120, ge=30, le=365),
                     crop: str | None = Query(None, max_length=32), x_geo_token: str = Header("")):
    return _field_health(request, FieldQuery(lat=lat, lon=lon, date=date, days=days, crop=crop), x_geo_token)


def _field_health(request: Request, q: FieldQuery, x_geo_token: str):
    lat, lon, date, days, crop = q.lat, q.lon, q.date, q.days, q.crop
    token = os.environ.get("GEO_SERVICE_TOKEN")
    if token and not hmac.compare_digest(x_geo_token.encode(), token.encode()):
        raise HTTPException(status_code=401, detail="unauthorized")
    today = datetime.now(timezone.utc).date()
    try:
        end = min(Date.fromisoformat(date), today) if date else today
    except ValueError:
        raise HTTPException(status_code=400, detail="date must be YYYY-MM-DD")
    start = end - timedelta(days=days)
    if not _state["ee"]:
        raise HTTPException(status_code=503, detail="Earth Engine is not available")

    rid = request.headers.get("x-request-id", "")
    rid = rid if REQUEST_ID.fullmatch(rid) else str(uuid.uuid4())
    with_redsi = crop == "wheat"  # REDSI was developed for wheat yellow rust only
    t0 = time.perf_counter()
    try:
        raw, geometry_source = fh.query_rows(lat, lon, start, end, with_redsi=with_redsi)
    except ee.EEException as err:
        quota = "quota" in str(err).lower() or "too many" in str(err).lower()
        log.warning("Earth Engine call failed", extra={"fields": {"requestId": rid, "quota": quota, "error": str(err)[:300]}})
        raise HTTPException(status_code=503 if quota else 502, detail="Earth Engine error")
    result = fh.summarize(raw, start=start, end=end, geometry_source=geometry_source, with_redsi=with_redsi)
    # never the coordinates; EECU per call is not returned by Earth Engine, so: time + workload tag
    log.info("field health", extra={"fields": {
        "requestId": rid, "workloadTag": WORKLOAD_TAG, "eeLatencyMs": round((time.perf_counter() - t0) * 1000),
        "days": days, "crop": crop, "images": result["images"], "clearImages": result["clear_images"],
        "flag": result["flag"]["code"], "geometrySource": result["geometry_source"]}})
    return result
