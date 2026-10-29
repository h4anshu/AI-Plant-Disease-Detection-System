# Languages: English, Hindi, Punjabi, Odia

Added 29 Oct 2026. The pilot states are Punjab (Ludhiana) and Odisha (Cuttack); a farmer there reads Punjabi or Odia first.

## 1. What is translated, and what is not

| | English | Hindi | **Punjabi** | **Odia** |
|---|---|---|---|---|
| Screens: menus, the leaf check, the result card, the log, the Overview, Weather & Alerts (levels, hazards, adding a field, the 72-hour strip), sign-in, notifications, offline notes | yes | yes | **yes (485 texts)** | **yes (485 texts)** |
| Names of the 10 crops, 53 diseases and 4 severities (`terms.json`) | yes | yes | **yes** | **yes** |
| Notification words (`server/utils/pushText.js`) | yes | yes | **yes** | **yes** |
| Dates, months, weekdays | browser | browser | **own tables** (`locales/dates.js`) | **own tables** |
| **Treatment advice** (what to spray, doses) and the **PDF report** | yes | yes (draft) | **Hindi** | **English** |
| The weather rules' advice sentences, official warnings' text, the Privacy page, the landing page, the map, the news and price cards | yes | yes | **Hindi** | **English** |

**Why not everything, and why the advice stays out:** about 1,000 texts exist; the screens and names are what a farmer must read to use the app. The advice (chemical names, doses, "act within 5 to 7 days") and the legal texts are the parts where a wrong word does harm, and even the Hindi of them is an AI draft waiting for an agronomist (`docs/TRANSLATION_REVIEW.csv`, `docs/ALERT_REVIEW.csv`). Machine-translating them into two more languages with no reader who can check them would multiply the risk, not the help. So they **fall back**: a Punjabi reader gets the Hindi text (most Punjabi readers know it), an Odia reader the English text (`i18n.js`, `fallbackLng`), and the result card says so in their own language ("the advice is shown in Hindi / in English until it is checked").

The server composes treatment advice and the report in English and Hindi only; the client asks for the nearest (`serverLang` in `i18n.js`: Punjabi asks for Hindi, Odia for English, in the `Accept-Language` header and the report request).

## 2. What changed in the code

- `i18n.js`: the two languages, their switcher entries (ਪੰ, ଓଡ଼), the fallback chain, `serverLang`.
- `locales/pa.json`, `locales/or.json`: partial files (a missing key falls back). Placeholders (`{{count}}`, `<b>`) and plural forms are checked against English by `Languages.test.jsx`.
- `locales/terms.json`: a `pa` and an `or` name on every entry; entries stay `needs_review: true`. `docs/TRANSLATION_REVIEW.csv` has the new columns `punjabi_draft`, `odia_draft`, `punjabi_corrected`, `odia_corrected` (`npm run translation-review`).
- `locales/dates.js`: dates and times. The browser's locale data for Punjabi and Odia is incomplete (an older Chrome prints "M10 29, Thu" for Punjabi and English month names for Odia), so both use tables of months and weekdays; digits stay 0-9 and times read "6:47 pm". Every date in the app goes through it.
- Fonts: Noto Sans Gurmukhi and Noto Sans Oriya next to the Devanagari one (`index.html`, `index.css`); the Hindi typography rules (no letter-spacing, taller headings, no fake italics) apply to all three scripts.
- The language switch has four buttons: on a phone it moves to its own row instead of overflowing (found in the browser: the fourth button was cut off at 390 px).
- Push notifications in the four languages (`PUSH_LANGS`); a subscription keeps the language chosen when it was turned on.

## 3. Checked

- Client `Languages.test.jsx` (every key exists in English, none empty, placeholders and plural forms match, every text is in the language's script, none is a copy of the English or Hindi; the names; the fallback to Hindi and English; the page language and font; what the server is asked for), `dates.test.js`, and the axe checks of the alert and sign-in screens in all four languages.
- Real browser (Chromium): Punjabi and Odia render with the right fonts (Gurmukhi and Oriya loaded), a Punjabi date reads "ਵੀਰਵਾਰ, 29 ਅਕਤੂਬਰ", the switch fits at 360 and 390 px, and no page scrolls sideways in any language.

## 4. What it still needs (you)

- **A Punjabi reader and an Odia reader** (`docs/TRANSLATION_REVIEW.csv` for the names; the screens in `pa.json` and `or.json`). Everything is AI-drafted by Claude on 29 Oct 2026; Odia is the less certain of the two. Wording a farmer would not use is likely in places ("sign in", "heatmap" and similar are written as the people say them, but check).
- The treatment advice and the weather-rule advice in Punjabi and Odia, **after** an agronomist has reviewed the Hindi: then the same wording can be translated, and `fallbackLng` stops covering them.
- Not done: the landing page and the Privacy page in the two languages; Bengali, Marathi, Telugu, Tamil and others (adding one is `locales/<code>.json` + a `terms.json` field + a font + `dates.js` + `pushText.js`, nothing else).
