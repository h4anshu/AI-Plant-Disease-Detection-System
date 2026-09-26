# Rejected / unused dataset archives

Moved here (not deleted) during the Sep 2026 new-crop expansion. Full evidence for each decision is in `ml-service/NEW_CROPS_REPORT.md`; the pipeline config (`ml-service/train/new_crops.py`) still points here, so every analysis can be re-run.

| Archive | Why it is not used for training |
|---|---|
| Sorghum Disease Image Dataset.zip | 4 of 6 classes are grain heads/panicles, not leaves; many shot on a white floor; no Healthy class. |
| Cotton Leaf Disease Dataset with Severity Levels (1).zip | Byte-identical duplicate (same MD5) of `Cotton Leaf Disease Dataset with Severity Levels.zip`. |
| Sugarcane Leaf Disease Dataset.zip | Sugarcane is an existing crop — parked per instruction, not judged. |
| Okra DiseaseNet Dataset.zip | 1,495 files but only 293 unique images; copies span its own train/val/test folders. Honest accuracy 55%. |
| Mango Leaf Disease Dataset.zip | Only background-removed leaves on black; image resolution differs by class (shortcut); 86% CV, Gall Midge 59%. |
| Tomato-Village-main.zip | Detached leaves on paper, per-class JPEG compression, 118 same-leaf-two-labels cases; 62% CV, 17% on field photos. |
| Chilli Leaf Disease Image Dataset for Classificati.zip | 98-100% white-paper backdrop + resolution shortcut; healthy field leaves called Leaf Curl 344/424 times. |
| Cotton Leaf Image Dataset for Disease Classificati.zip | White-paper backdrop; fails on field cotton (Fusarium recall 2%). |
| Niphad Grape Leaf Disease Dataset (NGLD).zip | 93-99% detached leaves on paper: 99% on paper photos, 12-19% on field photos. Not shipped (product decision). |
| Image Dataset for Turmeric Plant Leaf Disease Detection.zip | 100% detached leaves on white paper; no field photos to validate on. Not shipped. |
| Tea Leaf Dataset.rar + Tea Leaf Dataset/ | CS-D augmented release (1,500 raw x 9 copies per class), leaves on paper. Not shipped. Get the raw 9,000 field photos from Mendeley if tea is revisited. |
| Cotton Leaf Disease Dataset with Severity Levels.zip | Field photos but only Bacterial Blight + Healthy have >=50 originals; a 2-class head can't flag leaf curl or wilts. Not shipped. Severity grades are still useful to validate the severity module. |
| Leaf Image Dataset for Plant disease Classificatio.zip | Six small vegetable crops + okra: detached leaves on white paper, 135-303 photos per crop, classes of 12-132 images. |

The archives behind the shipped heads (groundnut, blackgram, apple, Multi-Crop) and the PlantDoc external test set are in `../_dataset_backup/`.
