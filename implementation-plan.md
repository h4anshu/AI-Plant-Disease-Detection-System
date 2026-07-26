# AI Plant Disease Detection System — Implementation Plan (Updated)
### with Severity-Based Yield Impact Estimation | MERN + AI/ML

> **Status:** Phase 0 (setup) + dataset collection complete. Phase 1 (ML training) next.
> **This document supersedes the original plan** — folder conventions, crop scope, and architecture below reflect actual decisions made during setup, not the original draft assumptions.

---

## 1. System Overview

A web platform where a farmer selects their crop, uploads a leaf photograph, and gets:
1. **Disease diagnosis** — CNN classifies the disease (crop-specific head)
2. **Severity level** — early / moderate / severe
3. **Treatment advice** — mapped to the detected disease
4. **Yield impact** — severity converted into an estimated yield-loss % (Phase 5, not yet built)

The heavy ML runs in a separate **Python service**. The MERN app handles UI, users, storage, and history.

---

## 2. Crop Scope (Active as of Phase 1 start)

**Active (6):** Wheat, Rice, Sugarcane, Potato, Maize, Pigeonpea
**Deferred:** Mustard — real disease data (HDMLS) not freely available; mustard is out-of-season (Rabi crop, Oct–Feb) so self-collection isn't currently possible either. Will be added as a 7th crop head once data exists (email request sent to HDMLS authors; self-collection planned for Nov–Feb season).
**Excluded permanently:** Chickpea — no usable healthy-class image source exists (FUSARIUM-22 is resistance-grading only, no healthy class); dropped rather than shipping a crop that can't say "no disease detected."

Dataset sources per active crop (see `raw_placement_report.json` for exact counts):
| Crop | Source | Classes | Notes |
|---|---|---|---|
| Wheat | Mendely_Wheat (Original only) + Yellow-Rust-19 | 6 (incl. collapsed Yellow_Rust) | YR-19 has real expert severity grades (0/R/MR/MRMS/MS/S) — saved to `wheat_severity_labels.csv` for severity model validation |
| Rice | Mendeley (Sethy et al.) | 4 | — |
| Sugarcane | Mendaly (11-class) | 11 | Two other sugarcane sources excluded (taxonomy conflicts / likely pre-augmented) |
| Potato | PlantVillage subset | 3 | Deduped nested-folder issue resolved |
| Maize | Kaggle (smaranjitghose, Corn/Maize Leaf Disease) | 4 | PlantVillage locally had no corn — needed separate source |
| Pigeonpea | Mendeley | 4 | — |

---

## 3. Architecture — Crop-Aware, Shared Backbone

```
┌──────────────┐    image+crop   ┌──────────────┐   image+crop   ┌────────────────────┐
│   React      │ ─────────────▶  │  Node +       │ ─────────────▶ │  Python + FastAPI   │
│  (frontend)  │ ◀─────────────  │  Express API  │ ◀───────────── │  (ML inference)     │
└──────────────┘   JSON result   └──────┬───────┘   JSON result   └─────────┬──────────┘
                                        │                                    │
                                  ┌─────▼─────┐                    ┌─────────▼──────────┐
                                  │  MongoDB  │                    │ Shared EfficientNetB0│
                                  │           │                    │ backbone + per-crop  │
                                  └───────────┘                    │ classification heads │
                                                                    └──────────────────────┘
```

**Key design decision:** ONE shared CNN backbone (transfer-learned once) with a **separate classification head per crop**, not a single flat model and not full auto crop-detection. The farmer selects crop in the UI (dropdown); this is deliberate — production agri-AI apps do this, and it avoids compounding errors from a model guessing the crop wrong. Adding a 7th crop (mustard) later means adding one head + fine-tuning, not retraining everything.

**Critical integration requirement:** `crop` must be forwarded end-to-end — Client → Express (`/api/predict`) → FastAPI (`/predict-disease`) — so the ML service knows which head to query. Severity is a separate parallel step (leaf-area segmentation, or real expert labels where available — wheat now, mustard later) independent of which head fires.

---

