# Field report (PDF)

One click on a result gives an A4 PDF of the checkup, for the farmer's records, an FPO, a bank or an
insurer. Samples: [sample_report.pdf](sample_report.pdf) (English) and [sample_report_hi.pdf](sample_report_hi.pdf)
(Hindi). The API answers they were built from are in [sample_report_api.json](sample_report_api.json).

It is a **summary with its limits printed on it, not an official loss assessment**. The diagnosis comes
from one photo. Severity agrees with expert grades 44% of the time. Yield loss is a lookup table. An
insurer or bank should treat it as supporting information, not evidence of loss.

## What is in it

| Section | Contents | Comes from |
|---|---|---|
| Header | report id, generated (IST), checkup date (IST), checkup id, model version | report record; `GET /api/predict` → `createdAt`, `_id`, `modelVersion` |
| Photo + Grad-CAM | the stored photo (resized, EXIF removed) and the heatmap | `imageUrl`, `gradcam` |
| Diagnosis | crop, disease, confidence, status, other possibilities, severity, yield loss with its confidence tag and source note | `crop`, `disease`, `confidence`, `status`, `top3`, `severity`, `yieldLossPercent`, `yieldLossConfidence` |
| Location | rounded to 0.01° (about 1 km), GPS or photo, accuracy, a small map with a 1 km circle | the private stored location (never in an API answer); `locationSource` |
| Field from space | verdict, last clear image, clear images, window, latest NDVI/NDRE, neighbours' range, farmland share, the NDVI/NDRE chart | `GET /api/predict/:id/field-health` (cached answer only) |
| Weather risk | 6 days (past 2, today, next 3) and today's conditions, for potato and rice | `GET /api/predict/:id/disease-risk` |
| Treatment | the advice in the report's language, with the "not yet checked by an expert" note for Hindi | `treatment`, `treatmentNeedsReview` |
| Limitations | AI diagnosis may be wrong; lookup-based loss; heuristic severity; satellite shows stress not disease; risk is an indicator; not an official assessment (not a PMFBY crop-cutting experiment) | fixed text |
| Where each value comes from | every value's label with its API route and field | the `source` of each row |
| Tamper evidence | SHA-256 of the report content, and the verify link | computed |

**Every number traces to an API field.** The report is built from the same view of the checkup that the
API sends to the app (`publicView` in `predictController.js`). Each row of the content carries a `source`,
and the last section of the PDF prints them all. `yieldLossConfidence` was added to the API for this: the
tag existed in `utils/yieldLoss.js` but was not returned before.

**No new satellite checks.** The field section uses the cached field-health answer. If the owner never
opened "See this field from space", the report says so and leaves the section out, so a download
never spends Earth Engine quota.

**When a part is missing, the report says so and doesn't fail.** A photo, map or weather answer that
can't be fetched leaves a note in place of the section. Only a checkup without a diagnosis (a rejected
photo, not a leaf) gets no report (409).

**Printing:** A4, black-and-white safe. Risk levels are printed as words, with white / light grey / dark
grey fills and a thick border for today. The chart uses a solid line, a dashed line and a grey band.
There is no colour-only meaning anywhere.

## Endpoints

| Route | Who | Answer |
|---|---|---|
| `GET /api/predict/:id/report.pdf?lang=en\|hi` | the checkup's owner (device id, like every checkup route) | the PDF (`Content-Disposition: attachment`, `no-store`). Without `lang`, the `Accept-Language` header decides. |
| `GET /api/reports/:reportId` | anyone with the id | `{ reportId, generatedAt, lang, contentSha256, pdfSha256, summary }`. The summary is crop, disease, status, confidence, severity, yield loss and its tag, checkup date and model version. No location, photo or device id. |

- The rate limit is `REPORT_RATE_LIMIT` (default 20 reports per 10 minutes per IP).
- Every download makes a new report with a new id. The id is `PG-` plus 72 random bits, so it can't be guessed.
- "Delete my data" deletes a checkup's reports too, and their verify links then answer 404.

## Tamper evidence: what it proves and what it doesn't

- Each report stores `contentSha256` (SHA-256 of the report content: stable JSON with sorted keys,
  including the SHA-256 of each embedded image) and `pdfSha256` (SHA-256 of the exact PDF bytes sent).
- **To check a PDF file:** compute its SHA-256 and compare it with `pdfSha256` from the verify link printed in it.
  - Windows: `certutil -hashfile report.pdf SHA256`.
  - Linux and Mac: `sha256sum report.pdf`.
  - A single changed byte gives a different hash.
- **To check a paper copy:** open the verify link and compare the printed key values and content hash
  with the `summary` and `contentSha256` it shows.
