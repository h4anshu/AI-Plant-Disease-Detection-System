"""Flood-extent logic and API with mocked Earth Engine output (no credentials needed). The `raw` dictionaries are real Earth Engine answers
(statistics only, no coordinates) from 26 Oct 2026: a Ravi floodplain point during the Sept 2025 floods, its edge, the same area in a dry
December, and an upland point in flood time."""
import sys
from datetime import date
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import flood as fl  # noqa: E402

T = 1756944000000  # 2025-09-04 00:00 UTC, in ms
END = date(2025, 9, 5)
FLOODED = {"baseline_images": 17, "new_water": 0.681, "now_images": 1, "usable": 0.958, "water_now": 0.946}  # real: Ravi floodplain, 4 Sep 2025
EDGE = {"baseline_images": 17, "new_water": 0.181, "now_images": 1, "usable": 0.908, "water_now": 0.181}  # real: the edge of the same plain
DRY = {"baseline_images": 16, "new_water": 0.0028, "now_images": 1, "usable": 0.729, "water_now": 0.0028}  # real: same place, December
UPLAND = {"baseline_images": 27, "new_water": 0, "now_images": 2, "usable": 0.8915, "water_now": 0}  # real: Ludhiana, 4 Sep 2025


def test_the_flag_follows_the_new_water_share():
    assert fl.summarize(FLOODED, latest_ms=T, end=END)["flag"] == "likely"
    assert fl.summarize(EDGE, latest_ms=T, end=END)["flag"] == "possible"
    assert fl.summarize(DRY, latest_ms=T, end=END)["flag"] == "none"
    assert fl.summarize(UPLAND, latest_ms=T, end=END)["flag"] == "none"
    # the boundaries: 5% is possible, 20% is likely
    assert fl.summarize({**EDGE, "new_water": 0.05}, latest_ms=T, end=END)["flag"] == "possible"
    assert fl.summarize({**EDGE, "new_water": 0.0494}, latest_ms=T, end=END)["flag"] == "none"  # the flag follows the number shown (4.9%)
    assert fl.summarize({**EDGE, "new_water": 0.2}, latest_ms=T, end=END)["flag"] == "likely"


def test_numbers_and_dates_of_a_flood():
    r = fl.summarize(FLOODED, latest_ms=T, end=END)
    assert r["status"] == "ok" and r["buffer_m"] == 500 and r["image_date"] == "2025-09-04" and r["age_days"] == 1
    assert (r["water_pct"], r["new_water_pct"], r["usable_pct"], r["baseline_images"]) == (94.6, 68.1, 95.8, 17)
    assert "radar_misses_canopy_and_town" in r["limits"] and "irrigated_paddy_reads_as_water" in r["limits"]


def test_too_little_usable_ground_or_no_baseline_is_not_judged():
    hills = fl.summarize({**FLOODED, "usable": 0.3}, latest_ms=T, end=END)
    assert hills["status"] == "too_little_data" and hills["flag"] is None and hills["new_water_pct"] is None
    assert fl.summarize({**FLOODED, "baseline_images": 0}, latest_ms=T, end=END)["status"] == "too_little_data"
    assert fl.summarize({**FLOODED, "new_water": None}, latest_ms=T, end=END)["status"] == "too_little_data"
    assert fl.summarize({"baseline_images": 3, "usable": None, "new_water": None}, latest_ms=T, end=END)["status"] == "too_little_data"


def test_no_recent_image_says_when_the_last_one_was():
    r = fl.summarize(None, latest_ms=None, end=END, last_seen="2025-08-12")
    assert r == {"status": "no_recent_image", "buffer_m": 500, "recent_days": 12, "last_image": "2025-08-12", "flag": None, "limits": fl.LIMITS}
    assert fl.summarize(None, latest_ms=None, end=END)["last_image"] is None


# --- API ---------------------------------------------------------------------------------------------

