import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { getFieldHealth } from '../services/api';

const W = 320;
const H = 150;
const PAD = { left: 30, right: 8, top: 8, bottom: 22 };
const COLORS = { ndvi: '#4A6741', ndre: '#B5652E', redsi: '#7A5C99', band: 'rgba(122,139,111,0.25)' };

// A small SVG time-series chart: field lines, the neighbours' middle half (25th-75th percentile) as a
// band, a dot per clear image. Kept dependency-free: two lines and a band don't need a chart library.
export function SeriesChart({ rows, window, keys, bandKey, yMin, yMax, lang, label }) {
  const t0 = Date.parse(window.start);
  const t1 = Date.parse(window.end);
  const x = (d) => PAD.left + ((Date.parse(d) - t0) / (t1 - t0)) * (W - PAD.left - PAD.right);
  const y = (v) => PAD.top + (1 - (Math.min(Math.max(v, yMin), yMax) - yMin) / (yMax - yMin)) * (H - PAD.top - PAD.bottom);
  const line = (k) => rows.filter((r) => r[k] != null).map((r) => `${x(r.date).toFixed(1)},${y(r[k]).toFixed(1)}`).join(' ');
  const withBand = rows.filter((r) => r.neighbours.enough && r.neighbours[bandKey]?.[0] != null);
  const band = [...withBand.map((r) => `${x(r.date).toFixed(1)},${y(r.neighbours[bandKey][2]).toFixed(1)}`),
    ...[...withBand].reverse().map((r) => `${x(r.date).toFixed(1)},${y(r.neighbours[bandKey][0]).toFixed(1)}`)].join(' ');
  const fmt = (d) => new Date(d).toLocaleDateString(lang, { day: 'numeric', month: 'short' });
  const ticks = [yMin, (yMin + yMax) / 2, yMax];

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto" role="img" aria-label={label}>
      {ticks.map((v) => (
        <g key={v}>
          <line x1={PAD.left} x2={W - PAD.right} y1={y(v)} y2={y(v)} stroke="rgba(31,59,44,0.12)" />
          <text x={PAD.left - 4} y={y(v) + 3} textAnchor="end" fontSize="9" fill="#7A8B6F">{Number(v.toFixed(2))}</text>
        </g>
      ))}
      {band && <polygon points={band} fill={COLORS.band} />}
      {keys.map((k) => (
        <polyline key={k} points={line(k)} fill="none" stroke={COLORS[k]} strokeWidth="1.8"
          strokeDasharray={k === 'ndre' ? '4 3' : undefined} />
      ))}
      {rows.filter((r) => r[keys[0]] != null).map((r) => (
        <circle key={r.date} cx={x(r.date)} cy={y(r[keys[0]])} r="2.2" fill={COLORS[keys[0]]} />
      ))}
      <text x={PAD.left} y={H - 6} fontSize="9" fill="#7A8B6F">{fmt(window.start)}</text>
      <text x={W - PAD.right} y={H - 6} fontSize="9" fill="#7A8B6F" textAnchor="end">{fmt(window.end)}</text>
    </svg>
  );
}

// dates with the month's name: "9/6/2026" reads as 9 June in India but meant 6 September
const longDate = (d, lang) => new Date(d).toLocaleDateString(lang === 'en' ? 'en-IN' : lang, { day: 'numeric', month: 'short', year: 'numeric' });

// "How does the whole field look from space?" for a checkup with a consented location. Loaded only on
// request: every uncached answer is an Earth Engine computation (docs/FIELD_HEALTH.md).
const FieldHealth = ({ predictionId, crop }) => {
  const { t, i18n } = useTranslation();
  const [state, setState] = useState({ status: 'idle' });

  const load = async () => {
    setState({ status: 'loading' });
    try {
      setState({ status: 'done', data: (await getFieldHealth(predictionId)).data });
    } catch (err) {
      setState({ status: 'error', message: err.response?.data?.message || t('field.failed') });
    }
  };

  if (state.status === 'idle') {
    return (
      <div className="mt-5 pt-4 border-t border-ink/10">
        <button type="button" onClick={load}
          className="font-mono text-xs uppercase tracking-wide px-3 py-2 border border-field text-field hover:bg-field/10">
          {t('field.show')}
        </button>
        <p className="text-xs text-ink/60 mt-2">{t('field.why')}</p>
      </div>
    );
  }
  if (state.status === 'loading') return <p role="status" className="mt-5 font-mono text-xs text-sage">{t('field.loading')}</p>;
  if (state.status === 'error') return <p role="alert" className="mt-5 font-mono text-xs text-clay">{state.message}</p>;

  const d = state.data;
  const rows = d.series.filter((r) => r.used);
  const flag = t(`field.flag.${d.flag.code}`, { date: d.flag.since && longDate(d.flag.since, i18n.language) });
  const worrying = ['below', 'below_once', 'not_farmland'].includes(d.flag.code);

  return (
    <section className="mt-5 pt-4 border-t border-ink/10" aria-labelledby="field-title">
      <p id="field-title" className="font-mono text-[10px] text-sage uppercase tracking-widest mb-2">{t('field.title')}</p>
      <p className={`text-sm leading-relaxed ${worrying ? 'text-clay font-medium' : 'text-ink/80'}`}>{flag}</p>
      {d.flag.stale && d.last_clear_date && d.flag.code !== 'not_farmland' && (
        <p className="text-xs text-ink/60 mt-1">{t('field.stale', { date: longDate(d.last_clear_date, i18n.language) })}</p>
      )}

      {rows.length > 0 && (
        <>
          <SeriesChart rows={rows} window={d.window} keys={['ndvi', 'ndre']} bandKey="ndvi" yMin={0} yMax={1}
            lang={i18n.language} label={t('field.chartLabel')} />
          <ul className="flex flex-wrap gap-x-4 gap-y-1 font-mono text-[11px] text-ink/70">
            <li><span className="inline-block w-4 h-0.5 align-middle mr-1" style={{ background: COLORS.ndvi }} />{t('field.ndvi')}</li>
            <li><span className="inline-block w-4 h-0 align-middle mr-1 border-t-2 border-dashed" style={{ borderColor: COLORS.ndre }} />{t('field.ndre')}</li>
            <li><span className="inline-block w-4 h-3 align-middle mr-1" style={{ background: COLORS.band }} />{t('field.band')}</li>
          </ul>
        </>
      )}

      {crop === 'wheat' && rows.some((r) => r.redsi != null) && (
        <div className="mt-3">
          <p className="font-mono text-[10px] text-sage uppercase tracking-widest">{t('field.redsiTitle')}</p>
          <SeriesChart rows={rows} window={d.window} keys={['redsi']} bandKey="redsi" lang={i18n.language} label={t('field.redsiTitle')}
            yMin={Math.min(...rows.map((r) => r.redsi ?? Infinity), 0)} yMax={Math.max(...rows.map((r) => r.redsi ?? -Infinity), 1)} />
          <p className="text-xs text-ink/60">{t('field.redsiNote')}</p>
        </div>
      )}

      <p className="text-xs text-ink/70 mt-3 border-l-2 border-sage pl-3">{t('field.explain')}</p>
      <p className="text-[11px] text-ink/50 mt-2">
        {t('field.meta', { clear: d.clear_images, total: d.images, date: d.last_clear_date ? longDate(d.last_clear_date, i18n.language) : '—' })}
        {' '}{d.geometry_source === 'buffer_30m' ? t('field.circle') : t('field.boundary')}
      </p>
    </section>
  );
};

export default FieldHealth;
