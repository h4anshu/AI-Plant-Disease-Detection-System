"""Context logic and /context API with mocked Earth Engine (no credentials needed).
fixtures/ee_context_punjab_2026-09-27.json is a real Earth Engine answer (numbers only, no coordinates) for a
Punjab paddy field: SoilGrids at 3 depths, ERA5-Land days, and the rainfall anomaly from ERA5-Land
(reference 20 Sep, CHIRPS not yet there) and from CHIRPS (reference 31 Aug)."""
import json
import math
import sys
from datetime import date
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import context as cx  # noqa: E402

FIX = json.loads((Path(__file__).parent / "fixtures" / "ee_context_punjab_2026-09-27.json").read_text())
RAW = FIX["raw"]
LATEST = FIX["latest"]  # {"chirps": "2026-08-31", "era5": "2026-09-19"} as checked on 27 Sep 2026


# --- soil ---------------------------------------------------------------------------------------------

def test_real_soil_answer_in_conventional_units():
    s = cx.summarize_soil(RAW["soil"])
    # ISRIC factors: pH /10, N /100 (cg/kg -> g/kg), SOC /10 (dg/kg -> g/kg), texture /10 (g/kg -> %), CEC /10, bdod /100
    assert RAW["soil"]["phh2o_0-5cm_mean"] == 77 and s["depths"]["0-5"]["phH2O"] == 7.7
    assert RAW["soil"]["nitrogen_0-5cm_mean"] == 1112 and s["depths"]["0-5"]["nitrogenGkg"] == 11.12
    assert s["depths"]["0-5"]["socGkg"] == 12.6 and s["depths"]["0-5"]["clayPct"] == 23.4
    assert s["depths"]["0-5"]["cecCmolKg"] == 16.3 and s["depths"]["0-5"]["bdodKgDm3"] == 1.47
    # 0-30 cm = (5 x 0-5 + 10 x 5-15 + 15 x 15-30) / 30
    d = s["depths"]
    assert s["topsoil0to30"]["clayPct"] == round((5 * d["0-5"]["clayPct"] + 10 * d["5-15"]["clayPct"] + 15 * d["15-30"]["clayPct"]) / 30, 2)
    assert s["texture"] == "loam"
    assert s["label"] == "modelled at 250 m (SoilGrids), not a soil test of this field"
    assert s["units"]["nitrogenGkg"] == "g/kg"


def test_no_soil_data_is_none_not_zero():
    assert cx.summarize_soil(None) is None
    assert cx.summarize_soil({k: None for k in RAW["soil"]}) is None
    partial = dict(RAW["soil"], **{"clay_15-30cm_mean": None})
    s = cx.summarize_soil(partial)
    assert s["topsoil0to30"]["clayPct"] is None and s["texture"] is None and s["depths"]["0-5"]["clayPct"] == 23.4


@pytest.mark.parametrize("clay,sand,silt,expected", [
    (2, 92, 6, "sand"),               # sand > 85, silt + 1.5 clay = 9 < 15
    (8, 82, 10, "loamy sand"),        # 70-90 sand, silt + 1.5 clay = 22, silt + 2 clay = 26 < 30
    (10, 65, 25, "sandy loam"),       # 7-20 clay, > 52 sand, silt + 2 clay = 45
    (5, 55, 40, "sandy loam"),        # < 7 clay, < 50 silt, silt + 2 clay = 50
    (18, 42, 40, "loam"),
    (20, 20, 60, "silt loam"),        # silt >= 50, clay 12-27
    (5, 25, 70, "silt loam"),         # silt 50-80, clay < 12
    (5, 5, 90, "silt"),
    (25, 60, 15, "sandy clay loam"),
    (32, 33, 35, "clay loam"),
    (32, 10, 58, "silty clay loam"),
    (40, 50, 10, "sandy clay"),
    (45, 5, 50, "silty clay"),
    (60, 20, 20, "clay"),
])
def test_usda_texture_every_class(clay, sand, silt, expected):
    assert cx.usda_texture(clay, sand, silt) == expected


def test_texture_boundaries_follow_the_manual():
    assert cx.usda_texture(27, 40, 33) == "clay loam"   # 27 clay is no longer loam (7 to < 27)
    assert cx.usda_texture(26.9, 40, 33.1) == "loam"
    assert cx.usda_texture(40, 20, 40) == "silty clay"  # 40/40 silty clay, not clay (silt < 40)
    assert cx.usda_texture(None, 40, 33) is None


# --- rainfall anomaly ---------------------------------------------------------------------------------

