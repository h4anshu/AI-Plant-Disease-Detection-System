import sys
from pathlib import Path

import pytest

ML = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ML))

BACKBONE = ML / "models" / "backbone" / "efficientnetb0_backbone.keras"
# a Git-LFS pointer or a missing checkout would be tiny; the real backbone is ~17 MB
HAVE_WEIGHTS = BACKBONE.exists() and BACKBONE.stat().st_size > 1_000_000

needs_weights = pytest.mark.skipif(
    not HAVE_WEIGHTS, reason="model weights (ml-service/models/**/*.keras) are not in this checkout")


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
