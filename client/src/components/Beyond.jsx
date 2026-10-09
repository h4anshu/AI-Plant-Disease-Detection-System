import { useTranslation } from 'react-i18next';
import { Calendar, Leaf, Magnifier } from './heroIcons';
import leafA from '../assets/how/leaf-a.webp';
import leafC from '../assets/how/leaf-c.webp';

// Illustrative values for the landing page only (labelled "Example data"); the real ones come from /api/disease-risk, the context layer and the geo-service.
const RISK = ['low', 'low', 'medium', 'high', 'high', 'medium'];   // past 2 days, today, next 3
const TODAY = 2;
const STATE = {   // the status system: low = healthy, medium = early, high = moderate (never colour alone: glyph + word)
  low: { c: '#6C854D', tint: '#E4F0D8', text: '#2F450C', g: 0 },
  medium: { c: '#AE9900', tint: '#F0ECD2', text: '#473D00', g: 1 },
  high: { c: '#98370C', tint: '#FFE5DC', text: '#6A2202', g: 2 },
};
const GLYPH = [
  <path key="0" d="M5 8.3l2.2 2.2L11 6" fill="none" stroke="currentColor" strokeWidth="1.8" />,
  <path key="1" d="M8 8V1.5A6.5 6.5 0 0 1 14.5 8z" fill="currentColor" />,
  <path key="2" d="M8 1.5a6.5 6.5 0 0 1 0 13z" fill="currentColor" />,
];
const SERIES = [   // NDVI, NDRE, REDSI (colours and dashes from the colour system: separable for colour-blind readers)
  { k: 'NDVI', c: '#6F9364', d: '', y: [.22, .3, .42, .55, .68, .78, .8, .7, .55, .4, .3, .25] },
  { k: 'NDRE', c: '#0A3C62', d: '7 5', y: [.12, .16, .24, .34, .44, .52, .55, .5, .4, .28, .2, .15] },
  { k: 'REDSI', c: '#98370C', d: '2 5', y: [.5, .46, .4, .34, .3, .26, .25, .3, .38, .45, .5, .52] },
];

const Head = ({ Icon, children }) => (
  <p className="flex items-center gap-2.5 font-mono text-[11px] uppercase tracking-[0.12em] text-ink-2">
    <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-pine text-parchment"><Icon className="h-4 w-4" /></span>{children}
  </p>
);
const Card = ({ children }) => <article className="map-glass flex flex-col rounded-[1.7rem] p-5 sm:p-6">{children}</article>;
const Tag = ({ t }) => <span className="ml-auto rounded-full bg-butter px-2.5 py-0.5 font-body text-xs normal-case tracking-normal text-ink">{t('beyond.tag')}</span>;

