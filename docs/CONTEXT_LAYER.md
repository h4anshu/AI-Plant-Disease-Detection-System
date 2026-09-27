# Context layer: weather, soil and season around a checkup

The leaf photo tells **which disease is visible**. Diseases also depend on the weather of the last days,
the soil and the season. For every checkup that has a location, the context layer collects these facts,
with their sources, and explains whether they **fit** the diagnosed disease and the other likely classes.

Example of what the app shows:

> **Favours it.** Recent weather and soil here favour bacterial blight.
> ▲ Average temperature, last 7 days: 28.2 °C (favourable: 25–34 °C)
> ▲ Average humidity, last 7 days: 74.6 % (favourable: above 70 %)
> Rain in the 30 days to 19 Sept: 21% of normal (ERA5-Land, compared with 2001–2020).
> Soil (modelled map at 250 m, not a test of your field): loam, pH 7.8 …
> *These conditions were collected with AI help from cited sources and are not yet checked by an expert.*

**It explains; it never changes the diagnosis.** The only production mode is `FUSION_MODE=explain`, and
the server refuses to start with anything else in production. Re-ranking exists only as offline
evaluation code (see "Fusion").

The design decisions and the Phase A measurements are in [CONTEXT_LAYER_PLAN.md](CONTEXT_LAYER_PLAN.md).
Every disease rule and its source is in [DISEASE_RULES.md](DISEASE_RULES.md).

## 1. How a request flows

```
result page (checkup with a location) ──once, automatically──► GET /api/predict/:id/context
  snapshot stored and CONTEXT_VERSION current? ─yes─► compare with the rules ─► answer   (no outside call)
  no ─► build it:
     weather ◄─ Open-Meteo (0.05° point)           or  ERA5-Land days ◄─┐
     rain vs normal, soil ◄──────────── geo-service POST /context (~250 m cell centre) ◄─ Earth Engine, 1 request
     field health ◄─ the satellite check's cache only (never a new Earth Engine run)
     season ◄─ calendar
   ─► store on the checkup (immutable) ─► compare with the rules ─► answer
```

- **All or nothing.** If a weather or Earth Engine call fails, the answer is 502/503 and nothing is
  stored, so opening the checkup again simply retries. A half-empty snapshot is never frozen.
- **Immutable.** Once stored, a snapshot is never recomputed unless `CONTEXT_VERSION` in
  `server/utils/context.js` is bumped. The *fit* is recomputed on every view from the stored snapshot,
  so a rule corrected by the agronomist shows up at once, without new weather calls.
- **The report** (PDF) prints the stored snapshot only. It never starts a weather or Earth Engine call.

## 2. The reference date

The weather is taken around the day the photo was taken, if the app can know it; otherwise the day of
the checkup.
- The browser reads the photo's **EXIF `DateTimeOriginal`** (the camera's own date) and sends it as
  `captured_at`. It does this only when a location is shared, because the date is used only for context.
- The server accepts it only if it is **not in the future and at most 60 days old**
  (`parseCapturedAt`). Otherwise it stores why not (`future`, `too_old`, `invalid`) and uses the
  checkup's date.
- Dates are Indian dates (IST): a checkup at 01:30 IST belongs to that day, not the UTC day before.

## 3. Weather (14 days up to the reference date + 3-day outlook)

| | Open-Meteo (CX-01) | ERA5-Land (CX-02) |
|---|---|---|
| When | the reference date is within the last 92 days (every accepted photo date) | older checkups opened for the first time |
| What | **hourly** temperature, humidity, rain | **daily** temperature (mean/min/max), dew point, rain |
| Grid | the location rounded to 0.05° (~5 km) before it leaves our server | 0.1° (~11 km) |
| How far back | `past_days` "Integer (0-92)" in the docs; a request 93 days back is refused (checked 27 Sep 2026) | 1950 to ~8 days ago (latest image 19 Sep 2026 when checked on 27 Sep 2026) |
| Licence | CC BY 4.0, free for non-commercial use | Copernicus licence; credit "Generated using Copernicus Climate Change Service information <year>" |

From the hourly data, each day gets:
- **Tmin / Tmean / Tmax** (°C);
- **mean and maximum relative humidity** (%);
- **hours with humidity ≥ 90%**;
- **rain** (mm).

A day needs at least 20 hourly values, the same rule as the weather-risk strip. Otherwise its values are
left empty and the date is listed under "gaps". No value is ever filled in.

