import { Link, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Camera, Leaf } from '../components/heroIcons';
import RiskStrip from '../components/RiskStrip';
import { getPredictionRisk } from '../services/api';
import { ACCURACY } from '../data/accuracy';
import { cropName } from '../locales/terms';
import { useHistory } from '../components/workspace/useHistory';
import { StatusPill, levelOf, needsAttention } from '../components/workspace/status';
import { CropTag, DAY, Lbl, PageHead, hasLocation, shortDate, titleOf } from '../components/workspace/parts';
import { cropIcon } from '../components/workspace/cropIcon';
import Icon from '../components/workspace/icons';
import plant from '../assets/hero/plant-560.webp';
import ModeTabs from '../components/workspace/ModeTabs';
import WeatherAlerts from '../components/workspace/WeatherAlerts';
import { useFieldAlerts } from '../components/workspace/useFieldAlerts';
import { feedNotice, summarize } from '../components/workspace/alertsLib';

import { formatDate } from '../locales/dates';
const Tile = ({ label, value, note, tone }) => (
  <article className="ws-card flex flex-col gap-1.5 p-5">
    <Lbl>{label}</Lbl>
    <p className={`font-display text-[3.4rem] leading-none tabular-nums ${tone || 'text-ink'}`}>{value}</p>
    <p className="text-[13px] text-ink-2">{note}</p>
  </article>
);

// The Overview has two halves, switched at the top: My Field (leaf checks, the page as it always was) and Weather & Alerts
// (docs/FIELD_ALERTS.md). The half last looked at is remembered on this browser; ?mode=weather opens it directly.
const MODE_KEY = 'overviewMode';
const readMode = (params) => {
  const q = params.get('mode');
  if (q === 'field' || q === 'weather') return q;
  try { return localStorage.getItem(MODE_KEY) === 'weather' ? 'weather' : 'field'; } catch { return 'field'; }
};

