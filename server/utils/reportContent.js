// What a field report says, as plain data (docs/REPORT.md). The PDF (utils/reportPdf.js) only draws
// this; the snapshot test pins it; the SHA-256 is taken over it. Every value comes from an API field and
// names it in `source`, so each number in the PDF can be traced back.
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

const terms = JSON.parse(readFileSync(new URL('../assets/terms.json', import.meta.url), 'utf8'));
export const REPORT_VERSION = 1;
export const REPORT_LANGUAGES = ['en', 'hi'];

const pick = (entry, lang, fallback) => entry?.[lang] || entry?.en || fallback;
const cropName = (crop, lang) => pick(terms.crops[crop], lang, crop);
const diseaseName = (crop, disease, lang) => pick(terms.diseases[crop]?.[disease], lang, disease?.replace(/_/g, ' '));
const severityName = (s, lang) => pick(terms.severity[s], lang, s);

const L = {
  en: {
    brand: 'PlantGuard', title: 'Field diagnosis report',
    reportId: 'Report ID', generated: 'Generated', checkupDate: 'Checkup date', checkupId: 'Checkup ID',
    modelVersion: 'Model version',
    images: 'Leaf photo and model attention',
    photo: 'Leaf photo as uploaded (resized, camera data removed)',
    gradcam: 'Grad-CAM: where the model looked most (brighter = more)',
    noGradcam: 'No heatmap was saved for this checkup.',
    diagnosis: 'Diagnosis', crop: 'Crop', disease: 'Diagnosis', confidence: 'Model confidence',
    status: 'Result status', statusOk: 'Confident diagnosis', statusUncertain: 'Uncertain: a clearer photo is advised',
    alternatives: 'Other possibilities', severity: 'Severity (from this photo)',
    severityNote: 'Severity is estimated from the share of discoloured leaf area in this one photo (early < 15%, moderate 15–40%, severe > 40%). In our test it agreed with expert grades 44% of the time.',
    yieldLoss: 'Estimated yield loss if untreated', yieldNone: 'Not estimated (no confident diagnosis)',
    yieldConfidence: { high: 'high confidence', med: 'medium confidence', low: 'low confidence' },
    yieldNote: 'From a lookup table of published figures (ICAR institutes, IRRI, state agricultural universities, peer-reviewed studies) by crop, disease and severity. High = India-specific or severity-resolved data; medium = international data; low = a proxy. It is not a measurement of this field.',
    location: 'Location', coords: 'Location (rounded to about 1 km)', locSource: 'Location from',
    sources: { gps: 'phone GPS', exif: 'GPS data in the photo' }, accuracy: 'Reported accuracy',
    noLocation: 'No location was shared with this checkup, so the map, satellite and weather sections are left out.',
    mapNote: 'The circle marks the rounded location (about 1 km), not the field boundary. Map © OpenStreetMap contributors.',
    mapMissing: 'The map could not be loaded when this report was made.',
    field: 'Field from space (Sentinel-2)', verdict: 'Verdict',
    flag: {
      below: 'Below neighbouring fields since {{date}}.',
      below_once: 'Below neighbouring fields on {{date}}; not yet confirmed by a second clear image.',
      normal: 'In line with neighbouring fields.', above: 'Greener than neighbouring fields.',
      no_neighbours: 'Not enough clear farmland nearby to compare with.',
      no_clear: 'No clear satellite view in the window (clouds).',
      not_farmland: 'The location does not look like farmland on the land-cover map; no comparison made.',
    },
    lastClear: 'Last clear image', clearImages: 'Clear images', clearOf: '{{clear}} of {{total}}',
    window: 'Window', latest: 'Latest field NDVI / NDRE', neighbours: 'Nearby fields NDVI (middle half)',
    farmland: 'Farmland share of the 30 m circle',
    chartNdvi: 'Field NDVI (greenness)', chartNdre: 'Field NDRE (leaf chlorophyll)', chartBand: 'Nearby fields NDVI, middle half',
    fieldNotChecked: 'Not included: the satellite view was not opened for this checkup in the app. The report never starts a new satellite check.',
    fieldNote: 'Satellites show crop stress, not which disease; the leaf photo tells which disease. Field = a 30 m circle around the location.',
    risk: { late_blight: 'Weather risk: potato late blight', blast: 'Weather risk: rice blast' },
    level: { low: 'Low', medium: 'Medium', high: 'High', null: '–' }, today: 'Today',
    riskAsOf: 'Risk indicator from weather, not a forecast of infection. Worked out when this report was made ({{date}}): past 2 days, today and the next 3.',
    riskUnavailable: 'Weather data was unavailable when this report was made.',
    riskModel: 'Model', riskSupport: 'Also shown',
    pdays: '7-day potato P-days', nightRh: '7-day night humidity total', run: 'Favourable days in a row',
    thresholdGt: 'needs more than {{x}}', runNote: '7 in a row = high',
    blitecast: 'Blitecast (supporting)', blitecastValue: '{{sv}} severity values, {{rain}} mm rain in 7 days, so a {{interval}} spray interval',
    interval: { '5-day': '5-day', '7-day': '7-day', '10+ day': '10+ day' },
    infectionHours: 'Infection hours today', infectionNote: '3 = medium, 6 = high',
    padmanabhan: 'Cool, humid days in a row (CRRI Cuttack rule)', padmanabhanNote: '4 in a row = warning',
    treatment: 'Treatment advice',
    notReviewed: 'This Hindi advice has not yet been checked by an agriculture expert. Keep chemical names and doses exactly as written, and confirm with your local agriculture officer.',
    limitations: 'Limitations: read before relying on this report',
    limits: [
      'This is an AI diagnosis from one leaf photo. It can be wrong; confirm with an agriculture officer or a KVK before acting on it.',
      'Yield loss is a lookup from published figures for this crop, disease and severity, not a measurement of this field.',
      'Severity is a heuristic from photo colours (44% agreement with expert grades).',
      'Satellite data shows crop stress, not which disease, and clouds can hide the field for weeks.',
      'The weather risk is an indicator from published models, not a forecast of infection.',
      'This is not an official crop-loss assessment (for example, not a PMFBY crop-cutting experiment).',
    ],
    sourcesTitle: 'Where each value comes from',
    integrity: 'Tamper evidence', hash: 'SHA-256 of the report content',
    verify: 'To check this report, open {{url}} : it shows the same hashes and the key values. The SHA-256 of this PDF file must match "pdfSha256" there.',
    page: 'Page {{i}} of {{n}}',
  },
  hi: {
    brand: 'PlantGuard', title: 'खेत निदान रिपोर्ट',
    reportId: 'रिपोर्ट आईडी', generated: 'बनाई गई', checkupDate: 'जाँच की तारीख़', checkupId: 'जाँच आईडी',
    modelVersion: 'मॉडल संस्करण',
    images: 'पत्ती की फ़ोटो और मॉडल का ध्यान',
    photo: 'अपलोड की गई पत्ती की फ़ोटो (छोटी की गई, कैमरा डेटा हटाया गया)',
    gradcam: 'Grad-CAM: मॉडल ने सबसे ज़्यादा कहाँ देखा (ज़्यादा चमक = ज़्यादा)',
    noGradcam: 'इस जाँच का हीटमैप सहेजा नहीं गया।',
    diagnosis: 'निदान', crop: 'फसल', disease: 'निदान', confidence: 'मॉडल का भरोसा',
    status: 'परिणाम की स्थिति', statusOk: 'भरोसेमंद निदान', statusUncertain: 'अनिश्चित: साफ़ फ़ोटो लेने की सलाह',
    alternatives: 'अन्य संभावनाएँ', severity: 'गंभीरता (इस फ़ोटो से)',
    severityNote: 'गंभीरता इसी एक फ़ोटो में पत्ती के बदरंग हिस्से के अनुपात से आँकी गई है (शुरुआती < 15%, मध्यम 15–40%, गंभीर > 40%)। हमारी जाँच में यह 44% बार विशेषज्ञों के आकलन से मेल खाई।',
    yieldLoss: 'इलाज न करने पर उपज में अनुमानित नुकसान', yieldNone: 'अनुमान नहीं (भरोसेमंद निदान नहीं)',
    yieldConfidence: { high: 'ऊँचा भरोसा', med: 'मध्यम भरोसा', low: 'कम भरोसा' },
    yieldNote: 'फसल, रोग और गंभीरता के अनुसार प्रकाशित आँकड़ों (ICAR संस्थान, IRRI, राज्य कृषि विश्वविद्यालय, समीक्षित शोध) की तालिका से। ऊँचा = भारत के या गंभीरता-वार आँकड़े; मध्यम = अंतरराष्ट्रीय आँकड़े; कम = अनुमानित विकल्प। यह इस खेत का माप नहीं है।',
    location: 'स्थान', coords: 'स्थान (लगभग 1 किमी तक गोल किया गया)', locSource: 'स्थान का स्रोत',
    sources: { gps: 'फ़ोन का GPS', exif: 'फ़ोटो में सहेजा GPS' }, accuracy: 'बताई गई सटीकता',
    noLocation: 'इस जाँच के साथ स्थान साझा नहीं किया गया, इसलिए नक्शा, सैटेलाइट और मौसम वाले हिस्से शामिल नहीं हैं।',
    mapNote: 'घेरा गोल किए गए स्थान (लगभग 1 किमी) को दिखाता है, खेत की सीमा को नहीं। नक्शा © OpenStreetMap contributors।',
    mapMissing: 'रिपोर्ट बनाते समय नक्शा लोड नहीं हो सका।',
    field: 'अंतरिक्ष से खेत (Sentinel-2)', verdict: 'नतीजा',
    flag: {
      below: '{{date}} से आसपास के खेतों से कमज़ोर।',
      below_once: '{{date}} को आसपास के खेतों से कमज़ोर; दूसरी साफ़ तस्वीर से अभी पुष्टि नहीं हुई।',
      normal: 'आसपास के खेतों जैसा ही।', above: 'आसपास के खेतों से ज़्यादा हरा।',
      no_neighbours: 'तुलना के लिए आसपास पर्याप्त साफ़ दिखने वाले खेत नहीं हैं।',
      no_clear: 'इस अवधि में सैटेलाइट से साफ़ तस्वीर नहीं मिली (बादल)।',
      not_farmland: 'यह स्थान भूमि-उपयोग नक्शे पर खेत जैसा नहीं दिखता; तुलना नहीं की गई।',
    },
    lastClear: 'आख़िरी साफ़ तस्वीर', clearImages: 'साफ़ तस्वीरें', clearOf: '{{total}} में से {{clear}}',
    window: 'अवधि', latest: 'खेत का ताज़ा NDVI / NDRE', neighbours: 'आसपास के खेतों का NDVI (बीच का आधा)',
    farmland: '30 मीटर घेरे में खेती की ज़मीन का हिस्सा',
    chartNdvi: 'खेत का NDVI (हरियाली)', chartNdre: 'खेत का NDRE (पत्तियों का क्लोरोफ़िल)', chartBand: 'आसपास के खेतों का NDVI, बीच का आधा',
    fieldNotChecked: 'शामिल नहीं: ऐप में इस जाँच के लिए सैटेलाइट दृश्य नहीं खोला गया। रिपोर्ट कभी नई सैटेलाइट जाँच शुरू नहीं करती।',
    fieldNote: 'सैटेलाइट फसल का तनाव दिखाता है, कौन-सा रोग है यह नहीं; रोग पत्ती की फ़ोटो बताती है। खेत = स्थान के चारों ओर 30 मीटर का घेरा।',
    risk: { late_blight: 'मौसम से ख़तरा: आलू का पछेती झुलसा', blast: 'मौसम से ख़तरा: धान का झोंका रोग' },
    level: { low: 'कम', medium: 'मध्यम', high: 'ज़्यादा', null: '–' }, today: 'आज',
    riskAsOf: 'मौसम पर आधारित ख़तरे का संकेत, संक्रमण का पूर्वानुमान नहीं। रिपोर्ट बनाते समय ({{date}}) निकाला गया: पिछले 2 दिन, आज और अगले 3 दिन।',
    riskUnavailable: 'रिपोर्ट बनाते समय मौसम का डेटा उपलब्ध नहीं था।',
    riskModel: 'मॉडल', riskSupport: 'साथ में दिखाया गया',
    pdays: 'आलू के 7 दिन के P-दिन', nightRh: '7 दिन की रात की नमी का कुल', run: 'लगातार अनुकूल दिन',
    thresholdGt: '{{x}} से ज़्यादा चाहिए', runNote: 'लगातार 7 = ज़्यादा ख़तरा',
    blitecast: 'Blitecast (सहायक)', blitecastValue: '{{sv}} गंभीरता अंक, 7 दिन में {{rain}} मिमी बारिश, यानी {{interval}} पर छिड़काव',
    interval: { '5-day': 'हर 5 दिन', '7-day': 'हर 7 दिन', '10+ day': '10+ दिन' },
    infectionHours: 'आज के संक्रमण-घंटे', infectionNote: '3 = मध्यम, 6 = ज़्यादा',
    padmanabhan: 'लगातार ठंडे, नम दिन (CRRI कटक नियम)', padmanabhanNote: 'लगातार 4 = चेतावनी',
    treatment: 'इलाज की सलाह',
    notReviewed: 'यह हिंदी सलाह अभी किसी कृषि विशेषज्ञ द्वारा जाँची नहीं गई है। दवा के नाम और मात्रा ठीक वैसे ही रखें जैसे लिखे हैं, और अपने स्थानीय कृषि अधिकारी से पुष्टि करें।',
    limitations: 'सीमाएँ: इस रिपोर्ट पर भरोसा करने से पहले पढ़ें',
    limits: [
      'यह एक पत्ती की फ़ोटो से AI निदान है। यह ग़लत हो सकता है; कोई कदम उठाने से पहले कृषि अधिकारी या KVK से पुष्टि करें।',
      'उपज का नुकसान इस फसल, रोग और गंभीरता के प्रकाशित आँकड़ों की तालिका से है, इस खेत का माप नहीं।',
      'गंभीरता फ़ोटो के रंगों से निकाला गया अनुमान है (विशेषज्ञों से 44% मेल)।',
      'सैटेलाइट फसल का तनाव दिखाता है, कौन-सा रोग है यह नहीं, और बादल हफ़्तों तक खेत को छिपा सकते हैं।',
      'मौसम से ख़तरा प्रकाशित मॉडलों पर आधारित संकेत है, संक्रमण का पूर्वानुमान नहीं।',
      'यह फसल नुकसान का आधिकारिक आकलन नहीं है (जैसे PMFBY का फसल-कटाई प्रयोग नहीं)।',
    ],
    sourcesTitle: 'हर मान कहाँ से आया',
    integrity: 'छेड़छाड़ का प्रमाण', hash: 'रिपोर्ट की सामग्री का SHA-256',
    verify: 'इस रिपोर्ट की जाँच के लिए {{url}} खोलें: वहाँ यही हैश और मुख्य मान दिखते हैं। इस PDF फ़ाइल का SHA-256 वहाँ के "pdfSha256" से मेल खाना चाहिए।',
    page: 'पृष्ठ {{i}} / {{n}}',
  },
};

