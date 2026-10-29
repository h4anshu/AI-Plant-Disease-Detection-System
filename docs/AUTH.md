# Accounts (sign-in)

Added 29 Oct 2026. Signing in is **optional**: PlantGuard works for a guest exactly as before, and an account makes the same records follow the user to other phones. Code: `server/middleware/auth.js`, `server/controllers/authController.js`, `client/src/pages/Auth.jsx`, `client/src/context/AuthContext.jsx`.

## 1. Who owns a record

| Visitor | How the server knows | What they reach |
|---|---|---|
| Guest | no `Authorization` header; the browser's random id in `x-device-id` | records with `userId = 000…000` and that `deviceId` |
| Account | `Authorization: Bearer <token>` | records with that `userId` (the device id is ignored) |

One function decides it for every route: `ownerFilter` (`predictController.js`). Checkups, saved fields, "Did this help?" answers, reports, the context card, field health and the disease-risk strip all go through it, so an account cannot reach a guest's records or another account's, and a guest cannot reach an account's (tests: `tests/auth.test.js`, "every account has its own records").

## 2. The pieces

- **Register** `POST /api/auth/register { name, email, password }` → `{ token, user }`. Name 1 to 60 characters, a valid email (stored lowercase), password 8 to 72 bytes (bcrypt reads no more). A second account with the same email is a 409.
- **Sign in** `POST /api/auth/login`. A wrong email and a wrong password give the same answer and take the same time (a dummy hash is compared when the email is unknown).
- **Token:** a JWT (HS256, signed with `JWT_SECRET`, **30 days, renewed when the app is opened with less than 15 left**: `GET /api/auth/me` returns a fresh `token`, which the client stores; a person who opens the app now and then never meets the sign-in page, which matters while there is no password reset) holding the account id and email. The client keeps it in `localStorage` and sends `Authorization: Bearer <token>` (the older bare token is still accepted). Production needs a `JWT_SECRET` of at least 32 characters, or the server does not start.
- **A bad token is a 401, never a silent guest.** Expired, wrongly signed, "alg none", naming the guest placeholder, or belonging to a deleted account: `401 { code: "invalid_token" }`. The client then forgets the token and shows the guest view (`api.js` response interceptor, event `auth:expired`). The account's existence is checked on every request that carries a token (one indexed read), so deleting an account stops its token at once.
- **Profile** `GET /api/auth/me`.
- **Delete the account** `DELETE /api/auth/me { password }`: the password is asked again (a token left on a borrowed phone must not be enough). It erases the checkups with their photos and heatmaps in Cloudinary, the saved fields, the answers to "Did this help?", the caches keyed by their places and the reports (the same function as "Delete my data": `wipeOwner`), then the account.
- **Add this browser's guest records to the account** `GET /api/auth/guest-data` (what is there) and `POST /api/auth/claim-guest` (move it). The client asks right after signing in and on Profile › My data; **nothing moves unless the user says yes** (on a shared phone, whoever signs in must not absorb another person's records). An account holds 3 fields, so only the room left is used, the oldest first, and the rest stay with the browser (the screen says how many). An answer to "Did this help?" the account already gave wins over the guest's copy.

## 3. Protections

- Only strings are accepted for email and password: `{"email": {"$ne": null}}` is refused before it reaches the database.
- Rate limits per IP: failed sign-ins (`LOGIN_RATE_LIMIT`, default 20 per 15 minutes; a correct sign-in is never counted), new accounts (`REGISTER_RATE_LIMIT`, 10 per hour), wrong-password account deletions (`ACCOUNT_RATE_LIMIT`). Behind mobile-network address sharing many people have one IP: raise `GLOBAL_RATE_LIMIT` too (see `docs/MONITORING.md`).
- Passwords are stored only as bcrypt hashes (cost 10); responses never contain the hash; logs hold no emails or tokens (`logError` logs the error only).

## 4. What accounts change elsewhere

- **The public map and "disease reports near you"** count distinct reporters: a guest browser by its device id, an account by its account id. An asker's own reports are left out (by device id, or by account id). Several accounts made on purpose could fake an outbreak, as several made-up device ids always could; the 3-reporter rule is a privacy rule, not proof.
- **"Did this help?"** has a unique key of (device id, alert). An account has no device id, so `user:<account id>` stands in for it; no migration of the old index was needed.
- The **Privacy page** has an "Accounts" section; `docs/DPDP_CHECKLIST.md` lists the account data and "Delete my account".

## 5. Not built (and why)

- **Password reset and email verification.** They need to send email; there is no free sender configured. Until then a forgotten password means a new account, and the screen says so when the password is chosen. A typo in the email is not caught. Options when wanted: a free transactional-email tier (Brevo, Resend) with a one-hour reset link, or "Sign in with Google" (no password at all; needs a Google OAuth client id).
- **Sign out everywhere / token revocation** (tokens are stateless; only deleting the account revokes).
- **Change password, change email, "download my data".**
- **Making sign-in required.** It is optional on purpose (a farmer with one leaf should not meet a form). To require it for a page, wrap the route in a component that redirects to `/login` when `isAuthenticated` is false; the server side already refuses guests on `/api/auth/*`.

## 6. Production

| Where | What |
|---|---|
| Cloud Run (server) | `JWT_SECRET` (already a secret: `jwt-secret` in Secret Manager, 43 characters), optional `LOGIN_RATE_LIMIT`, `REGISTER_RATE_LIMIT`, `ACCOUNT_RATE_LIMIT`, and a raised `GLOBAL_RATE_LIMIT` |
| Vercel (client) | nothing new: `VITE_API_URL` as before. **No secret ever goes to Vercel**: everything in Vercel's `VITE_*` variables is public in the browser |
| MongoDB Atlas | nothing: the `users` collection and its unique email index are created on first use |

Users from the time before sign-in was switched off may still hold a token in their browser. If it was signed with the current secret and the account exists it works; otherwise it gets a 401 once and is forgotten.
