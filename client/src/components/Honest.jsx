import { useTranslation } from 'react-i18next';
import { Bars, Camera, Leaf, Sprig } from './heroIcons';
import { ACCURACY } from '../data/accuracy';
import { cropName } from '../locales/terms';
import { CountUp, d } from './motion';
import leafA from '../assets/how/leaf-a.webp';
import leafB from '../assets/how/leaf-b.webp';

// Generated art (transparent webp) in assets/honest/: scan, board and soil are used; crop-<crop>.webp and badge-camera|leaf|bars.webp
// are picked up automatically when they exist (no code change).
const found = import.meta.glob('../assets/honest/*.webp', { eager: true, query: '?url', import: 'default' });
const art = (name) => Object.entries(found).find(([k]) => k.endsWith(`/${name}.webp`))?.[1];

// Desktop sizes are canvas units (1900 x 941, see .hon-wrap in index.css); the second number is the phone size in px.
const U = (n) => `calc(var(--u) * ${n})`;
const fs = (n, min) => ({ fontSize: `max(${min}px, ${U(n)})` });
const pos = (x, y, w, h) => ({ '--x': x, '--y': y, '--w': w, '--h': h });
const AXIS = [70, 80, 90, 100];
const at = (v) => `${((v * 100 - 70) / 30) * 100}%`;   // 70% to 100% across the range lane

const Point = ({ Icon, badge, title, text, i }) => (
  <li data-rv="left" style={d(.25 + i * .15)} className="flex items-center gap-4 max-lg:py-3 lg:gap-[calc(var(--u)*16)] lg:py-[calc(var(--u)*22)]">
    {badge
      ? <img src={badge} alt="" className="h-14 w-14 shrink-0 object-contain lg:h-[calc(var(--u)*62)] lg:w-[calc(var(--u)*62)]" />
      : <span className="grid h-14 w-14 shrink-0 place-items-center rounded-full bg-pine text-parchment lg:h-[calc(var(--u)*64)] lg:w-[calc(var(--u)*64)]"><Icon className="h-6 w-6 lg:h-[45%] lg:w-[45%]" /></span>}
    <div>
      <h3 className="font-display leading-tight text-ink" style={fs(28, 20)}>{title}</h3>
      <p className="mt-0.5 leading-snug text-ink-2" style={fs(19, 14)}>{text}</p>
    </div>
  </li>
);

const Row = ({ r, i, weakest, t, lang }) => {
  const icon = art(`crop-${r.crop}`);
  const dl = 0.35 + i * 0.09;   // rows cascade; the bar, its range and the dot follow the row, and the numbers count up with it
  return (
    <div role="row" data-rv="left" style={d(dl)} className="hon-row grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-1 border-t border-ink/10 py-2.5">
      <span role="cell" className="flex items-center gap-2 font-display" style={fs(23, 18)}>
        {icon ? <img src={icon} alt="" className="shrink-0 object-contain" style={{ width: U(38), height: U(38), minWidth: 26 }} /> : <Leaf className="h-[0.7em] w-[0.7em] shrink-0 text-leaf-text/70" />}
        <span className="whitespace-nowrap">{cropName(r.crop, lang)}{r.cv ? <sup className="text-ink-2">*</sup> : null}
          {weakest && <em className="ml-1.5 font-body text-[max(11px,0.58em)] not-italic text-rust-deep">· {t('honest.weakest')}</em>}</span>
      </span>
      <span role="cell" className={`text-right font-semibold tabular-nums lg:text-left ${weakest ? 'text-rust-deep' : 'text-ink'}`} style={fs(22, 17)}><CountUp to={r.acc * 100} dec={2} suffix="%" delay={dl + 0.3} /></span>
      <span role="cell" className="tabular-nums text-ink-2 max-lg:col-span-2" style={fs(18, 13)}>[<CountUp to={r.lo * 100} dec={1} delay={dl + 0.3} />–<CountUp to={r.hi * 100} dec={1} delay={dl + 0.3} />]</span>
      <span role="cell" aria-hidden="true" className="hon-whisk h-4 max-lg:col-span-2 lg:h-full">
        {/* track, filled bar from 70% to the accuracy, the 95% interval as a dark range with end caps, and the accuracy dot */}
        <i className="inset-x-0 top-1/2 -translate-y-1/2 rounded-full bg-ink/[0.14]" style={{ height: 'max(9px, ' + U(11) + ')' }} />
        {AXIS.map((a) => <i key={a} className="inset-y-[14%] w-px bg-ink/25" style={{ left: at(a / 100) }} />)}
        <i className={`rv-grow top-1/2 -translate-y-1/2 rounded-full ${weakest ? 'bg-gradient-to-r from-[#c8794a] to-rust-deep' : 'bg-gradient-to-r from-leaf to-pine'}`} style={{ left: 0, width: at(r.acc), height: 'max(9px, ' + U(11) + ')' }} />
        <i className="rv-fade top-1/2 -translate-y-1/2 rounded-sm bg-ink" style={{ '--pd': '1.1s', left: at(r.lo), width: `calc(${at(r.hi)} - ${at(r.lo)})`, minWidth: 5, height: 'max(4px, ' + U(5) + ')' }} />
        {[r.lo, r.hi].map((v) => <i key={v} className="rv-fade inset-y-[16%] w-[3px] -translate-x-1/2 rounded bg-ink" style={{ '--pd': '1.1s', left: at(v) }} />)}
        <i className="rv-pop top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-parchment bg-butter shadow-[0_0_0_2px_var(--color-ink)]" style={{ '--pd': '1.45s', left: at(r.acc), width: 'max(14px, ' + U(16) + ')', height: 'max(14px, ' + U(16) + ')' }} />
      </span>
    </div>
  );
};

