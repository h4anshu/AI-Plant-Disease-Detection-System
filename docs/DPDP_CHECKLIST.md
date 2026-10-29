# Data protection checklist (India's DPDP Act, 2023) for the weather-alert feature

**This is an engineering inventory and a to-do list, not legal advice.** A lawyer must confirm which obligations apply to this project (a student or non-commercial service; accounts are optional since 29 Oct 2026), when they start (the plan assumed **13 May 2027** for the main duties; confirm it), and the exact wording. Written 27 Oct 2026 from what the code does; items marked **Owner** or **Lawyer** need a person.

## 1. What personal data the app holds (from the code)
| Data | Where | Why | Kept | Deleted by |
|---|---|---|---|---|
| A random browser ID (UUID, in the browser's storage) | every guest record below | tells one browser's records from another's (a guest has no account) | as long as the records | "Delete my data" removes the records; the ID stays in the browser until it is cleared |
| **Account** (optional): name, email, a bcrypt hash of the password | `User` | sign-in; the checkups and fields of an account follow it to other phones | until the user deletes the account | "Delete my account" (Profile › My data; asks the password): erases the account and every record of it |
| Leaf photos, diagnosis, optional place (GPS or the photo's own) | `Prediction`, Cloudinary | the diagnosis, the history, the public map (counts per 5 km cell only) | until deleted | "Delete my data" (database, images, reports, caches) |
| Saved fields: crop, stage, optional name, **the exact point** (private, never returned or logged), the districts found for it | `Field` | weather and warning alerts | until deleted | the field's own Delete, or "Delete my data" |
| "Did this help?" answers: rule, date, level, answer, crop, stage (no place) | `AlertFeedback` | to judge which rules to keep | 1 year | "Delete my data"; TTL |
| Soil card values typed in (optional) | on the checkup | the soil card | with the checkup | "Delete my data" |
| Cached answers: weather and river by 5 km cell, fire by cell, news, the radar answer | caches (hours to 3 days; news 30 days) | speed, limits of free services | TTL | TTL; the radar cache of a field's place is also removed by "Delete my data" |
| Logs | Cloud Logging | operation | per Cloud Logging | never contain photos, IP addresses, device IDs or places (tests check this) |

## 2. Who else receives data
| Recipient | What | Note |
|---|---|---|
| MongoDB Atlas | all records above | database host |
| Cloudinary | photos | image host |
| Google Cloud (Cloud Run, Logging) and Vercel | the app and its logs | hosting |
| Open-Meteo | a point rounded to about 5 km (weather, river) | no identifier sent |
| NASA FIRMS | a box of about 22 km around the rounded point | with the project's own key |
| IMD (district lookup) | a 0.05 degree cell | no identifier |
| **Google Earth Engine** | for the satellite flood check (only when the farmer presses the button) and for field health: **the exact point** of the field | the one place the exact point leaves; the Privacy page now says so |
| NDMA SACHET, CWC, The Hindu, PIB | nothing about a user (our server fetches the feeds for everyone) | |

## 3. The checklist
| # | Item | Status |
|---|---|---|
| 1 | **Data inventory** (section 1) | done, keep it current when a feature stores something new |
| 2 | **Notice** in plain words, in English and Hindi, before the data is taken | the Privacy page covers photos, location, fields, what leaves the server, reports and answers (en, hi). The Hindi is AI-drafted: **Owner** to have it reviewed. The Act requires the notice in English or an Eighth Schedule language: **Lawyer** to confirm the wording |
| 3 | **Consent** that is free, specific and can be withdrawn as easily as it was given | location is asked for only after the farmer agrees and can be stopped; adding a field is the farmer's own act; withdrawing = deleting the field or all data. **No consent record is kept** (we hold no name or contact to attach one to): **Lawyer** to say whether a log is needed |
| 4 | **Purpose limitation and minimisation** | the exact point is used only to find the cell, the district and the distance, and for the radar button; alerts hold no coordinates; the public map shows counts of 3 or more browsers per 5 km cell. Done |
| 5 | **Retention and erasure** | see the table; "Delete my data" now also removes feedback answers and the radar cache of the fields. The history/field deletion is self-service. **Gap:** the browser ID itself stays in the browser (the farmer can clear it) |
| 6 | **Right to access and correction** | correction: name and stage of a field can be edited; the place cannot (delete and add again). **Gap:** there is no "download my data": **Owner** to decide if it is needed, then it is a small export of the same records |
| 7 | **Grievance contact** and the name of the data fiduciary | **Owner / Lawyer:** who is the fiduciary (student team, university, a registered entity)? Not on the Privacy page yet |
| 8 | **Children** (verifiable parental consent under 18) | the app has no age check, and an account asks only a name and an email; the data is a crop photo and a field. **Lawyer** to say if anything is needed |
| 9 | **Security safeguards** | HTTPS, private points never returned or logged, no IP or device IDs in logs, the operator routes behind a timing-safe token, per-device and global rate limits, TTLs on every cache, kill switches. Done; keep the `.env` out of git (it is ignored) and rotate keys that appear in a log or chat (the FIRMS key appeared once in a tool output on 27 Oct 2026) |
| 10 | **Breach plan** | not written. **Owner:** who is told within what time (the Board and the affected people), who can turn the service off (the kill switches and `gcloud run services update`, `docs/MONITORING.md`) |
| 11 | **Processors and cross-border transfers** | section 2; the contracts are the providers' standard terms. **Lawyer** to confirm they are enough |
| 12 | **Disclaimer on every alert** ("advisory forecast, can change, not an official warning, check IMD or your district officer") | the "Why this alert?" text names the source and the draft status; the exact disclaimer sentence on every card is **Lawyer**'s to approve (decision 9 of the plan) |
| 13 | **Significant data fiduciary** duties | unlikely for this size; **Lawyer** to confirm |
