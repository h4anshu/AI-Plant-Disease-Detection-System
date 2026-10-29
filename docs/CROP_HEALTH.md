# Crop health from space, for a saved field

Added 29 Oct 2026. The leaf photo says *which disease*; the satellite says *whether the whole field is under stress*, and since when. Until now that view existed only for a checkup with a location (`docs/FIELD_HEALTH.md`). A farmer who saved a field for weather alerts can now see it for that field, without taking a photo.

## What a farmer sees

Weather & Alerts › **"Crop health from space: {field}"**, under the 72-hour strip. One button, "See this field from space". Then the same view as in a checkup: a verdict ("Below neighbouring fields since 27 Sept 2026", "in line with nearby fields", "not farmland", "no clear image: cloudy season"), a chart of the field's greenness (NDVI) and leaf chlorophyll (NDRE) over the last 120 days against the middle half of the fields around it, for wheat the experimental yellow-rust index, how many satellite images were clear, and the line "the satellite shows whether the field is under stress, not which disease".

## How it works

- `GET /api/fields/:id/health` (`controllers/fieldHealthController.js`, `getSavedFieldHealth`), owner only (an account, or the guest browser), the same `POST /field-health` of the geo-service as for a checkup (Sentinel-2 through Earth Engine), with `date` = today and the field's crop. `answerHealth` is the one function behind both views.
- **On request only**, never as part of the alerts read: each uncached answer is an Earth Engine computation. Cached per place (to 11 m), crop and **day** for 30 days, under a SHA-256 key; limited by `FIELD_RATE_LIMIT` (10 per 10 minutes per IP); counted in `GET /api/alerts/health` as `earth-engine-health`.
- **Privacy:** the exact point goes only to the geo-service in a POST body (and so to Earth Engine, a circle of 30 m around it); it is never in an answer, a cache key or a log (`tests/savedFieldHealth.test.js` checks each). The Privacy page says so. "Delete my data" and "Delete my account" remove the field's cached answers (31 days of keys), like the radar ones.
- Client: `components/workspace/CropHealthCard.jsx` around the existing `FieldHealth` (it now takes `fieldId` as well as `predictionId`); it starts afresh when another field is chosen.

## Not built

- No alert from it: a field "below its neighbours" is shown, not pushed. Doing so would mean an Earth Engine run per field per day for everyone with notifications on; with the free monthly quota (18,000 EECU-seconds) that needs a budget guard like the weather one first.
- Ten-metre pixels and a 30 m circle: a small or oddly shaped field, a field next to a wood or a road, and a cloudy season are the cases where the verdict is weak; the screen says "no clear image" rather than guessing.
- A real field with real photos has not been compared with it: the three pilot fields (task.md, Pending) are what would show whether "below neighbours" matches what the farmer sees.

## Checked

Server `savedFieldHealth.test.js` (10), client `CropHealth.test.jsx` (4). Real browser against a stand-in geo-service: the card appears, asks nothing until the button, draws the verdict and the chart, and a second look after a reload is answered from the cache (the stand-in saw one call). **Not checked:** the real geo-service and Earth Engine from this feature (the same code path as a checkup's view, which was).
