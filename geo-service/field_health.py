"""Field health from space: Sentinel-2 NDVI / NDRE (and REDSI for wheat) of one field, compared with the
cropland around it. Every choice is explained in docs/FIELD_HEALTH.md; the comments here say *why*.

Two halves, so the logic can be tested without Earth Engine:
- query_rows(...)  builds ONE Earth Engine request and returns its raw result (a FeatureCollection dict,
                   one feature per Sentinel-2 image);
- summarize(...)   plain Python: merges same-day tiles, drops cloudy dates, compares with the
                   neighbours and writes the plain-language flag.
"""
from __future__ import annotations

from datetime import date as Date, timedelta

import ee

S2 = "COPERNICUS/S2_SR_HARMONIZED"  # Sentinel-2 surface reflectance, 10 m, ~5-day revisit, offsets harmonized
WORLDCOVER = "ESA/WorldCover/v200"  # ESA WorldCover 2021, 10 m land cover
CROPLAND = 40  # WorldCover class "Cropland"

# Sentinel-2 Scene Classification (SCL) classes counted as a clear view of the ground:
# 4 vegetation, 5 bare soil, 6 water (a flooded paddy is still the field), 7 unclassified.
# Everything else is not trusted: 0 no data, 1 saturated/defective, 2 dark area, 3 cloud shadow,
# 8/9 cloud (medium/high probability), 10 thin cirrus, 11 snow.
CLEAR_SCL = [4, 5, 6, 7]
MIN_CLEAR = 0.60  # a date is used only if >= 60% of the field's pixels are clear

FIELD_RADIUS_M = 30  # without a field boundary: a 30 m circle (~0.28 ha, ~28 Sentinel-2 pixels)
RING_INNER_M = 100  # neighbourhood ring starts 100 m out: pixels right next to the point are often the same field
RING_OUTER_M = 1000  # ... and ends at 1 km
MIN_RING_PIXELS = 50  # need >= 50 clear cropland pixels (0.5 ha) around the field for a fair comparison
SCALE_M = 10

BELOW_Z = -1.0  # "below neighbours": robust z-score <= -1 (field NDVI under the neighbours' 16th percentile, roughly)
ABOVE_Z = 1.0
STALE_DAYS = 20  # no clear image for 20+ days: the comparison may be out of date (typical in kharif)


# --- Earth Engine side -------------------------------------------------------------------------------

def field_geometry(lat: float, lon: float):
    """(geometry, source). The ALU field-boundary API needs an allow-listed Workspace account
    (docs/GEE_SETUP.md section 5); until a key is configured the field is a 30 m circle and says so."""
    return ee.Geometry.Point([lon, lat]).buffer(FIELD_RADIUS_M), "buffer_30m"


def _indices(img, with_redsi: bool):
    # NDVI = (NIR - Red) / (NIR + Red) with B8 (842 nm, 10 m) and B4 (665 nm, 10 m): green biomass.
    ndvi = img.normalizedDifference(["B8", "B4"]).rename("ndvi")
    # NDRE = (NIR narrow - RedEdge1) / (NIR narrow + RedEdge1) with B8A (865 nm) and B5 (705 nm), both
    # 20 m: chlorophyll; keeps changing in dense canopies where NDVI saturates.
    ndre = img.normalizedDifference(["B8A", "B5"]).rename("ndre")
    bands = [ndvi, ndre]
    if with_redsi:
        # REDSI (Zheng et al., Sensors 2018, 18(3):868, eq. 5), lower = more yellow rust stress:
        # ((705-665) * (R783 - R665) - (783-665) * (R705 - R665)) / (2 * R665), with B7 = 783, B5 = 705, B4 = 665.
        # Reflectance scale cancels out (numerator and denominator are both linear in reflectance).
        redsi = img.expression(
            "((705.0 - 665.0) * (B7 - B4) - (783.0 - 665.0) * (B5 - B4)) / (2.0 * B4)",
            {"B4": img.select("B4"), "B5": img.select("B5"), "B7": img.select("B7")},
        ).rename("redsi")
        bands.append(redsi)
    return ee.Image.cat(bands)


def query_rows(lat: float, lon: float, start: Date, end: Date, with_redsi: bool = False) -> tuple[dict, str]:
    """One Earth Engine request: per Sentinel-2 image, the field's clear fraction and mean indices, and
    the neighbourhood's cropland percentiles. Returns (getInfo() FeatureCollection dict, geometry source)."""
    field, source = field_geometry(lat, lon)
    point = ee.Geometry.Point([lon, lat])
    ring = point.buffer(RING_OUTER_M).difference(point.buffer(RING_INNER_M), 1)
    cropland = ee.ImageCollection(WORLDCOVER).first().select("Map").eq(CROPLAND)
    names = ["ndvi", "ndre"] + (["redsi"] if with_redsi else [])
    ring_reducer = ee.Reducer.percentile([25, 50, 75]).combine(ee.Reducer.count(), sharedInputs=True)

    def per_image(img):
        clear = img.select("SCL").remap(CLEAR_SCL, [1] * len(CLEAR_SCL), 0).rename("clear")
        idx = _indices(img, with_redsi)
        field_stats = clear.addBands(idx.updateMask(clear)).reduceRegion(
            ee.Reducer.mean(), field, SCALE_M, maxPixels=1e6)
        ring_stats = idx.select(names).updateMask(clear.And(cropland)).reduceRegion(
            ring_reducer, ring, SCALE_M, maxPixels=1e7)
        return (ee.Feature(None, field_stats).set(ring_stats)
                .set("date", img.date().format("YYYY-MM-dd")).set("cloud_pct", img.get("CLOUDY_PIXEL_PERCENTAGE")))

    images = (ee.ImageCollection(S2).filterBounds(field)
              .filterDate(start.isoformat(), (end + timedelta(days=1)).isoformat()))
    return ee.FeatureCollection(images.map(per_image)).getInfo(), source