- **Limits:**
  - This is a record kept by us, not a digital signature. It proves the report matches what our server
    issued, as long as our database is trusted.
  - It says nothing about whether the photo was really taken in that field.
  - The upgrade would be a signed PDF (PAdES) with a published key. That is not worth doing until an
    institution asks for it.

## Why PDFKit and not Playwright (Cloud Run)

| | PDFKit (chosen) | Playwright + Chromium |
|---|---|---|
| Image size | about +25 MB (pdfkit, fontkit and their dependencies, measured) plus 1.7 MB of fonts | about +300–450 MB (Chromium and its system libraries) |
| Memory | about 70 MB extra while drawing one report (measured), well inside the server's 512 MiB | Chromium needs about 1 GiB to render reliably, so a bigger, costlier instance |
| Cold start | 0.12 s to import (measured) | 2–5 s to launch a browser |
| Time per report | 0.1–0.3 s to draw (measured) | about 1–2 s |
| Hindi | fontkit's Indic shaper, checked by rendering: conjuncts, reph, pre-base ि, nukta (क्षेत्र, प्रतिशत, धर्म, कार्य, द्वारा, कि, ज़्यादा) all correct | HarfBuzz, perfect |

The only thing Chromium does better is Hindi text layout. That was tested before any code was written
(scratch render of those words), and PDFKit got it right.

Two details make mixed Hindi/English text work:
- **Font runs:** Noto Sans Devanagari has no Latin letters and Noto Sans has no Devanagari. Text is split
  into runs by which font has each character (`runs()` in `utils/reportPdf.js`). Digits and punctuation
  go with the run they are in, and leading digits go with the first word ("24 सित॰" stays one run).
- **One baseline:** each font would place itself by its own ascender, so every run uses the same fixed
  baseline. Hindi, English and mixed cells line up.

A test checks that the fonts can draw **every character** of both reports and of every crop, disease and
severity name in `terms.json`. That's how `→` and `≥` (in neither font) were found and replaced.

Fonts: Noto Sans and Noto Sans Devanagari, Regular and Bold (SIL Open Font License,
`server/assets/fonts/OFL.txt`), from the Noto project. `server/assets/terms.json` is a copy of
`client/src/locales/terms.json`, because the server image is built from `server/` alone. A test fails if
the two differ.

## Third parties, and what they see

- **OpenStreetMap tiles** (the map): our server asks `tile.openstreetmap.org` for about 6 tiles around the
  rounded point. OSM sees our server's address and that ~5 km area, never the user.
  - We follow their [tile policy](https://operations.osmfoundation.org/policies/tiles/): an identifying
    User-Agent, attribution on the map and in the text, tiles cached in memory, and no bulk use.
  - At about 6 tiles per report this is far from "heavy use". If report numbers ever grow a lot, move
    to a tile provider with a key.
- **Open-Meteo** (weather risk): the same rounded ~5 km grid point as the risk strip (docs/DISEASE_RISK.md).
- **Cloudinary:** the server downloads the photo and the heatmap it stored there.

## Sample report

`docs/sample_report.pdf` and `docs/sample_report_hi.pdf` were made through the **real pipeline**, locally:
- the ML service scored `ml-service/tests/fixtures/golden/rice.jpg` (a test-set image);
- the geo-service ran real Earth Engine for a cropland point next to Punjab Agricultural University,
  Ludhiana (95% cropland on WorldCover; a public institution, not a farmer's field);
- the weather came from real Open-Meteo, and the map from real OSM tiles.

The server ran with `REPORT_WATERMARK="SAMPLE: test-set image"`, which prints a diagonal watermark.
The verify link in the samples points at `localhost`, because they were issued by a local server.

To make it again:

1. Start the ML service, the geo-service and the server.
2. Run the script:
```bash
node scripts/sample_report.js http://localhost:4010/api
```

## Tests

`server/tests/report.test.js`:
- **Snapshots** of the report content in English and Hindi (in place of the brief's "HTML template"
  snapshot: there is no HTML, and the content object is what the PDF draws and what the hash covers).
- **Tracing and values:**
  - every row has an API source;
  - every number equals the API field, formatted;
  - the location is rounded and the exact point appears nowhere;
  - each missing part gets its note.
- **Hash:** the hash is stable under key order and changes on any edit.
- **Glyphs:** a glyph exists for every character, and the server's copy of the terms equals the app's.
- **The PDF itself:** it is A4, at most 3 pages, in both languages.
- **Routes:**
  - the owner gets the PDF, and the stored `pdfSha256` equals the SHA-256 of the bytes;
  - the verify answer carries no private data;
  - missing photo, map and weather still give a PDF;
  - a cached field check is used and the geo-service is never called;
  - another device or a bad id gets 404, and a rejected photo gets 409;
  - "Delete my data" makes the verify link 404.

`client/src/test/ReportButton.test.jsx` checks the download in the app's language, and the error message.
