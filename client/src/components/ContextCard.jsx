import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { getPredictionContext, putSoilTest } from '../services/api';
import { diseaseName } from '../locales/terms';

// fill = how strongly the environment points at the disease; never green/red alone (text says it too)
const LEVEL_STYLE = {
  favourable: 'bg-clay/15 text-clay border-clay',
  neutral: 'bg-wheat/25 text-ink border-wheat',
  unfavourable: 'bg-field/15 text-field border-field/60',
  unknown: 'bg-ink/5 text-ink/60 border-ink/20',
};
const CARD_FIELDS = [['ph', '0.1'], ['ocPct', '0.01'], ['availableN', '1'], ['availableP', '0.1'], ['availableK', '1'],
  ['zn', '0.01'], ['fe', '0.1'], ['s', '0.1']];

const num = (v, lang, digits = 1) => (v == null ? '–' : Number(v).toLocaleString(lang === 'en' ? 'en-IN' : lang, { maximumFractionDigits: digits }));
const longDate = (d, lang) => new Date(`${d}T00:00:00`).toLocaleDateString(lang === 'en' ? 'en-IN' : lang, { day: 'numeric', month: 'short' });

const Badge = ({ level }) => {
  const { t } = useTranslation();
  return <span className={`inline-block border font-mono text-[10px] uppercase tracking-wide px-2 py-0.5 ${LEVEL_STYLE[level] ?? LEVEL_STYLE.unknown}`}>{t(`context.level.${level}`)}</span>;
};

// "Mean daily temperature, last 7 days: 28 °C — rule: 25–34 °C ✓"
function RuleLine({ item, lang }) {
  const { t } = useTranslation();
  const value = (v) => (item.factor === 'season' ? [].concat(v).map((s) => t(`context.season.${s}`)).join(', ') : `${num(v, lang, 2)} ${item.unit}`);
  const threshold = item.op === 'between' ? t('context.op.between', { a: num(item.threshold[0], lang, 2), b: num(item.threshold[1], lang, 2), unit: item.unit })
    : item.op === 'in' ? value(item.threshold) : t(`context.op.${item.op}`, { v: num(item.threshold, lang, 2), unit: item.unit });
  const label = t(`context.factor.${item.factor}`, { hours: item.hours });
  const window = item.windowDays ? t('context.window', { count: item.windowDays }) : '';
  if (item.status === 'missing') {
    return <li className="text-ink/60">{label}{window}: {t(`context.missing.${item.reason}`, { defaultValue: t('context.missing.other') })}</li>;
  }
  const supports = (item.status === 'met') === (item.role === 'favourable');
  return (
    <li>
      <span aria-hidden="true" className={supports ? 'text-clay' : 'text-field'}>{supports ? '▲' : '▽'}</span>{' '}
      {label}{window}: <b className="font-medium">{value(item.actual)}</b> {t('context.rule', { rule: threshold })}
      {item.from === 'soilgrids' && <span className="text-ink/50"> ({t('context.modelled')})</span>}
      {item.from === 'soil_test' && <span className="text-ink/50"> ({t('context.fromCard')})</span>}
      <span className="sr-only">{supports ? t('context.supports') : t('context.against')}</span>
    </li>
  );
}

function FitBlock({ f, crop, lang, max = 3 }) {
  const { t } = useTranslation();
  const items = [...f.matched ?? [], ...f.unmatched ?? [], ...f.missing ?? []].slice(0, max);
  return (
    <div>
      <p className="text-sm text-ink"><Badge level={f.level} /> <span className="ml-1">{t(`context.fit.${f.level}`, { disease: diseaseName(crop, f.class, lang) })}</span></p>
      {f.reason && f.reason !== 'missing_data' && <p className="text-xs text-ink/60 mt-1">{t(`context.reason.${f.reason}`, { defaultValue: '' })}</p>}
      {f.model && (
        <p className="text-xs text-ink/70 mt-1">
          {t('context.model', { name: f.model.name, level: t(`risk.level.${f.model.level ?? 'unknown'}`) })}
        </p>
      )}
      {items.length > 0 && <ul className="mt-1 flex flex-col gap-0.5 text-xs text-ink/80">{items.map((i) => <RuleLine key={i.ruleId} item={i} lang={lang} />)}</ul>}
    </div>
  );
}

