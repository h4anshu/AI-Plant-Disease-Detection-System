# Farmer sessions for the Weather & Alerts screen (Phase 7)

A short, repeatable test with 5 to 10 farmers: **can they understand an alert and say what they would do?** It needs people, so this is a protocol for the team (or a KVK officer) to run, and a sheet to fill in. Nothing here needs code. Written 27 Oct 2026; the first round has not been run.

## Who, where, how long
- 5 to 10 farmers, ideally across 2 crops and both languages; through a Krishi Vigyan Kendra (KVK), an extension worker, or the pilot owners. At least 3 who read Hindi slowly or not at all (they are the ones the screen can fail).
- 20 minutes each, one at a time, on their own phone when possible (the phone and the network are part of the test). Note the phone model and whether the page loaded fast.
- One facilitator who asks, one who writes. Do **not** teach the screen first; the whole point is what they do without help.

## Before you start
1. Say what this is: "We are testing the screen, not you. There are no wrong answers. These are **practice** alerts, not real warnings for your field, so please do not act on them."
2. Ask for permission to take notes (and, only if they agree, a voice recording of the session). **No photos of faces, no phone numbers, no field location, no name on the sheet** (give each farmer a number). Offer to stop at any time.
3. Explain that the answers will be used to improve the wording and that nothing is sold or shared.

## The tasks (read each aloud; do not help)
Show the **cards** below one at a time, on paper or on the screen. Each card is a real sentence of the app with example numbers (they are in `client/src/locales/en.json` and `hi.json`, `alerts.rules.*`).

| Card | What the app says (English; show the Hindi to Hindi readers) | What a good answer sounds like |
|---|---|---|
| 1. Frost | "Frost risk. Give a light irrigation in the evening before the cold night." | Irrigate lightly in the evening, tonight or tomorrow night |
| 2. Dry spell | "Dry spell: 15 dry days in a row (Today). Irrigate if you can: sowing, flowering and grain filling need moisture in the soil." | Irrigate; check the soil |
| 3. Fire | "A fire was seen by satellite within 1 km of your field in the last 24 hours. Check around your field now, and if smoke or flames come close, call 101." | Go and look around; call 101 if it comes close |
| 4. Disease near | "Other farmers near you found Late blight on potato in the last 14 days. Look at your own plants soon." | Inspect their own plants; not "my crop has it" |
| 5. Official warning | NDMA SACHET text as the app shows it (use a real recent one) | Know it is an official warning; know to follow the officials |

For each card, in this order:
1. **"Please read it to me."** (Note reading speed and stumbles. If they cannot read it, note whether they ask for it to be read to them: that is the **read-aloud need**.)
2. **"What is this telling you?"**
3. **"What would you do, and when?"** (Start the clock at the end of the question; stop at a correct answer or at 90 seconds. Write the seconds.)
4. **"Is there a word here you are not sure about?"** (Likely ones: *Watch*, *Tip*, *Warning*, *hot spot*, *phones*, *reports near you*, *dry spell*, "satellite".)
5. **"Would you trust this? What would you want to check first?"**

Then on the live screen (their own crop, a test field in the nearest town, never their real field):
6. "Find out **why** the app is saying this." (Do they find "Why this alert?"?)
7. "Mark that you have done it." (Do they find the button?)
8. "Tell the app whether this helped." (The **Did this help?** row.)
9. "Change the language." (Do they find it, and is the Hindi the Hindi they would use?)
10. "If this came as a message on your phone, would you want it? How often is too often?" (There is no SMS or push: this is only to learn the limit.)

## What to record (one row per farmer and card)
| Farmer no. | Language | Crop | Reads Hindi (easily / slowly / no) | Card | Seconds to a correct action | Correct action stated (yes / partly / no) | Words not understood | Asked for it to be read aloud (yes/no) | Would trust it (yes / unsure / no) | Notes (quotes in their words) |
|---|---|---|---|---|---|---|---|---|---|---|

Also one line per farmer: phone model, network speed on the day, found "Why this alert?" (y/n), found "Mark as done" (y/n), found "Did this help?" (y/n), found the language button (y/n), whole-message wish (how often).

## How to read the results (proposals, to be agreed)
- **A card where fewer than 7 in 10 farmers state a correct action** (yes or partly) gets its words rewritten and is tested again. Bring the farmers' own words back into `alerts.rules.*` (in Hindi first), and apply them through `docs/ALERT_REVIEW.csv` (`hindi_corrected`).
- **A word that 3 or more farmers did not understand** is replaced (the level names *Watch* and *Tip* are the likely ones).
- **3 or more farmers who could not read the card and asked for it to be read to them** means a voice route is needed before any wide launch (text-to-speech in the browser is free; a phone-call route costs money and is not planned).
- **Time to a correct action over 60 seconds on average** means the main sentence is too long.
- Anyone who says they would **act on a wrong alert** (card 4 read as "my crop has the disease") is a finding about the wording, not about the farmer.

## After the session
- Thank them, and tell them again that the cards were practice.
- Type the sheet the same day, without names, into `docs/ALERT_SESSION_NOTES.csv` (columns as above) and add the totals to `docs/FIELD_ALERTS.md`, section "Evaluation".
- Do not keep recordings longer than it takes to type the notes.
