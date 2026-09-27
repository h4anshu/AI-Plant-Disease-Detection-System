# Context layer v1: plan

Status: **approved 27 Sep 2026**, with the decisions below. Everything under "Checked live" was measured
on 27 Sep 2026.

## Decisions (27 Sep 2026)

- **R1, soil:**
  - Rules may use SoilGrids **pH and texture**.
  - SoilGrids total N and SOC are **shown, labelled "modelled"**. A rule uses them only if its source
    states a threshold in total-N / SOC terms; otherwise that rule's soil factor is `not_comparable` and
    left out of the score.
- **Soil Health Card values** (new, the user's decision):
  - An optional form where the farmer types in the numbers from their own card: available N, P, K
    (kg/ha), OC %, pH, EC, S, Zn, Fe, Cu, Mn, B, and the card's sample date.
  - They're stored as `Prediction.soilTest` (private, validated to plausible ranges, deleted with
    "Delete my data").
  - Card values take precedence over SoilGrids for the same factor. Nutrient rules (available N/P/K,
    OC %, micronutrients) are evaluated **only** from card values; without a card they're `missing`,
    never filled from SoilGrids.
  - No name, mobile, card number or ID is asked for. The portal is not scraped (CX-07 stays Phase 2; this
    is manual entry by the farmer).
  - The modelled snapshot stays immutable. The fit is recomputed when card values are added.
  - A card older than the scheme's cycle (to be sourced in Phase B) gets a note.
- **R2, rain anomaly:**
  - CHIRPS when it covers the 30-day window.
  - Otherwise ERA5-Land against its own 2001–2020 baseline, ending at most 10 days before the reference
    date, with its actual dates shown.
  - Otherwise `unknown`.
- **Training data:** no context is attached to training images; this is confirmed with the user.
  Dataset-level dates (e.g. DS-09) are too coarse (one district and period for every class) and would
  invite a source/season shortcut. They're used only for the rule sanity check (5I). Located field
  checkups with feedback become the future labelled set for evaluating fusion.
- **Later, not in v1:** context-aware advice (spray timing from the rain forecast, spray interval), once
  the rules are reviewed.

## 1. What it does, in one paragraph

For a checkup with a location (status `ok` or `uncertain`), the server builds a context snapshot the
first time someone opens it. The snapshot holds the weather of the 14 days before the photo, a 3-day
outlook, the rainfall compared with normal, the modelled soil, the cached field health if it exists,
and the season. The snapshot is stored on the checkup and is never recomputed, unless
`CONTEXT_VERSION` is bumped. A pure rule engine then compares the snapshot with sourced rules for the
diagnosed disease and for the two alternatives. The result is favourable / neutral / unfavourable /
unknown, with the numbers, the thresholds and the citations. **The diagnosis is never changed.**
`FUSION_MODE=explain` is the only production mode.

## 2. Checked live (27 Sep 2026)

