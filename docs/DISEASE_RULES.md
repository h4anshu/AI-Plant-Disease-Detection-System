# Disease rules: the knowledge base behind "environment fit"

`server/knowledge/disease_rules.json` says, for each of the 53 classes the models can return, which
weather, soil or season conditions the literature links to that disease. Every number in it comes from a
source that was opened and quoted. The context layer (docs/CONTEXT_LAYER_PLAN.md) compares these rules
with the weather and soil at a checkup's location. The result is shown as an **explanation**. It never
changes the diagnosis.

**Status: every rule is a draft.** The rules were researched by an AI assistant on 27 Sep 2026 and have
not been checked by an agronomist. The app says "not yet checked by an expert" next to them until they
are. How to review them is at the end of this page.

## What is in it (27 Sep 2026)

| | Classes |
|---|---|
| with at least one sourced rule | 21 (40 rules) |
| using a published model already in the app (docs/DISEASE_RISK.md) | 2: potato late blight (INDO-BLIGHTCAST), rice blast (Yoshino) |
| healthy classes (no rules) | 10 |
| no rule, with the reason written down | 20 |

The 20 classes without rules fall into four groups:
- **Spread by insects or planting material:** rice tungro, sugarcane grassy shoot, sugarcane yellow
  leaf, groundnut rosette, blackgram leaf crinkle, pigeonpea sterility mosaic, banana bract mosaic,
  apple mosaic. The weather matters for the insect, not for the disease directly, and the sources give
  no thresholds.
- **The dataset class is not one disease:** sugarcane "Dried_Leaves", sugarcane "Viral_Disease",
  banana "Insect_Pest", and pigeonpea "Leaf_Spot" (the ICRISAT handbook gives three different leaf spots
  with different conditions).
- **The sources only use words** like "warm and humid" or "dry weather", or give contradictory
  conditions: wheat black point, wheat foot rot, sugarcane brown spot, sugarcane sett rot, pigeonpea
  leaf webber.
- **Nothing usable was found** in ICRISAT OAR, Crossref or Europe PMC: groundnut Alternaria leaf spot,
  banana Moko wilt, banana Pestalotiopsis leaf spot.

"No rule" is shown as **unknown**, never as "unfavourable".

## Where the rules come from

The sources are, in the order they were used:
- **Indian and international institutes:**
  - TNAU Agritech (catalogue source CX-12);
  - IRRI Rice Knowledge Bank;
  - ICAR journals (Journal of Wheat Research, Journal of Sugarcane Research);
  - the ICRISAT handbooks and papers;
  - the Government of India soil-testing manual (2011).
- **Peer-reviewed papers** (Plant Disease, Plant Pathology, Frontiers, MDPI journals, Phil. Trans. R.
  Soc. B), read through PubMed Central, Europe PMC or the publisher's abstract.

Blogs, AI summaries and search-result snippets were only used to find a source. Nothing was taken from
them. TNAU text is © TNAU, so only short quotes and the numbers are kept.

## The schema

```jsonc
{
  "factors": { "<name>": { "label", "unit", "meaning" } },   // the only factors a rule may use
  "seasons": { "months": { "1": ["rabi"], … }, "source": {…} },
  "soilHealthCard": { "retestAfterYears": 2, "source": {…} },
  "classes": [ {
    "crop": "rice", "class": "Brownspot",                       // exactly the label-map names
    "cause_type": "fungal|bacterial|viral|insect|nutrient|abiotic|healthy",
    "cause": "Bipolaris oryzae …",
    "combine": "any",                                           // optional, see "Scoring" below
    "rules": [ {
      "id": "rice.Brownspot.1",
      "factor": "rhMean", "op": "between", "value": [86, 100], "unit": "%",
      "window_days": 7,                                         // null for soil and season
      "hours": 12,                                              // wetDays only
      "role": "favourable|unfavourable", "weight": 1,
      "source_id": "irri-rkb-brown-spot",
      "reading": "…",                                           // optional: where we had to interpret the source
      "reviewed_by": { "reviewer", "verdict", "date", "notes" } // added by the review script
    } ],
    "model_ref": null | "diseaseRisk:indoBlightcast" | "diseaseRisk:yoshino",
    "sources": [ { "id", "title", "publisher", "url", "section_or_page", "quote_or_numbers", "accessed" } ],
    "literature_confidence": "high|med|low",
    "review_status": "draft|reviewed",
    "no_rule_reason": ""
  } ]
}
```

### Factors