def test_rain_source_is_chirps_when_it_covers_the_window():
    w = cx.rain_window(date(2026, 8, 31), LATEST)
    assert w == {"source": "chirps", "start": date(2026, 8, 1), "end": date(2026, 8, 31)}


def test_rain_source_falls_back_to_era5_ending_at_its_latest_day():
    w = cx.rain_window(date(2026, 9, 20), LATEST)
    assert w == {"source": "era5-land", "start": date(2026, 8, 21), "end": date(2026, 9, 20)}
    w = cx.rain_window(date(2026, 9, 29), LATEST)  # ERA5's last day (19 Sep) is 10 days before: still allowed
    assert w["source"] == "era5-land" and w["end"] == date(2026, 9, 20)


def test_rain_unknown_when_both_sources_are_too_old():
    w = cx.rain_window(date(2026, 9, 30), LATEST)  # 11 days after ERA5's last day: too old
    assert w["source"] is None and "2026-08-31" in w["reason"] and "2026-09-19" in w["reason"]
    assert cx.summarize_rain(None, w) == {"status": "unknown", "source": None, "reason": w["reason"]}


def test_real_rain_answers():
    era5 = cx.summarize_rain(RAW["rain"], cx.rain_window(date(2026, 9, 20), LATEST))
    assert era5 == {"status": "ok", "source": "era5-land", "windowStart": "2026-08-21", "windowEnd": "2026-09-19",
                    "rainMm": 23.6, "normalMm": 110.2, "percentOfNormal": 21, "baseline": "2001-2020"}
    chirps = cx.summarize_rain(RAW["rain_chirps"], cx.rain_window(date(2026, 8, 31), LATEST))
    assert chirps["source"] == "chirps" and chirps["percentOfNormal"] == 145 and chirps["windowEnd"] == "2026-08-30"
    assert len(RAW["rain"]["baseline"]) == 20


def test_rain_unknown_when_days_are_missing():
    w = cx.rain_window(date(2026, 8, 31), LATEST)
    short = {"recent": {"sum": 50.0, "n": 29}, "baseline": RAW["rain_chirps"]["baseline"]}
    assert cx.summarize_rain(short, w)["status"] == "unknown"
    gap = {"recent": RAW["rain_chirps"]["recent"], "baseline": [{"sum": None, "n": 30}] * 20}
    assert cx.summarize_rain(gap, w)["reason"] == "baseline years incomplete"


def test_era5_units_and_humidity():
    days = cx.summarize_era5(RAW["era5"])
    assert len(days) == 17 and days[0]["date"] == "2026-08-01" and days[0]["source"] == "era5-land"
    t, td = RAW["era5"]["temperature_2m"][0] - 273.15, RAW["era5"]["dewpoint_temperature_2m"][0] - 273.15
    assert days[0]["tmean"] == round(t, 1)
    # FAO-56: RH = 100 * e°(Tdew) / e°(T), e°(T) = 0.6108 exp(17.27 T / (T + 237.3))
    e = lambda x: 0.6108 * math.exp(17.27 * x / (x + 237.3))  # noqa: E731
    assert days[0]["rhMean"] == round(100 * e(td) / e(t))
    assert days[0]["hoursRh90"] is None and days[0]["rhMax"] is None  # daily data: no hourly humidity


def test_era5_negative_rain_is_clipped_and_missing_stays_missing():
    raw = {"date": ["2026-08-01", "2026-08-02"], "temperature_2m": [300, None], "temperature_2m_min": [295, None],
           "temperature_2m_max": [305, None], "dewpoint_temperature_2m": [295, None], "total_precipitation_sum": [-1e-6, 0.0123]}
    d = cx.summarize_era5(raw)
    assert d[0]["rain"] == 0 and d[1]["rain"] == 12.3
    assert d[1]["tmean"] is None and d[1]["rhMean"] is None


# --- API ----------------------------------------------------------------------------------------------

@pytest.fixture
def client(monkeypatch):
    import app
    from fastapi.testclient import TestClient
    monkeypatch.setattr(app, "init_earth_engine", lambda: None)
    calls = []

    def fake_query(lat, lon, *, soil, rain_ref, era5, latest):
        calls.append({"lat": lat, "lon": lon, "soil": soil, "rain_ref": rain_ref, "era5": era5, "latest": latest})
        w = cx.rain_window(rain_ref, latest) if rain_ref else None
        return {"soil": cx.summarize_soil(RAW["soil"]) if soil else None,
                "rain_anomaly": cx.summarize_rain(RAW["rain"], w) if w else None,
                "era5": cx.summarize_era5(RAW["era5"]) if era5 else None, "latest": latest,
                "parts": sorted(p for p, on in (("soil", soil), ("rain", w), ("era5", era5)) if on)}
    monkeypatch.setattr(app.cx, "query", fake_query)
    monkeypatch.setattr(app.cx, "latest_dates", lambda: LATEST)
    with TestClient(app.app) as c:
        c.calls = calls
        yield c


