import hashlib
import json
import re
from pathlib import Path

ML = Path(__file__).resolve().parents[1]
MODELS = ML / "models"
REGISTRY = json.loads((MODELS / "model_registry.json").read_text(encoding="utf-8"))
SEMVER = re.compile(r"^\d+\.\d+\.\d+$")


def sha256(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def test_weight_files_match_registry():
    """Changing a weight file without updating models/model_registry.json (sha + version) fails here."""
    assert sha256(MODELS / REGISTRY["backbone"]["file"]) == REGISTRY["backbone"]["sha256"]
    for crop, h in REGISTRY["heads"].items():
        assert sha256(MODELS / h["file"]) == h["sha256"], f"{crop}: weights changed - bump the version, update sha256"
    for name, digest in REGISTRY["gate"]["files"].items():
        assert sha256(MODELS / name) == digest, f"{name} changed - bump the gate version, update sha256"


def test_registry_entries_are_complete():
    label_maps = json.loads((ML / "data" / "label_maps.json").read_text(encoding="utf-8"))
    metrics = {m["crop"]: m for m in json.loads((MODELS / "metrics.json").read_text(encoding="utf-8"))["crops"]}
    for entry in [REGISTRY["backbone"], REGISTRY["gate"], *REGISTRY["heads"].values()]:
        assert SEMVER.match(entry["version"]) and entry["date"] and entry["training_data"]
    assert set(REGISTRY["heads"]) == set(label_maps) == set(metrics)
    for crop, h in REGISTRY["heads"].items():
        assert h["classes"] == sorted(label_maps[crop], key=label_maps[crop].get)
        assert h["metrics"] == f"metrics.json#{crop}"
