"""Field-health logic and API with mocked Earth Engine responses (no credentials needed).
fixtures/ee_paddy_punjab_2026-09-26.json is a real Earth Engine answer (statistics only, no coordinates)
for a paddy field in Punjab, so the tests run on the true shape of the data."""
import json
import sys
from datetime import date, timedelta
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import field_health as fh  # noqa: E402

FIXTURE = json.loads((Path(__file__).parent / "fixtures" / "ee_paddy_punjab_2026-09-26.json").read_text())
END = date(2026, 9, 26)
START = END - timedelta(days=120)


def row(day, clear=1.0, ndvi=0.7, nb=(0.6, 0.7, 0.8), pixels=5000, **extra):
    """One feature as Earth Engine returns it for one Sentinel-2 image."""
    p = {"date": day, "clear": clear, "ndvi": ndvi, "ndre": None if ndvi is None else ndvi / 2,
         "ndvi_p25": nb[0], "ndvi_p50": nb[1], "ndvi_p75": nb[2], "ndvi_count": pixels,
         "ndre_p25": nb[0] / 2, "ndre_p50": nb[1] / 2, "ndre_p75": nb[2] / 2, "ndre_count": pixels, **extra}
    return {"type": "Feature", "geometry": None, "properties": p}


def run(*features, end=END, **kw):
    return fh.summarize({"type": "FeatureCollection", "features": list(features)}, start=START, end=end,
                        geometry_source="buffer_30m", **kw)


def test_real_paddy_response():
    r = fh.summarize(FIXTURE, start=START, end=END, geometry_source="buffer_30m", with_redsi=True)
    assert r["images"] == 31 and r["clear_images"] == 16
    assert r["last_clear_date"] == "2026-09-25"
    assert r["flag"] == {"code": "normal", "since": None, "stale": False}
    assert r["summary"] == "In line with nearby fields."
    # the monsoon gap: no clear view between mid-July and mid-August is reported, not invented
    used = [s["date"] for s in r["series"] if s["used"]]
    assert not [d for d in used if "2026-07-16" <= d <= "2026-08-15"]
    assert all(s["clear_fraction"] < fh.MIN_CLEAR for s in r["series"] if not s["used"] and s["ndvi"] is not None)
    assert "redsi" in r["method"] and r["series"][-1].get("redsi") is not None


def test_a_location_that_is_not_farmland_gets_no_verdict():
    # a photo taken at home: the circle is a roof/road, NDVI stays ~0.1 all season, far under the fields
    features = [row(f"2026-09-{d:02d}", ndvi=0.12, nb=(0.4, 0.6, 0.7)) for d in (6, 13, 24)]
    r = run(*features, field_farmland=0.12)
    assert r["flag"]["code"] == "not_farmland" and r["field_farmland"] == 0.12
    assert "does not look like farmland" in r["summary"]
    assert r["series"][0]["z"] < -1  # the numbers are still there for the chart; only the verdict is withheld
    assert run(*features, field_farmland=0.9)["flag"]["code"] == "below"


def test_orchard_crops_accept_tree_cover_as_farmland():
    assert fh.farm_classes("apple") == [fh.TREE_COVER, fh.CROPLAND]
    assert fh.farm_classes("banana") == [fh.TREE_COVER, fh.CROPLAND]
    assert fh.farm_classes("wheat") == [fh.CROPLAND] and fh.farm_classes(None) == [fh.CROPLAND]


def test_same_day_tiles_keep_the_clearer_view():
    r = run(row("2026-09-01", clear=0.3, ndvi=0.2), row("2026-09-01", clear=0.9, ndvi=0.75))
    assert r["images"] == 1
    assert r["series"][0]["ndvi"] == 0.75 and r["series"][0]["used"]


def test_cloudy_dates_are_skipped_and_all_cloudy_says_so():
    r = run(row("2026-07-10", clear=0.59), row("2026-07-20", clear=0.1, ndvi=None))
    assert r["clear_images"] == 0 and r["last_clear_date"] is None
    assert r["flag"]["code"] == "no_clear"
    assert r["summary"] == "No clear satellite view in this period (clouds)."


def test_robust_z_uses_median_and_iqr():
    r = run(row("2026-09-20", ndvi=0.5, nb=(0.6, 0.7, 0.8)))
    assert r["series"][0]["z"] == pytest.approx((0.5 - 0.7) / (0.2 / 1.349), abs=0.01)  # -1.35


def test_below_neighbours_since_the_start_of_the_latest_run():
    r = run(row("2026-08-20", ndvi=0.5), row("2026-09-01", ndvi=0.72),
            row("2026-09-10", ndvi=0.5), row("2026-09-20", ndvi=0.45), row("2026-09-25", ndvi=0.4))
    assert r["flag"]["code"] == "below" and r["flag"]["since"] == "2026-09-10"
    assert r["summary"] == "Below neighbours since 2026-09-10."


def test_a_single_low_date_asks_to_wait_for_confirmation():
    r = run(row("2026-09-10", ndvi=0.72), row("2026-09-25", ndvi=0.4))
    assert r["flag"]["code"] == "below_once" and r["flag"]["since"] == "2026-09-25"


