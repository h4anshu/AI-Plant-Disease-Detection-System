# Field health from space

For a checkup with a consented location, the app can show how the **whole field** has looked from space
over the last 4 months, and whether it's doing worse than the farmland around it. The leaf photo says
*which disease*. The satellite adds *how much of the field is under stress, and since when*. It never
names a disease.

This page explains every choice for someone new to remote sensing. The code follows it line by line:
`geo-service/field_health.py`. `geo-service/notebooks/explore_field.ipynb` repeats the same steps on a map.

## How a request flows

```
browser ──"See this field from space"──► Express  GET /api/predict/:id/field-health
                                          │  only the owner of the checkup; only if it has a consented location
                                          │  cache hit (MongoDB, hashed key)? → answer, no Earth Engine cost
                                          ▼
                                  geo-service POST /field-health {lat, lon, date, days, crop}
                                          │  (location in the body: Cloud Run logs every URL, never bodies)
                                          ▼
                                  Earth Engine: ONE request → per-image statistics → verdict
```

- **Nothing happens until the user presses the button.** Each uncached answer costs Earth Engine compute.
- **The window** is the **120 days** up to the checkup's date, about one crop season.
- **Neither the answer nor the cache contains coordinates.** The geo-service logs never contain them.
  "Delete my data" also removes the cached answers.

## 1. Which pixels are "the field"