# --- Plain Python side (tested with mocked Earth Engine output) ---------------------------------------

def _num(v):
    return None if v is None else float(v)


def _robust_z(value, p25, p50, p75):
    """(field - neighbours' median) / (IQR / 1.349). IQR/1.349 estimates the standard deviation without
    being thrown off by a few odd pixels (roads, trees at field edges)."""
    if None in (value, p25, p50, p75) or p75 <= p25:
        return None
    return (value - p50) / ((p75 - p25) / 1.349)


def summarize(raw: dict, *, start: Date, end: Date, geometry_source: str, with_redsi: bool = False) -> dict:
    by_date: dict[str, dict] = {}
    for feature in raw.get("features", []):
        p = feature.get("properties", {})
        row = {
            "date": p["date"],
            "clear_fraction": round(_num(p.get("clear")) or 0.0, 3),
            "ndvi": _num(p.get("ndvi")),
            "ndre": _num(p.get("ndre")),
            "neighbours": {
                "pixels": int(p.get("ndvi_count") or 0),
                "ndvi": [_num(p.get(f"ndvi_p{q}")) for q in (25, 50, 75)],
                "ndre": [_num(p.get(f"ndre_p{q}")) for q in (25, 50, 75)],
            },
        }
        if with_redsi:
            row["redsi"] = _num(p.get("redsi"))
            row["neighbours"]["redsi"] = [_num(p.get(f"redsi_p{q}")) for q in (25, 50, 75)]
        # neighbouring Sentinel-2 tiles overlap: one pass can appear twice. Keep the clearer view.
        if row["date"] not in by_date or row["clear_fraction"] > by_date[row["date"]]["clear_fraction"]:
            by_date[row["date"]] = row

    series = []
    for row in sorted(by_date.values(), key=lambda r: r["date"]):
        row["used"] = row["clear_fraction"] >= MIN_CLEAR and row["ndvi"] is not None
        nb = row["neighbours"]
        nb["enough"] = nb["pixels"] >= MIN_RING_PIXELS
        z = _robust_z(row["ndvi"], *nb["ndvi"]) if row["used"] and nb["enough"] else None
        row["z"] = None if z is None else round(z, 2)
        for k in ("ndvi", "ndre", "redsi"):
            if row.get(k) is not None:
                row[k] = round(row[k], 4)
        for k in ("ndvi", "ndre", "redsi"):
            if k in nb:
                nb[k] = [None if v is None else round(v, 4) for v in nb[k]]
        series.append(row)

    used = [r for r in series if r["used"]]
    last_clear = used[-1]["date"] if used else None
    stale = last_clear is None or (end - Date.fromisoformat(last_clear)).days > STALE_DAYS
    flag = _flag(used)
    flag["stale"] = stale
    return {
        "window": {"start": start.isoformat(), "end": end.isoformat()},
        "geometry_source": geometry_source,
        "images": len(series),
        "clear_images": len(used),
        "last_clear_date": last_clear,
        "latest": ({k: used[-1][k] for k in ("date", "ndvi", "ndre", "z")} if used else None),
        "flag": flag,
        "summary": _summary(flag, last_clear, end),
        "series": series,
        "method": {
            "ndvi": "(B8 - B4) / (B8 + B4)",
            "ndre": "(B8A - B5) / (B8A + B5)",
            **({"redsi": "((705-665)*(B7-B4) - (783-665)*(B5-B4)) / (2*B4)  [experimental, wheat]"} if with_redsi else {}),
            "clear_scl_classes": CLEAR_SCL, "min_clear_fraction": MIN_CLEAR,
            "neighbourhood": f"ESA WorldCover cropland pixels {RING_INNER_M}-{RING_OUTER_M} m around the field",
            "z": "(field NDVI - neighbours' median) / (IQR / 1.349)", "below_z": BELOW_Z,
        },
    }


def _flag(used: list[dict]) -> dict:
    """below   = the last 2+ comparable clear dates are all <= BELOW_Z (since = the first of that run)
    below_once = only the latest one is (wait for the next clear image to confirm)
    above / normal by the latest comparable date; no_clear / no_neighbours when there is nothing to compare."""
    if not used:
        return {"code": "no_clear", "since": None}
    comparable = [r for r in used if r["z"] is not None]
    if not comparable:
        return {"code": "no_neighbours", "since": None}
    run = []
    for r in reversed(comparable):
        if r["z"] > BELOW_Z:
            break
        run.append(r)
    if len(run) >= 2:
        return {"code": "below", "since": run[-1]["date"]}
    if len(run) == 1:
        return {"code": "below_once", "since": run[0]["date"]}
    latest = comparable[-1]
    return {"code": "above" if latest["z"] >= ABOVE_Z else "normal", "since": None}


def _summary(flag: dict, last_clear: str | None, end: Date) -> str:
    text = {
        "below": f"Below neighbours since {flag['since']}.",
        "below_once": f"Below neighbours on {flag['since']}; wait for the next clear image to confirm.",
        "normal": "In line with nearby fields.",
        "above": "Greener than nearby fields.",
        "no_neighbours": "Not enough clear farmland nearby to compare with.",
        "no_clear": "No clear satellite view in this period (clouds).",
    }[flag["code"]]
    if flag["code"] != "no_clear" and flag["stale"] and last_clear:
        text += f" No clear image since {last_clear}, so this may be out of date."
    return text
