"""Offline sanity check of the disease rules (docs/CONTEXT_LAYER.md "Sanity check"): daily weather for a dataset's
documented district and months, from ERA5-Land hourly (CX-02 family, ECMWF/ERA5_LAND/HOURLY: hourly humidity is
needed for the leaf-wetness rules) and CHIRPS daily rain (CX-03). Writes rows the server's rule engine reads
(server/scripts/sanity_rules.js). A report only: never a training feature.

    .venv/Scripts/python geo-service/sanity_check.py   (needs your gcloud Earth Engine login, docs/GEE_SETUP.md)
"""
import json
import math
import sys
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

import ee
import google.auth

import context as cx

IST = timedelta(hours=5, minutes=30)
OUT = Path(__file__).resolve().parents[1] / "docs" / "sanity"

# Datasets in the catalogue sheet "Dataset Catalogue" with a documented place AND months, for a crop the app serves.
# The point is the district's approximate centre (a public place), not a field.
DATASETS = [{
    "id": "DS-09", "crop": "groundnut",
    "name": "Novel groundnut leaf dataset (Sasmal et al. 2024, Data in Brief 55:110763)",
    "place": "Purba Medinipur district, West Bengal (Ramchandrapur village); district centre used",
    "lat": 22.05, "lon": 87.75,
    "quote": "between January-April of 2022 and 2023, a few trips were made to Ramchandrapur village in the Purba Medinipur district",
    "periods": [("2022-01-01", "2022-04-30"), ("2023-01-01", "2023-04-30")],
}]


def rh(t_c, td_c):
    e = lambda x: 0.6108 * math.exp(17.27 * x / (x + 237.3))  # noqa: E731 FAO-56 eq. 11
    return min(100.0, 100 * e(td_c) / e(t_c))


def extract(ds, start: date, end: date) -> list[dict]:
    """Daily rows (IST days) for [start - 14 days, end]: the rule windows need two weeks before each day."""
    pt = ee.Geometry.Point([ds["lon"], ds["lat"]])
    first = start - timedelta(days=14)
    hourly = (ee.ImageCollection("ECMWF/ERA5_LAND/HOURLY")
              .filterDate((first - timedelta(days=1)).isoformat(), (end + timedelta(days=1)).isoformat())
              .select(["temperature_2m", "dewpoint_temperature_2m"]))
    fc = hourly.map(lambda i: ee.Feature(None, i.reduceRegion(ee.Reducer.first(), pt, cx.ERA5_SCALE_M))
                    .set("t", i.get("system:time_start")))
    chirps = ee.ImageCollection(cx.CHIRPS).filterDate(first.isoformat(), (end + timedelta(days=1)).isoformat())
    cfc = chirps.map(lambda i: ee.Feature(None, i.reduceRegion(ee.Reducer.first(), pt, cx.CHIRPS_SCALE_M))
                     .set("d", i.date().format("YYYY-MM-dd")))
    raw = ee.Dictionary({
        "t": fc.aggregate_array("t"), "temp": fc.aggregate_array("temperature_2m"), "dew": fc.aggregate_array("dewpoint_temperature_2m"),
        "rain_d": cfc.aggregate_array("d"), "rain": cfc.aggregate_array("precipitation"),
    }).getInfo()
    by_day: dict[str, dict] = {}
    for ms, t, td in zip(raw["t"], raw["temp"], raw["dew"]):
        if t is None or td is None:
            continue
        day = (datetime.fromtimestamp(ms / 1000, timezone.utc) + IST).date().isoformat()
        e = by_day.setdefault(day, {"temps": [], "rhs": []})
        e["temps"].append(t - 273.15)
        e["rhs"].append(rh(t - 273.15, td - 273.15))
    rain = dict(zip(raw["rain_d"], raw["rain"]))
    rows = []
    d = first
    while d <= end:
        k = d.isoformat()
        e = by_day.get(k)
        full = e and len(e["temps"]) >= 20
        rows.append({"date": k, "source": "era5-land-hourly", "forecast": False,
                     "tmin": round(min(e["temps"]), 1) if full else None,
                     "tmean": round(sum(e["temps"]) / len(e["temps"]), 1) if full else None,
                     "tmax": round(max(e["temps"]), 1) if full else None,
                     "rhMean": round(sum(e["rhs"]) / len(e["rhs"])) if full else None,
                     "rhMax": round(max(e["rhs"])) if full else None,
                     "hoursRh90": sum(h >= 90 for h in e["rhs"]) if full else None,
                     "rain": None if rain.get(k) is None else round(rain[k], 1)})
        d += timedelta(days=1)
    return rows


if __name__ == "__main__":
    creds, _ = google.auth.default(scopes=["https://www.googleapis.com/auth/earthengine", "https://www.googleapis.com/auth/cloud-platform"])
    ee.Initialize(creds, project="plant-disease-503711")
    ee.data.setDefaultWorkloadTag("sanity-check")
    OUT.mkdir(parents=True, exist_ok=True)
    for ds in DATASETS:
        periods = [{"start": s, "end": e, "days": extract(ds, date.fromisoformat(s), date.fromisoformat(e))} for s, e in ds["periods"]]
        out = OUT / f"{ds['id']}.json"
        out.write_text(json.dumps({**{k: v for k, v in ds.items() if k != "periods"}, "periods": periods,
                                   "extracted": date.today().isoformat()}, indent=1) + "\n", encoding="utf-8")
        print(out, sum(len(p["days"]) for p in periods), "days", file=sys.stderr)
