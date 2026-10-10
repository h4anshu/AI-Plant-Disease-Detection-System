import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Leaf, Sprig } from './heroIcons';
import { CountUp, d } from './motion';
import foliageTl from '../assets/how/foliage-tl.webp';
import foliageTr from '../assets/how/foliage-tr.webp';
import islands from '../assets/how/islands.webp';
import scanLeaf from '../assets/how/scan-leaf.webp';
import thumb from '../assets/hero/rust-thumb.webp';
import foliageBl from '../assets/how/foliage-bl.webp';

// Optional generated art: drop camera.webp / board.webp / log.webp (transparent) into assets/how and they replace the stand-ins below.
const found = import.meta.glob('../assets/how/*.{webp,png}', { eager: true, query: '?url', import: 'default' });
const art = (name) => Object.entries(found).find(([k]) => k.includes(`/${name}.`))?.[1];
const FLOATS = [  // [file, canvas x, y, width, rotation]
  ['leaf-a', 1066, 585, 100, 18], ['leaf-b', 548, 392, 112, -14], ['leaf-c', 1330, 322, 66, 24], ['leaf-d', 168, 470, 46, -20], ['leaf-e', 476, 500, 54, 10],
];
const floats = import.meta.glob('../assets/how/leaf-*.webp', { eager: true, query: '?url', import: 'default' });

const U = (n) => `calc(var(--u) * ${n})`;
const box = (x, y, w, h) => ({ left: U(x), top: U(y), ...(w && { width: U(w) }), ...(h && { height: U(h) }) });
const pos = (x, y, w) => ({ '--x': x, '--y': y, '--w': w });   // desktop placement of an element in the canvas (see .how-abs)
const fs = (px, min = 12) => ({ fontSize: `max(${min}px, ${U(px)})` });

const Badge = ({ n }) => (
  <span className="grid shrink-0 place-items-center bg-pine font-display text-parchment shadow-md" style={{ width: U(62), height: U(62), borderRadius: '50% 50% 50% 16%', ...fs(26, 16), minWidth: 38, minHeight: 38 }}>{n}</span>
);
const StepText = ({ n, t, style }) => (
  <div data-rv className="how-abs" style={{ ...style, ...d(0.15 * n) }}>
    <Badge n={`0${n}`} />
    <h3 className="mt-3 font-display leading-tight text-ink" style={fs(34, 20)}>{t(`how.s${n}t`)}</h3>
    <p className="mt-2 max-w-[22rem] leading-snug text-ink-2 lg:max-w-none" style={fs(19, 13)}>{t(`how.s${n}d`)}</p>
  </div>
);

const CameraArt = () => (   // stand-in until camera.webp exists
  <svg viewBox="0 0 200 160" className="h-full w-full drop-shadow-xl" aria-hidden="true">
    <rect x="8" y="34" width="184" height="112" rx="26" fill="#EFE7D2" /><rect x="8" y="34" width="184" height="112" rx="26" fill="url(#cg)" />
    <rect x="30" y="18" width="52" height="24" rx="8" fill="#D9CFB6" /><circle cx="100" cy="92" r="46" fill="#F6F0DE" /><circle cx="100" cy="92" r="36" fill="#1F4E8C" />
    <circle cx="100" cy="92" r="24" fill="#12335E" /><circle cx="90" cy="82" r="8" fill="#fff" opacity=".7" /><circle cx="168" cy="58" r="7" fill="#D9CFB6" />
    <defs><linearGradient id="cg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#fff" stopOpacity=".55" /><stop offset="1" stopColor="#000" stopOpacity=".08" /></linearGradient></defs>
  </svg>
);

const Ladybug = () => (
  <svg viewBox="0 0 24 24" className="h-full w-full" aria-hidden="true"><ellipse cx="12" cy="13" rx="8" ry="9" fill="#C8321E" /><path d="M12 4v18" stroke="#2a1410" strokeWidth="1.3" /><circle cx="12" cy="5" r="3.6" fill="#2a1410" />
    {[[8, 10], [16, 10], [8, 16], [16, 16]].map(([x, y]) => <circle key={x + y} cx={x} cy={y} r="1.5" fill="#2a1410" />)}</svg>
);

