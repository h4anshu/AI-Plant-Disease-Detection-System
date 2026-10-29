# Security (public deployment, optional sign-in)

Signing in is optional (`docs/AUTH.md`). A visitor with no token is a guest, scoped by the browser's device id;
a signed-in user is scoped by their account. This page covers what protects the public deployment.

## Covered

| Risk | Protection | Where |
|---|---|---|
| Guests seeing each other's history (photos, diagnoses) | Each browser keeps a random UUID in localStorage and sends it as `X-Device-Id`. Guest records are saved with it, and guest history only returns records with the same id. With no id, history is empty. A malformed id gets 400. Guest records saved before this change have no id, so nobody sees them. | `server/middleware/guestDevice.js`, `client/src/services/api.js` |
| Abuse and cost: every prediction is an ML call, a Cloudinary upload and a MongoDB write | Rate limit per IP: `POST /api/predict` 20 per 10 min (`PREDICT_RATE_LIMIT`), all routes 300 per 15 min (`GLOBAL_RATE_LIMIT`). Cloud Run `--max-instances 3` caps the bill. | `server/middleware/rateLimit.js` |
| Calling the ML service directly, which skips the rate limit | `/predict-disease` requires the shared secret `X-ML-Token` (`ML_SERVICE_TOKEN`, compared in constant time). `/health` stays open; it only shows model versions. | `ml-service/app.py`, `server/controllers/predictController.js` |
| Non-image or malicious uploads | The real file type is read from the bytes (sharp/libvips); the browser's mimetype is not trusted. Only JPEG, PNG and WebP are allowed, at most 4000 px per side and 5 MB. | `server/utils/image.js`, `server/middleware/upload.js` |
| Location and device leaks in public photos | The copy uploaded to Cloudinary is re-encoded without EXIF, so no GPS, camera model or serials. Orientation is applied first so the photo still displays upright. The ML service gets the original bytes, so predictions are unchanged. | `server/utils/image.js` |
| Other sites calling the API from a browser | CORS only allows `CLIENT_ORIGINS`. | `server/app.js` |
| Common web attacks | helmet headers (HSTS, nosniff, frame and referrer policies, no `X-Powered-By`). JSON bodies limited to 10 kB. | `server/app.js` |
| Leaking internals in error messages | Clients get generic messages; details go to the server log only. | controllers, `server/app.js` |
| Deploying with a missing secret | The server refuses to start and names every missing variable. In production (`NODE_ENV=production`, set in the Dockerfile) this includes `CLIENT_ORIGINS` and `ML_SERVICE_TOKEN`. | `server/server.js`, `server/.env.example` |
| Location privacy (disease map) | Location only after consent in the UI; the exact point is never returned by any API (`toResponse` strips it). The public map returns only H3 resolution-7 cells (about 5.2 km²) with at least 3 distinct browsers, report counts only (no device counts), and fixed 7/30/90-day windows so windows can't be subtracted. Guests without a device id count as one browser. | `server/utils/geo.js`, `server/controllers/mapController.js` |
| Right to delete | `DELETE /api/predict` removes all records of this browser (or user) and their Cloudinary photos and heatmaps; linked from `/privacy`. | `server/controllers/predictController.js`, `client/src/pages/Privacy.jsx` |
| Demo data leaking into the live map | The seed script refuses non-local MongoDB URIs; demo records are flagged and excluded unless `MAP_INCLUDE_DEMO=true` on a non-production server; the drift report and relabel export skip them. | `server/scripts/seed_demo_map.js` |
| Container escape impact | Both images run as non-root users (`node`, `app`). | Dockerfiles |

## Known limits

- **The device id is not authentication.** It's a random 122-bit secret held by the browser. Anyone
  who gets it (for example, someone using the same browser) sees that guest history. Clearing site data
  loses the history. Signing in and adding the guest records to the account removes this limit.
- **A token lives in the browser's storage for 30 days (renewed on use)** (not in a cookie): a script injected into the page could read it, so the
  page must stay free of third-party scripts. Signing out only forgets it in that browser; there is no "sign out everywhere" and
  no password reset yet (`docs/AUTH.md`, "Not built"). Deleting the account invalidates its tokens at once.
- **Rate limits count per Cloud Run instance** (in memory). With `max-instances 3`, a determined
  client gets at most 3× the limit. Use a shared store (Redis) if that ever matters.
- **The ML token is a shared secret.** A stronger setup is to make the ML service private:
  `gcloud run services remove-iam-policy-binding ml-service --member=allUsers --role=roles/run.invoker`,
  give the server's service account `roles/run.invoker`, and have the server send a Google ID
  token. Worth doing together with the auth work.
- **The ML service fails open when `ML_SERVICE_TOKEN` isn't set** (so local dev and tests work). It
  logs a warning at startup. Always set it on Cloud Run.

## Sign-in (done, `docs/AUTH.md`)

- A bad, expired or deleted-account token is a 401 (no silent fallback to guest).
- `/api/auth/login` counts only failed attempts per IP; `/api/auth/register` and account deletion are limited too.
- Passwords: 8 to 72 bytes, bcrypt cost 10; a wrong email and a wrong password look the same (message and time).
- Only strings are accepted for email and password (an object such as `{"$ne": null}` is refused, not run as a query).
- `JWT_SECRET` of at least 32 characters is required in production (the server refuses to start otherwise).
- Still open: what happens to anonymous guest records (retention or deletion policy).

## GPS hook

When the field-location feature is built, read GPS in `cleanImage()` (`server/utils/image.js`,
marked `HOOK`) from `meta.exif`, before the metadata is stripped, and store it with the user's
consent. It must not end up in the public Cloudinary copy.
