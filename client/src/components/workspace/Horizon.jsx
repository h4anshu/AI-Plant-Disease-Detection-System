import { useTranslation } from 'react-i18next';
import Icon from './icons';
import { dayMonth, fieldName, iconOf, stripSpan, weekday } from './alertsLib';
import { useAlertText } from './alertParts';

const PARTS = ['night', 'morn', 'noon', 'eve'];
const W = 1200; // the temperature line is drawn in a 1200 x H box and stretched to the width
const H = 150;
const fmt = (v) => (Math.abs(v) < 10 ? String(Math.round(v * 10) / 10) : String(Math.round(v)));

// The next 72 hours of one field: rain, temperature and the alerts on one line. Data: field.horizon from
// GET /api/fields/alerts (server/utils/alertRules.js horizon). Parts that have passed are hatched.
const Horizon = ({ field }) => {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const text = useAlertText();
  const { horizon, today } = field;
  const alerts = [...(field.official ?? []), ...field.alerts];   // official first: the strip shows both
  const slots = horizon.days.flatMap((d) => d.slots);
  const temps = slots.map((s) => s.t).filter((v) => v != null);
  const frost = field.alerts.find((a) => a.hazard === 'frost');
  // keep the frost lines in view when there is a frost alert, otherwise fit the data
  const lo = Math.min(...temps, ...(frost ? [frost.values.levels.warn - 1] : [])) - 2;
  const hi = Math.max(...temps) + 2;
  const y = (v) => ((hi - v) / (hi - lo)) * H;
  const x = (i) => (i + 0.5) * (W / 12);
  const line = slots.map((s, i) => (s.t == null ? '' : `${slots[i - 1]?.t == null || i === 0 ? 'M' : 'L'}${x(i).toFixed(1)} ${y(s.t).toFixed(1)}`)).join(' ');
  const coldest = temps.length ? Math.min(...temps) : null;
  const maxRain = Math.max(10, ...slots.map((s) => s.rain));
  const dry = slots.every((s) => s.rain < 0.1);
  const nowLeft = `calc(88px + (100% - 88px) * ${horizon.now / 12})`;
  const levels = frost?.values.levels;

  return (
    <section aria-labelledby="hz-h" className="ws-card flex min-w-0 flex-col gap-4 p-5 sm:p-6">
      <div>
        <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-ink-2">{t('alerts.hz.eyebrow')}</p>
        <h2 id="hz-h" className="mt-1 font-display text-[1.75rem] leading-tight">{t('alerts.hz.title', { name: fieldName(field, lang) })}</h2>
      </div>
      <div className="overflow-x-auto" tabIndex={0} role="region" aria-label={t('alerts.hz.scroll')}>
        <div className="relative min-w-[700px] pt-1.5">
          <div className="hz-grid">
            <div />
            {horizon.days.map((d, i) => (
              <div key={d.date} className={`hz-day ${i === 0 ? 'today' : ''}`} style={{ gridColumn: 'span 4' }}>{i === 0 ? t('alerts.today') : weekday(d.date, lang)}<small>{dayMonth(d.date, lang)}</small></div>
            ))}
            <div />
            {slots.map((s, i) => <div key={i} className={`hz-part ${s.past ? 'hz-past' : ''}`}>{t(`alerts.hz.${PARTS[i % 4]}`)}</div>)}
          </div>

          <div className="relative">
          <div className="hz-now" style={{ left: nowLeft }}><span>{t('alerts.hz.now')}</span></div>
          <div className="hz-grid mt-1.5 border-t border-ink/15" style={{ height: 92 }}>
            <div className="hz-lbl" style={{ gridRow: 1, gridColumn: 1 }}><Icon name="rain" className="h-[18px] w-[18px] text-[#0B5369]" /><span>{t('alerts.hz.rain')}<br /><span className="font-mono text-[11px]">mm</span></span></div>
            {slots.map((s, i) => (
              <div key={i} className={`hz-cell flex flex-col items-center justify-end pt-1 ${s.past ? 'hz-past' : ''}`} style={{ gridRow: 1, gridColumn: i + 2 }}>
                <span className="min-h-[14px] font-mono text-[11px] font-semibold tabular-nums text-[#0B5369]">{s.rain >= 0.1 ? fmt(s.rain) : ''}</span>
                <i className="block w-[60%] rounded-t-md bg-[#0B5369]" style={{ height: s.rain >= 0.1 ? Math.max(5, (s.rain / maxRain) * 60) : 0 }} />
              </div>
            ))}
            {dry && <span className="pointer-events-none z-[1] grid place-items-center" style={{ gridRow: 1, gridColumn: '2 / span 12' }}><span className="rounded-full border border-[#0B5369]/30 bg-[#D2EDF4] px-4 py-1.5 text-[13px] font-semibold text-[#083D4D]">{t('alerts.hz.dry')}</span></span>}
          </div>

          <div className="hz-grid mt-2 border-t border-ink/15" style={{ height: H + 10 }}>
            <div className="hz-lbl"><Icon name="sun" className="h-[18px] w-[18px] text-rust-deep" /><span>{t('alerts.hz.temp')}<br /><span className="font-mono text-[11px]">°C</span></span></div>
            <div className="relative" style={{ gridColumn: '2 / span 12', height: H }}>
              <div className="absolute inset-0 grid grid-cols-12">{slots.map((s, i) => <div key={i} className={`hz-cell ${s.past ? 'hz-past' : ''}`} />)}</div>
              {levels && [['watch', '#AE9900', 'dashed'], ['warn', '#98370C', 'solid']].map(([k, c, style]) => (
                <div key={k} className="absolute inset-x-0" style={{ top: y(levels[k]), borderTop: `1.5px ${style} ${c}` }}>
                  <span className="absolute right-1 -top-4 bg-paper px-1 font-mono text-[11px]" style={{ color: c }}>{levels[k]} °C</span>
                </div>
              ))}
              <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="absolute inset-0 h-full w-full" aria-hidden="true">
                <path d={line} fill="none" stroke="#0B5369" strokeWidth="2.5" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
              </svg>
              {slots.map((s, i) => s.t != null && (
                <span key={i} className="absolute z-[2] -translate-x-1/2 -translate-y-1/2" style={{ left: `${((i + 0.5) / 12) * 100}%`, top: y(s.t) }}>
                  <i className="block rounded-full border-2 bg-paper" style={{ width: s.t === coldest ? 14 : 10, height: s.t === coldest ? 14 : 10, borderColor: s.t === coldest ? '#98370C' : '#0B5369', background: s.t === coldest ? '#98370C' : undefined }} />
                  <b className={`absolute bottom-[14px] left-1/2 -translate-x-1/2 whitespace-nowrap font-mono text-[11px] tabular-nums ${s.t === coldest ? 'text-[#6A2202]' : 'font-medium text-ink-2'}`}>{fmt(s.t)}°</b>
                </span>
              ))}
            </div>
          </div>

          <div className="hz-grid mt-2 items-center gap-y-1 border-t border-ink/15 pt-2.5">
            <div className="hz-lbl"><Icon name="bell" className="h-[18px] w-[18px]" /><span>{t('alerts.hz.alerts')}</span></div>
            {alerts.map((a, i) => {
              const pos = stripSpan(today, a);
              return pos && (
                <div key={a.id} className="hz-chip" data-l={a.level} style={{ gridColumn: `${pos.start + 2} / span ${pos.span}`, gridRow: i + 1 }}>
                  <Icon name={iconOf(a)} /><span className="sr-only">{text.when(a)}, {t(`alerts.level.${a.level}`)}: </span><span>{a.origin === 'official' ? t(`alerts.official.family.${a.family}`) : t(`alerts.hazard.${a.hazard}`)}</span>
                </div>
              );
            })}
            {!alerts.length && <p className="text-sm text-ink-2" style={{ gridColumn: '2 / span 12' }}>{t('alerts.hz.none')}</p>}
          </div>
          </div>
        </div>
      </div>
      <p className="font-mono text-[11px] text-ink-2">{t('alerts.hz.foot')}</p>
    </section>
  );
};

export default Horizon;
