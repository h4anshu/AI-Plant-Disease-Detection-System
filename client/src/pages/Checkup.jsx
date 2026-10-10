import { useEffect, useState } from 'react';
import { Link, useLocation, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import ResultCard from '../components/ResultCard';
import RiskStrip from '../components/RiskStrip';
import ContextCard from '../components/ContextCard';
import FieldHealth from '../components/FieldHealth';
import ReportButton from '../components/ReportButton';
import Feedback from '../components/Feedback';
import { getPrediction, getPredictionRisk } from '../services/api';
import { cropName, diseaseName, severityName } from '../locales/terms';
import { StatusPill, levelOf } from '../components/workspace/status';
import { DAY, Lbl, hasLocation, locOf, shortDate } from '../components/workspace/parts';
import { cropIcon } from '../components/workspace/cropIcon';
import Icon from '../components/workspace/icons';

const TABS = [['care', 'tCare', ''], ['context', 'tContext', 'tagLoc'], ['sat', 'tSat', 'tagReq'], ['report', 'tReport', '']];
const SEVERITY = [['early', 'sevEarly'], ['moderate', 'sevModerate'], ['severe', 'sevSevere']];
const heatSrc = (g) => (/^(https?:|data:)/.test(g) ? g : `data:image/png;base64,${g}`);

const NoLocation = () => {
  const { t } = useTranslation();
  return (
    <article className="ws-card flex max-w-xl flex-col gap-3 p-6">
      <span className="grid h-11 w-11 place-items-center rounded-full bg-sage-wash text-pine"><Icon name="map" /></span>
      <h3 className="font-display text-2xl">{t('ws.checkup.ctxNoLocTitle')}</h3>
      <p className="text-[15px] text-ink-2">{t('ws.checkup.ctxNoLocText')}</p>
      <Link to="/me?tab=privacy" className="ws-btn ws-btn-ghost self-start">{t('ws.checkup.ctxShare')}</Link>
    </article>
  );
};

// One checkup as its own page (design "03 Checkup"): the photo and the verdict on top, then Care plan, Field context,
// Satellite and Report & feedback as tabs. It opens from the result of a new check (router state) or by link (GET /predict/:id).
const Checkup = () => {
  const { id } = useParams();
  const { state } = useLocation();
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const [p, setP] = useState(state?.result?._id === id ? state.result : null);
  const [missing, setMissing] = useState(false);
  const [tab, setTab] = useState('care');
  const [heat, setHeat] = useState(false);

  useEffect(() => {
    if (p?._id === id) return undefined;
    let current = true;
    setP(null);
    setMissing(false);
    getPrediction(id).then((res) => current && setP(res.data)).catch(() => current && setMissing(true));
    return () => { current = false; };
  }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (missing) {
    return (
      <div className="mx-auto flex max-w-xl flex-col items-center gap-4 px-5 py-20 text-center">
        <p className="font-display text-2xl italic text-ink-2">{t('ws.checkup.notFound')}</p>
        <Link to="/history" className="ws-btn">{t('ws.checkup.toLog')}</Link>
      </div>
    );
  }
  if (!p) return <p role="status" className="px-5 py-20 text-center font-mono text-xs text-ink-2">{t('ws.checkup.loading')}</p>;

  const level = levelOf(p);
  const located = hasLocation(p);
  const diagnosed = level !== 'retake';
  const when = new Date(p.createdAt).toLocaleString(locOf(lang), { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  const pct = Math.round((p.confidence || 0) * 100);
  const title = diagnosed ? diseaseName(p.crop, p.disease, lang) : null;
  const recheckOn = shortDate(new Date(p.createdAt).getTime() + 7 * DAY, lang);
  const showHeat = heat && p.gradcam;

  return (
    <div className="mx-auto flex max-w-[1180px] flex-col gap-6 px-5 pb-12 pt-5 lg:px-11 lg:pt-8">
      <nav aria-label={t('ws.checkup.breadcrumb')} className="flex items-center gap-2.5 text-sm text-ink-2">
        <Link to="/history" className="font-medium text-pine underline underline-offset-4">{t('ws.checkup.breadcrumb')}</Link><span aria-hidden="true">/</span><span>{cropName(p.crop, lang)}{title ? ` · ${title}` : ''}</span>
      </nav>

      <header className="flex flex-wrap items-end justify-between gap-5">
        <div className="flex items-center gap-4">
          <img src={cropIcon(p.crop)} alt="" className="h-16 w-16 object-contain sm:h-[76px] sm:w-[76px]" />
          <div>
            <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-leaf-text">{t('result.specimen', { crop: cropName(p.crop, lang) })}</p>
            <div className="mt-1 flex flex-wrap items-center gap-4">
              {title ? <h1 className="font-display text-[clamp(2.4rem,5vw,3.6rem)] leading-none">{title}</h1> : <h1 className="font-display text-[clamp(1.8rem,4vw,2.6rem)] leading-tight">{t(`history.status.${p.status}.title`)}</h1>}
              <StatusPill level={level} />
            </div>
            <p className="mt-1.5 text-sm text-ink-2">{t('ws.checkup.checked', { date: when })} · {located ? t('ws.checkup.approx') : t('ws.checkup.noLoc')}</p>
          </div>
        </div>
        {diagnosed && p._id && <button type="button" className="ws-btn" onClick={() => setTab('report')}><Icon name="download" />{t('report.download')}</button>}
      </header>

      {!diagnosed ? <ResultCard result={p} /> : (
        <>
          <section className="grid gap-6 lg:grid-cols-2">
            <figure className="ws-card flex flex-col gap-3 p-4">
              <div className="flex flex-wrap items-center justify-between gap-3 px-1">
                {p.gradcam ? (
                  <div role="group" aria-label={t('ws.checkup.photoView')} className="ws-seg">
                    <button type="button" aria-pressed={!heat} onClick={() => setHeat(false)}>{t('ws.checkup.photo')}</button>
                    <button type="button" aria-pressed={heat} onClick={() => setHeat(true)}>{t('ws.checkup.heat')}</button>
                  </div>
                ) : <span />}
                <span className="text-[13px] text-ink-2">{showHeat ? t('ws.checkup.heatNote') : t('ws.checkup.photoNote')}</span>
              </div>
              <img src={showHeat ? heatSrc(p.gradcam) : p.imageUrl} alt={showHeat ? t('result.gradcamAlt') : t('result.analyzedAlt')} className="h-[340px] w-full rounded-xl bg-sage-wash object-cover sm:h-[380px]" />
            </figure>

            <section className="ws-card flex flex-col gap-5 p-6">
              <div className="flex items-center gap-5">
                <div className="ws-ring" style={{ '--p': pct, '--s': '104px' }}><b>{pct}%</b></div>
                <div><Lbl>{t('result.confidence')}</Lbl><p className="mt-1.5 font-display text-2xl">{t(pct >= 90 ? 'ws.checkup.sure1' : pct >= 70 ? 'ws.checkup.sure2' : 'ws.checkup.sure3')}</p></div>
              </div>
              {level !== 'healthy' && (
                <>
                  <hr className="border-ink/10" />
                  <div>
                    <Lbl className="mb-2.5">{t('ws.checkup.sevTitle')}</Lbl>
                    <div className="grid grid-cols-3 gap-2">
                      {SEVERITY.map(([k, key]) => (
                        <div key={k} className={`rounded-xl px-3 py-2.5 ${k === level ? (k === 'early' ? 'border-2 border-[#AE9900] bg-[#F0ECD2] text-[#473D00]' : k === 'moderate' ? 'border-2 border-[#98370C] bg-[#FFE5DC] text-[#6A2202]' : 'border-2 border-[#6A2202] bg-[#F3C9B8] text-[#4A1700]') : 'bg-ink/5 text-ink-2'}`}>
                          <p className={`capitalize ${k === level ? 'font-bold' : 'font-semibold'}`}>{severityName(k, lang)}</p><p className="text-xs">{t(`ws.checkup.${key}`)}</p>
                        </div>
                      ))}
                    </div>
                    <p className="mt-2 text-[12.5px] text-ink-2">{t('ws.checkup.sevNote')}</p>
                  </div>
                </>
              )}
              {p.yieldLossPercent > 0 && (
                <div className="rounded-2xl bg-[#FFE5DC] px-4 py-4 text-[#6A2202]">
                  <Lbl className="!text-[#6A2202]">{t('ws.checkup.yieldTitle')}</Lbl>
                  <p className="mt-1.5 font-display text-[2.4rem] leading-none tabular-nums">{t('ws.checkup.yieldAbout', { pct: p.yieldLossPercent })}</p>
                  <div className="ws-bar ws-bar-rust mt-2"><i style={{ width: `${Math.min(100, p.yieldLossPercent)}%` }} /></div>
                  <p className="mt-2 text-[12.5px] text-[#4A1700]">{t('ws.checkup.yieldNote')}</p>
                </div>
              )}
              {p.top3?.length > 1 && (
                <details className="text-sm">
                  <summary className="flex min-h-[44px] cursor-pointer items-center font-semibold">{t('ws.checkup.others')}</summary>
                  <ul className="flex flex-col gap-2">
                    {p.top3.map((c) => <li key={c.disease} className="flex justify-between"><span>{diseaseName(p.crop, c.disease, lang)}</span><b className="tabular-nums">{Math.round(c.probability * 100)}%</b></li>)}
                  </ul>
                </details>
              )}
            </section>
          </section>

          <section className="flex flex-col gap-5">
            <div role="tablist" aria-label={t('ws.checkup.tabsAria')} className="ws-tabs">
              {TABS.map(([k, label, tag]) => (
                <button key={k} type="button" role="tab" className="ws-tab" aria-selected={tab === k} onClick={() => setTab(k)}>{t(`ws.checkup.${label}`)}{tag && <span className="n">{t(`ws.checkup.${tag}`)}</span>}</button>
              ))}
            </div>

            {tab === 'care' && (
              <div role="tabpanel" className="grid gap-5 md:grid-cols-2">
                <article className="ws-pine flex flex-col gap-3 p-6">
                  <h3 className="font-display text-2xl">{t('ws.checkup.treat')}</h3>
                  <p className="text-[15px] leading-relaxed text-parchment/90">{p.treatment}</p>
                  {/* the server says when it answered with a translation no expert has checked yet (treatmentMap.hi.js) */}
                  {p.treatmentNeedsReview && <p role="note" className="rounded-xl bg-butter/20 px-3.5 py-2.5 text-[13px] text-parchment">{t('result.notReviewed')}</p>}
                </article>
                {level !== 'healthy' && (
                  <article className="ws-card flex flex-col gap-3 p-6">
                    <h3 className="font-display text-2xl">{t('ws.checkup.recheck')}</h3>
                    <p className="text-[15px] text-ink-2">{t('ws.checkup.recheckText', { date: recheckOn })}</p>
                    <Link to="/predict" className="ws-btn ws-btn-ghost mt-auto self-start">{t('ws.menu.scan')}</Link>
                  </article>
                )}
              </div>
            )}

            {tab === 'context' && (
              <div role="tabpanel" className="grid items-start gap-5 lg:grid-cols-2">
                {!located ? <NoLocation /> : (
                  <>
                    {['potato', 'rice'].includes(p.crop) && <article className="ws-glass p-6"><RiskStrip load={() => getPredictionRisk(p._id)} reloadKey={p._id} /></article>}
                    <article className="ws-card p-6"><ContextCard result={p} /></article>
                  </>
                )}
              </div>
            )}

            {tab === 'sat' && (
              <div role="tabpanel">{located ? <article className="ws-card max-w-2xl p-6"><FieldHealth predictionId={p._id} crop={p.crop} /></article> : <NoLocation />}</div>
            )}

            {tab === 'report' && (
              <div role="tabpanel" className="grid items-start gap-5 lg:grid-cols-2">
                <article className="ws-card p-6"><h3 className="font-display text-2xl">{t('ws.checkup.reportTitle')}</h3><ReportButton predictionId={p._id} hasLocation={located} /></article>
                <article className="ws-card p-6"><h3 className="font-display text-2xl">{t('ws.checkup.feedbackTitle')}</h3><Feedback predictionId={p._id} crop={p.crop} /></article>
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
};

export default Checkup;