// The first screen of the workspace: what needs me today. Everything here is counted from this browser's history (GET /predict)
// or comes from the existing risk endpoint; nothing is invented.
const Overview = () => {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const { items, loading, error } = useHistory();
  const [params, setParams] = useSearchParams();
  const mode = readMode(params);
  const setMode = (m) => {
    setParams({ mode: m }, { replace: true });
    try { localStorage.setItem(MODE_KEY, m); } catch { /* private mode: not remembered */ }
  };
  const alertState = useFieldAlerts();
  const now = Date.now();
  const hour = new Date().getHours();
  const hello = t(`ws.overview.hello.${hour < 12 ? 'morning' : hour < 17 ? 'afternoon' : 'evening'}`);
  const today = formatDate(new Date(), lang, { weekday: 'long', day: 'numeric', month: 'long' });

  const last = items[0];
  // ponytail: "rechecked" = a newer checkup of the same crop exists; no field ids yet, so two plots of one crop count as one
  const attention = items.filter((p) => needsAttention(p) && !items.some((q) => q.crop === p.crop && new Date(q.createdAt) > new Date(p.createdAt)));
  const healthy = items.filter((p) => levelOf(p) === 'healthy').length;
  const retakes = items.filter((p) => levelOf(p) === 'retake').length;
  const last30 = items.filter((p) => now - new Date(p.createdAt) < 30 * DAY).length;
  const riskFor = items.find((p) => ['potato', 'rice'].includes(p.crop) && (!p.status || p.status === 'ok') && hasLocation(p));

  const byCrop = Object.entries(items.reduce((a, p) => ({ ...a, [p.crop]: (a[p.crop] || 0) + 1 }), {})).sort((a, b) => b[1] - a[1]).slice(0, 4);
  const accuracy = byCrop.map(([c]) => ACCURACY.find((a) => a.crop === c)).filter(Boolean).slice(0, 3);

  const title = !items.length ? t('ws.overview.first') : attention.length ? t('ws.overview.needsLook', { count: attention.length }) : t('ws.overview.allClear');
  // what is waiting in each half, shown on the switch so nothing hides behind the other one
  const sum = summarize(alertState.fields);
  const late = !!feedNotice(alertState.data?.officialSources);
  // an old copy: no signal, or a refresh that failed. "No alert" is never said from an old copy as if it were today's.
  const stale = !!alertState.error && !!alertState.data;
  const fieldPills = loading ? [] : !items.length ? [{ level: 'info', label: t('alerts.mode.noChecks') }]
    : attention.length ? [{ level: 'warn', label: t('alerts.mode.recheck', { count: attention.length }) }] : [{ level: 'calm', label: t('alerts.mode.clear') }];
  const weatherPills = !alertState.data ? (alertState.loading ? [] : [{ level: 'stale', label: t('alerts.mode.unavailable') }])
    : !sum.total ? [{ level: 'info', label: t('alerts.mode.addField') }]
    : [...(sum.urgent ? [{ level: 'urgent', label: t('alerts.mode.urgent', { count: sum.urgent }) }] : []),
      ...(sum.warn ? [{ level: 'warn', label: t('alerts.mode.warn', { count: sum.warn }) }] : []),
      ...(sum.watch ? [{ level: 'watch', label: t('alerts.mode.watch', { count: sum.watch }) }] : []),
      ...(!sum.urgent && !sum.warn && !sum.watch && sum.info ? [{ level: 'info', label: t('alerts.mode.info', { count: sum.info }) }] : []),
      ...(sum.unavailable ? [{ level: 'stale', label: t('alerts.mode.unavailable') }] : []),
      ...(stale ? [{ level: 'stale', label: t('alerts.mode.old') }] : []),
      // "no alert" is only said when the official feeds are not late and the answer is today's: a silent feed is not an all-clear
      ...(!sum.urgent && !sum.warn && !sum.watch && !sum.info && !sum.unavailable && !stale ? [late ? { level: 'stale', label: t('alerts.mode.officialLate') } : { level: 'calm', label: t('alerts.mode.none') }] : [])];
  const tabs = [
    { id: 'field', icon: 'sprout', title: t('alerts.mode.field'), sub: t('alerts.mode.fieldSub'), pills: fieldPills },
    { id: 'weather', icon: 'cloudsun', title: t('alerts.mode.weather'), sub: t('alerts.mode.weatherSub'), pills: weatherPills },
  ];
  const nAlerts = sum.urgent + sum.warn + sum.watch + sum.info;
  const weatherTitle = !alertState.data ? '' : !sum.total ? t('alerts.title.noFields') : nAlerts ? t('alerts.title.alerts', { count: nAlerts }) : sum.ok ? t(stale ? 'alerts.title.old' : late ? 'alerts.title.clearLate' : 'alerts.title.clear') : t('alerts.title.unavailable');
  const dueText = (p) => {
    const due = new Date(p.createdAt).getTime() + 7 * DAY;
    const days = Math.floor((now - due) / DAY);
    return days >= 1 ? t('ws.overview.overdue', { count: days }) : t('ws.overview.due', { date: shortDate(Math.max(due, now), lang) });
  };

  return (
    <div className="mx-auto flex max-w-[1180px] flex-col gap-7 px-5 pb-12 pt-6 lg:px-11 lg:pt-9">
      <PageHead eyebrow={t('ws.overview.eyebrow', { date: today })} title={<>{hello} <span className="italic text-leaf-text">{mode === 'weather' ? weatherTitle : loading ? '' : title}</span></>} />

      <ModeTabs mode={mode} onChange={setMode} tabs={tabs} />
      <div role="tabpanel" id="ws-mode-panel" aria-labelledby={`ws-mode-${mode}`} className="flex flex-col gap-7">
      {mode === 'weather' ? <WeatherAlerts state={alertState} /> : (<>

      {error && <p role="alert" className="ws-note ws-note-bad">{error}</p>}
      {loading && !items.length && <p role="status" className="font-mono text-xs text-ink-2">{t('ws.loading')}</p>}

      {/* the one big action, and the last result */}
      <section className="grid gap-6 lg:grid-cols-2">
        <div className="ws-pine relative flex min-h-[290px] flex-col justify-between overflow-hidden p-8">
          <div className="relative z-10 max-w-[20rem]">
            <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-butter">{t('ws.overview.heroLabel')}</p>
            <h2 className="mt-3 font-display text-[2rem] leading-[1.08] text-parchment">{t('ws.overview.heroTitle')}</h2>
            <p className="mt-3 text-[15px] text-parchment/80">{t('ws.overview.heroText')}</p>
          </div>
          <div className="relative z-10 mt-6 flex flex-wrap gap-3">
            <Link to="/predict" className="ws-btn ws-btn-butter"><Camera className="h-5 w-5" />{t('ws.overview.heroCta')}</Link>
            <Link to="/predict" className="ws-btn border-parchment/50 bg-transparent text-parchment hover:bg-parchment/10">{t('ws.overview.heroUpload')}</Link>
          </div>
          <img src={plant} alt="" aria-hidden="true" className="absolute -bottom-8 -right-2 z-0 w-[250px] max-sm:hidden" />
        </div>

        {last ? (
          <article className="ws-card flex flex-col gap-4 p-6">
            <div className="flex items-center justify-between gap-3"><Lbl>{t('ws.overview.last')} · {shortDate(last.createdAt, lang)}</Lbl><StatusPill level={levelOf(last)} /></div>
            <div className="flex gap-4">
              <img src={last.imageUrl} alt="" className="h-[132px] w-[132px] shrink-0 rounded-xl bg-sage-wash object-cover" />
              <div className="flex min-w-0 flex-1 flex-col justify-between">
                <div><CropTag crop={last.crop} lang={lang} /><h3 className="mt-1 font-display text-[2rem] leading-tight">{titleOf(last, t, lang)}</h3></div>
                {levelOf(last) !== 'retake' && (
                  <div className="flex items-center gap-3">
                    <div className="ws-ring" style={{ '--p': Math.round(last.confidence * 100), '--s': '60px' }}><b>{Math.round(last.confidence * 100)}%</b></div>
                    <span className="text-sm text-ink-2">{t('ws.overview.sure')}{last.yieldLossPercent != null && <> · {last.yieldLossPercent > 0 ? t('ws.overview.atRisk', { pct: last.yieldLossPercent }) : t('ws.overview.noRisk')}</>}</span>
                  </div>
                )}
              </div>
            </div>
            <Link to={`/checkup/${last._id}`} className="ws-btn ws-btn-ghost self-start">{t('ws.overview.open')}<Icon name="arrow" className="h-4 w-4" /></Link>
          </article>
        ) : !loading && (
          <article className="ws-card flex flex-col justify-center gap-4 p-7">
            <ol className="flex flex-col gap-3">
              {['s1', 's2', 's3'].map((k, i) => (
                <li key={k} className="flex items-center gap-3 text-[15px]"><span className="grid h-8 w-8 place-items-center rounded-full bg-pine font-display text-parchment">{i + 1}</span>{t(`ws.overview.${k}`)}</li>
              ))}
            </ol>
            <p className="text-[13px] text-ink-2">{t('ws.overview.firstNote')}</p>
          </article>
        )}
      </section>

      {items.length > 0 && (
        <>
          <section aria-label={t('ws.overview.tilesLabel')} className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <Tile label={t('ws.overview.tTotal')} value={items.length} note={t('ws.overview.tTotalNote', { count: last30 })} />
            <Tile label={t('ws.overview.tAttention')} value={attention.length} note={t('ws.overview.tAttentionNote')} tone={attention.length ? 'text-rust-deep' : ''} />
            <Tile label={t('ws.overview.tHealthy')} value={healthy} note={t('ws.overview.tHealthyNote', { pct: Math.round((healthy / items.length) * 100) })} />
            <Tile label={t('ws.overview.tRetake')} value={retakes} note={t('ws.overview.tRetakeNote')} />
          </section>

          <section className="grid gap-6 md:grid-cols-2">
            <article className="ws-card min-w-0 p-5 sm:p-6">
              <div className="flex items-center justify-between"><h2 className="font-display text-[1.75rem]">{t('ws.overview.attTitle')}</h2><Link to="/history" className="text-sm font-semibold text-pine underline underline-offset-4">{t('ws.overview.viewAll')}</Link></div>
              <p className="mb-2 mt-1 text-sm text-ink-2">{t('ws.overview.attIntro')}</p>
              {attention.length === 0 ? <p className="py-4 text-ink-2">{t('ws.overview.attNone')}</p> : (
                <ul>
                  {attention.slice(0, 3).map((p) => (
                    <li key={p._id} className="border-t border-ink/10">
                      <Link to={`/checkup/${p._id}`} className="ws-row">
                        <img src={cropIcon(p.crop)} alt="" className="h-10 w-10 shrink-0 object-contain" />
                        <span className="min-w-0 flex-1"><span className="block font-semibold">{cropName(p.crop, lang)} · {titleOf(p, t, lang)}</span><span className="text-[13px] text-ink-2">{dueText(p)}</span></span>
                        <StatusPill level={levelOf(p)} />
                        <Icon name="chevron" className="h-5 w-5 shrink-0 text-ink-2" />
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </article>

            {riskFor ? (
              <article className="ws-glass flex min-w-0 flex-col gap-3 p-4 sm:p-6">
                <Lbl>{t('ws.overview.riskTitle', { crop: cropName(riskFor.crop, lang).toLowerCase() })}</Lbl>
                <RiskStrip load={() => getPredictionRisk(riskFor._id)} reloadKey={riskFor._id} />
              </article>
            ) : (
              <article className="ws-sage flex flex-col justify-center gap-3 p-6">
                <span className="grid h-12 w-12 place-items-center rounded-full bg-pine text-parchment"><Icon name="map" /></span>
                <p className="font-display text-2xl">{t('ws.overview.mapTitle')}</p>
                <p className="text-sm text-ink-2">{t('ws.overview.mapText')}</p>
                <Link to="/map" className="ws-btn self-start">{t('ws.overview.mapCta')}</Link>
              </article>
            )}
          </section>

          <section className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
            <article className="ws-card p-6">
              <div className="mb-4 flex items-center justify-between"><h2 className="font-display text-[1.75rem]">{t('ws.overview.recent')}</h2><Link to="/history" className="text-sm font-semibold text-pine underline underline-offset-4">{t('ws.overview.openLog')}</Link></div>
              <ul className="grid grid-cols-2 gap-4 sm:grid-cols-4 lg:grid-cols-2 xl:grid-cols-4">
                {items.slice(0, 4).map((p) => (
                  <li key={p._id}>
                    <Link to={`/checkup/${p._id}`} className="flex flex-col gap-2.5 no-underline">
                      <img src={p.imageUrl} alt="" className="h-28 w-full rounded-xl bg-sage-wash object-cover" />
                      <span className="flex items-center gap-2"><img src={cropIcon(p.crop)} alt="" className="h-6 w-6 object-contain" /><span className="text-[15px] font-semibold leading-tight">{titleOf(p, t, lang)}</span></span>
                      <span className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1"><StatusPill level={levelOf(p)} /><span className="whitespace-nowrap text-[13px] tabular-nums text-ink-2">{shortDate(p.createdAt, lang)}</span></span>
                    </Link>
                  </li>
                ))}
              </ul>
            </article>

            <article className="ws-card flex flex-col gap-4 p-6">
              <h2 className="font-display text-[1.75rem]">{t('ws.overview.crops')}</h2>
              <ul className="flex flex-col gap-3">
                {byCrop.map(([c, n]) => (
                  <li key={c} className="flex items-center gap-3">
                    <img src={cropIcon(c)} alt="" className="h-8 w-8 shrink-0 object-contain" />
                    <span className="w-20 truncate font-medium">{cropName(c, lang)}</span>
                    <span className="ws-bar flex-1"><i style={{ width: `${(n / byCrop[0][1]) * 100}%` }} /></span>
                    <span className="w-6 text-right tabular-nums text-ink-2">{n}</span>
                  </li>
                ))}
              </ul>
              {accuracy.length > 0 && (
                <>
                  <hr className="border-ink/10" />
                  <div>
                    <Lbl className="mb-2.5">{t('ws.overview.accuracy')}</Lbl>
                    <ul className="flex flex-col gap-1.5 text-sm">
                      {accuracy.map((a) => (
                        <li key={a.crop} className="flex justify-between"><span>{cropName(a.crop, lang)}{a.cv ? '*' : ''}</span><span className="tabular-nums"><b>{(a.acc * 100).toFixed(2)}%</b> <span className="text-ink-2">[{(a.lo * 100).toFixed(1)}–{(a.hi * 100).toFixed(1)}]</span></span></li>
                      ))}
                    </ul>
                    <Link to="/me?tab=about" className="mt-2.5 inline-block text-sm font-semibold text-pine underline underline-offset-4">{t('ws.overview.accuracyAll')}</Link>
                  </div>
                </>
              )}
            </article>
          </section>
        </>
      )}

      </>)}
      </div>

      <p className="flex items-center gap-2 text-[13px] text-ink-2"><Leaf className="h-4 w-4 text-leaf-text" />{t('finale.legal')}</p>
    </div>
  );
};

export default Overview;
