import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { getFloodExtent, sendAlertFeedback, updateField } from '../../services/api';
import { cropIcon } from './cropIcon';
import Icon from './icons';
import Horizon from './Horizon';
import PushCard from './PushCard';
import NewsPanel from './NewsPanel';
import PricesCard from './PricesCard';
import { AlertPill, useAlertText } from './alertParts';
import { Lbl } from './parts';
import { MAX_FIELDS, STAGES, alertKey, chartScale, collect, dayLabel, dayMonth, feedNotice, fieldName, hourLabel, iconOf, pct, readDone, readHelp, stamp, weekday, writeDone, writeHelp } from './alertsLib';

import { formatTime } from '../../locales/dates';
const barColor = (crit) => (crit ? '#F2DB8F' : 'rgba(245,240,226,.3)');
const BAR = 110; // px of the tallest bar
const ROWS = 4;    // alerts listed under the main one before "show more"

// "Wed 24 Feb, 12 am to 7 am" (or across midnight); the server's times are local to the field
function useWindow() {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const sameDay = (a, b) => a.slice(0, 10) === b.slice(0, 10);
  const nextMidnight = (from, to) => to.slice(11, 13) === '00' && !sameDay(from, to);
  return {
    window: (a) => {
      if (a.source === 'imd' || a.source === 'cwc') return t('alerts.official.wholeDay', { day: dayLabel(a.date, lang) }); // IMD and the gauges speak by the day
      const to = nextMidnight(a.from, a.to) ? t('alerts.midnight') : hourLabel(a.to, lang);
      return sameDay(a.from, a.to) || nextMidnight(a.from, a.to)
        ? t('alerts.windowSame', { day: dayLabel(a.date, lang), from: hourLabel(a.from, lang), to })
        : t('alerts.windowAcross', { day1: dayLabel(a.from.slice(0, 10), lang), from: hourLabel(a.from, lang), day2: dayLabel(a.to.slice(0, 10), lang), to });
    },
    ends: (a) => (a.source === 'imd' || a.source === 'cwc' ? t('alerts.official.endOfDay', { day: dayLabel(a.date, lang) }) : `${dayLabel(a.to.slice(0, 10), lang)}, ${hourLabel(a.to, lang)}`),
  };
}

