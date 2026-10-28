import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { getFieldPrices } from '../../services/api';
import Icon from './icons';
import { Lbl, locOf, shortDate } from './parts';

// "Mandi prices" (docs/FIELD_ALERTS.md, "Mandi prices"): the last prices that market committees reported for the field's crop in its state, in
// rupees per quintal, from Agmarknet through data.gov.in. What was paid, never a forecast and never "sell" or "hold". It is a card, not an
// alert; it is not drawn at all when the feature is off or the field's state is not known yet.
const SOURCE = 'https://www.data.gov.in/resource/variety-wise-daily-market-prices-data-commodity';

const PricesCard = ({ field, name }) => {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const id = field._id;
  const [state, setState] = useState({ id, phase: 'loading' });
  useEffect(() => {
    let live = true;
    setState({ id, phase: 'loading' });
    getFieldPrices(id).then(({ data }) => { if (live) setState({ id, phase: 'ok', data }); }, () => { if (live) setState({ id, phase: 'failed' }); });
    return () => { live = false; };
  }, [id]);
  const phase = state.id === id ? state.phase : 'loading';
  const d = phase === 'ok' ? state.data : null;
  if (phase === 'loading' || (d && ['disabled', 'no_state'].includes(d.status))) return null;
  const rupees = (n) => `₹${Number(n).toLocaleString(locOf(lang))}`;
  const item = t(`alerts.prices.item.${field.crop}`);
  return (
    <section aria-labelledby="pr-h" className="ws-card flex min-w-0 flex-col gap-4 p-5 sm:p-6">
      <div>
        <Lbl>{name}</Lbl>
        <h2 id="pr-h" className="mt-1 font-display text-[1.5rem] leading-tight">{t('alerts.prices.title', { item })}</h2>
      </div>

      {(phase === 'failed' || d?.status === 'unavailable') && <p role="status" className="ws-note">{t('alerts.prices.failed')}</p>}
      {d?.status === 'none' && <p className="text-[15px] text-ink-2">{t('alerts.prices.none', { item, state: d.state })}</p>}
      {d?.status === 'stale' && <p className="text-[15px] text-ink-2">{t('alerts.prices.stale', { item, state: d.state, date: shortDate(d.lastDate, lang) })}</p>}
      {d?.status === 'ok' && (
        <>
          <div className="flex flex-col gap-1">
            <p className="font-display text-[2.2rem] leading-none">{t('alerts.prices.per', { price: rupees(d.median) })}</p>
            <p className="text-[14px] text-ink-2">
              {t(d.markets === 1 ? 'alerts.prices.one' : 'alerts.prices.many', { state: d.state, n: d.markets, date: shortDate(d.date, lang) })}
              {d.ageDays >= 3 && ` ${t('alerts.prices.old', { days: d.ageDays })}`}
            </p>
            {d.markets >= 3 && <p className="text-[14px] text-ink-2">{t('alerts.prices.range', { min: rupees(d.min), max: rupees(d.max) })}</p>}
            {d.trend && (
              <p className="flex items-center gap-1.5 text-[14px] font-semibold">
                <Icon name="arrow" className={`h-4 w-4 flex-none ${d.trend.pct < 0 ? 'rotate-90' : d.trend.pct > 0 ? '' : 'rotate-45'}`} />
                {t(d.trend.pct > 0 ? 'alerts.prices.up' : d.trend.pct < 0 ? 'alerts.prices.down' : 'alerts.prices.flat', { pct: Math.abs(d.trend.pct), since: shortDate(d.trend.since, lang), n: d.trend.markets })}
              </p>
            )}
          </div>
          {d.local.length > 0 && (
            <div className="flex flex-col gap-2">
              <Lbl>{t('alerts.prices.local')}</Lbl>
              <ul className="flex flex-col">
                {d.local.map((m) => (
                  <li key={m.market} className="flex items-baseline justify-between gap-3 border-t border-ink/10 py-2.5 first:border-t-0 first:pt-0">
                    <span className="text-[15px]">{m.market}</span>
                    <b className="font-mono text-[15px] tabular-nums">{rupees(m.price)}</b>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}

      <p className="text-[12.5px] leading-relaxed text-ink-2">
        {t('alerts.prices.note')}{' '}
        <a href={SOURCE} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-[44px] items-center font-semibold underline underline-offset-2">{t('alerts.prices.source')}</a>
      </p>
    </section>
  );
};

export default PricesCard;
