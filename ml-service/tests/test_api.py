import base64
import io
import json
import logging
from pathlib import Path

import pytest
from PIL import Image, ImageFilter

from conftest import needs_weights

TESTS = Path(__file__).resolve().parent
GOLDEN = json.loads((TESTS / "golden_expected.json").read_text(encoding="utf-8"))
PNG_SIGNATURE = b"\x89PNG\r\n\x1a\n"


def post(client, crop, data, name="leaf.jpg"):
    return client.post("/predict-disease", data={"crop": crop}, files={"file": (name, data, "image/jpeg")})


def fixture(crop):
    return (TESTS / "fixtures" / "golden" / GOLDEN[crop]["file"]).read_bytes()


def test_health_reports_model_versions(bare_api):
    r = bare_api.get("/health")
    assert r.status_code == 200
    body = r.json()
    assert body["status"] == "ok"
    assert body["models"]["backbone"]["version"] and body["models"]["gate"]
    assert set(body["models"]["heads"]) == set(GOLDEN)


def test_invalid_crop_is_400(bare_api):
    r = post(bare_api, "mango", b"whatever")
    assert r.status_code == 400
    assert "crop must be one of" in r.json()["detail"]


def test_shared_secret_is_required_when_set(bare_api, monkeypatch):
    monkeypatch.setenv("ML_SERVICE_TOKEN", "s3cret")
    assert post(bare_api, "wheat", b"x").status_code == 401  # no header
    r = bare_api.post("/predict-disease", data={"crop": "wheat"}, files={"file": ("a.jpg", b"x", "image/jpeg")},
                      headers={"X-ML-Token": "wrong"})
    assert r.status_code == 401
    r = bare_api.post("/predict-disease", data={"crop": "wheat"}, files={"file": ("a.jpg", b"x", "image/jpeg")},
                      headers={"X-ML-Token": "s3cret"})
    assert r.status_code == 415  # past the token check, stopped by the image check


class _Records(logging.Handler):
    def __init__(self):
        super().__init__()
        self.entries = []

    def emit(self, record):
        self.entries.append((record.getMessage(), getattr(record, "fields", {})))


@pytest.fixture
def ml_log():
    handler = _Records()
    logging.getLogger("ml").addHandler(handler)
    yield handler.entries
    logging.getLogger("ml").removeHandler(handler)


def test_request_id_is_kept_and_logged(bare_api, ml_log):
    r = bare_api.post("/predict-disease", data={"crop": "mango"}, files={"file": ("a.jpg", b"x", "image/jpeg")},
                      headers={"x-request-id": "req-42"})
    assert r.headers["x-request-id"] == "req-42"
    assert ("request", {"requestId": "req-42", "method": "POST", "path": "/predict-disease", "status": 400,
                        "latencyMs": ml_log[-1][1]["latencyMs"]}) == ml_log[-1]


@needs_weights
def test_prediction_is_logged_without_the_image(api, ml_log):
    r = api.post("/predict-disease", data={"crop": "wheat"}, files={"file": ("a.jpg", fixture("wheat"), "image/jpeg")},
                 headers={"x-request-id": "req-7"})
    assert r.status_code == 200
    fields = next(f for msg, f in ml_log if msg == "prediction")
    assert fields["requestId"] == "req-7" and fields["crop"] == "wheat" and fields["status"] == "ok"
    assert fields["disease"] == GOLDEN["wheat"]["disease"] and fields["modelVersion"]["head"]
    assert "severity" not in fields and "diseaseSeverity" in fields  # "severity" is the log level
    assert "gradcam" not in fields and len(json.dumps(fields)) < 1000  # no image or heatmap bytes


def test_json_log_format():
    from app import JsonFormatter
    record = logging.LogRecord("ml", logging.INFO, "", 0, "prediction", None, None)
    record.fields = {"crop": "wheat", "confidence": 0.9, "severity": "early", "message": "x"}  # must not win
    entry = json.loads(JsonFormatter().format(record))
    assert entry["severity"] == "INFO" and entry["message"] == "prediction" and entry["crop"] == "wheat"


def test_non_image_upload_is_415(bare_api):
    r = post(bare_api, "wheat", b"this is a text file, not a photo", name="notes.txt")
    assert r.status_code == 415
    assert r.json() == {"detail": "file is not a readable image"}


@needs_weights
@pytest.mark.parametrize("crop", sorted(GOLDEN))
def test_golden_prediction(api, crop):
    """Regression guard: a fixed held-out photo per crop keeps its class and confidence (+-0.02)."""
    exp = GOLDEN[crop]
    r = post(api, crop, fixture(crop))
    assert r.status_code == 200
    out = r.json()
    assert out["status"] == exp["status"] and out["reasons"] == []
    assert out["disease"] == exp["disease"]
    assert out["confidence"] == pytest.approx(exp["confidence"], abs=0.02)
    assert out["severity"] in {"healthy", "early", "moderate", "severe"}
    assert base64.b64decode(out["gradcam"])[:8] == PNG_SIGNATURE
    assert isinstance(out["ood_score"], float) and set(out["quality"]) == {"short_side", "blur", "brightness", "vegetation"}
    assert set(out["model_version"]) == {"backbone", "head", "gate"}


@needs_weights
def test_blurred_photo_is_rejected_without_diagnosis(api):
    img = Image.open(io.BytesIO(fixture("blackgram"))).filter(ImageFilter.GaussianBlur(9))
    buf = io.BytesIO()
    img.save(buf, format="JPEG")
    out = post(api, "blackgram", buf.getvalue()).json()
    assert out["status"] == "rejected_quality" and "blurry" in out["reasons"]
    assert out["ood_score"] is None and out["model_version"]["head"]
    assert not {"disease", "gradcam", "severity", "top3"} & set(out)


@needs_weights
def test_wrong_crop_is_uncertain_with_top3(api):
    # potato's gate flags 100% of other crops' held-out photos (docs/OOD_GATE.md)
    out = post(api, "potato", fixture("banana")).json()
    assert out["status"] == "uncertain" and out["reasons"]
    assert len(out["top3"]) == 3
    assert out["top3"][0]["probability"] >= out["top3"][1]["probability"] >= out["top3"][2]["probability"]
