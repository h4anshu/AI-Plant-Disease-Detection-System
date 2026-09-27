"""Context for a checkup (docs/CONTEXT_LAYER.md): modelled soil, the rainfall anomaly and, when the server
asks for it, ERA5-Land daily weather. Same split as field_health.py:
- the *_request() functions build Earth Engine objects; query() sends ONE getInfo() for all asked parts;
- the summarize_*() functions are plain Python over the raw numbers and are tested without Earth Engine.
Sources (catalogue sheet "Context Data Sources"): CX-06 SoilGrids, CX-03 CHIRPS, CX-02 ERA5-Land, via CX-11.
"""
from __future__ import annotations

import math
from datetime import date as Date, datetime, timedelta, timezone

import ee

# --- soil: SoilGrids 250 m v2.0 (CX-06), Earth Engine community assets -------------------------------
# ISRIC stores integers; dividing by the conversion factor gives conventional units (ISRIC SoilGrids FAQ,
# https://docs.isric.org/globaldata/soilgrids/SoilGrids_faqs_01.html, "Mapped units / Conversion factor").
SOIL = {  # property: (output name, conversion factor, conventional unit)
    "phh2o": ("phH2O", 10, "pH"),
    "nitrogen": ("nitrogenGkg", 100, "g/kg"),  # TOTAL nitrogen, not the "available N" of Indian soil tests
    "soc": ("socGkg", 10, "g/kg"),
    "clay": ("clayPct", 10, "%"),
    "sand": ("sandPct", 10, "%"),
    "silt": ("siltPct", 10, "%"),
    "cec": ("cecCmolKg", 10, "cmol(c)/kg"),
    "bdod": ("bdodKgDm3", 100, "kg/dm3"),
}
DEPTHS = [("0-5", 5), ("5-15", 10), ("15-30", 15)]  # (label, thickness in cm) for the 0-30 cm weighted mean
SOIL_SCALE_M = 250


def soil_request(point):
    bands = [ee.Image(f"projects/soilgrids-isric/{p}_mean").select([f"{p}_{d}cm_mean" for d, _ in DEPTHS])
             for p in SOIL]
    return ee.Image.cat(bands).reduceRegion(ee.Reducer.first(), point, SOIL_SCALE_M)


def usda_texture(clay: float, sand: float, silt: float) -> str | None:
    """The 12 USDA texture classes, word for word from the Soil Survey Manual (USDA Handbook 18, 2017),
    ch. 3 "Definitions of Soil Texture Classes and Subclasses" (pp. 122-123). Percentages of the < 2 mm fraction."""
    if None in (clay, sand, silt):
        return None
    if sand > 85 and silt + 1.5 * clay < 15:
        return "sand"
    if 70 <= sand <= 90 and silt + 1.5 * clay >= 15 and silt + 2 * clay < 30:
        return "loamy sand"
    if (7 <= clay < 20 and sand > 52 and silt + 2 * clay >= 30) or (clay < 7 and silt < 50 and silt + 2 * clay >= 30):
        return "sandy loam"
    if 7 <= clay < 27 and 28 <= silt < 50 and sand <= 52:
        return "loam"
    if (silt >= 50 and 12 <= clay < 27) or (50 <= silt < 80 and clay < 12):
        return "silt loam"
    if silt >= 80 and clay < 12:
        return "silt"
    if 20 <= clay < 35 and silt < 28 and sand > 45:
        return "sandy clay loam"
    if 27 <= clay < 40 and 20 < sand <= 45:
        return "clay loam"
    if 27 <= clay < 40 and sand <= 20:
        return "silty clay loam"
    if clay >= 35 and sand > 45:
        return "sandy clay"
    if clay >= 40 and silt >= 40:
        return "silty clay"
    if clay >= 40 and sand <= 45 and silt < 40:
        return "clay"
    return None  # on a boundary the rounded model values miss; said so rather than guessed


def summarize_soil(raw: dict | None) -> dict | None:
    """Integer SoilGrids values -> conventional units per depth, the 0-30 cm thickness-weighted mean and
    the texture class. None when the point has no soil data (water, city, outside the map)."""
    if not raw or all(v is None for v in raw.values()):
        return None
    depths = {d: {} for d, _ in DEPTHS}
    for prop, (name, factor, _) in SOIL.items():
        for d, _ in DEPTHS:
            v = raw.get(f"{prop}_{d}cm_mean")
            depths[d][name] = None if v is None else round(v / factor, 2)
    top = {}
    for prop, (name, _, _) in SOIL.items():
        vals = [(depths[d][name], w) for d, w in DEPTHS]
        top[name] = None if any(v is None for v, _ in vals) else round(sum(v * w for v, w in vals) / 30, 2)
    return {
        "depths": depths,
        "topsoil0to30": top,
        "units": {name: unit for name, _, unit in SOIL.values()},
        "texture": usda_texture(top["clayPct"], top["sandPct"], top["siltPct"]),
        "textureMethod": "USDA Soil Survey Manual (2017) ch. 3 texture class definitions",
        "label": "modelled at 250 m (SoilGrids), not a soil test of this field",
    }


