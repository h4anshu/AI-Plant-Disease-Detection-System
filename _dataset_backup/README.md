# Processed dataset archives (backup)

These archives were used for the Sep 2026 new-crop expansion and are **not needed by the app**. Their images were extracted into `ml-service/data/raw/<crop>/`, and the trained heads in `ml-service/models/heads/` never read them. Keep them only to re-run the analysis from scratch: `ml-service/train/new_crops.py` points here.

| Archive | Used for |
|---|---|
| A novel groundnut leaf dataset ….zip | Groundnut head (West Bengal field photos) |
| Blackgram Plant Leaf Disease Dataset.zip | Blackgram head |
| Indigenous Dataset for Apple Leaf Disease Detection and Classification.zip | Apple head |
| Multi-Crop Disease Dataset.zip | Groundnut (Tamil Nadu part) and banana heads; its chilli, radish and cauliflower parts were rejected |
| PlantDoc-Dataset-master.zip | External test set only (apple and grape healthy leaves, tomato) — never used for training |

Rejected datasets are in `../_rejected_datasets/` with reasons. Full analysis: `ml-service/NEW_CROPS_REPORT.md`.
