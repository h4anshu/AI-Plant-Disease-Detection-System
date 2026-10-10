import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { CountUp, d } from './motion';
import { ArrowUpRight, Camera, Leaf, LeafCircle, LeafSketch, SprayLeaf, Sprig } from './heroIcons';
import plant560 from '../assets/hero/plant-560.webp';
import plant840 from '../assets/hero/plant-840.webp';
import rustThumb from '../assets/hero/rust-thumb.webp';

// Everything inside the stage is placed in canvas units (1100 x 820): see the hero block in index.css
const U = (n) => `calc(var(--u) * ${n})`;
// x moves with --sx (0 on laptops, 200 on wide screens); decor on the left moves only part of the way so it spreads into the extra width
const at = (x, y, w, h, k = 1) => ({ left: `calc(var(--u) * (${x} + var(--sx) * ${k}))`, top: U(y), ...(w && { width: U(w) }), ...(h && { height: U(h) }) });
// left decor drifts toward the text on very wide screens, so the gap between the two columns stays filled
const atL = (x, y, w, h) => ({ ...at(x, y, w, h, 0), left: `calc(var(--u) * ${x} - max(0px, (100vw - 1500px) * .35))` });
const desktopOnly = 'max-lg:hidden';

const ResultCard = ({ t }) => (
  <article className="hero-card rounded-2xl border border-ink/10 bg-parchment p-[1.1em] shadow-[0_18px_40px_-18px_rgba(22,47,34,.35)]"
    style={{ '--x': 760, '--y': 20, '--w': 340 }}>
    <p className="flex justify-between font-mono text-[max(11px,0.75em)] uppercase tracking-[0.2em] text-ink-2"><span>{t('home.exampleLabel')}</span><span>{t('home.exampleTag')}</span></p>
    <div className="mt-[0.8em] flex gap-[1em]">
      <div className="min-w-0 flex-1">
        <p className="font-display text-[1.4em] leading-tight text-ink">{t('home.exampleTitle')}</p>
        <span className="mt-[0.6em] inline-block rounded-full bg-rust-deep px-[0.9em] py-[0.25em] font-mono text-[max(11px,0.78em)] uppercase tracking-[0.18em] text-parchment">{t('home.exampleStamp')}</span>
        <div className="mt-[0.9em] flex items-center gap-[0.7em]">
          <span className="grid h-[3.4em] w-[3.4em] place-items-center rounded-full border-[3px] border-pine font-display text-[1.05em] text-ink" style={{ borderTopColor: 'var(--color-rust)' }}><CountUp to={87} suffix="%" delay={1.1} /></span>
          <span className="text-ink-2">{t('home.exampleSureWord')}</span>
        </div>
      </div>
      <img src={rustThumb} alt="" width="300" height="400" className="h-[7.6em] w-[5.6em] shrink-0 rounded-xl object-cover" />
    </div>
  </article>
);

const PlanCard = ({ t }) => (
  <article className="hero-card rounded-2xl bg-pine p-[1.1em] text-parchment shadow-[0_18px_40px_-18px_rgba(7,38,24,.6)]" style={{ '--x': 780, '--y': 490, '--w': 320 }}>
    <p className="border-b border-parchment/20 pb-[0.6em] font-mono text-[max(11px,0.75em)] uppercase tracking-[0.2em] text-parchment/85">{t('home.planTitle')}</p>
    <div className="mt-[0.9em] flex items-center gap-[0.9em]">
      <SprayLeaf className="h-[3.6em] w-[2.7em] shrink-0 text-parchment max-[1499px]:hidden" />
      <ol className="grid flex-1 grid-cols-3 gap-[0.2em] text-center">
        {['plan1', 'plan2', 'plan3'].map((k, i) => (
          <li key={k} className="relative flex flex-col items-center gap-[0.45em]">
            <span className="grid h-[2.1em] w-[2.1em] place-items-center rounded-full bg-parchment font-display text-[1em] text-pine">{i + 1}</span>
            <span className="text-[0.92em] leading-tight">{t(`home.${k}`)}</span>
            {i < 2 && <span aria-hidden="true" className="absolute -right-[0.55em] top-[0.35em] text-parchment/60">→</span>}
          </li>
        ))}
      </ol>
    </div>
  </article>
);

const plus = (x, y) => `M${x - 7} ${y}H${x + 7}M${x} ${y - 7}V${y + 7}`;