function SoilCardForm({ predictionId, onSaved }) {
  const { t } = useTranslation();
  const [values, setValues] = useState({});
  const [state, setState] = useState({});
  const submit = async (e) => {
    e.preventDefault();
    setState({ saving: true });
    try {
      const body = Object.fromEntries(Object.entries(values).filter(([, v]) => v !== ''));
      onSaved((await putSoilTest(predictionId, body)).data);
      setState({ saved: true });
    } catch (err) {
      setState({ error: err.response?.data?.message || t('context.card.failed') });
    }
  };
  return (
    <details className="mt-3 text-xs">
      <summary className="cursor-pointer font-mono text-[10px] uppercase tracking-widest text-sage">{t('context.card.open')}</summary>
      <form onSubmit={submit} className="mt-2">
        <p className="text-ink/70 mb-2">{t('context.card.why')}</p>
        <div className="grid grid-cols-2 gap-2">
          {CARD_FIELDS.map(([k, step]) => (
            <label key={k} className="flex flex-col gap-0.5 text-ink/80">
              <span>{t(`context.card.field.${k}`)}</span>
              <input type="number" inputMode="decimal" step={step} min="0" value={values[k] ?? ''}
                onChange={(e) => setValues({ ...values, [k]: e.target.value })} className="border border-ink/20 bg-parchment px-2 py-1 w-full" />
            </label>
          ))}
          <label className="flex flex-col gap-0.5 text-ink/80 col-span-2">
            <span>{t('context.card.field.sampleDate')}</span>
            <input type="date" value={values.sampleDate ?? ''} onChange={(e) => setValues({ ...values, sampleDate: e.target.value })}
              className="border border-ink/20 bg-parchment px-2 py-1 w-full" />
          </label>
        </div>
        <p className="text-ink/50 mt-2">{t('context.card.private')}</p>
        <button type="submit" disabled={state.saving} className="mt-2 font-mono text-xs uppercase tracking-wide px-3 py-1.5 border border-ink text-ink">
          {t('context.card.save')}
        </button>
        {state.saved && <p role="status" className="text-field mt-1">{t('context.card.saved')}</p>}
        {state.error && <p role="alert" className="text-clay mt-1">{state.error}</p>}
      </form>
    </details>
  );
}