# --- rainfall anomaly: CHIRPS daily (CX-03), else ERA5-Land (CX-02) ----------------------------------
CHIRPS = "UCSB-CHG/CHIRPS/DAILY"
ERA5 = "ECMWF/ERA5_LAND/DAILY_AGGR"
BASELINE = (2001, 2020)
ANOMALY_DAYS = 30
ERA5_MAX_LAG_DAYS = 10  # the ERA5 window's last day may be at most this many days before the reference date
CHIRPS_SCALE_M = 5566  # 0.05 deg
ERA5_SCALE_M = 11132  # 0.1 deg


def _same_day_in(year: int, d: Date) -> Date:
    return d.replace(year=year) if not (d.month == 2 and d.day == 29) else Date(year, 2, 28)


def rain_window(ref: Date, latest: dict) -> dict:
    """Which source and dates to use for the 30 days before `ref` (decision R2 in docs/CONTEXT_LAYER_PLAN.md):
    CHIRPS if it covers the window; otherwise ERA5-Land ending at its latest day if that is at most
    ERA5_MAX_LAG_DAYS before `ref`; otherwise unknown."""
    end = ref  # exclusive: the 30 days are ref-30 .. ref-1
    if latest.get("chirps") and Date.fromisoformat(latest["chirps"]) >= end - timedelta(days=1):
        return {"source": "chirps", "start": end - timedelta(days=ANOMALY_DAYS), "end": end}
    if latest.get("era5"):
        last_day = min(end - timedelta(days=1), Date.fromisoformat(latest["era5"]))
        if (ref - last_day).days <= ERA5_MAX_LAG_DAYS:
            era5_end = last_day + timedelta(days=1)
            return {"source": "era5-land", "start": era5_end - timedelta(days=ANOMALY_DAYS), "end": era5_end}
    return {"source": None, "reason": f"rainfall data ends {latest.get('chirps')} (CHIRPS) / {latest.get('era5')} (ERA5-Land)"}


MM_PER_UNIT = {"chirps": 1.0, "era5-land": 1000.0}  # CHIRPS is mm/day; ERA5-Land precipitation is in metres


def _rain_image(source: str):
    if source == "chirps":
        return ee.ImageCollection(CHIRPS).select("precipitation"), CHIRPS_SCALE_M, "precipitation"
    # ERA5-Land precipitation can be slightly negative (catalogue note CX-02): clip each day at 0
    return (ee.ImageCollection(ERA5).select("total_precipitation_sum").map(lambda i: i.max(0).copyProperties(i, ["system:time_start"])),
            ERA5_SCALE_M, "total_precipitation_sum")


def rain_request(point, window: dict):
    coll, scale, band = _rain_image(window["source"])

    def total(start: Date, end: Date):
        c = coll.filterDate(start.isoformat(), end.isoformat())
        return ee.Dictionary({"sum": c.sum().reduceRegion(ee.Reducer.first(), point, scale).get(band), "n": c.size()})

    years = range(BASELINE[0], BASELINE[1] + 1)
    return ee.Dictionary({
        "recent": total(window["start"], window["end"]),
        "baseline": ee.List([total(_same_day_in(y, window["start"]), _same_day_in(y, window["start"]) + timedelta(days=ANOMALY_DAYS))
                             for y in years]),
    })


def summarize_rain(raw: dict | None, window: dict) -> dict:
    if window.get("source") is None:
        return {"status": "unknown", "source": None, "reason": window["reason"]}
    scale = MM_PER_UNIT[window["source"]]
    recent, base = raw["recent"], raw["baseline"]
    # every day of the window must be there, in the recent window and in every baseline year
    if recent["n"] < ANOMALY_DAYS or recent["sum"] is None:
        return {"status": "unknown", "source": window["source"], "reason": f"only {recent['n']} of {ANOMALY_DAYS} days available"}
    if any(b["n"] < ANOMALY_DAYS - 1 or b["sum"] is None for b in base):  # -1: a Feb 29 window
        return {"status": "unknown", "source": window["source"], "reason": "baseline years incomplete"}
    rain = recent["sum"] * scale
    normal = sum(b["sum"] for b in base) / len(base) * scale
    return {
        "status": "ok", "source": window["source"],
        "windowStart": window["start"].isoformat(), "windowEnd": (window["end"] - timedelta(days=1)).isoformat(),
        "rainMm": round(rain, 1), "normalMm": round(normal, 1),
        "percentOfNormal": None if normal <= 0 else round(100 * rain / normal),
        "baseline": f"{BASELINE[0]}-{BASELINE[1]}",
    }


