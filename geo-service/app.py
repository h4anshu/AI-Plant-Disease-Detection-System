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

import context as cx
import field_health as fh

PROJECT = os.environ.get("EE_PROJECT", "plant-disease-503711")
WORKLOAD_TAG = "field-health"  # EECU usage per tag: Cloud Monitoring, docs/GEE_SETUP.md section 4
CONTEXT_TAG = "context"
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


def _check_token(x_geo_token: str):
    token = os.environ.get("GEO_SERVICE_TOKEN")
    if token and not hmac.compare_digest(x_geo_token.encode(), token.encode()):
        raise HTTPException(status_code=401, detail="unauthorized")


def _request_id(request: Request) -> str:
    rid = request.headers.get("x-request-id", "")
    return rid if REQUEST_ID.fullmatch(rid) else str(uuid.uuid4())


def _ee_error(err: Exception, rid: str, what: str):
    """Quota / rate limits -> 503 (try later), anything else from Earth Engine -> 502. Never the coordinates."""
    quota = "quota" in str(err).lower() or "too many" in str(err).lower()
    log.warning(f"Earth Engine call failed ({what})", extra={"fields": {"requestId": rid, "quota": quota, "error": str(err)[:300]}})
    raise HTTPException(status_code=503 if quota else 502, detail="Earth Engine error")


def _field_health(request: Request, q: FieldQuery, x_geo_token: str):
    lat, lon, date, days, crop = q.lat, q.lon, q.date, q.days, q.crop
    _check_token(x_geo_token)
    today = datetime.now(timezone.utc).date()
    try:
        end = min(Date.fromisoformat(date), today) if date else today
    except ValueError:
        raise HTTPException(status_code=400, detail="date must be YYYY-MM-DD")
    start = end - timedelta(days=days)
    if not _state["ee"]:
        raise HTTPException(status_code=503, detail="Earth Engine is not available")

    rid = _request_id(request)
    with_redsi = crop == "wheat"  # REDSI was developed for wheat yellow rust only
    t0 = time.perf_counter()
    try:
        raw, geometry_source, field_farmland = fh.query_rows(lat, lon, start, end, with_redsi=with_redsi, crop=crop)
    except ee.EEException as err:
        _ee_error(err, rid, "field health")
    result = fh.summarize(raw, start=start, end=end, geometry_source=geometry_source, with_redsi=with_redsi,
                          field_farmland=field_farmland)
    # never the coordinates; EECU per call is not returned by Earth Engine, so: time + workload tag
    log.info("field health", extra={"fields": {
        "requestId": rid, "workloadTag": WORKLOAD_TAG, "eeLatencyMs": round((time.perf_counter() - t0) * 1000),
        "days": days, "crop": crop, "images": result["images"], "clearImages": result["clear_images"],
        "flag": result["flag"]["code"], "geometrySource": result["geometry_source"]}})
    return result


class ContextQuery(BaseModel):
    lat: float = Field(ge=-90, le=90)
    lon: float = Field(ge=-180, le=180)
    soil: bool = True
    rain_ref: str | None = None  # reference date: rainfall of the 30 days before it vs 2001-2020
    era5_start: str | None = None  # ERA5-Land daily weather for [start, end], when Open-Meteo can't cover it
    era5_end: str | None = None


def _day(value: str | None, name: str) -> Date | None:
    if value is None:
        return None
    try:
        return Date.fromisoformat(value)
    except ValueError:
        raise HTTPException(status_code=400, detail=f"{name} must be YYYY-MM-DD")


# Context for a checkup (docs/CONTEXT_LAYER.md): SoilGrids soil, the rainfall anomaly and optional ERA5-Land
# days, in ONE Earth Engine request (+ a once-a-day lookup of the newest CHIRPS / ERA5-Land dates).
# POST only: the location stays out of Cloud Run's request logs.
@app.post("/context")
def context(request: Request, q: ContextQuery, x_geo_token: str = Header("")):
    _check_token(x_geo_token)
    rain_ref, start, end = _day(q.rain_ref, "rain_ref"), _day(q.era5_start, "era5_start"), _day(q.era5_end, "era5_end")
    if (start is None) != (end is None) or (start and (end < start or (end - start).days > 60)):
        raise HTTPException(status_code=400, detail="era5_start and era5_end must both be set, at most 60 days apart")
    if not _state["ee"]:
        raise HTTPException(status_code=503, detail="Earth Engine is not available")
    rid = _request_id(request)
    t0 = time.perf_counter()
    try:
        with ee.data.workloadTagContext(CONTEXT_TAG):
            latest = cx.latest_dates() if rain_ref else {}
            result = cx.query(q.lat, q.lon, soil=q.soil, rain_ref=rain_ref, era5=(start, end) if start else None, latest=latest)
    except ee.EEException as err:
        _ee_error(err, rid, "context")
    log.info("context", extra={"fields": {
        "requestId": rid, "workloadTag": CONTEXT_TAG, "eeLatencyMs": round((time.perf_counter() - t0) * 1000),
        "parts": result["parts"], "soil": result["soil"] is not None,
        "rain": (result["rain_anomaly"] or {}).get("status"), "era5Days": len(result["era5"] or [])}})
    return result