**Leaf wetness:** no free service measures it. As in [DISEASE_RISK.md](DISEASE_RISK.md), an hour with
humidity ≥ 90% counts as a wet hour. Sentelhas et al. (2008) found this tracks measured wetness well; the
threshold was 90% at their tropical site. "Wet days (N h)" = days with at least N such hours.

**ERA5-Land days** are converted:
- temperature from kelvin (−273.15);
- rain from metres to millimetres, with tiny negative values clipped to 0 (catalogue note CX-02);
- relative humidity from the daily mean temperature T and dew point Td with FAO-56 (Allen et al. 1998,
  ch. 3, eqs. 10, 11 and 14): RH = 100 × e°(Td) / e°(T), where e°(T) = 0.6108 × exp(17.27 T / (T + 237.3)).

  This is an *approximate daily mean* RH. ERA5-Land daily data has no hourly humidity, so rules that
  need wet hours are "unknown" for those checkups, and they say so.

## 4. Rain compared with normal (30 days before the reference date)

Rain alone says little: 50 mm is a lot in March and nothing in August. So the app compares the last 30
days with the **same 30 calendar days averaged over 2001–2020** at the same place. For example, 21% of
normal means about a fifth of the usual rain.

**Source, decided with you (R2):**
1. **CHIRPS daily** (CX-03, `UCSB-CHG/CHIRPS/DAILY`, 0.05°, public domain) when it covers all 30 days.
2. Otherwise **ERA5-Land** (its own 30 days against its own 2001–2020 normal, so both sides come from the
   same source). Its window may end at most 10 days before the reference date, and the card and the PDF
   show the real dates.
3. Otherwise "not available yet".

**Why the fallback is needed:** CHIRPS runs about 4 weeks behind (its latest day was 31 Aug on 27 Sep
2026), so a 30-day window ending today is almost never covered.
- The latest dates are checked at run time, once a day per geo-service instance.
- A window counts only if every day is present, in the recent window and in every baseline year.

## 5. Soil (SoilGrids, CX-06)

SoilGrids 250 m v2.0 is a **model**: ISRIC predicted soil properties worldwide from soil samples,
climate and satellite data. It is **not a test of your field**, and the app says so every time.
- **Access:** Earth Engine community assets `projects/soilgrids-isric/<property>_mean` (the SoilGrids REST
  API is paused).