## 4. Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 18/19, Vite, Tailwind CSS (v4, via `@tailwindcss/vite`), Axios, react-router-dom |
| Backend | Node.js, Express.js — **ESM modules** (`import`/`export`), flat `server/` layout (entry: `server.js`) |
| Database | MongoDB (Mongoose) |
| Auth | JWT (`jsonwebtoken` + **bcryptjs**, not `bcrypt`) |
| ML Service | Python 3.11 (pinned — TensorFlow has no 3.11+ wheel gaps to worry about; 3.12/3.14 avoided), FastAPI, TensorFlow/Keras, scikit-learn |
| Model | Shared EfficientNetB0 backbone (transfer learning) + per-crop head; Extra Trees for yield (Phase 5) |
| Storage | Cloudinary (leaf images) |
| Deploy | Vercel (React) · Render (Express + FastAPI) · MongoDB Atlas |

---

## 5. Folder Structure (as actually built)

```
plant-disease-system/
│
├── client/                     # React frontend — teammate-built UI, merged
│   └── (Vite + Tailwind + Axios + react-router-dom; see UI_Implementation_Plan.md)
│
├── server/                     # Node + Express — FLAT layout, ESM
│   ├── config/db.js, cloudinary.js
│   ├── models/User.js, Prediction.js
│   ├── routes/auth.routes.js, predict.routes.js
│   ├── controllers/authController.js, predictController.js
│   ├── middleware/auth.js, upload.js
│   ├── utils/treatmentMap.js (⚠ placeholder, needs rebuild after Phase 1),
│   │         yieldLoss.js (Phase 5)
│   └── server.js               # entry point (not src/index.js)
│
├── mock-ml-service/             # Teammate's stub for frontend dev — 
│                                 # NOT the real ML service, kept separate
│
└── ml-service/                  # Python FastAPI — real ML service
    ├── data/raw/<crop>/<class>/  # 6 crops consolidated (5.2GB+)
    ├── models/backbone/, models/heads/<crop>/
    ├── app.py, predict.py
    ├── train/consolidate_raw_data.py, audit_datasets.py
    └── requirements.txt
```

---

## 6. Database Schema (MongoDB)

**User**
```
{ _id, name, email, passwordHash, createdAt }
```

**Prediction**
```
{
  _id, userId,
  imageUrl,
  crop,              // enum: wheat | rice | sugarcane | potato | maize | pigeonpea
  disease,
  confidence,        // 0–1
  severity,          // early | moderate | severe
  yieldLossPercent,  // null until Phase 5
  treatment,
  createdAt
}
```

---

## 7. API Endpoints

**Express (Node)**
| Method | Route | Purpose |
|---|---|---|
| POST | `/api/auth/register` | Create account |
| POST | `/api/auth/login` | Login, return JWT |
| POST | `/api/predict` | **multipart: `file` + `crop`** → orchestrate ML → save → return result |
| GET | `/api/predictions` | User's prediction history |

**FastAPI (Python)**
| Method | Route | Purpose |
|---|---|---|
| POST | `/predict-disease` | **image + crop** in → disease, confidence, severity, Grad-CAM out (routes to crop-specific head) |
| GET | `/health` | Service health check |

---

## 8. Environment Variables

`server/.env`: `MONGODB_URI`, `PORT=4000`, `JWT_SECRET`, `FASTAPI_URL`, `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET`
`ml-service/.env`: (TBD in Phase 2)

---

## 9. Development Phases — Status

| Phase | Work | Status |
|---|---|---|
| 0 | Setup (folders, base servers) | ✅ Done |
| 0.5 | Dataset collection, audit, consolidation (6 crops) | ✅ Done |
| 0.5 | Server merge with teammate's UI/backend work | ✅ Done (this task) |
| 1 | Train/val/test split, severity labeling (segmentation + real expert labels for wheat), shared-backbone + per-crop-head model training | ⏭ Next |
| 2 | ML service API — wire real model into FastAPI, crop-routing | Pending |
| 3 | Backend — rebuild `treatmentMap.js` against real class names | Pending |
| 4 | Frontend — see `UI_Implementation_Plan.md` | In progress (teammate) |
| 5 | Yield impact layer | Pending |
| 6 | Testing, deploy, docs | Pending |
| — | Mustard (7th crop) — pending data (email reply or Nov–Feb self-collection) | Deferred |

---

## 10. Known Placeholders / Non-Functional Pieces (do not build UI logic around these yet)

- `treatmentMap.js` — keys don't match real trained class names, will be rebuilt in Phase 3
- Grad-CAM — not implemented, FastAPI will return `null` until Phase 1/2 built
- `yieldLossPercent` — always `null` until Phase 5
- `mock-ml-service` — dev-only stub, its response shape is a stand-in, not the final contract
