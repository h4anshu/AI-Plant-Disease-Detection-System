"""Export predictions that need an expert's eye to a CSV (docs/MONITORING.md, "Relabel loop").

    cd ml-service
    python train/export_relabel_queue.py --env-file ../server/.env [--since 2026-10-01] [--out data/relabel.csv]

Picks every prediction a user marked wrong or "not sure", and every one the gate called "uncertain".
The CSV has empty expert_label / reviewer / notes columns for the reviewer to fill in. Users' answers are
unverified: only a reviewed expert_label may ever become training data.
The file holds links to users' photos: share it only with the reviewer, it is not for git (data/ is ignored).
"""
import argparse
import csv
import os
import sys
from datetime import datetime, timezone
from pathlib import Path

ML = Path(__file__).resolve().parents[1]
QUERY = {"$or": [{"feedback": {"$in": ["incorrect", "unsure"]}}, {"status": "uncertain"}]}
COLUMNS = ["id", "created_at", "crop", "status", "predicted", "confidence", "top3", "feedback", "corrected_label",
           "model_backbone", "model_head", "model_gate", "image_url", "gradcam_url", "expert_label", "reviewer", "notes"]


def to_row(doc):
    """One Mongo prediction -> one CSV row (reviewer columns left empty)."""
    version = doc.get("modelVersion") or {}
    gradcam = doc.get("gradcam") or ""
    return {
        "id": str(doc["_id"]),
        "created_at": doc["createdAt"].isoformat() if doc.get("createdAt") else "",
        "crop": doc.get("crop", ""),
        "status": doc.get("status") or "ok",
        "predicted": doc.get("disease") or "",
        "confidence": "" if doc.get("confidence") is None else round(doc["confidence"], 4),
        "top3": "; ".join(f"{t['disease']} {t['probability']:.2f}" for t in doc.get("top3") or []),
        "feedback": doc.get("feedback") or "",
        "corrected_label": doc.get("correctedLabel") or "",
        "model_backbone": version.get("backbone", ""),
        "model_head": version.get("head", ""),
        "model_gate": version.get("gate", ""),
        "image_url": doc.get("imageUrl", ""),
        "gradcam_url": gradcam if gradcam.startswith("http") else "",  # old base64 heatmaps are not links
        "expert_label": "", "reviewer": "", "notes": "",
    }


def read_env_file(path):
    for line in Path(path).read_text(encoding="utf-8").splitlines():
        key, sep, value = line.partition("=")
        if sep and not line.lstrip().startswith("#"):
            os.environ.setdefault(key.strip(), value.strip())


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--env-file", help="read MONGODB_URI from this file (e.g. ../server/.env)")
    ap.add_argument("--since", help="only predictions from this date on (YYYY-MM-DD)")
    ap.add_argument("--out", default=str(ML / "data" / f"relabel_queue_{datetime.now():%Y-%m-%d}.csv"))
    a = ap.parse_args()
    if a.env_file:
        read_env_file(a.env_file)
    from pymongo import MongoClient  # requirements-export.txt

    query = dict(QUERY)
    if a.since:
        query["createdAt"] = {"$gte": datetime.fromisoformat(a.since).replace(tzinfo=timezone.utc)}
    client = MongoClient(os.environ["MONGODB_URI"])
    docs = client.get_default_database().predictions.find(query).sort("createdAt", 1)
    Path(a.out).parent.mkdir(parents=True, exist_ok=True)
    with open(a.out, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=COLUMNS)
        writer.writeheader()
        n = sum(1 for doc in docs if writer.writerow(to_row(doc)) or True)
    print(f"{n} predictions to review -> {a.out}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