- **Properties:** pH (water), total nitrogen, soil organic carbon, clay, sand, silt, CEC, bulk density.
- **Depths:** 0–5, 5–15 and 15–30 cm.
- **Units:** SoilGrids stores whole numbers. ISRIC's own table
  ([SoilGrids FAQ](https://docs.isric.org/globaldata/soilgrids/SoilGrids_faqs_01.html)) gives the
  divisors:

  | Property | Stored as | Divide by | Shown as |
  |---|---|---|---|
  | pH (water) | pH × 10 | 10 | pH |
  | Total nitrogen | cg/kg | 100 | g/kg |
  | Soil organic carbon | dg/kg | 10 | g/kg |
  | Clay, sand, silt | g/kg | 10 | % |
  | CEC at pH 7 | mmol(c)/kg | 10 | cmol(c)/kg |
  | Bulk density | cg/cm³ | 100 | kg/dm³ |
- **0–30 cm value** = the thickness-weighted mean: (5 × top + 10 × middle + 15 × bottom) / 30.
- **Texture class** (sand, loam, clay loam, …): the 12 USDA classes, following the definitions in the
  USDA *Soil Survey Manual* (Handbook 18, 2017), ch. 3, word for word. For example, "Loam: 7 to less
  than 27 percent clay, 28 to less than 50 percent silt, and 52 percent or less sand". A value exactly on
  a boundary that the rounded model numbers miss is left empty.
- **Towns, rivers, roads:** SoilGrids has no values there (tested: the Lucknow and Delhi city points
  return nothing). The app says "no soil map data for this place".
- **Cache:** soil is static, so each ~250 m cell is asked only once, ever. The cache key is a hash of
  the cell centre, never readable coordinates.

**Why nitrogen and organic carbon are shown but not used in rules (decision R1):**
- SoilGrids gives *total* nitrogen and soil organic carbon. At the three test fields that was 11–18 g/kg
  N in the top 5 cm, and 13–38 g/kg organic carbon.
- Indian soil-test limits are for *available* nitrogen (alkaline permanganate, "low" < 280 kg/ha) and
  Walkley-Black organic carbon ("low" < 0.5%).
- These are different measurements, not the same number in other units. Comparing them would give
  confident nonsense. A test checks that no rule reads the modelled N or organic carbon.

### The farmer's own Soil Health Card

Nutrient rules use only real soil test values that the farmer types in from their card.
- **What can be entered:** pH, organic carbon %, available N/P/K (kg/ha), zinc, iron, sulphur (ppm) and
  the sample date. Any of them can be left out.
- **What is never asked:** a name, card number or phone number.
- **Storage:** the values are saved privately with that checkup (`PATCH /api/predict/:id/soil-test`).
  "Delete my data" removes them.
- **Precedence:** the card's pH takes precedence over the SoilGrids pH.
- **Limits used:** those of the *Methods Manual: Soil Testing in India* (Dept. of Agriculture &
  Cooperation, 2011), Table 1 and Table 6.
- **Old cards:** a card older than 2 years is marked as possibly out of date. The scheme allows a retest
  after two years (PIB release PRID 1808329).

## 6. Field health and season

- **Field health (CX-08, CX-09):** if the farmer already opened "See this field from space" for this
  checkup, the verdict, the last clear image date, and the latest NDVI and z-score from that cached answer
  are included. The context layer never starts a new satellite check (quota).
- **Season:** from the Indian Economic Service (Government of India) definition: *"The kharif cropping
  season is from July –October … the Rabi cropping season is from October-March (winter). The crops grown
  between March and June are summer crops."*
  - October and March belong to two seasons.
  - This is the season of the *date*, not the crop's own sowing date, and not district-specific. The
    official per-district crop calendar (PMFBY) would need the district, which the app doesn't store.

## 7. How the fit is decided

The full rules, sources and scoring are in [DISEASE_RULES.md](DISEASE_RULES.md). In short:
- **Each rule** compares one number with the literature, for example "average daily temperature over
  the last 7 days between 25 and 34 °C" (IRRI, rice bacterial blight). The result is *met*, *not met*,
  or *missing* when the data isn't there.
  - A weather number needs data on at least 70% of its window's days.
  - Windows end on the reference day. The outlook days are never used for the fit.
- **Score** = the share of checked rule weight that points towards the disease.
  - At least two thirds → **favours it**; one third or less → **doesn't favour it**; in between →
    **mixed**.
  - If rules carrying half the weight or more are missing → **can't tell**.
  - Leaf-wetness rules have weight 2 where the source makes wetness the condition for infection.
- **Nutrient deficiency** (groundnut): favourable if **any** card value is below its limit.
- **Potato late blight and rice blast** reuse the published models of the weather-risk strip
  (INDO-BLIGHTCAST; Yoshino). Their level on the reference day becomes the fit: high → favours,
  medium → mixed, low → doesn't favour. The models need hourly weather, so they are "can't tell" for
  ERA5-Land checkups.
- **Healthy leaves** are not compared. Classes whose sources give no numbers (viruses spread by
  insects, generic dataset classes) are "can't tell", with the reason.
- **Alternatives:** the ML service now returns the top-3 classes with every diagnosis, and the API
  scores each of them.
  - The app shows the alternatives only for *uncertain* results, inside "the model's leanings", labelled
    "not a diagnosis".
  - The PDF lists other possibilities only for uncertain results too, so a confident report didn't
    change.

## 8. Privacy

| Who gets what | Location detail |
|---|---|
| MongoDB (the checkup, private) | the exact point, as before; the snapshot itself holds **no** coordinates |
| geo-service (our Cloud Run service, POST body) | the centre of the ~250 m cell around the point, never the exact point |
| Open-Meteo | the point rounded to 0.05° (~5 km), as for the risk strip |
| Answers, URLs, logs, caches | no coordinates. Soil and weather cache keys are SHA-256 hashes (the weather cache key was plain text before; now hashed too). |

"Delete my data" deletes the checkups, and with them the snapshots and card values. It also deletes
the cached soil answers for those cells: a hash of a 250 m cell could be reversed by trying every cell
in India, so it counts as location data.

## 9. Cost (measured 27 Sep 2026, Cloud Monitoring, 5 calls per request shape)

Earth Engine does not report the cost of one request, so each request shape ran 5 times under its own
workload tag (`m-soil-rain`, `m-rain-chirps`, `m-era5-old`), and Cloud Monitoring summed the EECU-seconds.

| Part | EECU-seconds per call | Notes |
|---|---|---|
| Soil (8 properties × 3 depths) | ~0.05 | once per ~250 m cell, then cached forever |
| Rain vs normal, CHIRPS (21 windows of 30 days) | ~1.6 | stacking the windows into one image measured ~1.2; not worth reworking |
| Rain vs normal, ERA5-Land | ~4.0 | the usual case today (CHIRPS lags 4 weeks); the same with or without the daily clip |
| ERA5-Land days (17) for an old checkup | ~0.8 | only for checkups first opened more than ~78 days after the photo |
| Latest CHIRPS / ERA5 dates | ~0.01 | once a day per instance (a full-collection sort cost 1.6 and was replaced) |

- **A new checkup today costs about 4.1 EECU-seconds, once.** Repeat views, the PDF and fit updates cost
  nothing.
  - The daily cap of 18,000 EECU-s covers about 4,400 new located checkups a day.
  - The monthly 540,000 covers about 130,000.
  - For comparison, a field-health check is about 3.
- **Where to save if needed:** the 20-year ERA5-Land normal dominates the cost. Caching it per 0.1° cell
  and calendar window would cut a checkup to well under 1 EECU-s. This is noted in the code
  (`ponytail:` comment in `services/contextSnapshot.js`); not needed at today's volume.
- **Open-Meteo: 0 or 1 call per checkup.**
  - For a photo taken today it's the same query as the risk strip, and they share one cache: 0 extra
    calls when the strip already loaded.
  - For an EXIF date in the past it's one date-range call.
  - The limit is 10,000 calls a day.
- **geo-service: at most 1 call per checkup** (one Earth Engine request inside).
- **Timing:** the first view took 0.97 s end to end on the local stack (Earth Engine 0.94 s); later views
  are a database read.

## 10. Fusion (offline only)

`server/utils/fusion.js` implements the re-ranking from the brief, for evaluation:

```
new_i = p_i × f(score_i)^α, renormalised over the top-3      f(score) = 0.5 + score, kept within 0.5 … 1.5
α = 0.3 by default; an unknown fit leaves p_i unchanged (f = 1)
```

- It only reorders the existing top-3 of an **uncertain** checkup. An **ok** diagnosis is returned
  untouched (tested).
- `node scripts/eval_fusion.js [--alpha 0.3]` compares top-1 accuracy with and without fusion, per crop.
  - It uses checkups with a snapshot and a label from feedback ("correct", or "incorrect" with a class).
  - With fewer than 200 such checkups it prints "insufficient data" and exits 0.
  - Today there are none: the feature isn't deployed yet, and guest feedback is unverified. The
    expert-labelled field set (pending item P1) is the right input once it exists.
- **Production stays `FUSION_MODE=explain`.** Turning re-ranking on would need that evaluation to show a
  real gain first.

## 11. Sanity check of the rules against a real dataset

**Question:** would the rules have called the weather favourable where and when a dataset's diseased
leaves were actually photographed?
- **Which datasets qualify:** only datasets with a documented place *and* months, for a crop the app
  serves. In the catalogue that is **DS-09**, groundnut, Ramchandrapur, Purba Medinipur district, West
  Bengal: *"between January-April of 2022 and 2023"* (Sasmal et al. 2024, Data in Brief 55:110763).
  - The blackgram paper (DS-11) gives the place but no dates.
  - The other shipped crops' sources have neither.
- **Weather used:**
  - ERA5-Land **hourly** at the district centre (22.05° N, 87.75° E): the same CX-02 source at hourly
    resolution, needed for wet hours;
  - CHIRPS daily rain.
- **Engine:** the same rule engine, run for every day
  (`geo-service/sanity_check.py` → `docs/sanity/DS-09.json` → `node scripts/sanity_rules.js`).
- **This is a report only.** Nothing here touches training.

Days per month, **favourable / mixed / unfavourable / can't tell**:

| Class | 2022-01 | 2022-02 | 2022-03 | 2022-04 | 2023-01 | 2023-02 | 2023-03 | 2023-04 |
|---|---|---|---|---|---|---|---|---|
| Rust | 31/0/0/0 | 28/0/0/0 | 31/0/0/0 | 19/0/11/0 | 28/0/3/0 | 24/0/4/0 | 24/0/7/0 | 26/0/4/0 |
| Leaf_Spot | 21/0/10/0 | 17/0/11/0 | 2/0/29/0 | 0/0/30/0 | 7/0/24/0 | 7/0/21/0 | 0/0/31/0 | 0/0/30/0 |
| Alternaria_Leaf_Spot | 0/0/0/31 | 0/0/0/28 | 0/0/0/31 | 0/0/0/30 | 0/0/0/31 | 0/0/0/28 | 0/0/0/31 | 0/0/0/30 |
| Nutrition_Deficiency | 0/0/0/31 | 0/0/0/28 | 0/0/0/31 | 0/0/0/30 | 0/0/0/31 | 0/0/0/28 | 0/0/0/31 | 0/0/0/30 |
| Rosette | 0/0/0/31 | 0/0/0/28 | 0/0/0/31 | 0/0/0/30 | 0/0/0/31 | 0/0/0/28 | 0/0/0/31 | 0/0/0/30 |

Monthly weather at the district centre, to read the table with:

| Month | Tmean | Tmin | RH | days ≥ 6 h RH ≥ 90% | days ≥ 12 h | rain |
|---|---|---|---|---|---|---|
| 2022-01 | 18.2 °C | 13.4 | 76% | 17 | 5 | 24 mm |
| 2022-02 | 20.7 | 15.2 | 74% | 22 | 5 | 45 |
| 2022-03 | 27.1 | 21.4 | 66% | 14 | 0 | 13 |
| 2022-04 | 30.4 | 26.5 | 72% | 6 | 0 | 27 |
| 2023-01 | 20.6 | 15.1 | 68% | 12 | 1 | 8 |
| 2023-02 | 23.7 | 18.2 | 66% | 17 | 1 | 12 |
| 2023-03 | 26.7 | 22.0 | 68% | 17 | 0 | 48 |
| 2023-04 | 30.3 | 24.9 | 63% | 12 | 0 | 49 |

**What this says:**
- **Rust:** the rule (8–30 °C with a 6-hour wet spell; ICRISAT, Butler & Jadhav 1991) fits the
  collection months on most days, as it should: rust leaves were photographed then.
- **Leaf spot:** the rule needs a 12-hour wet spell (ICRISAT, Pande et al. 2004). It fits Jan–Feb 2022
  but not March–April, when leaf-spot photos were still being taken. Two explanations, both for the
  reviewer:
  - The rule may be too strict. The paper found severity rising from 4 h to 12 h, so 6–8 h may already
    favour it.
  - Hourly humidity at ~11 km may read lower than inside a groundnut canopy.

  **Leaf spot's wetness threshold is flagged in the review CSV notes.**
- **The other three classes have no weather rule** (no numbers in the sources, or card-only nutrients),
  so "can't tell" is the honest answer.

## 12. Limits worth knowing

- **Weather is modelled, not measured in the field:** a ~5 km point (Open-Meteo) or ~11 km (ERA5-Land).
  Microclimate under a canopy, irrigation and dew are invisible to it.
- **Soil is a 250 m model.** Nitrogen and organic carbon aren't comparable with Indian soil tests (see
  above). Only pH and texture are fair to compare, and a field's own card beats both.
- **Rules are drafts.** They were collected with AI help from cited sources on 27 Sep 2026, and many
  are international or lab-based. Until the agronomist review (`docs/RULES_REVIEW.csv`) every card and
  PDF says so.
- **"Favours it" isn't evidence the disease is there,** and "doesn't favour it" doesn't rule it out.
  The photo remains the diagnosis.
- **Season is by calendar date,** not the crop's sowing date.
- **CHIRPS lags about 4 weeks and ERA5-Land about a week,** so the rainfall window of a checkup made
  today ends a few days before it. The dates are shown.

## 13. Files

| File | What |
|---|---|
| `geo-service/context.py` | soil, rain vs normal, ERA5-Land days: Earth Engine request builders + plain-Python summaries |
| `geo-service/app.py` | `POST /context` (token, JSON logs without coordinates, 502/503 like `/field-health`) |
| `geo-service/sanity_check.py` | the offline weather extraction for section 11 |
| `server/utils/context.js` | reference date, daily rows, summaries, season, soil cache key, attributions, `CONTEXT_VERSION` |
| `server/services/contextSnapshot.js` | builds a snapshot (Open-Meteo / geo-service / caches), measured EECU per part |
| `server/utils/environmentFit.js` | the rule engine (pure) |
| `server/controllers/contextController.js` | `GET /api/predict/:id/context`, `PATCH /api/predict/:id/soil-test` |
| `server/utils/fusion.js`, `server/scripts/eval_fusion.js` | offline re-ranking and its evaluation |
| `server/scripts/sanity_rules.js` | section 11's table |
| `server/knowledge/disease_rules.json` | the rules ([DISEASE_RULES.md](DISEASE_RULES.md)) |
| `client/src/components/ContextCard.jsx` | the card (en + hi), the Soil Health Card form |
| `server/utils/reportContent.js` | the PDF's "Environment context" section (report version 2) |