| Factor | Unit | What it measures | Where it comes from |
|---|---|---|---|
| `tmean` | °C | average of the daily mean temperature over the window | Open-Meteo (ERA5-Land as a fallback) |
| `tmin` | °C | average of the daily minimum temperature | same |
| `tmeanMin` | °C | the coldest daily mean in the window (for cold injury) | same |
| `rhMean` | % | average of the daily mean relative humidity | same |
| `wetDays` | days | days with at least `hours` hours at RH ≥ 90% | Open-Meteo hourly only. RH ≥ 90% stands in for leaf wetness, which no free service measures (Sentelhas et al. 2008, as in docs/DISEASE_RISK.md). |
| `soil.ph` | pH | soil pH | the farmer's Soil Health Card if entered, otherwise SoilGrids (modelled, 0–30 cm) |
| `soilTest.availableN` / `P` / `K` | kg/ha | available nutrients | **Soil Health Card only** |
| `soilTest.ocPct` | % | organic carbon | Soil Health Card only |
| `soilTest.zn` / `fe` / `s` | ppm | micronutrients | Soil Health Card only |
| `season` | season | kharif / rabi / zaid of the reference date | the calendar below |

**Why nutrients come only from the card:** SoilGrids gives *total* nitrogen and soil organic carbon.
Indian thresholds are for *available* N (alkaline permanganate) and Walkley-Black organic carbon.
These are different measurements, not the same number in different units. SoilGrids values are shown
in the app, labelled "modelled", but no rule reads them (a test checks this).

### How the sources were read into rules

These conventions keep rules comparable. Where a rule needed one, it says so in its `reading` field,
and the review CSV shows that field.
- **"Relative humidity X%"** becomes the average daily RH over the window (`rhMean`).
- **"Leaf wetness / dew for N hours"** becomes at least one day in the last 7 with N hours at RH ≥ 90%
  (`wetDays`, `hours: N`).
- **Cardinal temperatures from infection models** (minimum and maximum for infection) are applied to
  the daily mean temperature. This is a simplification: the models work hour by hour.
- **Windows:**
  - 7 days for infection conditions, about the time from infection to visible symptoms for most leaf
    spots;
  - 14 days for slower processes: cold injury that shows weeks later, and sugarcane diseases.

  The window lengths are our choice, not the sources'. They are open to review.
- **Seasons:** the Indian Economic Service definition, *"The kharif cropping season is from July
  –October … Rabi … October-March (winter). The crops grown between March and June are summer crops."*
  October and March belong to two seasons. This is the season of the photo date, not the crop's
  sowing date.

## Scoring (implemented in `server/utils/environmentFit.js`, Phase C)

Each rule is either **met**, **not met**, or **missing** (the data isn't there).
- **Default (weighted):**
  - score = (weight of favourable rules that are met + weight of unfavourable rules that are not met)
    ÷ weight of the rules that could be checked;
  - favourable ≥ 0.67, unfavourable ≤ 0.33, neutral in between;
  - **unknown** if the missing rules carry half the total weight or more.
- **`combine: "any"`** (only groundnut Nutrition_Deficiency): favourable if **any** rule is met,
  because one deficient nutrient is enough. Unfavourable only if at least half of the rules could be
  checked and none is met. Otherwise unknown.
- **`model_ref`:** the level comes from the published model for that day: high → favourable,
  medium → neutral, low → unfavourable, no data → unknown.
- **Weights:** leaf-wetness rules have weight 2 where the source names wetness as the requirement for
  infection (wheat spot blotch and blast, maize turcicum blight, groundnut rust and leaf spot). Every
  other rule has weight 1.

## Reviewing the rules (agronomist / KVK scientist)

1. Run `cd server && npm run rules-review`. This writes `docs/RULES_REVIEW.csv` (UTF-8, opens in
   Excel):
   - one row per rule;
   - plus one row per class that has no rule, so the reason can be checked too.
2. For each row, read `rule`, `our_reading` and the quote, and open `source_url` if needed. Then fill
   in:
   - `reviewer` (name);
   - `verdict`:
     - `ok`: the rule is right;
     - `change`: put the right value in `corrected_value`, as a number (`28`), a range (`20-30`) or a
       season list (`kharif;zaid`);
     - `reject`: delete the rule;
   - `notes` (optional).
3. Save the file as CSV and run `npm run rules-review -- --apply <path to the file>`.
   - Reviewed rules are stamped with the reviewer and date.
   - A class becomes `reviewed` when all its rows have a verdict.
   - The CSV is rewritten with only the rows still open.
4. New rules (for example a reviewer's own source for a class that has none) are added to the JSON by
   hand, with their source, and then go through the same review.

`tests/knowledge.test.js` checks:
- all 53 classes are present;
- every rule uses a known factor with the right unit and window, and cites a source listed in its class;
- the two published models are referenced, not re-implemented;
- no rule reads modelled N/OC;
- the CSV is up to date;
- the apply step: ok / change / reject, and bad input is refused.