Sentinel-2 pixels are **10 m × 10 m**.
- **With a mapped field boundary** (Google's ALU API), the field is that polygon. This needs an
  allow-listed Google Workspace account; see `docs/GEE_SETUP.md` section 5.
- **Without one (the current setup)**, the field is a **30 m circle** around the checkup's location:
  about **0.28 ha, ~28 pixels**. Every answer says which was used (`geometry_source: buffer_30m`), and the
  app says so under the chart.
- **Why 30 m:** big enough to average out a single odd pixel, small enough to usually stay inside one
  Indian field (typical holdings are about 1 ha). **Limit:** a point near a field edge can include some of
  the neighbouring field.

## 2. Which images: Sentinel-2 surface reflectance

**Collection:** `COPERNICUS/S2_SR_HARMONIZED`.
- Two satellites give a new image of the same place about **every 5 days**.
- "SR" (surface reflectance) means atmospheric haze is already corrected.
- "Harmonized" removes a processing offset that ESA introduced in 2022, so old and new images compare
  directly.

**Same-day duplicates:** where Sentinel-2 tiles overlap, one satellite pass appears twice. The service
keeps the view with more clear pixels.

## 3. Clouds: the SCL mask and the 60% rule

Every image has a **Scene Classification Layer (SCL)** band that labels each pixel. A pixel counts as a
clear view of the ground only if it's one of these classes:

| SCL | Meaning | Used? |
|---|---|---|
| 4 | vegetation | ✅ |
| 5 | bare soil | ✅ |
| 6 | water | ✅ (a flooded, freshly transplanted paddy *is* the field) |
| 7 | unclassified | ✅ |
| 0, 1, 2 | no data, saturated/defective, dark area | ❌ |
| 3 | cloud shadow | ❌ |
| 8, 9 | cloud (medium / high probability) | ❌ |
| 10 | thin cirrus | ❌ |
| 11 | snow | ❌ |

A date is **used only if at least 60% of the field's pixels are clear**. Below that, the field average
would come from a few pixels near a cloud edge.

**Kharif (monsoon) months:** weeks can pass without one clear view.
- The service reports that plainly, e.g. "No clear satellite view in this period (clouds)". It never
  invents a value.
- It marks the result as **stale** when the last clear image is more than **20 days** old.
- A real example: a Kolhapur field, 1 Jul – 10 Aug 2026, had 11 images and 0 clear.

## 4. The indices (exact bands and formulas)

Healthy leaves absorb red light (chlorophyll uses it) and strongly reflect near-infrared (leaf structure).
Stress, sparse crop or senescence reduce that contrast, so these indices drop.

| Index | Formula (Sentinel-2 bands) | Wavelengths, pixel size | What it shows |
|---|---|---|---|
| **NDVI** | `(B8 − B4) / (B8 + B4)` | NIR 842 nm, red 665 nm; 10 m | Green biomass / canopy cover. 0.1–0.2 bare soil, 0.3–0.5 young or sparse crop, 0.6–0.9 dense green crop. It **saturates** around 0.8–0.9 in dense canopies. |
| **NDRE** | `(B8A − B5) / (B8A + B5)` | narrow NIR 865 nm, red-edge 705 nm; 20 m | Leaf **chlorophyll**. It keeps responding after NDVI has saturated, so it catches yellowing inside a dense canopy earlier. B8A is used instead of B8 because it has the same 20 m pixel as B5. |
| **REDSI** (wheat, experimental) | `((705−665)·(B7−B4) − (783−665)·(B5−B4)) / (2·B4)` | red 665, red-edge 705 and 783 nm; 10–20 m | *Red-Edge Disease Stress Index* for **wheat yellow rust**. **Lower = more stress.** From Zheng et al., "New Spectral Index for Detecting Wheat Yellow Rust Using Sentinel-2 Multispectral Imagery", *Sensors* 2018, 18(3):868, equation 5. |

- **Reflectance scale doesn't matter.** Band values are stored ×10,000. NDVI and NDRE are ratios, and
  REDSI's numerator and denominator are both linear in reflectance, so the scale cancels out.
- **Why REDSI is only "experimental":**
  - it was developed and validated in China, at wheat **grain filling** (May 2017);
  - it wasn't validated for Indian varieties or other growth stages;
  - it responds to other stresses too.
  The app computes it **only for wheat** and labels it "experimental research index, not a diagnosis".

## 5. The neighbourhood baseline

A low NDVI means little by itself: every field is brown after harvest. What matters is *this field
compared with similar fields nearby, on the same day*.
- **Ring:** from **100 m to 1 km** around the point. The first 100 m are skipped because those pixels
  are often the same field.
- **Only cropland:** pixels that **ESA WorldCover 2021** (`ESA/WorldCover/v200`, 10 m) labels
  **class 40, Cropland**. Villages, roads, trees and water don't pull the baseline down.
- **Same clear-pixel rule:** SCL classes 4–7 on the same date.
- **On each date:** the **25th, 50th (median) and 75th percentile** of NDVI, NDRE and REDSI over those
  pixels. The app draws the 25th–75th range as the grey band.
- **Minimum size:** at least **50 clear cropland pixels (0.5 ha)**. Otherwise that date isn't compared.
  If no date qualifies, the answer is "Not enough clear farmland nearby".

## 6. The comparison and the verdict

**Robust z-score** for each clear date:

```
z = (field NDVI − neighbours' median) / (IQR / 1.349)          IQR = 75th − 25th percentile
```

IQR / 1.349 estimates the spread the way a standard deviation would, but a few extreme pixels (a tree
line, a burnt stubble patch) can't distort it. z = −1 means roughly "lower than about 84% of nearby
cropland".

| Verdict (`flag.code`) | Rule | What the app says |
|---|---|---|
| `below` | the latest **2 or more** comparable clear dates in a row have z ≤ −1 | "Below neighbouring fields since \<first date of that run\>" |
| `below_once` | only the latest one does | "…on \<date\>. Wait for the next clear image to confirm." |
| `normal` | latest z between −1 and +1 | "In line with neighbouring fields" |
| `above` | latest z ≥ +1 | "Greener than neighbouring fields" |
| `no_neighbours` | no date had enough clear cropland around | "Not enough clear farmland nearby to compare with" |
| `no_clear` | no clear date in the window | "No clear satellite view in the last 4 months (clouds)" |

**Two dates are needed** before a field is called "below" because a single image can be off (thin haze
that SCL missed, or the field was just irrigated). With about 5-day revisits, 2 dates means about 10 days
of evidence.

**What "below" can also mean:** sowing later than the neighbours, a different crop, harvest earlier, or
waterlogging. The chart shows the history so the farmer can judge; the verdict is a pointer, not a
diagnosis.

## 7. Cost, cache and limits

- **One Earth Engine request per answer** (`FeatureCollection.getInfo()` over the whole window).
  - **Measured: about 3 EECU-seconds per field check** on 26 Sep 2026 (workload tag `field-health`, Cloud
    Monitoring).
  - The monthly noncommercial quota (540,000 EECU-seconds) covers about 150,000 uncached checks.
  - A daily cap of 18,000 EECU-s is set in the Quotas page.
  - How to see the numbers: `docs/GEE_SETUP.md` section 4.
- **Cache:** MongoDB `fieldhealthcaches`, keyed by `sha256(lat, lon rounded to 4 decimals (~11 m), date,
  120 days, crop)`, expires after 30 days. The window ends on the checkup's date, so later images never
  change an answer.
- **Rate limit:** 10 uncached checks per device per 10 minutes (`FIELD_RATE_LIMIT`).
- **Timing:** 2–8 s per answer (measured), plus a few seconds when the geo-service starts cold.
- **Limits worth knowing:**
  - **10 m pixels** show patches, not plants; a small disease focus inside a field may not register.
  - **Mixed pixels:** at field edges and bunds, pixels mix field with bund.
  - **One crop map for all years:** WorldCover is from 2021; land use can change since then.
  - **No field boundary** (no ALU access): the 30 m circle approximation.

## 8. Checked on real fields (26 Sep 2026, window 29 May – 26 Sep)

| Field | Images / clear | Last clear | Latest NDVI | z | Verdict |
|---|---|---|---|---|---|
| Mullanpur Dakha, Punjab (paddy) | 31 / 16 | 25 Sep | 0.60 | 0.01 | in line |
| Kolhapur, Maharashtra (sugarcane) | 31 / 10 | 25 Sep | 0.81 | 0.73 | in line |
| near Anantapur, AP (groundnut) | 30 / 6 | 14 Sep | 0.28 | 0.82 | in line |
| Samrala, Punjab | 55 / 29 | 23 Sep | 0.65 | 0.10 | in line |
| field inside Ludhiana city (few neighbours) | 31 / 15 | 23 Sep | 0.26 | −0.44 | in line (1,767–6,095 cropland pixels around) |
| Kolhapur, 1 Jul – 10 Aug (monsoon) | 11 / 0 | — | — | — | no clear view |

**The Punjab series shows a real paddy season:**
- NDVI falls to 0.08–0.09 at transplanting in late June (flooded field);
- no clear image from mid-July to mid-August (monsoon);
- NDVI peaks at 0.85 in early September;
- it declines towards harvest.