# --- ERA5-Land daily weather (CX-02), when Open-Meteo cannot cover the window -------------------------
ERA5_BANDS = ["temperature_2m", "temperature_2m_min", "temperature_2m_max", "dewpoint_temperature_2m", "total_precipitation_sum"]


def era5_request(point, start: Date, end: Date):
    """Daily values at the point for [start, end] as parallel lists (a FeatureCollection nested in a
    Dictionary loses its features in getInfo(), see field_health.py)."""
    c = ee.ImageCollection(ERA5).filterDate(start.isoformat(), (end + timedelta(days=1)).isoformat()).select(ERA5_BANDS)
    fc = c.map(lambda i: ee.Feature(None, i.reduceRegion(ee.Reducer.first(), point, ERA5_SCALE_M))
               .set("date", i.date().format("YYYY-MM-dd")))
    return ee.Dictionary({b: fc.aggregate_array(b) for b in ["date", *ERA5_BANDS]})


def saturation_vp(t_c: float) -> float:
    """FAO-56 (Allen et al. 1998) eq. 11, kPa."""
    return 0.6108 * math.exp(17.27 * t_c / (t_c + 237.3))


def summarize_era5(raw: dict | None) -> list[dict]:
    """K -> °C, m -> mm (negative clipped to 0), RH = 100 * e°(Tdew) / e°(T) (FAO-56 eqs 10, 11, 14) from the
    daily mean temperature and dew point: an approximate daily mean RH. No hourly RH, so no hours >= 90%."""
    if not raw:
        return []
    k = lambda v: None if v is None else v - 273.15  # noqa: E731
    days = []
    for i, d in enumerate(raw["date"]):
        t, tn, tx, td, p = (raw[b][i] for b in ERA5_BANDS)
        tmean, tdew = k(t), k(td)
        rh = None if None in (tmean, tdew) else min(100.0, 100 * saturation_vp(tdew) / saturation_vp(tmean))
        days.append({"date": d, "tmin": _r(k(tn)), "tmean": _r(tmean), "tmax": _r(k(tx)), "rhMean": _r(rh, 0),
                     "rhMax": None, "hoursRh90": None, "rain": None if p is None else round(max(p, 0) * 1000, 1),
                     "source": "era5-land"})
    return days


def _r(v, digits=1):
    return None if v is None else round(v, digits)


# --- latest available dates (checked at runtime, cached per day in this process) ---------------------
_latest_cache: dict = {}


def latest_dates(today: Date | None = None) -> dict:
    """Newest image date of CHIRPS and ERA5-Land. A windowed aggregate_max (not a full-collection sort,
    which cost 1.6 EECU-s when measured). ponytail: per-process cache, one lookup per instance per day."""
    today = today or datetime.now(timezone.utc).date()
    if today not in _latest_cache:
        since = (today - timedelta(days=90)).isoformat()
        until = (today + timedelta(days=1)).isoformat()
        ms = ee.Dictionary({name: ee.ImageCollection(c).filterDate(since, until).aggregate_max("system:time_start")
                            for name, c in (("chirps", CHIRPS), ("era5", ERA5))}).getInfo()
        _latest_cache.clear()
        _latest_cache[today] = {n: None if v is None else datetime.fromtimestamp(v / 1000, timezone.utc).date().isoformat()
                                for n, v in ms.items()}
    return _latest_cache[today]


def query(lat: float, lon: float, *, soil: bool, rain_ref: Date | None, era5: tuple[Date, Date] | None,
          latest: dict) -> dict:
    """ONE Earth Engine request for every part asked for; returns the summarized parts."""
    point = ee.Geometry.Point([lon, lat])
    window = rain_window(rain_ref, latest) if rain_ref else None
    parts = {}
    if soil:
        parts["soil"] = soil_request(point)
    if window and window.get("source"):
        parts["rain"] = rain_request(point, window)
    if era5:
        parts["era5"] = era5_request(point, *era5)
    raw = ee.Dictionary(parts).getInfo() if parts else {}
    return {
        "soil": summarize_soil(raw.get("soil")) if soil else None,
        "rain_anomaly": summarize_rain(raw.get("rain"), window) if window else None,
        "era5": summarize_era5(raw.get("era5")) if era5 else None,
        "latest": latest,
        "parts": sorted(parts),
    }