const Honest = () => {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const weakest = ACCURACY.reduce((a, b) => (b.acc < a.acc ? b : a)).crop;
  const scan = art('scan'), board = art('board'), soil = art('soil');
  return (
    <section id="honest" className="hon-bg scroll-mt-[4.6rem] px-5 py-14 sm:px-8 lg:py-0">
      <div className="hon-wrap">
        <div className="hon-stage mx-auto flex max-w-[1240px] flex-col gap-10 lg:max-w-none lg:block">
          <header className="hon-abs auto-h max-lg:order-1" style={pos(70, 44, 1040)}>
            <p data-rv="fade" className="flex items-center gap-3 font-mono uppercase tracking-[0.3em] text-rust-deep" style={fs(16, 12)}><Leaf className="h-[1.2em] w-[1.2em]" />{t('honest.eyebrow')}</p>
            <h2 className="mt-[0.3em] text-balance font-display leading-[1.04] text-ink" style={fs(68, 40)}>
              <span data-rv className="block" style={d(.1)}>{t('honest.title1')}</span><span data-rv className="block" style={d(.22)}>{t('honest.title2')} <em className="text-leaf-text">{t('honest.titleEm')}</em></span>
            </h2>
            <p data-rv style={{ ...fs(21, 16), ...d(.35) }} className="mt-[0.45em] max-w-[56rem] leading-relaxed text-ink-2 lg:max-w-[calc(var(--u)*580)]">{t('honest.intro')}</p>
          </header>

          <ul className="hon-abs auto-h max-lg:order-3 divide-y divide-ink/12 border-y border-ink/12 max-lg:py-2" style={pos(70, 380, 580)}>
            <Point i={0} Icon={Camera} badge={art('badge-camera')} title={t('honest.p1t')} text={t('honest.p1d')} />
            <Point i={1} Icon={Leaf} badge={art('badge-leaf')} title={t('honest.p2t')} text={t('honest.p2d')} />
            <Point i={2} Icon={Bars} badge={art('badge-bars')} title={t('honest.p3t')} text={t('honest.p3d')} />
          </ul>

          <div data-rv="zoom" className={`z-10 max-lg:order-4 hon-abs hon-paper hon-board rounded-3xl p-5 shadow-[0_24px_50px_-24px_rgba(25,61,43,.5)] ring-1 ring-pine/15 lg:p-0 ${board ? 'has-art' : ''}`} style={{ ...pos(690, 214, 1150, 575), ...d(.15), ...(board ? { '--board': `url(${board})` } : null) }}>
            <div role="table" aria-label={t('honest.tableTitle')} className="hon-inner">
              <div role="row" className="hidden items-end font-mono uppercase tracking-[0.1em] text-ink-2 lg:grid lg:grid-cols-[calc(var(--u)*290)_calc(var(--u)*274)_minmax(0,1fr)] lg:gap-x-[calc(var(--u)*14)]" style={{ ...fs(12.5, 11), height: U(26) }}>
                <span role="columnheader">{t('honest.colCrop')}</span>
                <span role="columnheader">{t('honest.colAcc')}</span>
                <span role="columnheader" className="relative block h-full" aria-label={t('honest.axis')}>
                  {AXIS.map((a) => <b key={a} className="absolute bottom-[2px] -translate-x-1/2 font-normal tabular-nums" style={{ left: at(a / 100) }}>{a}%</b>)}
                </span>
              </div>
              <div role="rowgroup">
                {ACCURACY.map((r, i) => <Row key={r.crop} r={r} i={i} weakest={r.crop === weakest} t={t} lang={lang} />)}
              </div>
              <p className="pt-2 leading-snug text-ink-2" style={fs(13, 12)}>{t('honest.note')}</p>
            </div>
          </div>

          {scan && <img src={scan} alt="" aria-hidden="true" className="hon-abs auto-h fl z-20 mx-auto w-full max-w-xs max-lg:order-2 lg:max-w-none" style={pos(1488, 36, 300)} />}

          {/* micro decor in the free corner: soil with sprouts, a sprig, two single leaves */}
          {soil && <img src={soil} alt="" aria-hidden="true" className="hon-abs auto-h px pointer-events-none max-lg:hidden" style={{ ...pos(650, 708, 1250), '--px': '12px' }} />}
          <span className="hon-abs auto-h px pointer-events-none block text-leaf/35 max-lg:hidden" style={{ ...pos(110, 800, 78), '--px': '30px' }}><Sprig className="h-auto w-full" /></span>
          <img src={leafA} alt="" aria-hidden="true" className="hon-abs auto-h fl pointer-events-none rotate-[18deg] max-lg:hidden" style={pos(1230, 90, 84)} />
          <img src={leafB} alt="" aria-hidden="true" className="hon-abs auto-h fl pointer-events-none -rotate-[14deg] max-lg:hidden" style={pos(330, 815, 72)} />
        </div>
      </div>
    </section>
  );
};

export default Honest;
