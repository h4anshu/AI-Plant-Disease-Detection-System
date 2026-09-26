# Disease-risk indicator: potato late blight and rice blast

A daily **risk indicator** with a 3-day outlook, computed from weather with **published models**. It says
whether recent and forecast weather matches conditions that these models associate with the disease. It
is **not a forecast of infection**: it knows nothing about the variety, the fungicides already sprayed, or
whether the pathogen is present. Every rule below was sourced before any code was written. A rule that
couldn't be sourced wasn't shipped.

Weather: [Open-Meteo](https://open-meteo.com) hourly forecast + the past 14 days (CC BY 4.0,
non-commercial free tier: under 10,000 calls/day, 5,000/hour, 600/minute). Time is local (`timezone=auto`).

## Potato late blight (*Phytophthora infestans*)

### Rule used for the level: INDO-BLIGHTCAST (ICAR-CPRI, India)

**Source:** Govindakrishnan P.M., et al. (2016), "INDO-BLIGHTCAST – a model for forecasting late blight
across agroecologies", *International Journal of Pest Management* 62(4).
[tandfonline 10.1080/09670874.2016.1210839](https://www.tandfonline.com/doi/abs/10.1080/09670874.2016.1210839).
- Developed at ICAR-Central Potato Research Institute, Shimla, from four Indo-Gangetic plain locations.
- Validated in the plains, the plateau and the hills.
- Run operationally by CPRI/AICRP with the IMD Agromet Division.

**The rule, as published in the abstract:**
- Compute daily **physiological days (P-days)** and the **mean relative humidity of the night**.
- Accumulate both over **7 consecutive days**.
- Late blight is predicted to appear **within 15 days** when the moving 7-day sums **exceed 52.5 P-days
  and 525 (RH %)**, and this holds **for seven consecutive days**. 525/7 = an average night RH of 75%;
  52.5/7 = 7.5 P-days/day.

**P-days** (the model's "effective temperature"). Sands, Hackett & Nix (1979), *Field Crops Research* 2,
as published by [Oregon State University, USPest.org](https://instar.biossys.oregonstate.edu/CalcMethods.html):

```
P(T) = 0                                   T < 7 °C or T > 30 °C
P(T) = 10 × (1 − (T − 21)² / (21 − 7)²)    7 ≤ T < 21
P(T) = 10 × (1 − (T − 21)² / (30 − 21)²)   21 ≤ T ≤ 30
P-day = (5·P(Tmin) + 8·P(⅔Tmin + ⅓Tmax) + 8·P(⅓Tmin + ⅔Tmax) + 3·P(Tmax)) / 24     (max 10 per day)
```

**Our reading, where the paper is paywalled:**
- **Night:** 18:00–06:00 local time, i.e. the evening of the day plus the early morning of the next.
- **P-days:** the standard Sands et al. formula above; the abstract only says "P-days".
- **Status:** our implementation of the published criterion, **not CPRI's official output**.

**Levels:**

| Level | Condition |
|---|---|
| **high** | both 7-day sums above the thresholds on **7 consecutive days** (the model's "blight predicted within 15 days") |
| **medium** | both sums above the thresholds today, but for fewer than 7 consecutive days (conditions are building up) |
| **low** | otherwise |

**Needed history:** 13 days (7 days to fill the sum, then 7 consecutive days). That's why the service
fetches **14 past days**, not 7.

**Known limits:**
- Fitted on the Indo-Gangetic plains; hills and plateau were only validation sites.
- Needs a potato crop in the field. The indicator doesn't know the planting date.
- Weather-model forecasts, not an on-farm station.

### Shown as supporting evidence: Wallin severity values / BLITECAST

**Sources:**
- Wallin J.R. (1962), *Plant Disease Reporter* 46:231–235.
- Krause R.A., Massie L.B., Hyre R.A. (1975), "Blitecast: a computerized forecast of potato late blight",
  *Plant Disease Reporter* 59:95–98.
- Tables as published by Johnson S.B., [University of Maine Extension Bulletin #2418](https://extension.umaine.edu/publications/2418e/).

**How severity values (SV) are assigned:** a **continuous period of RH ≥ 90%** gets SVs from its length and
its mean temperature:

| Mean temp during the RH ≥ 90% period | SV 0 | 1 | 2 | 3 | 4 | beyond |
|---|---|---|---|---|---|---|
| 7.2–12.2 °C (45–54 °F) | ≤ 15 h | 16–18 h | 19–21 h | 22–24 h | 25–27 h | > 27 h: SV = (h − 1)/3 − 4 |
| 12.8–15.0 °C (55–59 °F) | ≤ 12 h | 13–15 h | 16–18 h | 19–21 h | 22–24 h | > 24 h: SV = (h − 1)/3 − 3 |
| 15.6–27.2 °C (60–81 °F) | ≤ 9 h | 10–12 h | 13–15 h | 16–18 h | 19–21 h | > 21 h: SV = (h − 1)/3 − 2 |

- **Outside 7.2–27.2 °C:** 0 SV.
- **SV for a day:** the periods that end on that day.
- **BLITECAST's 7-day spray table** (UMaine Table 2): a 5-day spray interval when the 7-day SV total is
  ≥ 6 (≥ 5 if ≥ 30 mm rain in the 7 days); a 7-day interval at ≥ 5 (≥ 4 with rain).
- **What we show:** the 7-day SV total, labelled with the interval it corresponds to. It does not set the
  level.

**Known limits:**
- Developed in the north-eastern USA.
- The SV table is in whole °F bands, so the °C bands above are converted: 54–55 °F and 59–60 °F fall in
  the gaps and are assigned to the lower band.

### Researched, not used

**Hyre (1954; 1959, *Plant Disease* 43:245):** a day is favourable if the 5-day mean temperature is
< 25.5 °C and the 10-day rain is ≥ 3.0 cm (unfavourable if Tmin < 7.2 °C); 10 consecutive favourable days
→ blight in 7–14 days.
- Not used because it is rain-only and needs 19+ days of history.
- BLITECAST already embeds its idea.

**JHULSACAST (Singh et al. 2000, CPRI, western UP):** the published reviews name it but don't give its
rules, so it's not shipped.

## Rice blast (*Magnaporthe oryzae*)

### Rule used for the level: Yoshino (1979) infection hours

**Source:**
- Yoshino R. (1979), "Ecological studies on the penetration of rice blast fungus, *Pyricularia oryzae*,
  into leaf epidermal cells", *Bulletin of the Hokuriku National Agricultural Experiment Station* 22.
- **The rules as published in:**
  - Katsantonis D. et al. (2017), "Rice blast forecasting models and their practical value: a review",
    *Phytopathologia Mediterranea* 56(2):187–216,
    [open access](https://oajournals.fupress.net/index.php/pm/article/view/5722);
  - Nettleton D.F. et al. (2019), *BMC Bioinformatics* 20:514,
    [PMC6806664](https://pmc.ncbi.nlm.nih.gov/articles/PMC6806664/).
- Still used in operational systems in Japan and Korea.

**An hour is an *infection hour* when all three hold:**
1. the moving mean air temperature of the **past 5 days is 20–25 °C**;
2. the rain in that hour is **below 4 mm**;
3. the **continuous wet period** reaching that hour has lasted **at least base wet hours + 4 h**, where
   `base wet hours = 60.09 − 4.216·Tw + 0.08858·Tw²` and Tw is the mean temperature during the wet period.
   That's about 10–11 h at 20–25 °C, so about 14–15 h of wetness is required.

**Daily infection warning hours (DIWH)** = infection hours in the day. The published risk classes:

| DIWH | Yoshino class | Our level |
|---|---|---|
| 0 h | no risk | **low** |
| 1 h ≤ DIWH < 3 h | low risk | **low** |
| 3 h ≤ DIWH < 6 h | medium risk | **medium** |
| ≥ 6 h | high risk | **high** |

"No risk" and "low risk" both become "low": a three-colour strip for farmers. The DIWH value itself is
shown.

**Leaf wetness: a proxy, because Open-Meteo has no measured wetness.** An hour is "wet" when
**RH ≥ 90% or rain ≥ 0.1 mm**.
- Sentelhas P.C. et al. (2008), "Suitability of relative humidity as an estimator of leaf wetness
  duration", *Agricultural and Forest Meteorology* 148:392–400: the number of hours above a local RH
  threshold tracks measured wetness well; the thresholds were 83–92%, and **90% at the tropical site**
  (Piracicaba, Brazil).
- Open-Meteo offers `leaf_wetness_probability`, but its method isn't documented, so it isn't used.

**Known limits:**
- Developed in temperate Japan. In the hot Indian plains, the 5-day mean is often above 25 °C during
  kharif, so the rule rarely fires there. Blast in India peaks in cooler spells, in the hills and late in
  the season, which the India rule below reflects.
- Leaf blast only.

### Shown as supporting evidence: Padmanabhan (1965), CRRI Cuttack (now ICAR-NRRI)

**Source:** Padmanabhan S.Y. (1965), "Studies on forecasting outbreaks of blast disease of rice. 1.
Influence of meteorological factors on blast incidence at Cuttack", *Proceedings of the Indian Academy of
Sciences* 62:117–129; the rules as summarised in Katsantonis et al. (2017).
- **Leaf blast** follows **minimum temperature below 24 °C for 4–5 days** (after transplanting and during
  tillering) **with RH ≥ 90%**.

**What we show:** the current run of consecutive days with Tmin < 24 °C and a daily maximum RH ≥ 90%, and
whether it has reached **4 days** (the rule met).
- **Our reading:** "RH ≥ 90%" is taken as the day's maximum hourly RH ≥ 90%.
- It does not set the level: its RH duration isn't specified and the rule gives no graded levels.

### Researched, not used
- **Kapoor, Prasad & Sood (2004)**, Kangra (Himachal), *Indian Phytopathology* 57:440–445: 18–28 °C and
  RH > 90% for more than 9 h. Fitted to one hill district; the review gives only the summary.
- **BLASTAM** (Koshimizu 1988), **EPIBLA** (Manibhushanrao & Krishnan 1991): the published summaries
  don't give implementable thresholds.

## What every answer includes
- The level per day: past 2 days, today, next 3.
- The **driving conditions** (P-day and night-RH sums, SV total, DIWH, Tmin streak).
- The **model name and citation**.
- The label "risk indicator, not a forecast of infection".