// Environment context of a checkup with a location (docs/CONTEXT_LAYER.md): does the weather, soil and season
// fit the diagnosed disease? Loaded once, automatically; the server builds the snapshot on first view.
// It explains; it never changes the diagnosis. `leanings`: an uncertain result, where no class is a diagnosis.
const ContextCard = ({ result, leanings = false }) => {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const [state, setState] = useState({ status: 'loading' });
  const asked = useRef(null); // one request per checkup, also under React StrictMode's double effects

  useEffect(() => {
    if (asked.current === result._id) return;
    asked.current = result._id;
    getPredictionContext(result._id)
      .then((res) => setState({ status: 'done', data: res.data }))
      .catch((err) => setState({ status: 'error', message: err.response?.data?.message || t('context.failed') }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [result._id]);

  if (state.status === 'loading') return <p role="status" className="font-mono text-xs text-sage mt-3">{t('context.loading')}</p>;
  if (state.status === 'error') return <p role="alert" className="font-mono text-xs text-clay mt-3">{state.message}</p>;

  const { context: c, fit, draft, soilTest, soilTestNote } = state.data;
  const w = c.weather.summary;
  const rain = c.rainAnomaly;
  const soil = c.soil?.topsoil0to30;
  const sources = new Map();
  for (const f of [fit.diagnosed, ...fit.alternatives].filter(Boolean)) {
    for (const i of [...f.matched ?? [], ...f.unmatched ?? []]) if (i.source) sources.set(i.source.url, i.source);
  }
  if (c.riskModel?.url) sources.set(c.riskModel.url, { title: c.riskModel.name, url: c.riskModel.url });
  const everyClass = [fit.diagnosed, ...fit.alternatives].filter(Boolean);

  return (
    <section aria-labelledby="context-title" className="mt-5 border-t border-ink/10 pt-4">
      <p id="context-title" className="font-mono text-[10px] text-sage uppercase tracking-widest mb-2">{t('context.title')}</p>

      {leanings ? (
        <div className="flex flex-col gap-2">
          <p className="text-xs text-ink/70">{t('context.leanings')}</p>
          {everyClass.map((f) => <FitBlock key={f.class} f={f} crop={result.crop} lang={lang} max={2} />)}
        </div>
      ) : (
        fit.diagnosed && <FitBlock f={fit.diagnosed} crop={result.crop} lang={lang} />
      )}

      <ul className="mt-3 flex flex-col gap-1 text-xs text-ink/80">
        <li>{t('context.weather', { from: longDate(c.weather.days[0].date, lang), to: longDate(c.reference.date, lang),
          tmin: num(w.tminMean, lang), tmax: num(w.tmaxMean, lang), rh: num(w.rhMean, lang, 0), rain: num(w.rainMm, lang) })}
          {w.wetDays12 != null && ` ${t('context.wetDays', { count: w.wetDays12 })}`}
          {c.reference.source === 'exif' && ` ${t('context.exifDate')}`}
        </li>
        <li>{rain.status === 'ok'
          ? t('context.rain', { to: longDate(rain.windowEnd, lang), pct: rain.percentOfNormal, src: rain.source === 'chirps' ? 'CHIRPS' : 'ERA5-Land' })
          : t('context.rainUnknown')}</li>
        <li>{soil
          ? t('context.soil', { texture: t(`context.texture.${c.soil.texture}`, { defaultValue: c.soil.texture ?? '–' }), ph: num(soil.phH2O, lang), soc: num(soil.socGkg, lang), n: num(soil.nitrogenGkg, lang) })
          : t('context.noSoil')}</li>
        {soilTest && <li>{t('context.cardEntered')}{soilTestNote && ` ${t('context.cardOld')}`}</li>}
        <li>{t('context.seasonLine', { season: c.season.names.map((s) => t(`context.season.${s}`)).join(' / ') })}</li>
        {c.fieldHealth.status === 'cached' && c.fieldHealth.verdict && (
          <li>{t('context.field')} {t(`field.flag.${c.fieldHealth.verdict}`, { date: c.fieldHealth.since ?? '' })}</li>
        )}
      </ul>

      {draft && <p role="note" className="text-xs text-clay border-l-2 border-clay pl-3 mt-3">{t('context.draft')}</p>}
      <p className="text-[11px] text-ink/60 mt-2">{t('context.explainOnly')}</p>

      <SoilCardForm predictionId={result._id} onSaved={(d) => d.fit && setState({ status: 'done', data: { ...state.data, ...d } })} />

      <details className="mt-2 text-[11px] text-ink/60">
        <summary className="cursor-pointer font-mono text-[10px] uppercase tracking-widest text-sage">{t('context.sources')}</summary>
        <ul className="mt-1 flex flex-col gap-0.5">
          {[...sources.values()].map((s) => <li key={s.url}><a className="underline" href={s.url} target="_blank" rel="noreferrer">{s.title}</a></li>)}
          {c.provenance.attributions.map((a) => <li key={a}>{a}</li>)}
        </ul>
      </details>
    </section>
  );
};

export default ContextCard;