const HowItWorks = () => {
  const { t } = useTranslation();
  const bullets = ['b1', 'b2', 'b3'];
  const plan = ['plan1', 'plan2', 'plan3', 'plan4'];
  const boardImg = art('board'), cameraImg = art('camera'), logImg = art('log'), ladybugImg = art('ladybug');
  return (
    <section id="how" className="how-bg scroll-mt-[4.6rem] pb-16 pt-14 lg:flex lg:min-h-[calc(100svh-4.6rem)] lg:items-center lg:py-0">
      <Sprig className="pointer-events-none absolute -left-6 top-24 h-40 text-leaf/25 lg:hidden" />
      <div className="how-wrap w-full">
        <img src={foliageTl} alt="" aria-hidden="true" className="how-tl" />
        <img src={foliageTr} alt="" aria-hidden="true" className="how-tr" />
        <img src={foliageBl} alt="" aria-hidden="true" className="how-bl" />
        <img src={foliageBl} alt="" aria-hidden="true" className="how-br" />
        <div className="how-stage px-5 lg:px-0">
          {/* corner branches: bled past the section edge so their clipped sides never show */}

          {/* header */}
          <header className="relative z-20 text-center max-lg:pt-20 lg:absolute lg:inset-x-0 lg:top-[calc(var(--u)*40)]">
            <p data-rv="fade" className="inline-flex items-center gap-3 font-mono uppercase tracking-[0.34em] text-pine" style={fs(20, 12)}>
              <Leaf className="h-[1.1em] w-[1.1em] text-leaf" />{t('how.eyebrow')}<Leaf className="h-[1.1em] w-[1.1em] -scale-x-100 text-leaf" />
            </p>
            <div data-rv="t" className="mx-auto mt-3 flex items-center justify-center gap-2 text-leaf" style={{ width: U(380) }} aria-hidden="true">
              <i className="rv-grow h-px flex-1 bg-leaf/50" style={{ '--o': '100%' }} /><Leaf className="fl h-5 w-5" /><i className="rv-grow h-px flex-1 bg-leaf/50" />
            </div>
            <h2 className="mt-4 text-balance font-display leading-[1.04] text-ink" style={fs(72, 30)}>
              <span data-rv className="block" style={d(.1)}>{t('how.title1')}</span><span data-rv className="block" style={d(.22)}>{t('how.title2')} <em className="text-leaf-text">{t('how.titleEm')}</em></span>
            </h2>
            <p data-rv style={{ ...fs(22, 14), ...d(.35) }} className="mx-auto mt-4 max-w-2xl text-ink-2 lg:max-w-none lg:whitespace-nowrap">{t('how.sub')}</p>
          </header>

          {/* layers: islands + vines */}
          <img src={islands} alt="" aria-hidden="true" width="1670" height="570" className="pointer-events-none absolute max-lg:hidden" style={{ left: 0, top: U(430), width: U(1670) }} />

          {FLOATS.map(([f, x, y, w, r]) => (
            <img key={f} src={Object.entries(floats).find(([k]) => k.includes(`/${f}.`))?.[1]} alt="" aria-hidden="true" className="how-float pointer-events-none absolute z-10 max-lg:hidden"
              style={{ ...box(x, y, w), '--r': `${r}deg`, transform: `rotate(${r}deg)` }} />
          ))}

          <div className="relative z-20 mx-auto mt-10 flex flex-col gap-14 lg:mt-0 lg:block">
            {/* step 1 */}
            <div className="lg:contents">
              <StepText n={1} t={t} style={pos(232, 276, 330)} />
              <div data-rv="zoom" className="how-vis" style={{ '--bx': 20, '--by': 440, '--bw': 560, '--bh': 440, ...d(.2) }}>
                <img className="how-isl" src={islands} alt="" aria-hidden="true" loading="lazy" />
                <div className="rounded-[2.2em] border-white/0" style={{ ...box(185, 58, 280, 220), border: `${U(5)} solid transparent` }}>
                  {['tl', 'tr', 'bl', 'br'].map((c) => (
                    <i key={c} className="absolute border-white/90 [filter:drop-shadow(0_0_6px_rgba(255,255,255,.8))]" style={{
                      width: U(78), height: U(78), borderWidth: 0, borderStyle: 'solid', borderRadius: U(22),
                      ...(c[0] === 't' ? { top: 0, borderTopWidth: U(6) } : { bottom: 0, borderBottomWidth: U(6) }),
                      ...(c[1] === 'l' ? { left: 0, borderLeftWidth: U(6) } : { right: 0, borderRightWidth: U(6) }) }} />
                  ))}
                  <div className="absolute overflow-hidden shadow-xl" style={{ left: U(34), top: U(22), width: U(190), height: U(170), borderRadius: '10% 90% 10% 90%', transform: 'rotate(-14deg)' }}>
                    <img src={scanLeaf} alt="" className="h-full w-full scale-125 object-cover" /><span className="how-sweep" />
                  </div>
                </div>
                <div style={box(95, 160, 250, 202)}>{cameraImg ? <img src={cameraImg} alt="" className="h-full w-full object-contain" /> : <CameraArt />}</div>
              </div>
              <ul className="how-abs mx-auto mt-3 flex flex-wrap justify-center gap-x-5 gap-y-1 text-ink-2 lg:mt-0 lg:block lg:space-y-1" style={{ ...pos(150, 880, 400), ...fs(16, 13) }}>
                {bullets.map((b, i) => <li key={b} data-rv="left" style={d(.5 + i * .12)} className="flex items-center gap-2"><Leaf className="h-[1.1em] w-[1.1em] shrink-0 text-leaf-text" />{t(`how.${b}`)}</li>)}
              </ul>
            </div>

            {/* step 2 */}
            <div className="lg:contents">
              <StepText n={2} t={t} style={pos(748, 372, 390)} />
              <div data-rv="zoom" className="how-vis" style={{ '--bx': 560, '--by': 520, '--bw': 640, '--bwm': 470, '--bh': 380, ...d(.4) }}>
                <img className="how-isl" src={islands} alt="" aria-hidden="true" loading="lazy" />
                <span className="how-ring rounded-[50%] border-2 border-[#9fd48a]/70 shadow-[0_0_30px_rgba(150,210,120,.55)]" style={box(60, 175, 470, 130)} />
                <span className="how-ring rounded-[50%] border border-[#9fd48a]/60" style={{ ...box(30, 153, 530, 160), animationDelay: '-1.6s' }} />
                <article className="rounded-[1.6em] border border-white/80 bg-white/60 p-[1.2em] shadow-[0_24px_50px_-20px_rgba(25,61,43,.45)] backdrop-blur-md" style={{ ...box(110, 54, 350, 215), transform: 'rotate(-5deg)', ...fs(15, 11) }}>
                  <p className="flex items-center justify-between font-mono text-[max(11px,0.78em)] uppercase tracking-widest text-ink-2"><span className="flex items-center gap-2"><Leaf className="h-[1.3em] w-[1.3em] text-leaf-text" />{t('how.cardLabel')}</span><span>{t('how.example')}</span></p>
                  <div className="mt-[0.7em] flex items-end justify-between gap-3">
                    <h4 className="font-display text-[1.75em] italic leading-tight text-ink max-lg:text-[1.4em]">{t('how.cardDisease')}</h4>
                    <span className="shrink-0 rounded-2xl bg-sage-wash px-[0.7em] py-[0.3em] text-center font-display text-[1.5em] text-leaf-text"><CountUp to={92} suffix="%" delay={.9} /><small className="block font-body text-[max(11px,0.45em)] not-italic text-ink-2">{t('how.cardConf')}</small></span>
                  </div>
                  <div className="mt-[0.8em] flex items-center gap-3">
                    <img src={thumb} alt="" className="h-[4.4em] w-[6.4em] rounded-xl object-cover" />
                    <span className="inline-flex items-center gap-2 rounded-full bg-parchment px-[0.9em] py-[0.45em] shadow"><Leaf className="h-[1.2em] w-[1.2em] text-rust" />{t('how.cardCrop')}</span>
                  </div>
                </article>
              </div>
            </div>

            {/* step 3 */}
            <div className="lg:contents">
              <StepText n={3} t={t} style={pos(1198, 290, 340)} />
              <div data-rv="zoom" className="how-vis" style={{ '--bx': 1110, '--by': 440, '--bw': 560, '--bh': 440, ...d(.6) }}>
                <img className="how-isl" src={islands} alt="" aria-hidden="true" loading="lazy" />
                <div style={boardImg ? box(30, 52, 390, 270) : { ...box(65, 62, 300, 220), transform: 'rotate(-7deg)' }}>
                  {boardImg ? <img src={boardImg} alt="" className="absolute inset-0 h-full w-full object-contain" /> : (
                    <div className="absolute inset-0 rounded-[1.6em] bg-gradient-to-br from-[#B88A55] to-[#7E5B34] shadow-[0_24px_40px_-16px_rgba(60,40,15,.55)]" style={{ padding: U(12) }}>
                      <div className="h-full w-full rounded-[1.1em] bg-[#F1E7CD] shadow-inner" />
                    </div>
                  )}
                  <ul className="absolute flex flex-col justify-between text-ink" style={{ ...(boardImg ? { ...box(80, 74, 258, 132), transform: 'rotate(-6.5deg)' } : box(30, 26, 245, 170)), ...fs(boardImg ? 16 : 17, 11) }}>
                    {plan.map((p, i) => (
                      <li key={p} data-rv="left" style={d(1 + i * .18)} className="flex items-center gap-[0.6em] leading-tight">
                        <span className="grid h-[1.9em] w-[1.9em] shrink-0 place-items-center rounded-full border border-pine/60 bg-parchment/80 text-pine"><Leaf className="h-[1.1em] w-[1.1em]" /></span>{t(`how.${p}`)}
                      </li>
                    ))}
                  </ul>
                </div>
                <span style={{ ...box(470, 52, 34, 30), transform: 'rotate(-24deg)' }}>{ladybugImg ? <img src={ladybugImg} alt="" className="h-full w-full object-contain" /> : <Ladybug />}</span>
              </div>
            </div>

            {/* call to action, on the middle island */}
            <div data-rv="zoom" className="how-abs flex justify-center max-lg:relative" style={{ ...pos(655, 822, 370), ...d(.2) }}>
              {logImg && <img src={logImg} alt="" aria-hidden="true" className="pointer-events-none absolute max-lg:hidden" style={{ left: '-18%', top: U(30), width: '136%' }} />}
              <Link to="/predict" className="relative z-10 inline-flex w-full items-center justify-between gap-3 rounded-full border-[3px] border-leaf bg-pine pl-8 pr-2 text-parchment shadow-[0_18px_30px_-12px_rgba(7,38,24,.6)] cta-lift hover:bg-pine-hover focus-visible:outline-3 focus-visible:outline-offset-3 focus-visible:outline-ink max-lg:max-w-sm max-lg:py-2" style={{ ...fs(27, 17), height: 'max(46px, ' + U(70) + ')' }}>
                <span className="whitespace-nowrap font-display">{t('how.cta')}</span>
                <span className="nudge grid place-items-center rounded-full bg-parchment text-pine" style={{ width: 'max(36px, ' + U(54) + ')', height: 'max(36px, ' + U(54) + ')' }}><svg viewBox="0 0 24 24" className="h-1/2 w-1/2" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m9 6 6 6-6 6" /></svg></span>
              </Link>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

export default HowItWorks;
