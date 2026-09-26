// Disease-risk rules from published models (docs/DISEASE_RISK.md has every source and assumption).
// Pure functions over an hourly local-time weather series: { time: ['YYYY-MM-DDTHH:00', ...],
// temp: [°C], rh: [%], rain: [mm] }. Missing values are null. Nothing here fetches anything.

export const LABEL = 'risk indicator, not a forecast of infection';

// ---- daily aggregates -------------------------------------------------------------------------------

const dateOf = (t) => t.slice(0, 10);
const hourOf = (t) => Number(t.slice(11, 13));
const mean = (xs) => xs.reduce((s, x) => s + x, 0) / xs.length;
const addDays = (date, n) => {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

// Per local date: Tmin, Tmax, rain, max RH, and the mean RH of that date's NIGHT (18:00 that evening to
// 05:00 next morning; our reading of INDO-BLIGHTCAST's "mean RH of the night").
export function dailyAggregates(w) {
  const days = new Map();
  const day = (d) => days.get(d) ?? days.set(d, { date: d, temps: [], rhs: [], rain: 0, night: [] }).get(d);
  w.time.forEach((t, i) => {
    const d = day(dateOf(t));
    if (w.temp[i] != null) d.temps.push(w.temp[i]);
    if (w.rh[i] != null) d.rhs.push(w.rh[i]);
    d.rain += w.rain[i] ?? 0;
    const h = hourOf(t);
    if (w.rh[i] == null) return;
    if (h >= 18) d.night.push(w.rh[i]);
    else if (h < 6) day(addDays(dateOf(t), -1)).night.push(w.rh[i]);
  });
  // only dates with their own hours (early-morning hours also create an entry for the previous night)
  const own = new Set(w.time.map(dateOf));
  return [...days.values()].filter((d) => own.has(d.date)).sort((a, b) => a.date.localeCompare(b.date)).map((d) => ({
    date: d.date,
    tmin: d.temps.length >= 20 ? Math.min(...d.temps) : null, // a full day, not a fragment
    tmax: d.temps.length >= 20 ? Math.max(...d.temps) : null,
    rain: d.rain,
    rhMax: d.rhs.length >= 20 ? Math.max(...d.rhs) : null,
    nightRh: d.night.length >= 10 ? mean(d.night) : null, // 12 night hours; allow a couple missing
  }));
}

// ---- potato late blight: INDO-BLIGHTCAST (Govindakrishnan et al. 2016) -------------------------------

// Sands, Hackett & Nix (1979) potato development rate, cardinal temperatures 7 / 21 / 30 °C
export function pRate(t) {
  if (t < 7 || t > 30) return 0;
  return t < 21 ? 10 * (1 - ((t - 21) ** 2) / 196) : 10 * (1 - ((t - 21) ** 2) / 81);
}

export function pDay(tmin, tmax) {
  return (5 * pRate(tmin) + 8 * pRate((2 * tmin + tmax) / 3) + 8 * pRate((tmin + 2 * tmax) / 3) + 3 * pRate(tmax)) / 24;
}

export const INDO = { pdays7: 52.5, nightRh7: 525, consecutive: 7 };

// Per day: 7-day sums of P-days and night RH, favourable when BOTH exceed the thresholds; high after
// 7 consecutive favourable days (the model's "late blight within 15 days"), medium when favourable today.
export function indoBlightcast(days) {
  let run = 0;
  return days.map((d, i) => {
    const win = days.slice(i - 6, i + 1);
    const complete = i >= 6 && win.every((x) => x.tmin != null && x.tmax != null && x.nightRh != null);
    if (!complete) { run = 0; return { date: d.date, level: null, pdays7: null, nightRh7: null, favourableRun: 0 }; }
    const pdays7 = win.reduce((s, x) => s + pDay(x.tmin, x.tmax), 0);
    const nightRh7 = win.reduce((s, x) => s + x.nightRh, 0);
    const favourable = pdays7 > INDO.pdays7 && nightRh7 > INDO.nightRh7;
    run = favourable ? run + 1 : 0;
    const level = run >= INDO.consecutive ? 'high' : favourable ? 'medium' : 'low';
    return { date: d.date, level, pdays7: round(pdays7, 1), nightRh7: round(nightRh7, 0), favourableRun: run };
  });
}

// ---- potato late blight: Wallin severity values / BLITECAST (supporting) -----------------------------

// Severity value of one continuous RH >= 90% period. The published table (UMaine Bulletin #2418) is, row
// by row, SV = floor((hours - 1) / 3) - k with k = 4 / 3 / 2 for 45-54 / 55-59 / 60-81 °F (bands in whole °F).
export function wallinSV(hours, meanTempC) {
  const f = Math.round(meanTempC * 9 / 5 + 32);
  const k = f >= 45 && f <= 54 ? 4 : f >= 55 && f <= 59 ? 3 : f >= 60 && f <= 81 ? 2 : null;
  return k === null ? 0 : Math.max(0, Math.floor((hours - 1) / 3) - k);
}

// SV per date (a period counts on the date it ends), then 7-day totals and BLITECAST's spray interval
export function wallinDaily(w) {
  const sv = new Map();
  let start = -1;
  const close = (end) => {
    const temps = w.temp.slice(start, end + 1).filter((t) => t != null);
    if (temps.length) {
      const date = dateOf(w.time[end]);
      sv.set(date, (sv.get(date) ?? 0) + wallinSV(end - start + 1, mean(temps)));
    }
    start = -1;
  };
  w.time.forEach((_, i) => {
    const wet = w.rh[i] != null && w.rh[i] >= 90;
    if (wet && start < 0) start = i;
    if (!wet && start >= 0) close(i - 1);
  });
  if (start >= 0) close(w.time.length - 1);
  return sv;
}

export function blitecastInterval(sv7, rain7) {
  const wetWeek = rain7 >= 30; // 1.18 inches
  if (sv7 >= (wetWeek ? 5 : 6)) return '5-day';
  if (sv7 >= (wetWeek ? 4 : 5)) return '7-day';
  return '10+ day';
}

// ---- rice blast: Yoshino (1979) infection hours -------------------------------------------------------

export const baseWetHours = (tw) => 60.09 - 4.216 * tw + 0.08858 * tw * tw;
// leaf wetness proxy (Sentelhas et al. 2008): RH >= 90% or measurable rain
export const isWet = (rh, rain) => (rh != null && rh >= 90) || (rain ?? 0) >= 0.1;

// Per hour: infection hour when (1) the past 5 days' mean temperature is 20-25 °C, (2) rain < 4 mm in the
// hour, (3) the continuous wet period so far >= base wet hours + 4 h (base from its mean temperature).
export function yoshinoHours(w) {
  const flags = new Array(w.time.length).fill(false);
  let runStart = -1;
  w.time.forEach((_, i) => {
    const wet = isWet(w.rh[i], w.rain[i]);
    if (!wet) { runStart = -1; return; }
    if (runStart < 0) runStart = i;
    if (i < 120) return; // not enough history for the 5-day mean
    const past = w.temp.slice(i - 120, i).filter((t) => t != null);
    if (past.length < 108) return;
    const mean5 = mean(past);
    const runTemps = w.temp.slice(runStart, i + 1).filter((t) => t != null);
    const runHours = i - runStart + 1;
    flags[i] = mean5 >= 20 && mean5 <= 25 && (w.rain[i] ?? 0) < 4 && runTemps.length > 0
      && runHours >= baseWetHours(mean(runTemps)) + 4;
  });
  return flags;
}

export const yoshinoLevel = (diwh) => (diwh >= 6 ? 'high' : diwh >= 3 ? 'medium' : 'low');

// ---- rice blast: Padmanabhan (1965), CRRI Cuttack (supporting) ----------------------------------------

// consecutive days (ending on each date) with Tmin < 24 °C and the day's highest RH >= 90%
export function padmanabhanStreaks(days) {
  let run = 0;
  return new Map(days.map((d) => {
    run = d.tmin != null && d.rhMax != null && d.tmin < 24 && d.rhMax >= 90 ? run + 1 : 0;
    return [d.date, run];
  }));
}

// ---- assessment ---------------------------------------------------------------------------------------

export const MODELS = {
  potato: {
    disease: 'late_blight',
    model: { name: 'INDO-BLIGHTCAST (ICAR-CPRI)',
      citation: 'Govindakrishnan P.M. et al. (2016) Int. J. Pest Management 62(4); P-days: Sands et al. (1979)',
      url: 'https://www.tandfonline.com/doi/abs/10.1080/09670874.2016.1210839' },
    supporting: { name: 'Wallin severity values / BLITECAST',
      citation: 'Wallin (1962); Krause, Massie & Hyre (1975) Plant Disease Reporter 59:95-98',
      url: 'https://extension.umaine.edu/publications/2418e/' },
  },
  rice: {
    disease: 'blast',
    model: { name: 'Yoshino infection hours',
      citation: 'Yoshino (1979); rules as in Katsantonis et al. (2017) Phytopathologia Mediterranea 56(2):187-216',
      url: 'https://oajournals.fupress.net/index.php/pm/article/view/5722' },
    supporting: { name: 'Padmanabhan (1965), CRRI Cuttack',
      citation: 'Padmanabhan S.Y. (1965) Proc. Indian Acad. Sci. 62:117-129',
      url: 'https://oajournals.fupress.net/index.php/pm/article/view/5722' },
  },
};
export const RISK_CROPS = Object.keys(MODELS);

// today (local) -2 .. +3 days, each with a level and the conditions behind it
export function assess(crop, w, today) {
  const days = dailyAggregates(w);
  const want = [-2, -1, 0, 1, 2, 3].map((n) => addDays(today, n));
  let rows;
  if (crop === 'potato') {
    const indo = new Map(indoBlightcast(days).map((r) => [r.date, r]));
    const sv = wallinDaily(w);
    const rainOf = new Map(days.map((d) => [d.date, d.rain]));
    rows = want.map((date) => {
      const r = indo.get(date);
      const week = [...Array(7)].map((_, k) => addDays(date, -k));
      const sv7 = week.reduce((s, d) => s + (sv.get(d) ?? 0), 0);
      const rain7 = week.reduce((s, d) => s + (rainOf.get(d) ?? 0), 0);
      return { date, level: r?.level ?? null, conditions: r && {
        pdays7: r.pdays7, nightRh7: r.nightRh7, favourableRun: r.favourableRun,
        thresholds: { pdays7: INDO.pdays7, nightRh7: INDO.nightRh7, consecutive: INDO.consecutive },
        wallinSV7: sv7, rain7mm: round(rain7, 1), blitecastInterval: blitecastInterval(sv7, rain7) } };
    });
  } else {
    const flags = yoshinoHours(w);
    const diwh = new Map();
    w.time.forEach((t, i) => { if (flags[i]) diwh.set(dateOf(t), (diwh.get(dateOf(t)) ?? 0) + 1); });
    const streaks = padmanabhanStreaks(days);
    const complete = new Set(days.filter((d) => d.tmin != null).map((d) => d.date));
    rows = want.map((date) => {
      if (!complete.has(date)) return { date, level: null, conditions: null };
      const h = diwh.get(date) ?? 0;
      const streak = streaks.get(date) ?? 0;
      return { date, level: yoshinoLevel(h), conditions: {
        infectionHours: h, padmanabhanStreak: streak, padmanabhanMet: streak >= 4 } };
    });
  }
  return { crop, disease: MODELS[crop].disease, label: LABEL, today, model: MODELS[crop].model,
    supporting: MODELS[crop].supporting, days: rows.map((r) => ({ ...r, forecast: r.date > today })) };
}

function round(x, digits) {
  const f = 10 ** digits;
  return Math.round(x * f) / f;
}
