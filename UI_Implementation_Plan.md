# Frontend Implementation Guide — Crop-Aware Architecture

This explains one important design decision that affects how the Predict flow needs to work, so the UI can be built correctly from here rather than reworked later.

## The core decision: one model, many crops, crop selected by the user

The ML model is **one shared CNN backbone with a separate classification head per crop** — not a single flat "PlantVillage-style" model that guesses both crop and disease from the image alone.

That means: **the farmer must select their crop in the UI before/with the photo upload.** This is intentional, not a shortcut — real production agri-AI apps (Plantix, etc.) work this way. The farmer already knows what they planted; making the model re-derive that from a photo just adds a failure point for no benefit.

## Current crop scope

**Active now (6):** Wheat, Rice, Sugarcane, Potato, Maize, Pigeonpea
**Not available yet:** Mustard — data isn't ready (in progress, expected later in the year). Suggest either omitting it from the dropdown entirely for now, or showing it disabled/"coming soon" — your call on which reads better in the UI.
**Not in scope:** Chickpea was dropped from the project (data limitation), no need to design for it.

## What the Predict page needs

1. **Crop selector** — required field, dropdown/select, options = the 6 active crops above. Must be selected before the image can be submitted.
2. **Image upload** — existing UploadBox component, unchanged.
3. **On submit**, send both to the backend as multipart form data:
   - `file`: the image
   - `crop`: string, one of `wheat | rice | sugarcane | potato | maize | pigeonpea` (lowercase, matches the backend enum)

## API contract — `POST /api/predict`

**Request:** `multipart/form-data`
```
file: <image>
crop: "wheat"   // one of the 6 values above
```

**Response:**
```json
{
  "disease": "string",
  "confidence": 0.0,
  "severity": "early | moderate | severe",
  "treatment": "string",
  "gradcam": null,
  "yieldLossPercent": null,
  "imageUrl": "string",
  "crop": "string",
  "createdAt": "string"
}
```

**Important:** `gradcam` and `yieldLossPercent` will be `null` for a while — the real ML service, Grad-CAM, and yield layer aren't built yet. **Build the Result card to handle `null` gracefully** (hide the Grad-CAM overlay / yield block rather than showing broken UI) instead of assuming they'll always have values.

## Result card requirements

Per the original plan's design principle (minimal, clean, severity color-coding is the one visual cue that matters):
- Leaf image
- Disease name + confidence (bar or %)
- **Severity badge, color-coded:** green = early, orange = moderate, red = severe
- Treatment advice text
- Grad-CAM overlay — only render if `gradcam` is non-null
- Yield impact block — only render if `yieldLossPercent` is non-null (Phase 5, not built yet — safe to build the UI slot now and just keep it hidden)

## One thing to avoid

Don't hardcode any UI logic against specific disease name strings (e.g. don't write `if (disease === "Leaf_rust")`). The real trained class names aren't finalized yet — the `treatmentMap.js` placeholder currently in the backend doesn't match real classes either and will be rebuilt once training is done. Render everything generically off whatever `disease` / `severity` / `treatment` strings come back from the API.

## Mock service note

`mock-ml-service` has been updated to also accept a `crop` field in its request (even though it currently ignores it and returns a stub) — so developing against the mock stays consistent with the real contract above. If you add more mock behavior, keep it matching this contract so nothing needs rewiring when the real ML service comes online.
