import base64
import io
import json
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
