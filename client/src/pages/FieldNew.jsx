import { lazy, Suspense, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import terms from '../locales/terms.json';
import { cropName } from '../locales/terms';
import { createField, getFields } from '../services/api';
import { getLocation } from '../services/location';
import { cropIcon } from '../components/workspace/cropIcon';
import Icon from '../components/workspace/icons';
import { MAX_FIELDS, STAGES, cropLabel } from '../components/workspace/alertsLib';
import { PageHead } from '../components/workspace/parts';

// Leaflet loads only when someone reaches the "place" step
const LocationPicker = lazy(() => import('../components/workspace/LocationPicker'));

const CROPS = Object.keys(terms.crops);
const STEPS = ['crop', 'stage', 'place'];
const MAX_NAME = 40; // server/models/Field.js

// Add a field in three taps: crop, stage, place. The exact place stays private (docs/FIELD_ALERTS.md); only the weather for
// its 5 km square is ever asked for. Saving opens the Weather & Alerts half of the Overview.
const FieldNew = () => {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const navigate = useNavigate();
  const [step, setStep] = useState(0);
  const [crop, setCrop] = useState('');
  const [stage, setStage] = useState('');
  const [place, setPlace] = useState(null);       // { lat, lon, source: 'gps' | 'map' }
  const [name, setName] = useState('');
  const [locating, setLocating] = useState(false);
  const [gpsFailed, setGpsFailed] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [full, setFull] = useState(false);

  useEffect(() => {
    getFields().then((res) => setFull(res.data.length >= MAX_FIELDS)).catch(() => {});
  }, []);

  const ready = [!!crop, !!stage, !!place][step];

  const locate = async () => {
    setLocating(true);
    setGpsFailed(false);
    const fix = await getLocation();   // the browser's GPS; resolves with no coordinates when refused or slow
    setLocating(false);
    if (fix.lat != null) setPlace({ lat: fix.lat, lon: fix.lon, source: 'gps' });
    else setGpsFailed(true);
  };

  const save = async () => {
    setSaving(true);
    setError('');
    try {
      await createField({ crop, stage, lat: place.lat, lon: place.lon, ...(name.trim() && { name: name.trim() }) });
      navigate('/overview?mode=weather');
    } catch (err) {
      const status = err.response?.status;
      setError(status === 409 ? t('alerts.new.full') : status === 400 ? t('alerts.new.invalid') : t('alerts.new.failed'));
      setSaving(false);
    }
  };

  if (full) {
    return (
      <div className="mx-auto flex max-w-[760px] flex-col gap-6 px-5 pb-12 pt-6 lg:px-11 lg:pt-9">
        <PageHead eyebrow={t('alerts.new.eyebrow')} title={t('alerts.new.fullTitle')} />
        <article className="ws-card flex flex-col items-start gap-4 p-6">
          <p className="text-[15px]">{t('alerts.new.full')}</p>
          <Link to="/me?tab=data" className="ws-btn">{t('alerts.new.manage')}</Link>
        </article>
      </div>
    );
  }

  return (
    <div className="mx-auto flex max-w-[980px] flex-col gap-6 px-5 pb-12 pt-6 lg:px-11 lg:pt-9">
      <PageHead eyebrow={t('alerts.new.eyebrow', { step: step + 1 })} title={<>{t('alerts.new.title1')} <span className="italic text-leaf-text">{t('alerts.new.title2')}</span></>} />

      <ol className="grid grid-cols-3 gap-3" aria-label={t('alerts.new.stepsAria')}>
        {STEPS.map((s, i) => (
          <li key={s} aria-current={i === step ? 'step' : undefined} className="flex flex-col gap-2">
            <span className="ws-bar !h-2"><i style={{ width: i < step ? '100%' : i === step ? '50%' : '0%' }} /></span>
            <span className={`text-sm ${i === step ? 'font-bold text-pine' : 'text-ink-2'}`}>{i < step ? '✓ ' : ''}{t(`alerts.new.step.${s}`)}</span>
          </li>
        ))}
      </ol>

      <section className="ws-card flex flex-col gap-6 p-5 sm:p-8" aria-live="polite">
        {step === 0 && (
          <>
            <div><h2 className="font-display text-[1.9rem] leading-tight">{t('alerts.new.cropTitle')}</h2><p className="mt-1.5 text-[15px] text-ink-2">{t('alerts.new.cropText')}</p></div>
            <div role="group" aria-label={t('alerts.new.cropTitle')} className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
              {CROPS.map((c) => (
                <button key={c} type="button" aria-pressed={crop === c} onClick={() => setCrop(c)}
                  className={`flex min-h-[44px] flex-col items-center gap-2 rounded-[20px] border-2 px-2 py-3 ${crop === c ? 'border-pine bg-sage-wash' : 'border-ink/15 bg-white/60 hover:border-ink/40'}`}>
                  <img src={cropIcon(c)} alt="" className="h-20 w-20 object-contain" />
                  <b className="text-[15px] font-semibold">{cropLabel(c, lang)}</b>
                </button>
              ))}
            </div>
          </>
        )}

        {step === 1 && (
          <>
            <div><h2 className="font-display text-[1.9rem] leading-tight">{t('alerts.new.stageTitle', { crop: cropName(crop, lang).toLowerCase() })}</h2><p className="mt-1.5 text-[15px] text-ink-2">{t('alerts.new.stageText')}</p></div>
            <div role="group" aria-label={t('alerts.new.stageTitle', { crop: cropName(crop, lang).toLowerCase() })} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {STAGES.map((s) => (
                <button key={s} type="button" aria-pressed={stage === s} onClick={() => setStage(s)}
                  className={`flex min-h-[44px] flex-col items-start gap-1.5 rounded-[20px] border-2 p-4 text-left ${stage === s ? 'border-pine bg-sage-wash' : 'border-ink/15 bg-white/60 hover:border-ink/40'}`}>
                  <b className="text-[16px] font-semibold">{t(`alerts.stage.${s}`)}</b>
                  <span className="text-[13px] leading-snug text-ink-2">{t(`alerts.new.stageHelp.${s}`)}</span>
                </button>
              ))}
              <div className="flex flex-col justify-center gap-1.5 rounded-[20px] border-2 border-dashed border-ink/25 p-4 text-ink-2">
                <b className="text-[15px] text-ink">{t('alerts.new.notSure')}</b>
                <span className="text-[13px] leading-snug">{t('alerts.new.notSureText')}</span>
              </div>
            </div>
          </>
        )}

        {step === 2 && (
          <>
            <div><h2 className="font-display text-[1.9rem] leading-tight">{t('alerts.new.placeTitle')}</h2><p className="mt-1.5 text-[15px] text-ink-2">{t('alerts.new.placeText')}</p></div>
            <div className="flex flex-wrap items-center gap-3">
              <button type="button" className="ws-btn" disabled={locating} onClick={locate}><Icon name="crosshair" className="h-[18px] w-[18px]" />{locating ? t('alerts.new.locating') : t('alerts.new.gps')}</button>
              <span className="font-mono text-xs text-ink-2">{t('alerts.new.orTap')}</span>
            </div>
            {gpsFailed && <p role="alert" className="ws-note">{t('alerts.new.gpsFailed')}</p>}
            <Suspense fallback={<p role="status" className="font-mono text-xs text-ink-2">{t('ws.loading')}</p>}>
              <LocationPicker value={place} onPick={setPlace} />
            </Suspense>
            {place
              ? <p role="status" className="ws-note !bg-[#E4F0D8]">{t('alerts.new.placed')}</p>
              : <p className="ws-note">{t('alerts.new.noPin')}</p>}
            <div className="flex flex-col gap-2">
              <label htmlFor="field-name" className="font-mono text-[11px] uppercase tracking-[0.14em] text-ink-2">{t('alerts.new.nameLabel')}</label>
              <input id="field-name" type="text" value={name} maxLength={MAX_NAME} onChange={(e) => setName(e.target.value)} placeholder={cropLabel(crop, lang)}
                className="min-h-[48px] max-w-[420px] rounded-[14px] border-[1.5px] border-ink/15 bg-white px-4 text-base text-ink" />
            </div>
            <p className="flex items-start gap-3 rounded-2xl border border-ink/15 bg-white/60 px-4 py-3.5 text-[13.5px] leading-relaxed text-ink-2">
              <Icon name="lock" className="mt-0.5 h-5 w-5 shrink-0 text-pine" /><span><b className="text-ink">{t('alerts.new.privateHead')}</b> {t('alerts.new.privateText')}</span>
            </p>
          </>
        )}

        {error && <p role="alert" className="ws-note ws-note-bad">{error}</p>}

        <div className="flex flex-wrap justify-between gap-3 border-t border-ink/10 pt-5">
          {step === 0
            ? <Link to="/overview?mode=weather" className="ws-btn ws-btn-ghost"><Icon name="back" className="h-[18px] w-[18px]" />{t('alerts.new.cancel')}</Link>
            : <button type="button" className="ws-btn ws-btn-ghost" disabled={saving} onClick={() => setStep(step - 1)}><Icon name="back" className="h-[18px] w-[18px]" />{t('alerts.new.back')}</button>}
          {step < 2
            ? <button type="button" className="ws-btn" disabled={!ready} onClick={() => setStep(step + 1)}>{t('alerts.new.next')}<Icon name="chevron" className="h-[18px] w-[18px]" /></button>
            : <button type="button" className="ws-btn" disabled={!ready || saving} onClick={save}>{saving ? t('alerts.new.saving') : t('alerts.new.save')}</button>}
        </div>
      </section>
    </div>
  );
};

export default FieldNew;