def test_above_and_normal():
    assert run(row("2026-09-25", ndvi=0.95))["flag"]["code"] == "above"
    assert run(row("2026-09-25", ndvi=0.71))["flag"]["code"] == "normal"


def test_too_little_farmland_nearby_is_not_compared():
    r = run(row("2026-09-25", pixels=49))
    assert r["series"][0]["z"] is None
    assert r["flag"]["code"] == "no_neighbours"


def test_old_last_clear_image_is_marked_stale():
    r = run(row("2026-08-30", ndvi=0.7))
    assert r["flag"]["stale"] is True
    assert "No clear image since 2026-08-30" in r["summary"]


def test_redsi_only_when_asked():
    f = row("2026-09-25", redsi=0.2, redsi_p25=0.1, redsi_p50=0.2, redsi_p75=0.3)
    assert "redsi" not in run(f)["series"][0]
    assert run(f, with_redsi=True)["series"][0]["redsi"] == 0.2


# --- API ---------------------------------------------------------------------------------------------

@pytest.fixture
def client(monkeypatch):
    import app
    from fastapi.testclient import TestClient
    monkeypatch.setattr(app, "init_earth_engine", lambda: None)  # no credentials in tests
    calls = []

    def fake_query(lat, lon, start, end, with_redsi=False, crop=None):
        calls.append({"lat": lat, "lon": lon, "start": start, "end": end, "with_redsi": with_redsi, "crop": crop})
        return FIXTURE, "buffer_30m", 0.94
    monkeypatch.setattr(app.fh, "query_rows", fake_query)
    with TestClient(app.app) as c:
        c.calls = calls
        yield c


def test_field_health_endpoint(client):
    r = client.get("/field-health", params={"lat": 30.858816, "lon": 75.666131, "date": "2026-09-26", "days": 120})
    assert r.status_code == 200
    body = r.json()
    assert body["flag"]["code"] == "normal" and body["geometry_source"] == "buffer_30m" and body["field_farmland"] == 0.94
    assert "30.8588" not in r.text and "75.6661" not in r.text  # the answer never carries the location
    assert client.calls[0]["start"] == date(2026, 5, 29) and client.calls[0]["with_redsi"] is False


def test_post_takes_the_location_in_the_body(client):
    r = client.post("/field-health", json={"lat": 30.858816, "lon": 75.666131, "date": "2026-09-26", "days": 120})
    assert r.status_code == 200 and r.json()["flag"]["code"] == "normal"
    assert client.calls[0]["lat"] == 30.858816
    assert client.post("/field-health", json={"lat": 95, "lon": 75}).status_code == 422


def test_wheat_gets_redsi_and_future_dates_are_clamped(client):
    client.get("/field-health", params={"lat": 30.9, "lon": 75.8, "date": "2099-01-01", "crop": "wheat"})
    assert client.calls[-1]["with_redsi"] is True and client.calls[-1]["crop"] == "wheat"
    assert client.calls[-1]["end"] <= date.today()


@pytest.mark.parametrize("params,status", [
    ({"lat": 91, "lon": 75}, 422), ({"lat": 30, "lon": 181}, 422), ({"lat": 30, "lon": 75, "days": 10}, 422),
    ({"lat": 30, "lon": 75, "days": 400}, 422), ({"lat": 30, "lon": 75, "date": "26-09-2026"}, 400), ({"lon": 75}, 422),
])
def test_invalid_input(client, params, status):
    assert client.get("/field-health", params=params).status_code == status
    assert client.calls == []


def test_token_required_when_set(client, monkeypatch):
    monkeypatch.setenv("GEO_SERVICE_TOKEN", "s3cret")
    assert client.get("/field-health", params={"lat": 30, "lon": 75}).status_code == 401
    ok = client.get("/field-health", params={"lat": 30, "lon": 75}, headers={"X-Geo-Token": "s3cret"})
    assert ok.status_code == 200


def test_earth_engine_errors(client, monkeypatch):
    import app

    def fail(msg):
        def f(*a, **k):
            raise app.ee.EEException(msg)
        return f
    monkeypatch.setattr(app.fh, "query_rows", fail("Computation timed out."))
    assert client.get("/field-health", params={"lat": 30, "lon": 75}).status_code == 502
    monkeypatch.setattr(app.fh, "query_rows", fail("Too many concurrent aggregations / quota exceeded"))
    assert client.get("/field-health", params={"lat": 30, "lon": 75}).status_code == 503


def test_without_earth_engine_credentials_503(monkeypatch):
    import app
    from fastapi.testclient import TestClient

    def no_credentials():
        raise RuntimeError("no default credentials")
    monkeypatch.setattr(app, "init_earth_engine", no_credentials)
    monkeypatch.setitem(app._state, "ee", False)
    with TestClient(app.app) as c:
        assert c.get("/health").json() == {"status": "ok", "earth_engine": False}
        assert c.get("/field-health", params={"lat": 30, "lon": 75}).status_code == 503
