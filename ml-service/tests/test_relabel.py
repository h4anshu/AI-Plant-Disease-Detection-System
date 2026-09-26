from datetime import datetime

from bson import ObjectId

from train.export_relabel_queue import COLUMNS, QUERY, to_row


def test_query_picks_disagreements_unsure_and_uncertain():
    assert QUERY == {"$or": [{"feedback": {"$in": ["incorrect", "unsure"]}}, {"status": "uncertain"}]}


def test_row_for_a_corrected_prediction():
    doc = {"_id": ObjectId("6ab748480b8116240ec672a2"), "createdAt": datetime(2026, 10, 1, 9, 30), "crop": "wheat",
           "status": "ok", "disease": "LeafBlight", "confidence": 0.912345, "feedback": "incorrect",
           "correctedLabel": "WheatBlast", "modelVersion": {"backbone": "1.0.0", "head": "1.0.0", "gate": "1.0.0"},
           "imageUrl": "https://res.cloudinary.com/x/leaf.jpg", "gradcam": "https://res.cloudinary.com/x/cam.png",
           "deviceId": "3f2b8c1e-9d4a-4e7b-8a6c-2f1e0d9c8b7a"}
    row = to_row(doc)
    assert list(row) == COLUMNS
    assert row["predicted"] == "LeafBlight" and row["corrected_label"] == "WheatBlast" and row["confidence"] == 0.9123
    assert row["model_head"] == "1.0.0" and row["gradcam_url"].endswith("cam.png")
    assert row["expert_label"] == "" and "3f2b8c1e" not in str(row)  # never who sent it


def test_row_for_an_old_uncertain_record():
    doc = {"_id": ObjectId(), "crop": "banana", "status": "uncertain", "confidence": 0.41,
           "top3": [{"disease": "Sigatoka", "probability": 0.41}, {"disease": "Healthy", "probability": 0.3}],
           "gradcam": "iVBORw0KGgo="}  # base64 from before the Cloudinary migration, no model version
    row = to_row(doc)
    assert row["top3"] == "Sigatoka 0.41; Healthy 0.30"
    assert row["gradcam_url"] == "" and row["model_head"] == "" and row["predicted"] == ""