| Check | Result | What it means for the design |
|---|---|---|
| Catalogue sheet "Context Data Sources" | present: CX-01…CX-13, Phase 1 = CX-01/02/03/06/08/09/11/12, CX-13 "In use" | the file on this branch is current |
| SoilGrids from our Earth Engine project | works: `projects/soilgrids-isric/{phh2o,nitrogen,soc,clay,sand,silt,cec,bdod}_mean`, 6 depth bands each (`<p>_0-5cm_mean` … `<p>_100-200cm_mean`) | one `reduceRegion` returns all 24 values (8 properties × 3 depths) |
| SoilGrids unit conversion | ISRIC FAQ ([SoilGrids_faqs_01](https://docs.isric.org/globaldata/soilgrids/SoilGrids_faqs_01.html)): *"By dividing the predictions values by the values in the Conversion factor column…"*. bdod cg/cm³ ÷100 → kg/dm³; cec mmol(c)/kg ÷10 → cmol(c)/kg; clay/sand/silt g/kg ÷10 → %; nitrogen cg/kg ÷100 → g/kg; soc dg/kg ÷10 → g/kg; phh2o pH×10 ÷10 → pH | factors from the source, not guessed |
| **ERA5-Land latest date** (`ECMWF/ERA5_LAND/DAILY_AGGR`) | **2026-09-19, only 8 days behind** (not the ~3 months the brief expected) | ERA5-Land covers every accepted photo date except its last 8 days |
| ERA5-Land units | temperatures in K, `total_precipitation_sum` in m (tiny negative values possible, CX-02 note) | convert K → °C and m → mm, clip rain < 0 to 0 |
| **CHIRPS latest date** (`UCSB-CHG/CHIRPS/DAILY`) | **2026-08-31, about 4 weeks behind** | a 30-day anomaly **ending today** can't be computed from CHIRPS (see risk R2) |
| Open-Meteo past data | docs: `past_days` is "Integer (0-92)". A `start_date` older than that answers *"out of allowed range from 2026-06-26 to 2026-10-12"* (93 days back, 16 ahead). No key, same free tier. | photo dates accepted up to 60 days back, plus the 14-day window = 74 days, so **Open-Meteo always covers a live checkup**. ERA5-Land is needed only as a fallback, and for the offline sanity check (5I). |
| **EECU per call** (Cloud Monitoring, one workload tag per call type, 3 runs each) | soil (24 values at one point): **0.04 EECU-s**; CHIRPS 30-day rain + 20-year baseline: **0.38**; ERA5-Land 17 days at one point: **0.34**; "latest date" with a full-collection sort: **1.6** (too costly, replaced below) | a normal checkup costs **≈ 0.4 EECU-s**; the daily cap of 18,000 allows ≈ 40,000 uncached checkups a day |
| Timing | soil 1.5 s, CHIRPS 1.5 s, ERA5 0.4 s (warm) | first card load ≈ 2–4 s, plus a geo-service cold start |

Soil values at the three test fields (0–5 cm, converted): pH 6.7–7.7, clay 23–34%, sand 39–40%,
**total N 11.1–17.6 g/kg, SOC 12.6–37.6 g/kg.** See risk R1: these N and OC values are far above what
Indian soil tests usually report.

## 3. Design

### 3.1 Flow

```
client ResultCard (location present) ──once──► GET /api/predict/:id/context   (owner-only, contextLimiter)
  server: snapshot on the checkup and version == CONTEXT_VERSION? → fit(...) → answer (no external calls)
  else build it:
    weather  ← services/openMeteo.js (hourly, 0.05° grid; the existing cache when the reference date is today)
    soil     ← SoilCache (hash of the snapped 250 m cell) or geo-service POST /context {lat, lon, soil:true}
    rain anomaly (+ ERA5-Land only if Open-Meteo can't cover the window) ← same geo-service request
    field    ← FieldHealthCache only (never calls the geo-service for this)
    season   ← static table
  → save prediction.context (immutable) → fit(...) → answer
```

- **One geo-service request per uncached checkup** (soil and rain together). There are zero requests
  when the soil cell is cached and the anomaly is unknown or already stored.
- **Open-Meteo: 0 or 1 call per checkup.** 0 when the risk strip already fetched this grid cell this
  hour. Otherwise 1 call (`past_days=14, forecast_days=5`, the same query as the risk strip, so it
  fills the same cache), or 1 call with `start_date/end_date` for an older EXIF date.
- **Failures:** geo-service timeout → 502, quota → 503, Open-Meteo down → 502, and **nothing is
  stored**. So the next open retries, and a half-empty snapshot is never frozen. That holds even when
  only the soil lookup fails: v1 stores all or nothing, which keeps "immutable" honest. The one
  exception is data that doesn't exist yet: a rain anomaly the source can't cover is stored as
  `unknown` with its reason.

### 3.2 Reference date

- The client reads EXIF `DateTimeOriginal` with the exifr import it already has, and sends
  `captured_at` (YYYY-MM-DD).
- The server accepts it only if it is not in the future and not more than 60 days old. Otherwise it is
  ignored, and the reason is stored.
- `reference = { date, source: "exif" | "created_at", rejected?: "future" | "too_old" }`.

### 3.3 Snapshot schema (stored as `Prediction.context`, no coordinates anywhere)

```jsonc
{
  "version": 1, "computedAt": "…",
  "reference": { "date": "2026-09-20", "source": "exif" },
  "weather": {
    "source": "open-meteo" | "era5-land", "grid": "0.05°" | "0.1°", "timezone": "Asia/Kolkata",
    "days": [ { "date": "…", "tmin": 22.1, "tmean": 26.0, "tmax": 31.4, "rhMean": 81, "rhMax": 97,
                "hoursRh90": 7 /* null for ERA5: daily data */, "rain": 3.2, "source": "open-meteo",
                "forecast": false } ],                              // 14 before + reference day + 3 outlook
    "gaps": ["2026-09-11"],                                         // days with < 20 hourly values
    "summary": { "window": 14, "tminMean": …, "tmeanMean": …, "tmaxMean": …, "rhMean": …,
                 "hoursRh90": …, "humidDays": …, "rainMm": …, "rainyDays": … }
  },
  "rainAnomaly": { "source": "chirps" | "era5-land" | null, "windowStart": "…", "windowEnd": "…",
                   "rainMm": 288.7, "normalMm": 157.9, "percentOfNormal": 183, "baseline": "2001-2020",
                   "status": "ok" | "unknown", "reason": "data ends 2026-08-31" },
  "soil": { "source": "SoilGrids 250 m v2.0 (CX-06)", "label": "modelled at 250 m, not a soil test of this field",
            "depths": { "0-5": {…}, "5-15": {…}, "15-30": {…} },
            "topsoil0to30": { "phH2O": 7.8, "nitrogenGkg": 8.1, "socGkg": 10.2, "clayPct": 25.6, "sandPct": 38.4,
                              "siltPct": 36.0, "cecCmolKg": 15.3, "bdodKgDm3": 1.52 },
            "texture": "loam", "textureMethod": "USDA triangle (Soil Survey Manual)" },
  "fieldHealth": { "status": "cached" | "not_requested", "verdict": "normal", "lastClearDate": "…",
                   "latestNdvi": 0.6, "latestZ": 0.01 },
  "season": { "name": "kharif" | "rabi" | "zaid" | "perennial", "source_id": "…" },
  "provenance": { "sources": [ { "cx": "CX-01", "dataset": "open-meteo forecast", "dates": "…" }, … ],
                  "attributions": [ "Weather data by Open-Meteo.com (CC BY 4.0)", … ],
                  "eecuEstimate": 0.4, "geoCalls": 1, "openMeteoCalls": 1 }
}
```

- **0–30 cm value:** the depth-weighted mean `(5·v₀₋₅ + 10·v₅₋₁₅ + 15·v₁₅₋₃₀) / 30`. Rules compare
  against this, and the three depths are kept for display. **Decision for you: see R1.**
- **Humid day** = a day whose maximum hourly RH is ≥ 90%. This is the reading already used for
  Padmanabhan in diseaseRisk.js. For ERA5 days: daily mean RH ≥ 90%, marked as such.
- **Rainy day** = rain ≥ 2.5 mm, the IMD definition. The IMD source is to be cited in Phase B.
- **RH from ERA5-Land:** the Magnus formula with the Alduchov & Eskridge (1996) coefficients (17.625,
  243.04 °C), applied to the daily mean T and dew point. That gives an approximate daily mean RH. The
  source is to be opened and cited in Phase C.
- **Texture class:** the USDA 12-class triangle from clay/sand/silt. Source: USDA NRCS Soil Survey
  Manual (Handbook 18), ch. 3. Checked on the triangle's corner cases.

### 3.4 Knowledge base: `server/knowledge/disease_rules.json`

The schema from the brief is kept, with these additions:

- `id` per rule, so the review CSV can round-trip.
- An `aggregate` on each rule, so a rule says exactly what it measures. Allowed aggregates:
  - `mean` over the window: `tmin`, `tmean`, `tmax`, `rhMean`;
  - `sum`: `hoursRh90`, `rain`;
  - `count`: `humidDays`, `rainyDays`;
  - `value` for static factors: `rainAnomalyPct`, `soil.phH2O`, `soil.nitrogenGkg`, `soil.socGkg`,
    `soil.texture`, `season`;
  - Soil Health Card factors (only from the farmer's card): `soilTest.availableN`, `availableP`,
    `availableK` (kg/ha), `ocPct`, `ph`, `ec` (dS/m), `s`, `zn`, `fe`, `cu`, `mn`, `b` (ppm).
    `ph` falls back to SoilGrids pH when there's no card.
- `op` is one of `lt le gt ge between in`. `between` is inclusive, `[lo, hi]`.
- `unit` must match the factor's unit. The schema test checks this.
- `window_days` is 1–14, counted back from the reference date.
- `quote_or_numbers` and `section_or_page` are required for every source.
- `accessed` is a date.
- `model_ref` is used only for `potato/Late_blight → diseaseRisk:indoBlightcast` and
  `rice/Blast → diseaseRisk:yoshino`. These entries have `rules: []`, and their sources point to
  docs/DISEASE_RISK.md.

**Review loop:**
- `server/scripts/rules_review.js` (`npm run rules-review`) writes `docs/RULES_REVIEW.csv`: one row per
  rule, with blank `reviewer / verdict / corrected_value / notes` columns.
- `--apply <csv>` writes the reviewed rows back into the JSON:
  - `verdict=ok` → `review_status: reviewed`;
  - `corrected_value` → a new value, marked reviewed;
  - `reject` → the rule is removed, and the reason is logged into `no_rule_reason` if it was the class's
    last rule.
- A test fails when the CSV is stale. This is the same pattern as translation-review.

### 3.5 Rule engine: `server/utils/environmentFit.js` (pure)

`fit(entry, snapshot, riskAssessment?)` → `{ level, score, matched[], unmatched[], missing[], draft }`.
Each item is `{ ruleId, factor, actual, op, threshold, unit, role, sourceId }`.

- **Each rule** is either *met* (its condition holds), *not met*, or *missing*, when the factor is null or
  unknown in the snapshot.
- **Score**, over the evaluated rules only:
  `score = Σ w·[favourable & met] + Σ w·[unfavourable & not met]` ÷ `Σ w (evaluated)`.
  So 1 means every favourable condition is present and no unfavourable one.
- **Unknown** when:
  - the class has no rules; or
  - the missing rules carry ≥ 50% of the class's total weight; or
  - no rule could be evaluated.
- **Level:** score ≥ 0.67 favourable, ≤ 0.33 unfavourable, otherwise neutral.
- **model_ref classes:** the level comes from `diseaseRisk.assess(crop, hourly weather, reference date)`.
  The reference day's level maps high → favourable (1.0), medium → neutral (0.5), low → unfavourable
  (0.0), and null → unknown. The model's own numbers are shown, not re-implemented. The ERA5 path has
  no hourly data, so it gives `unknown` for these two classes, with the reason.
- Weights default to 1. A source-stated "main factor" may get 2. The weight is written in the rule.

### 3.6 API, ML, fusion

- `GET /api/predict/:id/context`:
  - owner-only;
  - `contextLimiter` 30 per 10 min per IP (`CONTEXT_RATE_LIMIT`). That's above the predict limit of 20,
    because the client calls it automatically after every located result;
  - 404 not yours; 409 no location or status not ok/uncertain; 503 geo-service not configured / quota;
    502 upstream failure.
  - The answer is the snapshot without coordinates, plus `fit` for the diagnosed class and for each top-3
    alternative, the attributions, and `draft: true` while any rule used is a draft.
- **ml-service:** `top3` in every ok/uncertain answer (a one-line change; `test_api` updated). The server
  already stores it.
  - The UI keeps showing alternatives only for `uncertain`.
  - **The PDF's "other possibilities" row is limited to `uncertain`**, so an ok report doesn't change.
- **Fusion** (`server/utils/fusion.js`):
  `rerank(top3, fits, alpha=0.3)` = `p·f(score)^α`, renormalised, with `f = 0.5 + score` bounded to
  0.5..1.5, and `unknown` → f = 1.
  - It returns the input unchanged unless the status is `uncertain`.
  - It is used only by `server/scripts/eval_fusion.js`.
  - `FUSION_MODE` accepts only `explain` in production. The server refuses to start with `rerank` when
    `NODE_ENV=production`.
  - eval_fusion: labelled = feedback `correct` (label = disease) or `incorrect` with a class
    `correctedLabel`, plus a snapshot. Below 200 → prints "insufficient data" and exits 0. Today there
    are 0.

### 3.7 geo-service `POST /context`

- Body: `{lat, lon, soil: bool, rain_anomaly: {end}, era5: {start, end}?}`.
- The same token, JSON logging (no coordinates), and error mapping (EE timeout 502, quota 503) as
  `/field-health`. Workload tag: `context`.
- **One `getInfo()`** returns an `ee.Dictionary` of the soil values, CHIRPS recent + baseline, and
  optionally the ERA5-Land daily rows. This is fine because it's a Dictionary of numbers and lists, not a
  nested FeatureCollection, which is the Task 12 bug.
- **Latest available dates:** `filterDate(today−60 d, today).aggregate_max('system:time_start')`
  instead of a full-collection sort (1.6 EECU-s). Server-side it's cached for one day, so it's inside
  the same request.
- The SoilGrids point is snapped to a 0.0025° grid (~250–280 m) **before** it's queried. That way the
  `SoilCache` key (sha256 of the snapped point) and the value always correspond.
- Tests: a recorded real EE answer as the fixture, plus synthetic rows, in the style of
  `test_field_health.py`.

### 3.8 Season

- Kharif / rabi / zaid from a cited Ministry of Agriculture (DES) or ICAR crop calendar, for the
  reference month and the crop.
- Perennial crops (sugarcane, banana, apple) → `perennial`, or the calendar's own label.
- The table lives in the knowledge-base file with its `source_id`. The source is found and quoted in
  Phase B; if none is openly available, season = `unknown` and I tell you.

### 3.9 Privacy

- Exact coordinates only in the private prediction record and in the POST body to the geo-service.
- Open-Meteo gets the 0.05° point, as today.
- The snapshot, the answer, logs, the PDF section and cache keys hold no coordinates. The soil cache key
  is a hash.
- **"Delete my data"** deletes the predictions, and with them the snapshots. It also deletes the
  `SoilCache` entries for those cells: a hash of a 250 m grid can be reversed by trying every cell in
  India, so it counts as location data.
- The Privacy page gets one paragraph (en + hi).

### 3.10 Client, PDF

- `ContextCard.jsx` on the result card when `locationSource !== 'none'` and the status is ok/uncertain.
  - One automatic request (a ref guards against a repeat in React strict mode).
  - States: loading / favourable / neutral / unfavourable / unknown / error.
  - Content:
    - the fit badge plus 2–3 reasons, "value vs threshold";
    - one weather line;
    - a soil line with the "modelled" label;
    - the season;
    - the alternatives' fit when the top-3 is shown;
    - citations;
    - the draft note;
    - attributions.
  - en + hi, 360 px.
- PDF: an "Environment context" section from `prediction.context` only. When there's no snapshot yet:
  "not computed yet (open the checkup in the app)".
  - Every row gets a `source` of `GET /api/predict/:id/context › …`.
  - Report version bump. The snapshot tests are updated; the hash and verify flow are unchanged.

## 4. The 53 classes and the planned source for each

Legend: F fungal, B bacterial, V viral / phytoplasma, I insect, N nutrient, A abiotic, H healthy.

- "Planned source" = where I expect to find numeric favourable conditions. **Nothing here is a rule
  yet.** In Phase B each page is opened and quoted.
- A class whose sources only say something vague ("high humidity", "warm weather") gets `rules: []`
  and a reason. I don't turn vague words into numbers.
- Expected outcome: roughly 25–30 classes with at least one numeric rule, 2 with `model_ref`, 10 healthy,
  and the rest `rules: []` with a reason (mostly vector-borne viruses and insects, where weather rules
  would be about the vector, not the disease).

| # | Crop | Class | Type | Cause (to confirm) | Planned sources |
|---|---|---|---|---|---|
| 1 | wheat | BlackPoint | F | *Alternaria / Bipolaris* on grain | ICAR-IIWBR bulletins; CIMMYT wheat disease field guide; peer-reviewed |
| 2 | wheat | FusariumFootRot | F | *Fusarium* spp. crown/foot rot | CIMMYT field guide; peer-reviewed |
| 3 | wheat | HealthyLeaf | H | – | none |
| 4 | wheat | LeafBlight | F | spot blotch *Bipolaris sorokiniana* (+ *Alternaria triticina*) | ICAR-IIWBR; CIMMYT (spot blotch, eastern Gangetic plains papers) |
| 5 | wheat | WheatBlast | F | *Magnaporthe oryzae* Triticum | CIMMYT; peer-reviewed (Bangladesh 2016 outbreak) |
| 6 | rice | Bacterialblight | B | *Xanthomonas oryzae* pv. *oryzae* | IRRI Rice Knowledge Bank; ICAR-NRRI; TNAU (CX-12) |
| 7 | rice | Blast | F | *Magnaporthe oryzae* | **model_ref diseaseRisk:yoshino** (+ Padmanabhan), docs/DISEASE_RISK.md |
| 8 | rice | Brownspot | F | *Bipolaris oryzae*; nutrient-poor soils | IRRI RKB; TNAU; peer-reviewed |
| 9 | rice | Healthy | H | – | none |
| 10 | rice | Tungro | V | RTBV/RTSV via green leafhopper | IRRI RKB; ICAR-NRRI |
| 11 | sugarcane | Banded_Chlorosis | A | cold injury | ICAR-SBI Coimbatore / ICAR-IISR Lucknow; peer-reviewed |
| 12 | sugarcane | BrownRust | F | *Puccinia melanocephala* | ICAR-SBI; TNAU; peer-reviewed |
| 13 | sugarcane | Brown_Spot | F | *Cercospora longipes* | TNAU; ICAR-SBI |
| 14 | sugarcane | Dried_Leaves | A | drying / senescence (dataset class is a symptom) | likely `rules: []` (not one cause) |
| 15 | sugarcane | Grassy_shoot | V | phytoplasma, sett-borne / leafhopper | ICAR-SBI; TNAU |
| 16 | sugarcane | Healthy_Leaves | H | – | none |
| 17 | sugarcane | Pokkah_Boeng | F | *Fusarium* spp. | ICAR-SBI; ICAR-IISR; peer-reviewed |
| 18 | sugarcane | Sett_Rot | F | *Ceratocystis paradoxa* | TNAU; ICAR-SBI |
| 19 | sugarcane | Viral_Disease | V | mosaic viruses (dataset class is generic) | likely `rules: []` |
| 20 | sugarcane | Yellow_Leaf | V | ScYLV via aphids | ICAR-SBI; peer-reviewed |
| 21 | sugarcane | smut | F | *Sporisorium scitamineum* | TNAU; ICAR-SBI |
| 22 | potato | Early_blight | F | *Alternaria solani* | ICAR-CPRI; TNAU; peer-reviewed |
| 23 | potato | Late_blight | F | *Phytophthora infestans* | **model_ref diseaseRisk:indoBlightcast** (+ Wallin/Blitecast) |
| 24 | potato | healthy | H | – | none |
| 25 | maize | Blight | F | Turcicum leaf blight *Exserohilum turcicum* | ICAR-IIMR; CIMMYT Maize Doctor; TNAU |
| 26 | maize | Common_Rust | F | *Puccinia sorghi* | ICAR-IIMR; CIMMYT |
| 27 | maize | Gray_Leaf_Spot | F | *Cercospora zeae-maydis* | CIMMYT; peer-reviewed |
| 28 | maize | Healthy | H | – | none |
| 29 | pigeonpea | Healthy | H | – | none |
| 30 | pigeonpea | Leaf_Spot | F | *Cercospora* leaf spot | ICRISAT; ICAR-IIPR |
| 31 | pigeonpea | Leaf_webber | I | *Maruca vitrata* / leaf webber | ICRISAT; ICAR-IIPR |
| 32 | pigeonpea | Sterilic_mosaic | V | PPSMV via eriophyid mite | ICRISAT |
| 33 | groundnut | Alternaria_Leaf_Spot | F | *Alternaria* spp. | ICRISAT; TNAU |
| 34 | groundnut | Healthy | H | – | none |
| 35 | groundnut | Leaf_Spot | F | early / late leaf spot (*Cercospora arachidicola*, *Nothopassalora personata*) | ICRISAT; TNAU; ICAR-DGR |
| 36 | groundnut | Nutrition_Deficiency | N | Fe/N/Zn deficiency (dataset class is generic) | TNAU; ICAR-DGR (soil pH / calcareous) |
| 37 | groundnut | Rosette | V | GRV complex via aphid | ICRISAT |
| 38 | groundnut | Rust | F | *Puccinia arachidis* | ICRISAT; TNAU |
| 39 | blackgram | Anthracnose | F | *Colletotrichum lindemuthianum* | ICAR-IIPR; TNAU |
| 40 | blackgram | Healthy | H | – | none |
| 41 | blackgram | Leaf_Crinkle | V | ULCV | ICAR-IIPR; TNAU |
| 42 | blackgram | Powdery_Mildew | F | *Erysiphe polygoni* | ICAR-IIPR; TNAU |
| 43 | blackgram | Yellow_Mosaic | V | MYMIV via whitefly | ICAR-IIPR; TNAU; peer-reviewed |
| 44 | apple | Alternaria_Leaf_Blotch | F | *Alternaria mali* | SKUAST-K; Dr YSPUHF; ICAR-CITH; peer-reviewed |
| 45 | apple | Healthy | H | – | none |
| 46 | apple | Mosaic | V | ApMV | ICAR-CITH; peer-reviewed |
| 47 | banana | Bract_Mosaic_Virus | V | BBrMV via aphids | ICAR-NRCB; TNAU |
| 48 | banana | Healthy | H | – | none |
| 49 | banana | Insect_Pest | I | mixed pests (generic class) | likely `rules: []` |
| 50 | banana | Moko_Wilt | B | *Ralstonia solanacearum* | ICAR-NRCB; TNAU |
| 51 | banana | Panama_Wilt | F | *Fusarium oxysporum* f. sp. *cubense* | ICAR-NRCB; TNAU (soil pH / texture) |
| 52 | banana | Pestalotiopsis_Leaf_Spot | F | *Pestalotiopsis* spp. | peer-reviewed |
| 53 | banana | Sigatoka_Leaf_Spot | F | *Mycosphaerella* / *Pseudocercospora* spp. | ICAR-NRCB; TNAU |

Research order: wheat, rice, sugarcane, potato, then maize, pigeonpea, groundnut, blackgram, apple, banana.
TNAU text is © TNAU, so I record facts and numbers with a link and at most a short quote.

## 5. Budgets

| Resource | Per uncached checkup | Per repeat view | Notes |
|---|---|---|---|
| Earth Engine | ≈ 0.4 EECU-s (soil 0.04 + CHIRPS 0.38), + 0.34 when the ERA5 fallback runs | 0 | soil is cached forever per cell; the daily cap of 18,000 EECU-s allows ≈ 40,000 checkups a day. To be re-measured on the final combined request. |
| Open-Meteo | 0–1 call | 0 | the same cache key as the risk strip when the date is today; the limit is 10,000 a day |
| geo-service requests | 0–1 | 0 | one EE `getInfo` per request |
| MongoDB | ~4–6 KB per snapshot | – | Atlas M0 512 MB: fine for tens of thousands of checkups |

## 6. Risks and decisions I need from you

- **R1 (needs your decision): SoilGrids N and OC don't match Indian soil-test thresholds.**
  - **What SoilGrids gives:** *total* nitrogen and SOC. At the three test fields that's 11–18 g/kg N in
    the top 5 cm (≈ 8 g/kg over 0–30 cm), and 13–38 g/kg SOC.
  - **What Indian sources use:** *available* N (alkaline KMnO₄, kg/ha; "low" < 280 kg/ha) and
    Walkley-Black OC % ("low" < 0.5%).
  - **The problem:** these are different quantities, not just different units, and the SoilGrids
    values look high for Punjab, Kolhapur and Anantapur soils. So "soil N 0.6 g/kg vs threshold 1.0"
    from the brief's example is unlikely to be reproducible honestly.
  - **My recommendation:**
    - soil pH and texture are used in rules;
    - N and OC are **shown** (modelled, with the caveat), but a rule may use them only if its source
      states a threshold in total-N or SOC terms;
    - otherwise the rule's soil factor is recorded as `not_comparable` and left out of the score.
  - The Soil Health Card check (CX-07, Phase 2) would settle it later.
- **R2 (needs your decision): CHIRPS lags about 4 weeks** (latest date today is 31 Aug), so a 30-day
  anomaly ending on today's date is almost always "unknown". Options:
  - **(a)** CHIRPS only; the anomaly is `unknown` for recent checkups.
  - **(b, recommended)** CHIRPS when it covers the window. Otherwise ERA5-Land: its 30-day rain against
    its own 2001–2020 baseline, the same source on both sides. It's allowed to end up to 10 days before
    the reference date (ERA5-Land lags 8 days), and its actual dates are shown ("30 days to 19 Sep:
    142% of normal"). Beyond that it's unknown.
- **R3: ERA5-Land's role is small.** Open-Meteo covers every accepted photo date (≤ 60 days + 14), so
  ERA5-Land weather is used only:
  - if Open-Meteo's range shrinks;
  - for R2(b);
  - for the offline sanity check.

  The fallback path is still built and tested, as asked.
- **R4: Vague literature.** Many sources give only qualitative conditions. Those classes get
  `rules: []`, so the card will often say "unknown: no sourced rule" for viruses and insects. That's
  the honest outcome.
- **R5: Weather is gridded, not measured in the field** (0.05° / ~11 km models, no leaf wetness). It's
  stated on the card.
- **R6: The sanity check (5I) has little to work with.** Among the shipped crops' sources, only DS-09
  (groundnut, Purba Medinipur, Jan–Apr 2022/2023) documents both place and months. In Phase E I'll check
  the papers behind DS-11 (blackgram), DS-06 (apple) and DS-08 (Tamil Nadu multi-crop) for dates. The
  six original crops' datasets aren't in the catalogue, so they're skipped.
- **R7: Always returning top-3** changes the ML contract. It's backward compatible, and the PDF row is
  limited to uncertain as said above.
- **R8: Hindi strings are AI-drafted.** They're added to the review list, like earlier tasks.

Nothing from "Fallback" / "Phase 2" (NASA POWER, IMD, Soil Health Card, ALU) is needed.

## 7. Phases after approval

- **B:** knowledge-base research, `docs/RULES_REVIEW.csv`, the review script. Committed alone.
- **C:** geo-service `/context`, the snapshot + API, `environmentFit`, fusion + eval, and tests.
- **D:** ContextCard, the PDF section, privacy, en + hi.
- **E:** sanity check, `docs/CONTEXT_LAYER.md` (plain-words explanation of every factor), a task.md
  entry, and the deploy steps under task.md Pending.
