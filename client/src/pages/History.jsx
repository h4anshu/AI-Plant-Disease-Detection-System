import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { cropName } from '../locales/terms';
import { useHistory } from '../components/workspace/useHistory';
import { StatusPill, levelOf, needsAttention } from '../components/workspace/status';
import { CropTag, Lbl, PageHead, hasLocation, shortDate, titleOf } from '../components/workspace/parts';
import { cropIcon } from '../components/workspace/cropIcon';
import Icon from '../components/workspace/icons';

const FILTERS = {
  all: () => true,
  attention: needsAttention,
  healthy: (p) => levelOf(p) === 'healthy',
  retake: (p) => levelOf(p) === 'retake',
};
const TAB_KEYS = { all: 'tAll', attention: 'tAttention', healthy: 'tHealthy', retake: 'tRetake' };
const LEGEND = [['healthy', 'lHealthy'], ['early', 'lEarly'], ['moderate', 'lModerate'], ['severe', 'lSevere'], ['retake', 'lRetake']];

// Every checkup of this browser: filter by result and crop, as a list or a photo grid (design "04 Field log")
const History = () => {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const { items, loading, error, hasMore, more } = useHistory();
  const [status, setStatus] = useState('all');
  const [crop, setCrop] = useState('all');
  const [view, setView] = useState('list');

  const crops = [...new Set(items.map((p) => p.crop).filter(Boolean))];
  const rows = items.filter((p) => FILTERS[status](p) && (crop === 'all' || p.crop === crop));
  const where = (p) => (hasLocation(p) ? t('ws.log.approx') : t('ws.log.noLoc'));
  const sure = (p) => (levelOf(p) === 'retake' ? '—' : `${Math.round((p.confidence || 0) * 100)}%`);
  const risk = (p) => (p.yieldLossPercent > 0 ? `${p.yieldLossPercent}%` : '—');

  return (
    <div className="mx-auto flex max-w-[1180px] flex-col gap-5 px-5 pb-12 pt-6 lg:px-11 lg:pt-9">
      <PageHead eyebrow={t('history.eyebrow')} title={<>{t('history.title').split(' ')[0]} <span className="italic text-leaf-text">{t('history.title').split(' ').slice(1).join(' ')}</span></>}>
        <Link to="/predict" className="ws-btn"><Icon name="check" />{t('ws.log.newCheck')}</Link>
      </PageHead>
      {!loading && !error && <p className="-mt-2 text-ink-2">{t('ws.log.count', { count: items.length })}</p>}
      {error && <p role="alert" className="ws-note ws-note-bad">{error}</p>}
      {loading && !items.length && <p role="status" className="font-mono text-xs text-ink-2">{t('ws.loading')}</p>}

      <div role="tablist" aria-label={t('ws.log.tabsAria')} className="ws-tabs">
        {Object.keys(FILTERS).map((k) => (
          <button key={k} type="button" role="tab" className="ws-tab" aria-selected={status === k} onClick={() => setStatus(k)}>
            {t(`ws.log.${TAB_KEYS[k]}`)}<span className="n">{items.filter(FILTERS[k]).length}</span>
          </button>
        ))}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3.5">
        <ul aria-label={t('ws.log.cropAria')} className="flex flex-wrap gap-2">
          <li><button type="button" className="ws-chip" aria-pressed={crop === 'all'} onClick={() => setCrop('all')}>{t('ws.log.allCrops')}</button></li>
          {crops.map((c) => (
            <li key={c}><button type="button" className="ws-chip" aria-pressed={crop === c} onClick={() => setCrop(c)}><img src={cropIcon(c)} alt="" className="h-6 w-6 object-contain" />{cropName(c, lang)}</button></li>
          ))}
        </ul>
        <div role="group" aria-label={t('ws.log.viewAria')} className="ws-seg">
          <button type="button" aria-pressed={view === 'list'} onClick={() => setView('list')}>{t('ws.log.viewList')}</button>
          <button type="button" aria-pressed={view === 'grid'} onClick={() => setView('grid')}>{t('ws.log.viewGrid')}</button>
        </div>
      </div>

      <div className="flex flex-wrap items-start gap-6">
        <section aria-label={t('history.title')} className="min-w-0 flex-[999_1_620px]">
          {view === 'list' && rows.length > 0 && (
            <div className="ws-card overflow-hidden">
              <div className="hidden grid-cols-[minmax(0,1fr)_128px_56px_76px_64px_20px] gap-3 bg-sage-wash px-4 py-3 font-mono text-[11px] uppercase tracking-[0.14em] text-ink-2 sm:grid">
                <span>{t('ws.log.colCheckup')}</span><span>{t('ws.log.colResult')}</span><span>{t('ws.log.colSure')}</span><span>{t('ws.log.colRisk')}</span><span>{t('ws.log.colDate')}</span><span />
              </div>
              <ul>
                {rows.map((p) => (
                  <li key={p._id} className="border-t border-ink/10">
                    <Link to={`/checkup/${p._id}`} className="ws-row ws-row-grid min-h-[76px] sm:grid-cols-[minmax(0,1fr)_128px_56px_76px_64px_20px] sm:gap-3 sm:py-3">
                      <span className="flex min-w-0 flex-1 items-center gap-3.5">
                        <img src={p.imageUrl} alt="" className="h-[60px] w-[60px] shrink-0 rounded-xl bg-sage-wash object-cover" />
                        <span className="min-w-0">
                          <CropTag crop={p.crop} lang={lang} size={20} />
                          <span className="block truncate text-base font-semibold">{titleOf(p, t, lang)}</span>
                          <span className="text-[12.5px] text-ink-2">{where(p)}</span>
                        </span>
                      </span>
                      <span className="max-sm:hidden"><StatusPill level={levelOf(p)} /></span>
                      <span className="font-semibold tabular-nums max-sm:hidden">{sure(p)}</span>
                      <span className="font-semibold tabular-nums text-rust-deep max-sm:hidden">{risk(p)}</span>
                      <span className="text-[13px] tabular-nums text-ink-2 max-sm:hidden">{shortDate(p.createdAt, lang)}</span>
                      <Icon name="chevron" className="h-5 w-5 text-ink-2 max-sm:hidden" />
                      <span className="flex flex-col items-end gap-1.5 sm:hidden"><StatusPill level={levelOf(p)} /><span className="text-xs tabular-nums text-ink-2">{shortDate(p.createdAt, lang)}</span></span>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {view === 'grid' && rows.length > 0 && (
            <ul className="grid grid-cols-[repeat(auto-fill,minmax(200px,1fr))] gap-4">
              {rows.map((p) => (
                <li key={p._id} className="ws-card ws-hover overflow-hidden">
                  <Link to={`/checkup/${p._id}`} className="flex flex-col no-underline">
                    <img src={p.imageUrl} alt="" className="h-36 w-full bg-sage-wash object-cover" />
                    <span className="flex flex-col gap-2 p-4">
                      <CropTag crop={p.crop} lang={lang} size={20} />
                      <span className="font-display text-[1.35rem] leading-tight">{titleOf(p, t, lang)}</span>
                      <span className="flex items-center justify-between gap-2"><StatusPill level={levelOf(p)} /><span className="text-[13px] tabular-nums text-ink-2">{shortDate(p.createdAt, lang)}</span></span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}

          {!loading && rows.length === 0 && (
            <div className="ws-card flex flex-col items-center gap-3 px-6 py-14 text-center">
              <p className="font-display text-[1.75rem] italic text-ink-2">{items.length ? t('ws.log.noMatch') : t('history.empty')}</p>
              <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-ink-2">{items.length ? t('ws.log.tryOther') : t('history.emptyHint')}</p>
              {items.length
                ? <button type="button" className="ws-btn ws-btn-ghost" onClick={() => { setStatus('all'); setCrop('all'); }}>{t('ws.log.clear')}</button>
                : <Link to="/predict" className="ws-btn">{t('ws.menu.scan')}</Link>}
            </div>
          )}

          {!loading && hasMore && <button type="button" onClick={more} className="ws-btn ws-btn-ghost mt-5 w-full">{t('history.loadOlder')}</button>}
        </section>

        <aside className="flex min-w-[260px] max-w-[340px] flex-[1_1_280px] flex-col gap-4">
          <section className="ws-card p-5">
            <Lbl className="mb-3">{t('ws.log.legend')}</Lbl>
            <ul className="flex flex-col gap-2.5 text-[13.5px]">
              {LEGEND.map(([level, key]) => (
                <li key={level} className="flex items-start gap-2.5"><StatusPill level={level} className="shrink-0" /><span className="text-ink-2">{t(`ws.log.${key}`)}</span></li>
              ))}
            </ul>
          </section>
          <section className="ws-sage p-5">
            <p className="font-display text-[1.35rem]">{t('ws.log.stays')}</p>
            <p className="mt-1.5 text-[13.5px] text-ink-2">{t('ws.log.staysText')}</p>
            <Link to="/me?tab=data" className="mt-2.5 inline-block text-sm font-semibold text-pine underline underline-offset-4">{t('ws.log.manage')}</Link>
          </section>
        </aside>
      </div>
    </div>
  );
};

export default History;