// The bars of the main alert: the rule's number for each day ahead, with the lines of its levels
const Chart = ({ alert }) => {
  const { t, i18n } = useTranslation();
  const { values } = alert;
  const scale = chartScale(values);
  const unit = values.metric === 'rain' ? 'mm' : values.metric === 'discharge' ? 'm³/s' : values.metric === 'dry' ? t('alerts.chart.days') : '°C';
  const lines = Object.entries(values.levels).filter(([k]) => k !== 'info');
  // two close lines (a river's 95th and 99th percentile): the lower one's label goes under its line instead of over the other's
  const px = (v) => (pct(v, scale) / 100) * BAR;
  const close = values.levels.warn != null && values.levels.watch != null && Math.abs(px(values.levels.warn) - px(values.levels.watch)) < 14;
  return (
    <div className="flex min-w-0 flex-col gap-2 self-center rounded-[20px] border border-parchment/15 bg-parchment/[0.07] px-5 pb-3 pt-4">
      <div className="flex items-baseline justify-between gap-2"><Lbl className="!text-[#D5D5C7]">{t(`alerts.chart.${values.metric}`)}</Lbl><span className="font-mono text-[11px] text-[#D5D5C7]">{unit}</span></div>
      <div className="relative" style={{ height: BAR + 44 }} role="img" aria-label={values.series.map((s) => `${weekday(s.date, i18n.language)} ${s.value} ${unit}`).join(', ')}>
        {lines.map(([k, v]) => (
          <div key={k} className="absolute inset-x-0 z-[1]" style={{ bottom: 24 + (pct(v, scale) / 100) * BAR, borderTop: k === 'warn' ? '1.5px solid #F2DB8F' : '1.5px dashed rgba(245,240,226,.7)' }}>
            <span className={`absolute right-0 font-mono text-[10px] ${close && k === 'watch' ? 'top-0.5' : '-top-4'}`} style={{ color: k === 'warn' ? '#F2DB8F' : '#D5D5C7' }}>{t(`alerts.level.${k}`)} {v}</span>
          </div>
        ))}
        <div className="absolute inset-0 grid gap-2 pr-[78px]" style={{ gridTemplateColumns: `repeat(${values.series.length}, minmax(0, 1fr))` }}>
          {values.series.map((s) => {
            const crit = s.date === alert.date;
            return (
              <div key={s.date} className="flex flex-col items-center justify-end gap-1">
                <span className="relative z-[2] rounded bg-[#2A4C3C] px-1 font-mono text-xs font-semibold tabular-nums" style={{ color: crit ? '#F2DB8F' : '#D5D5C7' }}>{s.value}{values.metric === 'tmin' || values.metric === 'tmax' ? '°' : ''}</span>
                <i className="block w-[58%] rounded-t-lg" style={{ height: Math.max(4, (pct(s.value, scale) / 100) * BAR), background: barColor(crit) }} />
                <span className="h-5 text-xs leading-5 text-[#D5D5C7]">{weekday(s.date, i18n.language)}</span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

// what a report-based alert (other farmers' photo checks near the field) has instead of a chart: how many phones, which disease, and the caveat
const NearPanel = ({ alert }) => {
  const { t } = useTranslation();
  const text = useAlertText();
  const { value, window, radiusKm } = alert.values;
  const disease = text.disease(alert);
  return (
    <div className="flex min-w-0 flex-col gap-3 self-center rounded-[20px] border border-parchment/15 bg-parchment/[0.07] px-5 py-5">
      <Lbl className="!text-[#D5D5C7]">{t('alerts.near.panel')}</Lbl>
      <p className="font-display text-[2.4rem] leading-none text-butter">{t('alerts.near.count', { value })}</p>
      <p className="text-[15px] leading-snug">{t('alerts.near.text', { window, km: radiusKm, crop: text.crop(alert), disease })}</p>
      <p className="text-[12.5px] leading-relaxed text-[#D5D5C7]">{t('alerts.near.caveat')}</p>
      <Link to="/map" className="ws-btn ws-btn-butter self-start"><Icon name="map" className="h-[18px] w-[18px]" />{t('alerts.near.map')}</Link>
    </div>
  );
};

// "Did this help?" under the main alert: acted / not needed / it was wrong. One answer per alert, remembered on this device and sent to
// the server (which stores the rule, date, level and answer only). The answers decide which rules are kept (docs/FIELD_ALERTS.md, "Evaluation").
const HelpRow = ({ alert }) => {
  const { t } = useTranslation();
  const key = alertKey(alert);
  const [answers, setAnswers] = useState(readHelp);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const given = answers[key];
  const send = async (answer) => {
    setBusy(true);
    setFailed(false);
    try {
      await sendAlertFeedback(alert.field._id, { alertId: alert.id, level: alert.level, answer });
      const next = { ...answers, [key]: answer };
      setAnswers(next);
      writeHelp(next);
    } catch { setFailed(true); } finally { setBusy(false); }
  };
  const again = () => { const next = { ...answers }; delete next[key]; setAnswers(next); writeHelp(next); };
  return (
    <div className="relative z-10 flex flex-wrap items-center gap-x-4 gap-y-2.5 border-t border-parchment/20 pt-4" role="group" aria-label={t('alerts.help.q')}>
      <span className="font-mono text-[11px] uppercase tracking-[0.14em] text-[#D5D5C7]">{t('alerts.help.q')}</span>
      {given ? (
        <>
          <span role="status" className="text-[14px]">{t('alerts.help.thanks')}</span>
          <button type="button" className="text-[13px] underline underline-offset-2" onClick={again}>{t('alerts.help.change')}</button>
        </>
      ) : [['acted', 'acted'], ['not_needed', 'notNeeded'], ['wrong', 'wrong']].map(([a, text]) => (
        <button key={a} type="button" disabled={busy} className="ws-btn !min-h-[44px] !border-parchment/50 bg-transparent !px-4 text-sm text-parchment hover:bg-parchment/10" onClick={() => send(a)}>{t(`alerts.help.${text}`)}</button>
      ))}
      {failed && <span role="alert" className="text-[13px] text-butter">{t('alerts.help.failed')}</span>}
    </div>
  );
};

// what a fire alert has instead of a chart: how many hot spots, how near, when the last one was seen, and what a satellite cannot see
const FirePanel = ({ alert }) => {
  const { t, i18n } = useTranslation();
  const { count, nearKm, newest } = alert.values;
  return (
    <div className="flex min-w-0 flex-col gap-3 self-center rounded-[20px] border border-parchment/15 bg-parchment/[0.07] px-5 py-5">
      <Lbl className="!text-[#D5D5C7]">{t('alerts.fire.panel')}</Lbl>
      <p className="font-display text-[2.4rem] leading-none text-butter">{t('alerts.fire.count', { count })}</p>
      <p className="text-[15px] leading-snug">{t('alerts.fire.text', { km: nearKm, time: stamp(newest, i18n.language) })}</p>
      <p className="text-[12.5px] leading-relaxed text-[#D5D5C7]">{t('alerts.fire.caveat')}</p>
      <a href="https://firms.modaps.eosdis.nasa.gov/map/" target="_blank" rel="noopener noreferrer" className="ws-btn ws-btn-butter self-start"><Icon name="arrow" className="h-[18px] w-[18px]" />{t('alerts.fire.map')}</a>
    </div>
  );
};

// what an official alert has instead of our chart: who issued it, when, until when, and the original
const OfficialPanel = ({ alert }) => {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  return (
    <div className="flex min-w-0 flex-col gap-4 self-center rounded-[20px] border border-parchment/15 bg-parchment/[0.07] px-5 py-5">
      <Lbl className="!text-[#D5D5C7]">{t('alerts.official.panel')}</Lbl>
      <dl className="flex flex-col gap-3 text-[15px]">
        <div><dt className="font-mono text-[11px] uppercase tracking-[0.14em] text-[#D5D5C7]">{t(alert.source === 'cwc' ? 'alerts.official.asOf' : 'alerts.official.issuedBy')}</dt><dd className="mt-0.5 font-semibold">{alert.source === 'cwc' ? stamp(alert.issuedAt, lang) : `${alert.issuer}, ${stamp(alert.issuedAt, lang)}`}</dd></div>
        {alert.source !== 'cwc' && <div><dt className="font-mono text-[11px] uppercase tracking-[0.14em] text-[#D5D5C7]">{t('alerts.official.validUntil')}</dt><dd className="mt-0.5 font-semibold">{alert.source === 'imd' ? dayLabel(alert.date, lang) : stamp(alert.expires, lang)}</dd></div>}
        {alert.instruction && <div><dt className="font-mono text-[11px] uppercase tracking-[0.14em] text-[#D5D5C7]">{t('alerts.official.says')}</dt><dd className="mt-0.5">{alert.instruction}</dd></div>}
      </dl>
      {alert.link?.startsWith('https://') && <a href={alert.link} target="_blank" rel="noopener noreferrer" className="ws-btn ws-btn-butter self-start"><Icon name="arrow" className="h-[18px] w-[18px]" />{t('alerts.official.open')}</a>}
    </div>
  );
};

// The flood signals of one field (docs/FIELD_ALERTS.md, "Flood"): each says what it is, including "no river here" and "no gauge near".
// They are regional: nothing here says that the field will flood.
const Row = ({ icon, label, children, level }) => (
  <li className="flex flex-col gap-1.5 border-t border-ink/10 py-3.5 first:border-t-0 first:pt-0">
    <span className="flex flex-wrap items-center gap-2 text-[13px] text-ink-2"><Icon name={icon} className="h-4 w-4" />{label}{level && <AlertPill level={level} />}</span>
    <span className="text-[15px] leading-snug">{children}</span>
  </li>
);

// The satellite part: radar sees through cloud, so it can say whether the 500 m around the field is newly under water. It is a computation
// at Earth Engine, so it runs when the farmer asks, not with every look at the page.
const RadarRow = ({ fieldId }) => {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const [state, setState] = useState({ phase: 'idle' }); // idle | loading | done | busy | many | failed
  const current = useRef(fieldId);
  current.current = fieldId;
  useEffect(() => { setState({ phase: 'idle' }); }, [fieldId]); // another field: the earlier answer was not about it
  const run = async () => {
    setState({ phase: 'loading' });
    try {
      const { data } = await getFloodExtent(fieldId);
      if (current.current === fieldId) setState({ phase: 'done', data });
    } catch (err) {
      const code = err.response?.status;
      if (current.current === fieldId) setState({ phase: code === 503 ? 'busy' : code === 429 ? 'many' : 'failed' });
    }
  };
  const d = state.data;
  const level = d?.flag === 'likely' ? 'warn' : d?.flag === 'possible' ? 'watch' : undefined;
  const text = state.phase === 'busy' ? t('alerts.flood.radar.busy') : state.phase === 'many' ? t('alerts.flood.radar.many') : state.phase === 'failed' ? t('alerts.flood.radar.failed')
    : !d ? null
      : d.status === 'no_recent_image' ? (d.last_image ? t('alerts.flood.radar.noImage', { days: d.recent_days, date: dayMonth(d.last_image, lang) }) : t('alerts.flood.radar.noImageEver', { days: d.recent_days }))
        : d.status === 'too_little_data' ? t('alerts.flood.radar.tooLittle')
          : t(`alerts.flood.radar.${d.flag}`, { date: dayMonth(d.image_date, lang), pct: d.new_water_pct, usable: d.usable_pct });
  return (
    <Row icon="field" label={t('alerts.flood.radar.label')} level={level}>
      {text && <span className="block">{text}</span>}
      {state.phase !== 'done' && (
        <button type="button" className="ws-btn ws-btn-ghost mt-2 !min-h-[44px] !px-4 text-sm" disabled={state.phase === 'loading'} onClick={run}>
          {state.phase === 'loading' ? t('alerts.flood.radar.loading') : t('alerts.flood.radar.button')}
        </button>
      )}
      {d?.status === 'ok' && <span className="mt-1 block text-[12.5px] text-ink-2">{t('alerts.flood.radar.limits')}</span>}
    </Row>
  );
};

const FloodCard = ({ field, name }) => {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const { river, gauge } = field.flood;
  const radar = field.flood.radar?.status === 'ready';
  const riverAlert = field.alerts?.find((a) => a.hazard === 'flood_river');
  const trend = (g) => t(`alerts.official.trend.${g.trend || 'steady'}`);
  if (river.status === 'disabled' && gauge.status === 'disabled' && !radar) return null;
  return (
    <section aria-labelledby="fl-h" className="ws-card flex min-w-0 flex-col gap-4 p-5 sm:p-6">
      <div>
        <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-ink-2">{name}</p>
        <h2 id="fl-h" className="mt-1 font-display text-[1.5rem] leading-tight">{t('alerts.flood.title')}</h2>
      </div>
      <ul className="flex flex-col">
        {river.status !== 'disabled' && (
          <Row icon="rain" label={t('alerts.flood.river')} level={riverAlert?.level}>
            {river.status === 'unavailable' ? t('alerts.flood.riverUnavailable')
              : river.status === 'none' ? t('alerts.flood.riverNone')
                : riverAlert ? t('alerts.flood.riverHigh', { day: dayLabel(riverAlert.date, lang), peak: river.peak, p95: river.p95 })
                  : t('alerts.flood.riverOk', { now: river.now, peak: river.peak, p95: river.p95 })}
          </Row>
        )}
        {gauge.status !== 'disabled' && (
          <Row icon="field" label={t('alerts.flood.gauge')} level={gauge.level}>
            {gauge.status === 'unavailable' ? t('alerts.flood.gaugeUnavailable')
              : gauge.status === 'none' ? t('alerts.flood.gaugeNone')
                : gauge.level ? t('alerts.flood.gaugeAbove', { name: gauge.name, km: gauge.km, level: t(`alerts.official.cwcLevel.${gauge.level}`), trend: trend(gauge) })
                  : t('alerts.flood.gaugeBelow', { name: gauge.name, km: gauge.km })}
          </Row>
        )}
        {radar && <RadarRow fieldId={field._id} />}
      </ul>
      <p className="text-[12.5px] leading-relaxed text-ink-2">{t('alerts.flood.note')}</p>
    </section>
  );
};

const Empty = () => {
  const { t } = useTranslation();
  return (
    <article className="ws-card flex flex-wrap items-center gap-6 p-6 sm:p-8">
      <img src={cropIcon('rice')} alt="" className="h-24 w-24 shrink-0 object-contain" />
      <div className="flex min-w-[240px] flex-1 flex-col gap-3">
        <h2 className="font-display text-[2rem] leading-tight">{t('alerts.empty.title')}</h2>
        <p className="max-w-[52ch] text-[15px] text-ink-2">{t('alerts.empty.text')}</p>
        <Link to="/fields/new" className="ws-btn self-start"><Icon name="plus" />{t('alerts.empty.cta')}</Link>
      </div>
    </article>
  );
};

// Weather & Alerts: the second half of the Overview. `state` is useFieldAlerts(); everything shown is computed by the server
// from the saved fields' weather (docs/FIELD_ALERTS.md). Failures are said out loud: a field whose weather did not load is
// never drawn as "no alert".
const WeatherAlerts = ({ state }) => {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const text = useAlertText();
  const win = useWindow();
  const { data, fields, loading, error, reload } = state;
  const [sel, setSel] = useState('all');
  const [why, setWhy] = useState(false);
  const [allRows, setAllRows] = useState(false);
  const [done, setDone] = useState(readDone);
  const [stageErr, setStageErr] = useState('');
  const [saving, setSaving] = useState(false);

  if (!data) {
    if (loading) return <p role="status" className="font-mono text-xs text-ink-2">{t('ws.loading')}</p>;
    return (
      <div className="ws-card flex flex-col items-start gap-4 border-dashed border-[#AE9900] p-6" role="alert">
        <AlertPill level="stale" />
        <h2 className="font-display text-[1.75rem]">{t('alerts.error.title')}</h2>
        <p className="text-[15px] text-ink-2">{error || t('alerts.error.load')}</p>
        <button type="button" className="ws-btn" onClick={reload}><Icon name="arrow" />{t('alerts.retry')}</button>
      </div>
    );
  }
  if (!fields.length) return <Empty />;

  const shown = sel === 'all' || !fields.some((f) => f._id === sel) ? fields : fields.filter((f) => f._id === sel);
  const isDone = (a) => !!done[alertKey(a)];
  const items = collect(shown).sort((a, b) => isDone(a) - isDone(b));   // what is done sinks, so the next thing to do leads
  const unavailable = shown.filter((f) => f.status !== 'ok');
  const top = items[0];
  const rest = items.slice(1);
  const stripField = shown.find((f) => f.status === 'ok' && (!top || f._id === top.field._id)) ?? shown.find((f) => f.status === 'ok');
  const toggleDone = (a) => {
    const next = { ...done };
    if (next[alertKey(a)]) delete next[alertKey(a)]; else next[alertKey(a)] = Date.now();
    setDone(next);
    writeDone(next);
  };
  const nameOf = (f) => fieldName(f, lang);
  const checked = formatTime(new Date(data.checkedAt), lang, { hour: 'numeric', minute: '2-digit' });
  const notice = feedNotice(data.officialSources);
  const old = !!error;   // an old copy (no signal, or a refresh that failed): "no alert" is never said from it as if it were today's

  const changeStage = async (f, stage) => {
    setSaving(true);
    setStageErr('');
    try { await updateField(f._id, { stage }); await reload(); } catch { setStageErr(t('alerts.cond.stageFailed')); } finally { setSaving(false); }
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div role="group" aria-label={t('alerts.fields.aria')} className="flex flex-wrap items-center gap-2.5">
          {fields.length > 1 && <button type="button" className="ws-chip" aria-pressed={sel === 'all'} onClick={() => { setSel('all'); setWhy(false); }}>{t('alerts.fields.all')}</button>}
          {fields.map((f) => (
            <button key={f._id} type="button" className="ws-chip" aria-pressed={shown.length === 1 && shown[0]._id === f._id} onClick={() => { setSel(f._id); setWhy(false); }}>
              <img src={cropIcon(f.crop)} alt="" className="h-7 w-7 object-contain" />{nameOf(f)}
            </button>
          ))}
          {fields.length < MAX_FIELDS
            ? <Link to="/fields/new" className="ws-btn ws-btn-ghost !min-h-[44px] !px-4"><Icon name="plus" className="h-4 w-4" />{t('alerts.fields.add')}</Link>
            : <span className="text-[13px] text-ink-2">{t('alerts.fields.max', { count: MAX_FIELDS })}</span>}
        </div>
        <span className="font-mono text-[11px] uppercase tracking-[0.1em] text-ink-2">{t('alerts.checked', { time: checked })}</span>
      </div>

      {error && <p role="alert" className="ws-note ws-note-bad">{error}</p>}
      {shown.some((f) => f.fire?.status === 'unavailable') && <p role="status" className="ws-note">{t('alerts.fire.unavailable')}</p>}
      {notice && <p role="status" className="ws-note">{notice.at ? t('alerts.official.late', { time: stamp(notice.at, lang) }) : t('alerts.official.never')}</p>}

      {unavailable.map((f) => (
        <div key={f._id} role="alert" className="ws-card flex flex-wrap items-center gap-4 border-dashed border-[#AE9900] p-5">
          <AlertPill level="stale" />
          <div className="min-w-[240px] flex-1">
            <h2 className="font-display text-[1.4rem] leading-tight">{t('alerts.unavailable.title', { name: nameOf(f) })}</h2>
            <p className="mt-1 text-sm text-ink-2">{t('alerts.unavailable.text')}</p>
          </div>
          <button type="button" className="ws-btn ws-btn-ghost" onClick={reload}>{t('alerts.retry')}</button>
        </div>
      ))}

      {top && (
        <section aria-labelledby="al-top" className="ws-pine flex flex-col gap-6 p-6 sm:p-8">
          <div className="relative z-10 flex flex-wrap items-center justify-between gap-3">
            <h2 id="al-top" className="font-mono text-[11px] uppercase tracking-[0.14em] text-butter">{isDone(top) ? t('alerts.allDone') : t('alerts.needs')}</h2>
            <div className="flex flex-wrap items-center gap-2.5">
              <span className="font-mono text-xs font-semibold uppercase tracking-[0.12em] text-butter">{text.when(top)}</span>
              <AlertPill level={isDone(top) ? 'calm' : top.level} label={isDone(top) ? t('alerts.doneShort') : undefined} dark />
              <span className="inline-flex min-h-[28px] items-center gap-1.5 rounded-full border border-parchment/35 bg-parchment/10 px-3 text-xs">{top.origin === 'official' ? <><Icon name="bell" className="h-3.5 w-3.5" />{t('alerts.official.chip', { source: t(`alerts.official.source.${top.source}`) })}</> : <><Icon name="clock" className="h-3.5 w-3.5" />{t(top.hazard === 'disease_near' ? 'alerts.sourceReports' : top.hazard === 'fire_near' ? 'alerts.sourceSatellite' : 'alerts.sourceModel')}</>}</span>
            </div>
          </div>
          <div className="relative z-10 grid gap-8 lg:grid-cols-[1.1fr_1fr]">
            <div className="flex min-w-0 flex-col gap-5">
              <div className="flex items-center gap-3.5">
                <span className="grid h-12 w-12 flex-none place-items-center rounded-full bg-parchment/15 text-butter"><Icon name={iconOf(top)} className="h-6 w-6" /></span>
                <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-[#D5D5C7]">{top.origin === 'official' ? t(`alerts.official.family.${top.family}`) : t(`alerts.hazard.${top.hazard}`)} · {nameOf(top.field)}{top.stage && ` · ${t(`alerts.stage.${top.stage}`)}`}</p>
              </div>
              <h3 className={`font-display text-parchment [text-wrap:pretty] ${text.head(top).length > 140 ? 'text-[clamp(1.25rem,2vw,1.65rem)] leading-snug' : 'text-[clamp(1.75rem,3vw,2.6rem)] leading-[1.12]'}`}>{text.head(top)}</h3>
              <dl className="flex flex-wrap gap-x-9 gap-y-3">
                <div><dt className="font-mono text-[11px] uppercase tracking-[0.14em] text-[#D5D5C7]">{t('alerts.when')}</dt><dd className="mt-1 text-[17px] font-semibold">{win.window(top)}</dd></div>
                <div><dt className="font-mono text-[11px] uppercase tracking-[0.14em] text-[#D5D5C7]">{t('alerts.ends')}</dt><dd className="mt-1 text-[17px] font-semibold">{win.ends(top)}</dd></div>
              </dl>
              <div className="flex flex-wrap gap-3">
                <button type="button" className="ws-btn ws-btn-butter" aria-expanded={why} onClick={() => setWhy(!why)}>{t('alerts.why')}</button>
                <button type="button" className="ws-btn !border-parchment/50 bg-transparent text-parchment hover:bg-parchment/10" aria-pressed={isDone(top)} onClick={() => toggleDone(top)}>
                  <Icon name="check2" className="h-[18px] w-[18px]" />{isDone(top) ? t('alerts.doneOn') : t('alerts.done')}
                </button>
              </div>
            </div>
            {top.origin === 'official' ? <OfficialPanel alert={top} /> : top.hazard === 'disease_near' ? <NearPanel alert={top} /> : top.hazard === 'fire_near' ? <FirePanel alert={top} /> : <Chart alert={top} />}
          </div>
          <HelpRow key={alertKey(top)} alert={top} />
          {why && (
            <div className="relative z-10 grid gap-6 border-t border-parchment/20 pt-5 md:grid-cols-2">
              <div className="flex flex-col gap-2.5">
                <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-butter">{t('alerts.whyTitle')}</p>
                <p className="text-[16px] leading-relaxed">{text.why(top)}</p>
              </div>
              <ul className="flex flex-col gap-2 text-sm text-[#D5D5C7]">
                {top.origin === 'official' ? <li>{t('alerts.official.checked', { time: checked })}</li> : <>
                  <li>{t('alerts.sure', { level: t(`alerts.confidence.${top.confidence}`) })}</li>
                  {top.confidence === 'low' && <li>{t('alerts.capNote')}</li>}
                  <li>{t('alerts.source', { time: checked })}</li>
                  <li>{t(top.reviewStatus === 'reviewed' ? 'alerts.ruleReviewed' : 'alerts.rule', { id: top.rule })}</li>
                </>}
              </ul>
            </div>
          )}
          {rest.length > 0 && (
            <div className="relative z-10 flex flex-col gap-3 border-t border-parchment/20 pt-5">
              <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-[#D5D5C7]">{t('alerts.next')}</p>
              {(allRows ? rest : rest.slice(0, ROWS)).map((a) => (
                <div key={alertKey(a)} className="flex flex-wrap items-center gap-4 rounded-2xl border border-parchment/15 bg-parchment/[0.08] px-4 py-3.5">
                  <span className="grid h-11 w-11 flex-none place-items-center rounded-full bg-parchment/15 text-butter"><Icon name={iconOf(a)} className="h-[22px] w-[22px]" /></span>
                  <div className="flex min-w-[220px] flex-1 flex-col gap-1.5">
                    <div className="flex flex-wrap items-center gap-2.5">
                      <span className="font-mono text-[11px] font-semibold uppercase tracking-[0.12em] text-butter">{text.when(a)}</span>
                      <AlertPill level={isDone(a) ? 'calm' : a.level} label={isDone(a) ? t('alerts.doneShort') : undefined} dark />
                      <span className="font-mono text-[11px] uppercase tracking-[0.1em] text-[#D5D5C7]">{nameOf(a.field)}</span>
                    </div>
                    <p className="line-clamp-3 font-display text-[1.25rem] leading-snug">{text.head(a)}</p>
                  </div>
                  <button type="button" className="ws-btn !border-parchment/50 bg-transparent !min-h-[44px] !px-4 text-sm text-parchment hover:bg-parchment/10" aria-pressed={isDone(a)} onClick={() => toggleDone(a)}>{isDone(a) ? t('alerts.doneOn') : t('alerts.done')}</button>
                </div>
              ))}
              {rest.length > ROWS && <button type="button" className="ws-btn !border-parchment/50 bg-transparent !min-h-[44px] self-start !px-4 text-sm text-parchment hover:bg-parchment/10" aria-expanded={allRows} onClick={() => setAllRows(!allRows)}>{allRows ? t('alerts.fewerRows') : t('alerts.moreRows', { count: rest.length - ROWS })}</button>}
            </div>
          )}
        </section>
      )}

      {!top && unavailable.length < shown.length && (
        <section aria-labelledby="al-calm" className="ws-sage flex flex-wrap items-center gap-8 border border-ink/15 p-6 sm:p-9">
          <div className="flex min-w-[260px] flex-1 flex-col gap-4">
            <AlertPill level={old || notice ? 'stale' : 'calm'} label={old ? t('alerts.mode.old') : undefined} className="self-start" />
            <h2 id="al-calm" className="font-display text-[clamp(1.9rem,3.4vw,2.7rem)] leading-[1.1]">{old ? t('alerts.calm.titleOld') : notice ? t('alerts.calm.titleLate') : t('alerts.calm.title')}</h2>
            <p className="max-w-[54ch] text-[16px] text-ink-2">{old ? t('alerts.calm.textOld') : t('alerts.calm.text', { time: checked })}</p>
          </div>
          <img src={cropIcon(shown[0].crop)} alt="" className="h-40 w-40 object-contain max-sm:hidden" />
        </section>
      )}

      {stripField && (
        <div className="grid items-stretch gap-6 min-[1500px]:grid-cols-[1fr_300px]">
          <Horizon field={stripField} />
          <article className="ws-card flex flex-col gap-1 p-5 sm:p-6">
            <h2 className="font-display text-[1.5rem]">{t('alerts.cond.title')}</h2>
            <p className="mb-2 text-[13px] text-ink-2">{nameOf(stripField)}</p>
            <div className="grid sm:grid-cols-3 sm:gap-x-6 min-[1500px]:grid-cols-1">
            <div className="flex flex-col gap-0.5 border-t border-ink/10 py-3">
              <span className="flex items-center gap-2 text-[13px] text-ink-2"><Icon name="rain" className="h-4 w-4" />{t('alerts.cond.rain7')}</span>
              <b className="font-display text-[1.7rem] font-normal tabular-nums">{stripField.conditions.rain7 == null ? '–' : `${stripField.conditions.rain7} mm`}</b>
            </div>
            <div className="flex flex-col gap-0.5 border-t border-ink/10 py-3">
              <span className="flex items-center gap-2 text-[13px] text-ink-2"><Icon name="frost" className="h-4 w-4" />{t('alerts.cond.coldest')}</span>
              <b className="font-display text-[1.7rem] font-normal tabular-nums">{stripField.conditions.coldest ? `${stripField.conditions.coldest.t} °C` : '–'}</b>
              {stripField.conditions.coldest && <span className="text-[13px] text-ink-2">{dayLabel(stripField.conditions.coldest.date, lang)}</span>}
            </div>
            <div className="flex flex-col gap-1.5 border-t border-ink/10 pt-3">
              <label htmlFor="al-stage" className="flex items-center gap-2 text-[13px] text-ink-2"><Icon name="sprout" className="h-4 w-4" />{t('alerts.cond.stage')}</label>
              <select id="al-stage" value={stripField.stage} disabled={saving} onChange={(e) => changeStage(stripField, e.target.value)}
                className="min-h-[44px] rounded-xl border border-ink/25 bg-parchment px-3 text-[15px] font-semibold text-ink">
                {STAGES.map((s) => <option key={s} value={s}>{t(`alerts.stage.${s}`)}</option>)}
              </select>
              <span className="text-[12px] text-ink-2">{t('alerts.cond.stageNote')}</span>
              {stageErr && <p role="alert" className="ws-note ws-note-bad">{stageErr}</p>}
            </div>
            </div>
          </article>
        </div>
      )}

      <PushCard />

      {(stripField ?? shown[0])?.flood && <FloodCard field={stripField ?? shown[0]} name={nameOf(stripField ?? shown[0])} />}
      {shown[0] && <NewsPanel field={stripField ?? shown[0]} name={nameOf(stripField ?? shown[0])} />}
      {shown[0] && <PricesCard field={stripField ?? shown[0]} name={nameOf(stripField ?? shown[0])} />}

      <p className="ws-note">{t('alerts.disclaimer')}</p>
      <p className="font-mono text-[11px] leading-relaxed text-ink-2">{data.weatherSource}</p>
    </div>
  );
};

export default WeatherAlerts;