def test_context_endpoint(client, caplog):
    r = client.post("/context", json={"lat": 30.8575, "lon": 75.6675, "soil": True, "rain_ref": "2026-09-20"},
                    headers={"x-request-id": "rid-1"})
    assert r.status_code == 200
    body = r.json()
    assert body["soil"]["texture"] == "loam" and body["rain_anomaly"]["percentOfNormal"] == 21
    assert body["era5"] is None and body["latest"] == LATEST
    assert "30.857" not in r.text and "75.667" not in r.text  # the answer never carries the location
    assert client.calls[0]["rain_ref"] == date(2026, 9, 20) and client.calls[0]["era5"] is None


def test_context_log_line_has_no_location(client, monkeypatch):
    import io
    import app
    buf = io.StringIO()
    monkeypatch.setattr(app._handler, "stream", buf)
    client.post("/context", json={"lat": 30.8575, "lon": 75.6675, "rain_ref": "2026-09-20"})
    out = buf.getvalue()
    line = next(json.loads(x) for x in out.splitlines() if '"context"' in x)
    assert line["workloadTag"] == "context" and line["parts"] == ["rain", "soil"]
    assert "30.857" not in out and "75.667" not in out


def test_soil_can_be_skipped_and_era5_asked_for(client):
    r = client.post("/context", json={"lat": 30, "lon": 75, "soil": False, "era5_start": "2026-08-01", "era5_end": "2026-08-17"})
    assert r.status_code == 200 and r.json()["soil"] is None and len(r.json()["era5"]) == 17
    assert client.calls[-1]["era5"] == (date(2026, 8, 1), date(2026, 8, 17)) and client.calls[-1]["latest"] == {}


@pytest.mark.parametrize("body,status", [
    ({"lat": 91, "lon": 75}, 422), ({"lat": 30, "lon": 181}, 422), ({"lon": 75}, 422),
    ({"lat": 30, "lon": 75, "rain_ref": "20-09-2026"}, 400),
    ({"lat": 30, "lon": 75, "era5_start": "2026-08-01"}, 400),
    ({"lat": 30, "lon": 75, "era5_start": "2026-08-10", "era5_end": "2026-08-01"}, 400),
    ({"lat": 30, "lon": 75, "era5_start": "2026-01-01", "era5_end": "2026-08-01"}, 400),
])
def test_context_invalid_input(client, body, status):
    assert client.post("/context", json=body).status_code == status
    assert client.calls == []


def test_context_token_and_get_not_allowed(client, monkeypatch):
    monkeypatch.setenv("GEO_SERVICE_TOKEN", "s3cret")
    assert client.post("/context", json={"lat": 30, "lon": 75}).status_code == 401
    assert client.post("/context", json={"lat": 30, "lon": 75}, headers={"X-Geo-Token": "s3cret"}).status_code == 200
    assert client.get("/context", params={"lat": 30, "lon": 75}).status_code == 405  # the location never goes in a URL


def test_context_earth_engine_errors(client, monkeypatch):
    import app

    def fail(msg):
        def f(*a, **k):
            raise app.ee.EEException(msg)
        return f
    monkeypatch.setattr(app.cx, "query", fail("Computation timed out."))
    assert client.post("/context", json={"lat": 30, "lon": 75}).status_code == 502
    monkeypatch.setattr(app.cx, "query", fail("Quota exceeded: too many requests"))
    assert client.post("/context", json={"lat": 30, "lon": 75}).status_code == 503
    monkeypatch.setattr(app.cx, "latest_dates", fail("Quota exceeded"))
    assert client.post("/context", json={"lat": 30, "lon": 75, "rain_ref": "2026-09-20"}).status_code == 503


def test_context_without_credentials_503(monkeypatch):
    import app
    from fastapi.testclient import TestClient
    monkeypatch.setattr(app, "init_earth_engine", lambda: (_ for _ in ()).throw(RuntimeError("no credentials")))
    monkeypatch.setitem(app._state, "ee", False)
    with TestClient(app.app) as c:
        assert c.post("/context", json={"lat": 30, "lon": 75}).status_code == 503


def test_fixture_has_no_coordinates():
    text = json.dumps(FIX)
    assert "30.85" not in text and "75.66" not in text