const Beyond = () => {
  const { t, i18n } = useTranslation();
  const loc = i18n.language === 'en' ? 'en-IN' : i18n.language;
  const day = (i) => new Date(Date.now() + (i - TODAY) * 864e5).toLocaleDateString(loc, { weekday: 'short' });
  return (
    <section id="around" className="bey-bg scroll-mt-[4.6rem] px-5 py-16 sm:px-8 lg:flex lg:min-h-[calc(100svh-4.6rem)] lg:items-center lg:pb-12 lg:pt-[clamp(64px,6.4vw,124px)]">
      <img src={leafA} alt="" aria-hidden="true" className="map-float pointer-events-none absolute left-[41%] top-[11%] w-12 max-lg:hidden" style={{ '--r': '-20deg' }} />
      <img src={leafC} alt="" aria-hidden="true" className="map-float pointer-events-none absolute right-[5%] top-[4%] w-12 max-lg:hidden" style={{ '--r': '24deg' }} />
      <div className="relative mx-auto w-full max-w-[1380px]">
        <header className="grid items-end gap-6 lg:grid-cols-[1.1fr_.9fr] lg:gap-14">
          <div>
            <p className="flex items-center gap-3 font-mono text-xs uppercase tracking-[0.3em] text-ink-2"><Leaf className="h-5 w-5 -rotate-12 text-leaf-text" />{t('beyond.eyebrow')}</p>
            <h2 className="mt-3 text-balance font-display text-[clamp(2.2rem,4vw,3.5rem)] leading-[1.04] text-ink">{t('beyond.title1')}<br /><em className="text-leaf-text">{t('beyond.titleEm')}</em></h2>
          </div>
          <p className="max-w-xl text-lg leading-relaxed text-ink-2 lg:pb-2">{t('beyond.intro')}</p>
        </header>

        <div className="mt-8 grid gap-5 lg:mt-7 lg:grid-cols-3 lg:gap-6">
          {/* weather risk */}
          <Card>
            <div className="flex items-center"><Head Icon={(p) => <Magnifier {...p} />}>{t('beyond.c1')}</Head><Tag t={t} /></div>
            <h3 className="mt-4 font-display text-2xl text-ink">{t('beyond.c1t')}</h3>
            <ol className="my-auto grid grid-cols-6 gap-1.5 py-5 sm:gap-2" aria-label={t('beyond.c1t')}>
              {RISK.map((lv, i) => {
                const s = STATE[lv];
                return (
                  <li key={i} className={`flex flex-col items-center gap-2 rounded-xl border-[1.5px] px-0.5 py-6 text-center lg:py-4 ${i < TODAY ? 'opacity-70' : ''} ${i === TODAY ? 'ring-2 ring-ink/70 ring-offset-1 ring-offset-transparent' : ''}`}
                    style={{ borderColor: s.c, background: s.tint, color: s.text }}>
                    <svg viewBox="0 0 16 16" className="h-6 w-6" style={{ color: s.c }} aria-hidden="true"><circle cx="8" cy="8" r="6.5" fill="none" stroke="currentColor" strokeWidth="1.6" />{GLYPH[s.g]}</svg>
                    <span className="text-xs font-medium leading-none">{i === TODAY ? t('risk.today') : day(i)}</span>
                    <span className="text-[11px] leading-none sm:text-xs">{t(`risk.level.${lv}`)}</span>
                  </li>
                );
              })}
            </ol>
            <ul className="mt-1 flex flex-wrap gap-x-4 gap-y-1.5 text-sm text-ink-2">
              {['low', 'medium', 'high'].map((lv) => (
                <li key={lv} className="flex items-center gap-1.5"><svg viewBox="0 0 16 16" className="h-4 w-4" style={{ color: STATE[lv].c }} aria-hidden="true"><circle cx="8" cy="8" r="6.5" fill="none" stroke="currentColor" strokeWidth="1.6" />{GLYPH[STATE[lv].g]}</svg>{t(`risk.level.${lv}`)}</li>
              ))}
            </ul>
            <p className="mt-auto pt-4 text-sm leading-snug text-ink-2">{t('beyond.c1n')}</p>
          </Card>

          {/* rain vs normal */}
          <Card>
            <div className="flex items-center"><Head Icon={(p) => <Calendar {...p} />}>{t('beyond.c2')}</Head><Tag t={t} /></div>
            <h3 className="mt-4 font-display text-2xl text-ink">{t('beyond.c2t')}</h3>
            <div className="mt-6 space-y-6">
              {[[t('beyond.c2normal'), 64, 70, false], [t('beyond.c2now'), 91, 100, true]].map(([name, mm, w, now]) => (
                <div key={name}>
                  <div className="flex items-baseline justify-between text-ink"><span className="text-sm">{name}</span><span className="font-display text-2xl tabular-nums">{mm}<small className="ml-1 font-body text-sm text-ink-2">mm</small></span></div>
                  <div className="mt-2 h-5 rounded-full bg-ink/10"><div className="h-full rounded-full" style={{ width: `${w}%`, background: now ? 'linear-gradient(90deg,#3d7f95,#0B5369)' : 'repeating-linear-gradient(135deg,#D2EDF4 0 6px,#bfe0ea 6px 12px)', boxShadow: now ? 'none' : 'inset 0 0 0 1.5px #0B5369' }} /></div>
                </div>
              ))}
            </div>
            <p className="mt-5 inline-flex w-fit items-center gap-2 rounded-full bg-[#D2EDF4] px-3.5 py-1.5 text-sm font-medium text-[#0B5369]"><svg viewBox="0 0 12 12" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M6 10V2M2.5 5.5 6 2l3.5 3.5" /></svg>+{Math.round(((91 - 64) / 64) * 100)}%</p>
            <p className="mt-auto pt-4 text-sm leading-snug text-ink-2">{t('beyond.c2n')}</p>
          </Card>

          {/* field from space */}
          <Card>
            <div className="flex items-center"><Head Icon={Leaf}>{t('beyond.c3')}</Head><Tag t={t} /></div>
            <h3 className="mt-4 font-display text-2xl text-ink">{t('beyond.c3t')}</h3>
            <svg viewBox="0 0 360 150" className="mt-3 w-full" role="img" aria-label={t('beyond.c3')}>
              <g stroke="#162F22" strokeOpacity=".16">{[0, 1, 2, 3].map((i) => <line key={i} x1="8" x2="352" y1={14 + i * 36} y2={14 + i * 36} />)}</g>
              {SERIES.map(({ k, c, d, y }) => <polyline key={k} fill="none" stroke={c} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" strokeDasharray={d} points={y.map((v, i) => `${8 + i * 31.3},${130 - v * 120}`).join(' ')} />)}
              <text x="8" y="146" fontSize="11" fill="#2F493B">{t('beyond.sowing')}</text>
              <text x="352" y="146" fontSize="11" textAnchor="end" fill="#2F493B">{t('beyond.harvest')}</text>
            </svg>
            <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-2">
              {SERIES.map(({ k, c, d }) => <li key={k} className="flex items-center gap-1.5"><svg width="24" height="8" aria-hidden="true"><line x1="0" x2="24" y1="4" y2="4" stroke={c} strokeWidth="3" strokeDasharray={d} /></svg>{k === 'REDSI' ? t('beyond.redsi') : k}</li>)}
            </ul>
            <p className="mt-auto pt-3 text-sm leading-snug text-ink-2">{t('beyond.c3n')}</p>
          </Card>
        </div>

        <p className="mt-6 flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-center text-sm text-ink-2 lg:mt-5">
          <span className="font-mono text-[11px] uppercase tracking-[0.2em]">{t('beyond.sources')}</span><span>{t('beyond.sourcesList')}</span>
        </p>
      </div>
    </section>
  );
};

export default Beyond;
