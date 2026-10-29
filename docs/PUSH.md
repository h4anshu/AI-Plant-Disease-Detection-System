# Push notifications (free)

Added 29 Oct 2026. Before this, a farmer learned of a frost only by opening the app. Now a phone can be told when a serious warning is issued for one of the saved fields, with the app closed. Free: it goes through the browser's own push service (Google, Mozilla, Apple), encrypted for that one browser.

## 1. What a farmer sees

- **Weather & Alerts › "Alerts on this phone".** A card with one button, "Turn on notifications". The browser's permission question appears only when it is tapped. Then: "Notifications are on for this phone", "Send a test" and "Turn off".
- **What is sent:** a notification such as "Frost: Warning, Your wheat field, tomorrow. Open PlantGuard to see what to do." (English or Hindi, the language chosen when it was turned on). **Only the hazard, the level and the crop: never the field's name or place** (it shows on a lock screen). A tap opens the app on Weather & Alerts.
- **Which alerts:** `Warning` and `Urgent` of our own rules (frost, heat, heavy rain, dry spell...), the river and fire alerts, and official warnings (NDMA SACHET, IMD, CWC) of those levels. `Watch` and `Tip` alerts stay on the screen: a phone that buzzes for every tip gets switched off. `PUSH_MIN_LEVEL` changes the floor.
- **Once, and again only when it gets worse:** each phone remembers what it was told (`id|level`); a Warning that becomes Urgent is sent again. At most 3 per phone per run (`PUSH_MAX_PER_RUN`), worst first; the rest follow on the next run.
- **iPhone:** web push works only for an app added to the Home Screen (Share › Add to Home Screen), iOS 16.4 or later. In Safari the card says so instead of offering the button. **Not shown** where the browser cannot do push, or the server has no keys.

## 2. How it works

| Piece | What it does |
|---|---|
| `server/services/push.js` | `dispatchPushes()`: for every owner with a subscription, computes what the screen would show (`computeFieldAlerts`, the same function as `GET /api/fields/alerts`), picks what is new, claims it atomically, sends it. A 404/410 from the push service removes the subscription; another failure gives the alert back (tried again next run), and 8 failures in a row drop it |
| `POST /api/alerts/tick` | the existing operator route (header `x-alerts-token`) now ends with `dispatchPushes()`; its answer carries `push: { owners, subscriptions, sent, removed, failed, skipped }`. **Cloud Scheduler calls it** (§4): nothing else runs on a schedule, because Cloud Run sleeps |
| `PushSubscription` | per owner (account, or guest browser), the secret endpoint, the two keys, the language, what was sent; dropped after 180 days without the app syncing it |
| `GET /api/push/key`, `POST /api/push/subscribe`, `/unsubscribe`, `/test` | subscribe (max 5 devices per owner), remove (no sign-in needed: it must work after a sign-out), test message to the caller's own phone |
| `client/src/services/push.js`, `PushCard.jsx` | permission, subscribing, syncing; `public/sw.js` draws the notification and opens the app on a tap |
| `server/utils/pushText.js` | the words, per language (Hindi AI-drafted: review it with the rest) |

## 3. Safety

- **The server posts to the subscription's endpoint, so an endpoint is never taken as given:** https only, no credentials, port 443, and the host must be a browser push service (`fcm.googleapis.com`, `updates.push.services.mozilla.com`, `*.push.apple.com`, `*.notify.windows.com`). Anything else, such as an internal address or a look-alike host, is a 400 (test: `push.test.js`, "who may subscribe"). Otherwise a subscription would be a way to make the server call any address.
- **Whose phone it is:** a subscription belongs to the owner who subscribed. **Signing out turns notifications off on that phone** (and removes the server's copy), so the next person is not sent the last one's warnings; deleting the account does too. A session that only ran out keeps them (the account is still theirs). Signing in moves an already-on phone to the new account. "Delete my data" and "Delete my account" remove the subscriptions; claiming a browser's guest records moves them.
- The endpoint is never logged; a test notification and subscribing are rate-limited per device.

## 4. Turning it on in production (needs you)

1. **Make the keys once** (the private key is a secret; the public one is not):
   ```powershell
   cd server
   $k = npx web-push generate-vapid-keys --json | ConvertFrom-Json
   $f = New-TemporaryFile; [IO.File]::WriteAllText($f, $k.privateKey)
   gcloud secrets create vapid-private-key --replication-policy=automatic --data-file=$f
   Remove-Item $f
   $k.publicKey        # copy it for the next step
   cd ..
   ```
2. **Give them to the server** (use your own email in `VAPID_SUBJECT`; push services contact it about abuse):
   ```powershell
   gcloud run services update server --region asia-south1 --update-secrets "VAPID_PRIVATE_KEY=vapid-private-key:latest" --update-env-vars "VAPID_PUBLIC_KEY=<the public key>,VAPID_SUBJECT=mailto:<your email>"
   ```
   Do not rotate these keys later without telling users: phones subscribed with the old public key stop working until they turn notifications off and on.
3. **The schedule.** `ALERTS_ADMIN_TOKEN` must be set on the server (a long random value, as a secret). Then one Cloud Scheduler job, every 30 minutes (3 jobs a month are free):
   ```powershell
   gcloud services enable cloudscheduler.googleapis.com
   gcloud scheduler jobs create http plantguard-tick --location asia-south1 --schedule "*/30 * * * *" --uri "https://<server url>/api/alerts/tick" --http-method POST --headers "x-alerts-token=<the admin token>"
   ```
   A run asks Open-Meteo for each subscribed owner's grid cells (cached 1 to 6 hours), so it fits the free allowance (`docs/MONITORING.md`, "Open-Meteo allowance"); `PUSH_BUDGET_MS` (default 100 s) stops a run before Cloud Run's time limit and 300 owners are handled per run.
4. Check: `GET /api/alerts/health` (with the token) shows `configured.push: true` and the number of subscriptions; on a phone, Weather & Alerts › "Turn on notifications" › "Send a test".

## 5. Checked, and not

- Server `push.test.js` (36): subscribing (every refused address, bad keys, caps, language, owner changes), unsubscribing, test sends, dispatch (levels, once, worse-again, order and the cap of 3, several phones, two runs at once, gone and failing subscriptions, a failing owner, the time budget, the tick), every hazard/level/crop in every language, deleting and claiming.
- Client `Push.test.jsx`, `AuthPush.test.jsx`, `serviceWorker.test.js`: the states of the card, the permission flow, undoing a refused subscription, sign-in/out, the worker drawing and opening (a hostile `url` such as `//evil.example` becomes `/overview`).
- **Real browser (Chromium, production build):** with a real VAPID key pair the browser made a real subscription at `fcm.googleapis.com`, the server accepted it, and "Send a test" went through `web-push` to Google's push service and was accepted (the card said "Test sent").
- **Not checked:** that the notification appears on a phone. The automated browser has no channel from Google's service and cannot list notifications even for a direct `showNotification`. Try it on your phone after deploying: it is the one thing left.
- Not built: quiet hours, a per-hazard choice, push for "watch" level, the notification's action buttons ("Done").
