import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

const LEVEL_STYLE = {
  low: 'bg-field/15 text-field border-field/40',
  medium: 'bg-wheat/25 text-ink border-wheat',
  high: 'bg-clay/20 text-clay border-clay',
  null: 'bg-ink/5 text-ink/40 border-ink/15',
};

// Weather-based disease risk for 6 days (2 past, today, 3 ahead) from the published models in
// docs/DISEASE_RISK.md. `load` returns the API answer (result page: the checkup; map page: its centre).
const RiskStrip = ({ load, reloadKey }) => {
  const { t, i18n } = useTranslation();
  const [state, setState] = useState({ status: 'loading' });

  useEffect(() => {
    let current = true;
    setState({ status: 'loading' });
    load()
      .then((res) => current && setState({ status: 'done', data: res.data }))
      .catch((err) => current && setState({ status: 'error', message: err.response?.data?.message || t('risk.failed') }));
    return () => { current = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reloadKey]);

  if (state.status === 'loading') return <p role="status" className="font-mono text-xs text-sage mt-3">{t('risk.loading')}</p>;
  if (state.status === 'error') return <p role="alert" className="font-mono text-xs text-clay mt-3">{state.message}</p>;

  const d = state.data;
  const day = (date) => new Date(`${date}T00:00:00`).toLocaleDateString(i18n.language === 'en' ? 'en-IN' : i18n.language, { weekday: 'short', day: 'numeric' });
  const today = d.days.find((x) => x.date === d.today)?.conditions;

  return (
    <section aria-labelledby="risk-title" className="mt-3">
      <p id="risk-title" className="font-mono text-[10px] text-sage uppercase tracking-widest mb-1">{t(`risk.title.${d.disease}`)}</p>
      <ol className="grid grid-cols-6 gap-1">
        {d.days.map((x) => (
          <li key={x.date} aria-label={`${day(x.date)}: ${t(`risk.level.${x.level ?? 'unknown'}`)}`}
            className={`border px-1 py-1.5 text-center ${LEVEL_STYLE[x.level]} ${x.date === d.today ? 'ring-2 ring-ink/60' : ''} ${x.date < d.today ? 'opacity-60' : ''}`}>
            <span className="block text-[10px] leading-tight">{x.date === d.today ? t('risk.today') : day(x.date)}</span>
            <span className="block font-mono text-[11px] font-medium mt-0.5">{t(`risk.level.${x.level ?? 'unknown'}`)}</span>
          </li>
        ))}
      </ol>
      <p className="text-[11px] text-ink/70 mt-1">{t('risk.label')}</p>

      {today && (
        <details className="mt-1 text-xs text-ink/70">
          <summary className="cursor-pointer font-mono text-[10px] uppercase tracking-widest text-sage">{t('risk.why')}</summary>
          <ul className="mt-1 flex flex-col gap-1">
            {d.crop === 'potato' ? (
              <>
                <li>{t('risk.potato.main', { pdays: today.pdays7, rh: today.nightRh7, run: today.favourableRun })}</li>
                <li>{t('risk.potato.support', { sv: today.wallinSV7, rain: today.rain7mm, interval: t(`risk.interval.${today.blitecastInterval}`) })}</li>
              </>
            ) : (
              <>
                <li>{t('risk.rice.main', { hours: today.infectionHours })}</li>
                <li>{t(today.padmanabhanMet ? 'risk.rice.supportMet' : 'risk.rice.support', { days: today.padmanabhanStreak })}</li>
              </>
            )}
          </ul>
          <p className="mt-1 text-[11px] text-ink/50">
            {t('risk.source')}: <a className="underline" href={d.model.url} target="_blank" rel="noreferrer">{d.model.name}</a> ({d.model.citation});{' '}
            {t('risk.alsoShown')}: <a className="underline" href={d.supporting.url} target="_blank" rel="noreferrer">{d.supporting.name}</a>.{' '}
            <a className="underline" href="https://open-meteo.com" target="_blank" rel="noreferrer">{d.weatherSource}</a>.
          </p>
        </details>
      )}
    </section>
  );
};

export default RiskStrip;
