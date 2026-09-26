import sys
from pathlib import Path

import pytest

ML = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ML))

BACKBONE_ONNX = ML / "models" / "onnx" / "backbone.onnx"
# the serving models are ONNX files built from the tracked .keras weights (git-ignored)
HAVE_WEIGHTS = BACKBONE_ONNX.exists() and BACKBONE_ONNX.stat().st_size > 1_000_000

needs_weights = pytest.mark.skipif(
    not HAVE_WEIGHTS, reason="ONNX models not built - run `python train/export_onnx.py` (needs requirements-export.txt)")


@pytest.fixture(scope="session")
def api():
    """App client with the lifespan run: backbone + 10 heads + gate loaded once per session."""
    from fastapi.testclient import TestClient
    from app import app
    with TestClient(app) as c:
        yield c


@pytest.fixture(scope="module")
def bare_api():
    """App client without the lifespan: for routes that reject a request before touching a model."""
    from fastapi.testclient import TestClient
    from app import app
    return TestClient(app)