const Hero = () => {
  const { t } = useTranslation();
  return (
    <div className="hero-bg">
      <Sprig className="pointer-events-none absolute bottom-[3rem] left-0 hidden h-[min(34svh,300px)] -translate-x-[55%] text-leaf/20 lg:block" />
      <section className="relative mx-auto flex w-full max-w-[2000px] flex-col px-[clamp(1.25rem,4.2vw,5.5rem)] lg:min-h-[calc(100svh-8.25rem)]">
        <div className="grid items-center gap-8 pb-8 pt-10 lg:flex-1 lg:grid-cols-[minmax(0,.9fr)_minmax(0,1.1fr)] lg:gap-2 lg:py-4">
          <div>
            <span data-rv="fade" className="hero-eyebrow inline-block font-mono text-xs uppercase tracking-[0.22em] text-rust-deep">{t('home.eyebrow')}</span>
            <h1 className="mt-4 font-display text-[clamp(2.7rem,9vw,4.4rem)] leading-[1] tracking-[-0.01em] text-ink lg:text-[clamp(2.6rem,min(5.6vw,9.4svh),6.4rem)]">
              <span data-rv className="block" style={d(.1)}>{t('home.title1')}</span><span data-rv className="block" style={d(.24)}>{t('home.title2')}</span><em data-rv className="block text-leaf-text" style={d(.4)}>{t('home.titleEm')}</em>
            </h1>
            <p data-rv style={d(.6)} className="mt-5 max-w-md text-lg leading-relaxed text-ink-2 lg:mt-[min(1.5rem,2.6svh)] lg:max-w-xl lg:text-[clamp(1.15rem,1.45vw,1.5rem)]">{t('home.intro')}</p>
            <div data-rv style={d(.75)} className="mt-7 flex flex-col items-start gap-5 lg:mt-[min(2rem,3.4svh)] lg:gap-[min(1.25rem,2.2svh)]">
              {/* ponytail: login temporarily disabled, always send to /predict. Restore the ternary once login is back on. */}
              <Link to="/predict" className="inline-flex w-full items-center justify-center gap-4 rounded-md bg-pine px-9 py-4 font-mono text-sm uppercase lg:px-11 lg:py-5 lg:text-base tracking-[0.2em] text-parchment cta-lift hover:bg-pine-hover focus-visible:outline-3 focus-visible:outline-offset-3 focus-visible:outline-ink sm:w-auto">
                <Camera className="h-6 w-6" />{t('home.cta')}<ArrowUpRight className="h-4 w-4" />
              </Link>
              <a href="#how" className="border-b border-ink/40 py-2 text-lg text-ink hover:border-ink">{t('home.howLink')} →</a>
              <p className="flex items-center gap-3 text-sm text-ink-2">
                <span className="grid h-10 w-10 place-items-center rounded-full border border-rust/40 text-leaf-text"><Leaf className="h-5 w-5" /></span>
                {t('home.trust')}
              </p>
            </div>
          </div>

          <div className="hero-wrap lg:ml-auto lg:w-full lg:max-w-[max(760px,calc((100svh-11rem)*1.341))]">
            <div className="hero-stage" aria-hidden="true">
              <div className="hero-art">
                <span data-rv="zoom" className="hero-ring" />
                <span className="hero-frame"><i /><i /><i /><i /><b className="hero-scan" /></span>

                <svg data-rv="fade" className={desktopOnly} style={{ ...at(0, 0, 1100, 820), ...d(.8) }} viewBox="0 0 1100 820" fill="none" stroke="var(--color-leaf)" strokeWidth="1.3" opacity=".75">
                  <path d="M792 232 770 380" />
                  <path d={`${plus(420, 70)}${plus(860, 120)}${plus(330, 600)}`} opacity=".7" />
                  <path d="M170 334H246M170 328v12M208 296v76M202 296h12M202 372h12" opacity=".7" />
                  <path d="M860 752h235" opacity=".6" />
                </svg>

                <img className="hero-img" src={plant560} srcSet={`${plant560} 560w, ${plant840} 840w`} sizes="(min-width:1024px) 520px, 90vw"
                  width="560" height="700" alt="" fetchPriority="high" />
                <span className="hero-dot rounded-full bg-rust" style={at(763, 373, 14, 14)} />

                {/* scan badge: ring-leaf over a pill */}
                <span className="fl grid place-items-center rounded-full border border-leaf/50 bg-parchment/70 text-leaf-text" style={{ ...at(262, 8, 118, 118), '--fd': '7s' }}><LeafCircle className="h-[78%] w-[78%]" /></span>
                <span className="hero-label fl inline-flex items-center justify-center whitespace-nowrap rounded-2xl border border-leaf/30 bg-parchment px-[1em] shadow-sm" style={{ ...at(236, 98, 0, 52), width: 'auto', minWidth: U(170), '--fd': '5s', '--fdl': '-1.5s' }}>{t('home.scanActive')}</span>

                {/* left: leaf anatomy sketch, species label */}
                <span data-rv="zoom" className={`rounded-full border border-dashed border-leaf/50 ${desktopOnly}`} style={{ ...atL(26, 262, 150, 210), ...d(.5) }} />
                <LeafSketch data-rv="zoom" className={`text-leaf ${desktopOnly}`} style={{ ...atL(47, 280, 106, 160), ...d(.7) }} />
                <span data-rv="fade" className={`hero-label ${desktopOnly}`} style={{ ...atL(26, 492), ...d(.9) }}>{t('home.anatomy')}</span>
                <span data-rv="fade" className={`hero-label ${desktopOnly}`} style={{ ...atL(46, 606), ...d(1) }}>{t('home.wheat')}<br /><i className="normal-case tracking-normal">Triticum aestivum</i><br /><span className="text-leaf">— — —</span></span>

                <span data-rv="fade" className={`border-l border-leaf/60 ${desktopOnly}`} style={{ ...atL(26, 602, 0, 78), ...d(1) }} />
                {/* right: faint leaf badge and the tagline */}
                <LeafCircle className={`fl text-leaf opacity-40 ${desktopOnly}`} style={{ ...at(912, 292, 96, 96), '--fd': '8s', '--fdl': '-3s' }} />
                <span data-rv="fade" className={`hero-label flex items-center gap-3 ${desktopOnly}`} style={{ ...at(860, 696, 235), ...d(1.1) }}><Leaf className="h-[1.9em] w-[1.9em] text-leaf" />{t('home.tagline')}</span>
              </div>
            </div>
            <div className="hero-cards"><ResultCard t={t} /><PlanCard t={t} /></div>
          </div>
        </div>

      </section>
    </div>
  );
};

export default Hero;
