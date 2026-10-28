"""Flood extent from space: Sentinel-1 radar (VV) around one field, "new water" now versus a dry baseline.
Docs: docs/FIELD_ALERTS.md section 8. Same two halves as field_health.py, so the logic is tested without Earth Engine:
- query(...)      Earth Engine: which radar images exist, then ONE request for the water shares;
- summarize(...)  plain Python: the answer, the flag and the plain-language limits.

How it works, and why (radar sees through cloud, which is why it is used for floods):
- Calm open water reflects the radar beam away, so it is DARK in VV backscatter. A pixel below WATER_DB counts as water.
  (A fixed threshold, not Otsu: inside a 500 m circle that is mostly land, Otsu's two-class split is unstable.)
- Speckle (radar noise) is smoothed with a 30 m median before thresholding.
- "New" water = water now AND not water in the baseline (the median of the images 20 to 120 days earlier).
- Pixels that are never trusted: permanent water (JRC Global Surface Water: water in more than 90% of months), slopes of 5 degrees
  or more (radar shadow looks like water), and anything the radar did not cover.
- Limits that cannot be fixed with these data: a rice paddy that is irrigated reads as water, but then it was water in the baseline too
  unless it was planted in between; flood under a dense canopy or in a city is not seen; a short flood between two passes (every 6 to
  12 days) is missed.
"""
from __future__ import annotations

from datetime import date as Date, timedelta

import ee

S1 = "COPERNICUS/S1_GRD"  # Sentinel-1 ground range detected, 10 m, in dB
GSW = "JRC/GSW1_4/GlobalSurfaceWater"
SRTM = "USGS/SRTMGL1_003"
BUFFER_M = 500  # the area around the field that is judged
SCALE_M = 10
WATER_DB = -16.0  # VV below this is open water (typical values -15 to -20 dB; land is -5 to -12)
SMOOTH_M = 30
PERMANENT_WATER = 90  # JRC occurrence (% of months)
MAX_SLOPE = 5  # degrees
RECENT_DAYS = 12  # an image older than this is not "now" (the satellites pass every 6 to 12 days)
BASE_FROM, BASE_TO = 120, 20  # the baseline: images from 120 to 20 days before "now"
MIN_VALID = 0.5  # at least half the circle must be usable (hills and shadows remove the rest)
POSSIBLE_PCT = 5.0  # share of the usable circle that is new water: ours, a draft until a hydrologist sets them
LIKELY_PCT = 20.0


def _s1(area):
    return (ee.ImageCollection(S1).filterBounds(area).filter(ee.Filter.eq("instrumentMode", "IW"))
            .filter(ee.Filter.listContains("transmitterReceiverPolarisation", "VV")).select("VV"))


def recent_images(lat: float, lon: float, end: Date) -> list[dict]:
    """Dates of the radar images over the field in the last RECENT_DAYS (newest last). One cheap call."""
    area = ee.Geometry.Point([lon, lat]).buffer(BUFFER_M)
    imgs = _s1(area).filterDate((end - timedelta(days=RECENT_DAYS)).isoformat(), (end + timedelta(days=1)).isoformat())
    feats = ee.FeatureCollection(imgs.map(lambda i: ee.Feature(None, {"t": i.get("system:time_start"), "orbit": i.get("orbitProperties_pass")})))
    rows = feats.getInfo()["features"]
    return sorted(({"t": r["properties"]["t"], "orbit": r["properties"]["orbit"]} for r in rows), key=lambda r: r["t"])


def last_image_before(lat: float, lon: float, end: Date) -> str | None:
    """The date of the newest radar image up to `end`, looking back 60 days (for the "no recent image" answer)."""
    area = ee.Geometry.Point([lon, lat]).buffer(BUFFER_M)
    imgs = _s1(area).filterDate((end - timedelta(days=60)).isoformat(), (end + timedelta(days=1)).isoformat())
    t = imgs.aggregate_max("system:time_start").getInfo()
    return None if t is None else Date.fromtimestamp(t / 1000).isoformat()


def query(lat: float, lon: float, end: Date, latest_ms: int) -> dict:
    """ONE request: the shares of the 500 m circle that are usable, water now, and new water, from the radar images of the
    24 hours up to the newest pass `latest_ms` against the median of the baseline window. Returns plain numbers."""
    point = ee.Geometry.Point([lon, lat])
    area = point.buffer(BUFFER_M)
    s1 = _s1(area)
    t = ee.Date(latest_ms)
    now_col = s1.filterDate(t.advance(-1, "day"), t.advance(1, "second"))
    base_col = s1.filterDate(t.advance(-BASE_FROM, "day"), t.advance(-BASE_TO, "day"))
    now_img = now_col.mosaic().focal_median(SMOOTH_M, "circle", "meters")
    base_img = base_col.median().focal_median(SMOOTH_M, "circle", "meters")
    permanent = ee.Image(GSW).select("occurrence").unmask(0).gt(PERMANENT_WATER)
    slope = ee.Terrain.slope(ee.Image(SRTM))
    trusted = permanent.Not().And(slope.lt(MAX_SLOPE))
    valid_now = trusted.updateMask(now_img.mask())
    valid_both = valid_now.updateMask(base_img.mask())
    water_now = now_img.lt(WATER_DB)
    water_base = base_img.lt(WATER_DB)
    new_water = water_now.And(water_base.Not())
    mean = ee.Reducer.mean()

    def share(img, mask):
        return img.updateMask(mask).reduceRegion(mean, area, SCALE_M, maxPixels=1e7).values().get(0)

    result = ee.Dictionary({
        "usable": trusted.unmask(0).updateMask(now_img.mask().unmask(0)).reduceRegion(mean, area, SCALE_M, maxPixels=1e7).values().get(0),
        "water_now": share(water_now, valid_now),
        "new_water": share(new_water, valid_both),
        "baseline_images": base_col.size(),
        "now_images": now_col.size(),
    })
    return result.getInfo()


def summarize(raw: dict | None, *, latest_ms: int | None, end: Date, last_seen: str | None = None) -> dict:
    """The answer. `raw` is query()'s dictionary, or None when no radar image is recent."""
    if raw is None or latest_ms is None:
        return {"status": "no_recent_image", "buffer_m": BUFFER_M, "recent_days": RECENT_DAYS, "last_image": last_seen, "flag": None,
                "limits": LIMITS}
    pct = lambda v: None if v is None else round(100 * float(v), 1)  # noqa: E731
    usable = float(raw.get("usable") or 0)
    now_date = Date.fromtimestamp(latest_ms / 1000).isoformat()
    base = {"status": "ok", "buffer_m": BUFFER_M, "image_date": now_date, "age_days": (end - Date.fromisoformat(now_date)).days,
            "baseline_images": int(raw.get("baseline_images") or 0), "usable_pct": round(100 * usable, 1), "limits": LIMITS}
    new, wet = raw.get("new_water"), raw.get("water_now")
    if usable < MIN_VALID or new is None or not base["baseline_images"]:
        return {**base, "status": "too_little_data", "water_pct": pct(wet), "new_water_pct": None, "flag": None}
    new_pct = pct(new)
    flag = "likely" if new_pct >= LIKELY_PCT else "possible" if new_pct >= POSSIBLE_PCT else "none"
    return {**base, "water_pct": pct(wet), "new_water_pct": new_pct, "flag": flag}


LIMITS = ["radar_misses_canopy_and_town", "irrigated_paddy_reads_as_water", "short_floods_between_passes_are_missed"]
