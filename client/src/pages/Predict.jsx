import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { cropName } from '../locales/terms';
import UploadBox from '../components/UploadBox';
import ResultCard from '../components/ResultCard';
import LocationConsent from '../components/LocationConsent';
import { PageHead, Lbl } from '../components/workspace/parts';
import { cropIcon } from '../components/workspace/cropIcon';
import { predictDisease } from '../services/api';
import { getCapturedDate, getLocation, readConsent, saveConsent } from '../services/location';

// Both Cloud Run services scale to zero: the first check after a quiet spell also starts them
export const SLOW_AFTER_MS = 8000;

const crops = ['wheat', 'rice', 'sugarcane', 'potato', 'maize', 'pigeonpea', 'groundnut', 'blackgram', 'apple', 'banana'];

// New check (design "02"): crop, photo, location, analyze. A saved result opens as its own page (/checkup/:id).
const Predict = () => {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const [file, setFile] = useState(null);
  const [crop, setCrop] = useState('wheat');
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [slow, setSlow] = useState(false);
  const [consent, setConsent] = useState(readConsent);
  const [locating, setLocating] = useState(false);

  const changeConsent = (value) => {
    setConsent(value);
    if (value) saveConsent(value);
  };

  const handleAnalyze = async () => {
    if (!file) {
      setError(t('predict.selectFirst'));
      return;
    }
    setError('');
    setLoading(true);
    setResult(null);
    const slowTimer = setTimeout(() => setSlow(true), SLOW_AFTER_MS);

    try {
      const formData = new FormData();
      formData.append('image', file);
      formData.append('crop', crop);
      // location only with consent; anything else is sent as "none" (server/utils/geo.js)
      setLocating(consent === 'granted');
      const place = consent === 'granted' ? await getLocation(file) : { location_source: 'none' };
      setLocating(false);
      for (const [key, value] of Object.entries(place)) formData.append(key, String(value));
      // with a location, the photo's date lets the context layer use the weather of that day
      const captured = place.location_source !== 'none' ? await getCapturedDate(file) : null;
      if (captured) formData.append('captured_at', captured);
      const res = await predictDisease(formData);
      // a saved checkup (has an id) opens as its own page; the record is passed along so it shows at once
      if (res.data._id) navigate(`/checkup/${res.data._id}`, { state: { result: res.data } });
      else setResult(res.data);
    } catch (err) {
      setError(err.response?.data?.message || t('predict.failed'));
    } finally {
      clearTimeout(slowTimer);
      setSlow(false);
      setLocating(false);
      setLoading(false);
    }
  };

  const done = [true, !!file, !!file && consent !== null, false];
  const current = done.indexOf(false);
  const steps = ['sCrop', 'sPhoto', 'sLoc', 'sAnalyze'];

  return (
    <div className="mx-auto flex max-w-[1180px] flex-col gap-6 px-5 pb-12 pt-6 lg:px-11 lg:pt-9">
      <PageHead eyebrow={t('predict.eyebrow')} title={<>{t('predict.title').split(' ').slice(0, -1).join(' ')} <span className="italic text-leaf-text">{t('predict.title').split(' ').slice(-1)}</span></>} />

      <ol aria-label={t('ws.check.stepsAria')} className="flex flex-wrap gap-2.5">
        {steps.map((k, i) => (
          <li key={k} className={`inline-flex min-h-[44px] items-center gap-2.5 rounded-full py-0 pl-2 pr-4 text-sm font-semibold ${i === current ? 'bg-pine text-parchment' : done[i] ? 'bg-sage-wash text-pine' : 'border border-ink/15 bg-white/60 text-ink-2'}`}>
            <span className={`grid h-7 w-7 place-items-center rounded-full font-mono text-xs ${i === current ? 'bg-parchment text-pine' : done[i] ? 'bg-pine text-parchment' : 'bg-ink/10'}`}>{done[i] ? '✓' : i + 1}</span>{t(`ws.check.${k}`)}
          </li>
        ))}
      </ol>

      <div className="grid items-start gap-7 lg:grid-cols-2">
        <section className="ws-card flex flex-col gap-7 p-6 sm:p-7">
          <div>
            <h2 id="crop-title" className="font-display text-2xl">{t('ws.check.step1')}</h2>
            <p className="sr-only">{t('predict.selectCrop')}</p>
            <ul aria-labelledby="crop-title" className="mt-3.5 grid grid-cols-3 gap-2.5 sm:grid-cols-5">
              {crops.map((c) => (
                <li key={c}>
                  <button type="button" aria-pressed={crop === c} onClick={() => setCrop(c)}
                    className={`flex min-h-[92px] w-full flex-col items-center justify-center gap-1.5 rounded-2xl text-ink ${crop === c ? 'border-[2.5px] border-pine bg-sage-wash' : 'border-[1.5px] border-ink/15 bg-white/70 hover:border-ink/40'}`}>
                    <img src={cropIcon(c)} alt="" className="h-[38px] w-[38px] object-contain" />
                    <span className="text-[13px] font-semibold capitalize">{cropName(c, i18n.language)}</span>
                  </button>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h2 className="font-display text-2xl">{t('ws.check.step2')}</h2>
            <p className="sr-only">{t('predict.leafPhoto')}</p>
            <div className="mt-3.5"><UploadBox onFileSelect={setFile} /></div>
          </div>

          <div>
            <h2 className="font-display text-2xl">{t('ws.check.step3')} <span className="font-body text-base text-ink-2">{t('ws.check.optional')}</span></h2>
            <div className="mt-3.5"><LocationConsent consent={consent} onChange={changeConsent} /></div>
          </div>

          <div>
            {error && <p role="alert" className="ws-note ws-note-bad mb-3">{error}</p>}
            <button type="button" onClick={handleAnalyze} disabled={loading} className="ws-btn min-h-[54px] w-full text-base">
              {locating ? t('location.getting') : loading ? t('predict.reading') : t('predict.analyze')}
            </button>
            {slow && <p role="status" className="ws-note mt-3">{t('predict.waking')}</p>}
          </div>
        </section>

        <aside className="ws-card flex min-h-[420px] flex-col gap-5 p-6 sm:p-7 lg:sticky lg:top-6" aria-live="polite">
          {result ? <ResultCard result={result} /> : loading ? (
            <div className="flex flex-1 flex-col justify-center gap-3 text-center">
              <p className="font-mono text-xs uppercase tracking-[0.22em] text-rust-deep">{t('ws.check.working')}</p>
              <p className="font-display text-3xl">{t('ws.check.reading')}</p>
              <p className="text-sm text-ink-2">{t('ws.check.st1')} · {t('ws.check.st2')} · {t('ws.check.st3')}{consent === 'granted' ? ` · ${t('ws.check.st4')}` : ''}</p>
            </div>
          ) : (
            <>
              <div className="flex flex-1 flex-col items-center justify-center gap-3 py-6 text-center">
                <svg width="44" height="44" viewBox="0 0 24 24" fill="none" className="text-leaf" aria-hidden="true">
                  <path d="M12 3C7 3 4 7 4 12c0 4 3 8 8 9 5-1 8-5 8-9 0-5-3-9-8-9z" stroke="currentColor" strokeWidth="1.2" /><path d="M12 3v18M12 3C8 6 6 9 6 12" stroke="currentColor" strokeWidth="1" />
                </svg>
                <p className="font-display text-[1.6rem] italic text-ink-2">{t('predict.awaiting')}</p>
                <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-ink-2">{t('predict.willAppear')}</p>
              </div>
              <hr className="border-ink/10" />
              <div>
                <Lbl className="mb-3">{t('ws.check.getTitle')}</Lbl>
                <ul className="flex flex-col gap-2.5 text-sm">
                  {['get1', 'get2', 'get3', 'get4'].map((k) => (
                    <li key={k} className="flex items-center gap-2.5"><span className="grid h-[26px] w-[26px] shrink-0 place-items-center rounded-full bg-pine text-parchment"><svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m5 12.5 4.2 4.2L19 7" /></svg></span>{t(`ws.check.${k}`)}</li>
                  ))}
                </ul>
              </div>
            </>
          )}
        </aside>
      </div>
    </div>
  );
};

export default Predict;
