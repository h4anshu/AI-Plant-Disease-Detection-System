"""(Re)build the golden regression fixtures: one held-out test photo per crop, short side resized to
256 px (above the gate's 212 px size cut-off), plus the expected class/confidence in
golden_expected.json. Run from ml-service/ only when a head changes on purpose:
    ../.venv/Scripts/python.exe tests/make_golden.py
"""
import io
import json
import sys
from pathlib import Path

from PIL import Image

ML = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ML))
from predict import ACTIVE_CROPS, load_models, predict_disease  # noqa: E402

OUT = ML / "tests" / "fixtures" / "golden"


def fixture_bytes(path: Path) -> bytes:
    img = Image.open(path).convert("RGB")
    s = 256 / min(img.size)
    img = img.resize((round(img.width * s), round(img.height * s)), Image.LANCZOS)
    buf = io.BytesIO()
    img.save(buf, format="JPEG", quality=88)
    return buf.getvalue()


def main():
    backbone, heads, label_maps, gate = load_models()
    OUT.mkdir(parents=True, exist_ok=True)
    expected = {}
    for crop in ACTIVE_CROPS:
        for cls in sorted(label_maps[crop]):
            done = False
            for path in sorted((ML / "data" / "test" / crop / cls).iterdir())[:25]:
                raw = fixture_bytes(path)
                out = predict_disease(backbone, heads, label_maps, gate, crop, raw)
                # a clear, correctly classified photo that passes the gate - stable across platforms
                if out["status"] == "ok" and out["disease"] == cls and out["confidence"] >= 0.9:
                    name = f"{crop}.jpg"
                    (OUT / name).write_bytes(raw)
                    expected[crop] = {"file": name, "source": f"data/test/{crop}/{cls}/{path.name}",
                                      "disease": cls, "confidence": round(out["confidence"], 4), "status": "ok"}
                    done = True
                    break
            if done:
                break
        print(crop, expected.get(crop))
    (ML / "tests" / "golden_expected.json").write_text(json.dumps(expected, indent=2), encoding="utf-8")
    size = sum(p.stat().st_size for p in OUT.iterdir())
    print(f"{len(expected)} fixtures, {size / 1024:.0f} KB total")


if __name__ == "__main__":
    main()
