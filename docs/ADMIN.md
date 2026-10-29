# The operator's page

Added 29 Oct 2026. Until now the operator (you) had `curl` and JSON. `/admin` shows the same, and the numbers that were missing, on one page.

## Using it

Open `https://<your site>/admin`, type the operator token (the server's `ALERTS_ADMIN_TOKEN`; without it set the page says it is off), press Open. The token is kept for that browser tab only (`sessionStorage`; never `localStorage`), and "Sign out" forgets it. The page is not linked from anywhere and carries `noindex`; the protection is the token, not the hidden address. It is in English on purpose: it is for one person.

## What it shows (counts only)

| Card | From | Why |
|---|---|---|
| **Use of the app**: accounts (and new this week), saved fields by crop, checkups (7 days, 30 days, all), outcomes of the last 30 days, how many shared a location, notifications on by language | `GET /api/admin/summary` | is anyone using it, and which crop |
| **Is the model right?** the users' own answer to "Was this correct?", per crop: answers, correct, wrong, not sure, and *right* = correct ÷ (correct + wrong) | the same | the nearest thing to field accuracy that exists without the pilot fields. Guest answers are unverified |
| **Most common diseases, 30 days** | the same | what is being found, where to look first |
| **Did the alerts help?** per rule: answers, acted, not needed, wrong (target: 60% or more acted) | `GET /api/alerts/feedback` | which rules to keep (`docs/ALERT_REVIEW.csv`) |
| **Feeds and switches**: each official feed's state and age, which kill switches are off, which keys and services are configured | `GET /api/alerts/health` | the first look when "no alert" might mean "feed down" |
| **Free services today**: calls against Open-Meteo's 10,000 a day and the counters of the others | the same | the ceiling that stops the weather alerts (`docs/MONITORING.md`) |

**Nothing names anyone**: no email, name, id, device id, field, place or photo; `tests/admin.test.js` searches the answer for each. Seed (demo) data of a local database is not counted.

## Protection

`adminGuard` (a timing-safe comparison, 503 when unset, 401 when wrong) on `/api/admin/*` and on the older `/api/alerts/health`, `/feedback`, `/tick`. **Wrong tokens are counted per IP** (`ADMIN_RATE_LIMIT`, default 10 per 15 minutes; a correct token is never counted), so guessing the token is slow and the operator is never locked out. Choose a long random token (the production one: `docs/DEPLOY.md`, Part F, and `docs/PUSH.md` §4).

## Limits

Counts are computed on each refresh over the whole collections (indexes on `createdAt` and `status` are not there): fine for thousands of checkups, to be revisited at hundreds of thousands. No history or graphs (numbers of today only), no export, no per-user view (on purpose).