export const fill = (s, vars = {}) => s.replace(/\{\{(\w+)\}\}/g, (_, k) => String(vars[k] ?? ''));
export const labels = (lang) => L[lang] ?? L.en;

const IST = 'Asia/Kolkata';
const locale = (lang) => (lang === 'hi' ? 'hi-IN' : 'en-IN');
export const formatIST = (date, lang) => `${new Intl.DateTimeFormat(locale(lang), { timeZone: IST, day: 'numeric',
  month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(date))} IST`;
// 'YYYY-MM-DD' (a calendar date, no time) -> "6 Sept 2026"
export const formatDay = (ymd, lang) => new Intl.DateTimeFormat(locale(lang), { timeZone: 'UTC', day: 'numeric',
  month: 'short', year: 'numeric' }).format(new Date(`${ymd}T00:00:00Z`));
const pct = (x, digits = 1) => `${(x * 100).toFixed(digits)}%`;
// a model confidence never prints as a certain "100.0%"
const confidence = (x) => (x >= 0.9995 ? '> 99.9%' : pct(x));
const num = (x, digits = 2) => (x == null ? '–' : x.toFixed(digits));

const API = 'GET /api/predict';
const row = (label, value, source) => ({ label, value, source }); // source: 'API route › field'

// prediction: the checkup as the API returns it (predictController publicView, in the report's language).
// location: { lat, lon, accuracyM } from the private record, or null. fieldHealth: the cached geo answer
// or null. risk: utils/diseaseRisk assess() + weatherSource, { unavailable: true }, or null (no model).
// images: SHA-256 of the embedded photo / heatmap / map bytes (null when missing).
export function buildReport({ reportId, generatedAt, lang, prediction: p, location, fieldHealth, risk, images, verifyUrl, watermark = null }) {
  const t = labels(lang);
  const sections = [];

  sections.push({ id: 'images', title: t.images,
    photo: { caption: t.photo, sha256: images.photo },
    gradcam: images.gradcam ? { caption: t.gradcam, sha256: images.gradcam } : null,
    note: images.gradcam ? null : t.noGradcam });

  const ok = p.status === 'ok';
  const diag = [
    row(t.crop, cropName(p.crop, lang), `${API} › crop`),
    row(t.disease, diseaseName(p.crop, p.disease, lang), `${API} › disease`),
    row(t.confidence, confidence(p.confidence), `${API} › confidence`),
    row(t.status, ok ? t.statusOk : t.statusUncertain, `${API} › status`),
  ];
  const others = (p.top3 ?? []).filter((c) => c.disease !== p.disease);
  if (others.length) {
    diag.push(row(t.alternatives, others.map((c) => `${diseaseName(p.crop, c.disease, lang)} ${pct(c.probability)}`).join(', '),
      `${API} › top3[].disease, top3[].probability`));
  }
  diag.push(row(t.severity, severityName(p.severity, lang), `${API} › severity`));
  diag.push(p.yieldLossPercent == null
    ? row(t.yieldLoss, t.yieldNone, `${API} › yieldLossPercent`)
    : row(t.yieldLoss, `${p.yieldLossPercent}% (${t.yieldConfidence[p.yieldLossConfidence] ?? '–'})`,
      `${API} › yieldLossPercent, yieldLossConfidence`));
  sections.push({ id: 'diagnosis', title: t.diagnosis, rows: diag, notes: [t.severityNote, t.yieldNote] });

  if (!location) {
    sections.push({ id: 'location', title: t.location, rows: [], notes: [t.noLocation] });
  } else {
    // two decimals: about 1.1 km north-south, the same rounding the map circle shows
    const lat = Math.round(location.lat * 100) / 100;
    const lon = Math.round(location.lon * 100) / 100;
    const rows = [
      row(t.coords, `${Math.abs(lat).toFixed(2)}° ${lat >= 0 ? 'N' : 'S'}, ${Math.abs(lon).toFixed(2)}° ${lon >= 0 ? 'E' : 'W'}`,
        'stored checkup location (private; never in an API answer), rounded to 0.01°'),
      row(t.locSource, t.sources[p.locationSource] ?? p.locationSource, `${API} › locationSource`),
    ];
    if (location.accuracyM != null) {
      rows.push(row(t.accuracy, `± ${Math.round(location.accuracyM)} m`, 'stored checkup locationAccuracyM (private)'));
    }
    sections.push({ id: 'location', title: t.location, rows,
      map: images.map ? { sha256: images.map, center: { lat, lon } } : null,
      notes: [images.map ? t.mapNote : t.mapMissing] });
  }

  if (location) {
    const FH = 'GET /api/predict/:id/field-health';
    if (!fieldHealth) {
      sections.push({ id: 'field', title: t.field, rows: [], notes: [t.fieldNotChecked] });
    } else {
      const used = (fieldHealth.series ?? []).filter((s) => s.used);
      const last = used.at(-1);
      const flag = fieldHealth.flag ?? {};
      const rows = [
        row(t.verdict, fill(t.flag[flag.code] ?? String(flag.code), { date: flag.since ? formatDay(flag.since, lang) : '' }),
          `${FH} › flag.code, flag.since`),
        row(t.lastClear, fieldHealth.last_clear_date ? formatDay(fieldHealth.last_clear_date, lang) : '–', `${FH} › last_clear_date`),
        row(t.clearImages, fill(t.clearOf, { clear: fieldHealth.clear_images, total: fieldHealth.images }), `${FH} › clear_images, images`),
        row(t.window, `${formatDay(fieldHealth.window.start, lang)} – ${formatDay(fieldHealth.window.end, lang)}`, `${FH} › window.start, window.end`),
      ];
      if (last) {
        rows.push(row(t.latest, `${num(last.ndvi)} / ${num(last.ndre)} (${formatDay(last.date, lang)})`, `${FH} › series[last used].ndvi, .ndre, .date`));
        if (last.neighbours?.enough) {
          rows.push(row(t.neighbours, `${num(last.neighbours.ndvi[0])} – ${num(last.neighbours.ndvi[2])}`, `${FH} › series[last used].neighbours.ndvi[p25, p75]`));
        }
      }
      if (fieldHealth.field_farmland != null) {
        rows.push(row(t.farmland, pct(fieldHealth.field_farmland, 0), `${FH} › field_farmland`));
      }
      sections.push({ id: 'field', title: t.field, rows,
        chart: used.length ? {
          window: fieldHealth.window,
          windowLabels: [formatDay(fieldHealth.window.start, lang), formatDay(fieldHealth.window.end, lang)],
          legend: { ndvi: t.chartNdvi, ndre: t.chartNdre, band: t.chartBand },
          points: used.map((s) => ({ date: s.date, ndvi: s.ndvi, ndre: s.ndre,
            band: s.neighbours?.enough ? [s.neighbours.ndvi[0], s.neighbours.ndvi[2]] : null })),
        } : null,
        notes: [t.fieldNote] });
    }
  }

  if (location && risk) {
    const R = 'GET /api/predict/:id/disease-risk';
    if (risk.unavailable) {
      sections.push({ id: 'risk', title: t.risk[risk.disease] ?? t.risk.late_blight, rows: [], notes: [t.riskUnavailable] });
    } else {
      const c = risk.days.find((d) => d.date === risk.today)?.conditions;
      const rows = [];
      if (c && risk.crop === 'potato') {
        rows.push(row(t.pdays, `${c.pdays7} (${fill(t.thresholdGt, { x: c.thresholds.pdays7 })})`, `${R} › days[today].conditions.pdays7`));
        rows.push(row(t.nightRh, `${c.nightRh7} (${fill(t.thresholdGt, { x: c.thresholds.nightRh7 })})`, `${R} › days[today].conditions.nightRh7`));
        rows.push(row(t.run, `${c.favourableRun} (${t.runNote})`, `${R} › days[today].conditions.favourableRun`));
        rows.push(row(t.blitecast, fill(t.blitecastValue, { sv: c.wallinSV7, rain: c.rain7mm, interval: t.interval[c.blitecastInterval] ?? c.blitecastInterval }),
          `${R} › days[today].conditions.wallinSV7, rain7mm, blitecastInterval`));
      } else if (c) {
        rows.push(row(t.infectionHours, `${c.infectionHours} (${t.infectionNote})`, `${R} › days[today].conditions.infectionHours`));
        rows.push(row(t.padmanabhan, `${c.padmanabhanStreak} (${t.padmanabhanNote})`, `${R} › days[today].conditions.padmanabhanStreak`));
      }
      rows.push(row(t.riskModel, `${risk.model.name}: ${risk.model.citation}`, `${R} › model.name, model.citation`));
      rows.push(row(t.riskSupport, risk.supporting.name, `${R} › supporting.name`));
      sections.push({ id: 'risk', title: t.risk[risk.disease],
        days: risk.days.map((d) => ({ date: d.date, today: d.date === risk.today,
          label: d.date === risk.today ? t.today : formatDay(d.date, lang).split(' ').slice(0, 2).join(' '),
          level: d.level, levelText: t.level[d.level ?? 'null'] })),
        daysSource: `${R} › days[].date, days[].level`,
        rows, notes: [fill(t.riskAsOf, { date: formatDay(risk.today, lang) }), risk.weatherSource] });
    }
  }

  sections.push({ id: 'treatment', title: t.treatment,
    text: p.treatment ?? t.yieldNone, source: `${API} › treatment`,
    notes: p.treatmentNeedsReview ? [t.notReviewed] : [] });

  sections.push({ id: 'limitations', title: t.limitations, items: t.limits });

  const mv = p.modelVersion;
  return {
    version: REPORT_VERSION, reportId, lang, generatedAt: new Date(generatedAt).toISOString(), watermark,
    brand: t.brand, title: t.title,
    header: [
      row(t.reportId, reportId, 'report record › reportId'),
      row(t.generated, formatIST(generatedAt, lang), 'report record › generatedAt'),
      row(t.checkupDate, formatIST(p.createdAt, lang), `${API} › createdAt`),
      row(t.checkupId, String(p._id), `${API} › _id`),
      row(t.modelVersion, mv ? [mv.backbone, mv.head, mv.gate].filter(Boolean).join(' · ') : '–', `${API} › modelVersion`),
    ],
    sections,
    verify: { url: verifyUrl, text: fill(t.verify, { url: verifyUrl }) },
  };
}

// Stable JSON (sorted keys) so the hash does not depend on property order
const stable = (v) => (Array.isArray(v) ? `[${v.map(stable).join(',')}]`
  : v && typeof v === 'object' ? `{${Object.keys(v).sort().map((k) => `${JSON.stringify(k)}:${stable(v[k])}`).join(',')}}`
    : JSON.stringify(v ?? null));
export const contentHash = (content) => createHash('sha256').update(stable(content)).digest('hex');
export const sha256 = (buf) => (buf ? createHash('sha256').update(buf).digest('hex') : null);

// every row with its source, for the report's last section
export const sourceRows = (content) => [
  ...content.header,
  ...content.sections.flatMap((s) => [...(s.rows ?? []),
    ...(s.daysSource ? [{ label: s.title, source: s.daysSource }] : []),
    ...(s.source ? [{ label: s.title, source: s.source }] : [])]),
];