@pytest.fixture
def client(monkeypatch):
    import app
    from fastapi.testclient import TestClient
    monkeypatch.setattr(app, "init_earth_engine", lambda: None)
    calls = {"recent": [], "query": [], "last": []}
    images = [{"t": T - 8 * 86400000, "orbit": "ASCENDING"}, {"t": T, "orbit": "DESCENDING"}]
    monkeypatch.setattr(app.fl, "recent_images", lambda lat, lon, end: (calls["recent"].append((lat, lon, end)), images)[1])
    monkeypatch.setattr(app.fl, "query", lambda lat, lon, end, t: (calls["query"].append((lat, lon, end, t)), FLOODED)[1])
    monkeypatch.setattr(app.fl, "last_image_before", lambda lat, lon, end: (calls["last"].append(end), "2025-08-12")[1])
    with TestClient(app.app) as c:
        c.calls, c.images = calls, images
        yield c


def test_endpoint_uses_the_newest_image_and_never_returns_the_location(client):
    r = client.post("/flood-extent", json={"lat": 31.93, "lon": 74.68, "date": "2025-09-05"})
    assert r.status_code == 200 and r.json()["flag"] == "likely" and r.json()["image_date"] == "2025-09-04"
    assert "31.93" not in r.text and "74.68" not in r.text
    assert client.calls["query"][0] == (31.93, 74.68, date(2025, 9, 5), T)  # the newest of the two images
    assert client.calls["last"] == []


def test_no_recent_image_asks_for_the_last_one(client):
    client.images.clear()
    r = client.post("/flood-extent", json={"lat": 31.93, "lon": 74.68, "date": "2025-09-05"})
    assert r.status_code == 200 and r.json()["status"] == "no_recent_image" and r.json()["last_image"] == "2025-08-12"
    assert client.calls["query"] == []


def test_future_dates_are_clamped_and_bad_input_refused(client):
    client.post("/flood-extent", json={"lat": 31.9, "lon": 74.7, "date": "2099-01-01"})
    assert client.calls["recent"][-1][2] <= date.today()
    n = len(client.calls["recent"])
    for body, status in [({"lat": 95, "lon": 74}, 422), ({"lat": 31, "lon": 181}, 422), ({"lon": 74}, 422), ({"lat": 31, "lon": 74, "date": "05-09-2025"}, 400)]:
        assert client.post("/flood-extent", json=body).status_code == status
    assert len(client.calls["recent"]) == n


def test_token_required_when_set(client, monkeypatch):
    monkeypatch.setenv("GEO_SERVICE_TOKEN", "s3cret")
    assert client.post("/flood-extent", json={"lat": 31, "lon": 74}).status_code == 401
    assert client.post("/flood-extent", json={"lat": 31, "lon": 74}, headers={"X-Geo-Token": "s3cret"}).status_code == 200
    assert client.get("/flood-extent").status_code == 405  # POST only: a location must not sit in a URL


def test_earth_engine_errors(client, monkeypatch):
    import app

    def fail(msg):
        def f(*a, **k):
            raise app.ee.EEException(msg)
        return f
    monkeypatch.setattr(app.fl, "recent_images", fail("Computation timed out."))
    assert client.post("/flood-extent", json={"lat": 31, "lon": 74}).status_code == 502
    monkeypatch.setattr(app.fl, "recent_images", fail("Too many concurrent aggregations / quota exceeded"))
    assert client.post("/flood-extent", json={"lat": 31, "lon": 74}).status_code == 503


def test_without_earth_engine_credentials_503(monkeypatch):
    import app
    from fastapi.testclient import TestClient

    def no_credentials():
        raise RuntimeError("no default credentials")
    monkeypatch.setattr(app, "init_earth_engine", no_credentials)
    monkeypatch.setitem(app._state, "ee", False)
    with TestClient(app.app) as c:
        assert c.post("/flood-extent", json={"lat": 31, "lon": 74}).status_code == 503
