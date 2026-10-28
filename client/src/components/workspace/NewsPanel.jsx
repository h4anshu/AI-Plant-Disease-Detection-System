import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { getFieldNews } from '../../services/api';
import Icon from './icons';
import { Lbl, shortDate } from './parts';

// "What officials and papers say" (docs/FIELD_ALERTS.md, "News and advisories"): headlines of the field's state and crop with an outbound link
// to the publisher, and a few official pages. Headline, source and date only; nothing is copied, summarised or presented as advice.
// If the headlines cannot be loaded the official pages still show.
const Link = ({ href, className = '', children, ...rest }) => (
  <a href={href} target="_blank" rel="noopener noreferrer" className={`underline-offset-2 hover:underline focus-visible:underline ${className}`} {...rest}>{children}</a>
);

const Chip = ({ children }) => <span className="inline-flex min-h-[24px] items-center rounded-full border border-ink/25 px-2.5 text-[11.5px] font-semibold">{children}</span>;

const NewsPanel = ({ field, name }) => {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const id = field._id;
  const [state, setState] = useState({ id, phase: 'loading' }); // loading | ok | failed
  useEffect(() => {
    let live = true;
    setState({ id, phase: 'loading' });
    getFieldNews(id).then(({ data }) => { if (live) setState({ id, phase: 'ok', data }); }, () => { if (live) setState({ id, phase: 'failed' }); });
    return () => { live = false; };
  }, [id]);
  const d = state.id === id && state.phase === 'ok' ? state.data : null;
  const phase = state.id === id ? state.phase : 'loading';
  const links = [...(d?.links.state ?? []), ...(d?.links.national ?? [])];
  return (
    <section aria-labelledby="nw-h" className="ws-card flex min-w-0 flex-col gap-5 p-5 sm:p-6">
      <div>
        <Lbl>{name}</Lbl>
        <h2 id="nw-h" className="mt-1 font-display text-[1.5rem] leading-tight">{t('alerts.news.title')}</h2>
      </div>

      <div className="flex flex-col gap-3">
        <Lbl>{t('alerts.news.papers')}</Lbl>
        {phase === 'loading' && <p role="status" className="text-[15px] text-ink-2">{t('alerts.news.loading')}</p>}
        {phase === 'failed' && <p role="status" className="ws-note">{t('alerts.news.failed')}</p>}
        {d && !d.items.length && <p className="text-[15px] text-ink-2">{t('alerts.news.empty')}</p>}
        {d?.items.length > 0 && (
          <ul className="flex flex-col">
            {d.items.map((i) => (
              <li key={i.link} className="flex flex-col gap-1.5 border-t border-ink/10 py-3.5 first:border-t-0 first:pt-0">
                <Link href={i.link} lang={i.lang} className="inline-block py-2 font-display text-[1.15rem] leading-snug [text-wrap:pretty]">{i.title}</Link>
                <span className="flex flex-wrap items-center gap-x-2.5 gap-y-1.5 text-[13px] text-ink-2">
                  <span className="font-semibold text-ink">{i.sourceName}</span>
                  <span>{i.dated ? shortDate(i.date, lang) : t('alerts.news.seen', { date: shortDate(i.date, lang) })}</span>
                  <span>{t(`alerts.news.lang.${i.lang}`)}</span>
                  {i.state && <Chip>{t('alerts.news.yourState', { state: d.state })}</Chip>}
                  {i.crop && <Chip>{t('alerts.news.yourCrop')}</Chip>}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {d && (
        <div className="flex flex-col gap-3">
          <Lbl>{t('alerts.news.official')}</Lbl>
          <ul className="flex flex-col">
            {links.map((l) => (
              <li key={l.id} className="flex flex-col gap-0.5 border-t border-ink/10 py-3 first:border-t-0 first:pt-0">
                <Link href={l.url} className="inline-flex min-h-[44px] items-center gap-2 text-[15px] font-semibold"><Icon name="arrow" className="h-4 w-4 flex-none" />{l.label?.[lang] ?? l.label?.en ?? t(`alerts.news.links.${l.id}.name`)}</Link>
                <span className="pl-6 text-[13px] text-ink-2">{l.id === 'imd-state' ? t(d.state ? 'alerts.news.links.imd-state.textState' : 'alerts.news.links.imd-state.text', { state: d.state }) : t(`alerts.news.links.${l.id}.text`, { defaultValue: '' })}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <p className="text-[12.5px] leading-relaxed text-ink-2">{t('alerts.news.note')}</p>
    </section>
  );
};

export default NewsPanel;
