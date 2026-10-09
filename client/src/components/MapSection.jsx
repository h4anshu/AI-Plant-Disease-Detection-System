import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowUpRight, Calendar, Leaf } from './heroIcons';
import terms from '../locales/terms.json';
import { cropName, diseaseName } from '../locales/terms';
import { BINS, binLabel } from '../pages/mapStyle';
import diorama from '../assets/map/diorama.webp';
import lens from '../assets/map/lens.webp';
import badge from '../assets/map/privacy-badge.webp';
import soil from '../assets/honest/soil.webp';
import potato from '../assets/honest/crop-potato.webp';
import leafA from '../assets/how/leaf-a.webp';
import leafC from '../assets/how/leaf-c.webp';
import leafE from '../assets/how/leaf-e.webp';

// Desktop: everything sits on a 1900 x 941 unit canvas (see .map-wrap in index.css). The picture group (.map-vis) has its own 940 x 720 space.
const U = (n) => `calc(var(--u) * ${n})`;
const fs = (n, min) => ({ fontSize: `max(${min}px, ${U(n)})` });
const pos = (x, y, w) => ({ '--x': x, '--y': y, '--w': w });
const at = (x, y, w, h) => ({ left: U(x), top: U(y), width: U(w), ...(h && { height: U(h) }) });
const CROPS = Object.keys(terms.crops);
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);   // English crop and disease names are stored lower-case; Hindi has no case
const DAYS = [7, 30, 90];
const EXAMPLE = { crop: 'potato', disease: 'Early_blight', reports: 12 };

// Optional generated art: drop a transparent, tinted-glass hexagon cluster into assets/map/hex-clear.webp and it replaces the drawn one below.
const found = import.meta.glob('../assets/map/hex-clear.webp', { eager: true, query: '?url', import: 'default' });
const hexClear = Object.values(found)[0];

// 14 honeycomb cells (flat-top, axial columns -2..2). Exactly 7 are filled, one per bin shade, so the picture never shows more areas than a real filter would.
const HEX_R = 50, HEX_H = Math.sqrt(3) * HEX_R;
const HEX = [[-2, 0, 'e'], [-2, 1, 'e'], [-1, -1, 'b'], [-1, 0, 'r'], [-1, 1, 'e'], [0, -1, 'o'], [0, 0, 'R'], [0, 1, 'r'], [1, -1, 'e'], [1, 0, 'o'], [1, 1, 'e'], [2, -1, 'e'], [2, 0, 'b'], [2, 1, 'e']];
const HEX_COLOR = { b: BINS[0].color, o: BINS[1].color, r: BINS[2].color, R: BINS[3].color };
const hexPts = (r) => [0, 1, 2, 3, 4, 5].map((k) => `${(r * Math.cos((Math.PI / 3) * k)).toFixed(1)},${(r * Math.sin((Math.PI / 3) * k)).toFixed(1)}`).join(' ');

// The drawn cluster: see-through tiles lying flat on the land (squashed and turned to the slab's angle), so the fields stay visible.
const HexLayer = ({ style }) => (
  <svg viewBox="-205 -140 410 280" style={style} fill="none" aria-hidden="true" className="pointer-events-none overflow-visible [filter:drop-shadow(0_10px_10px_rgba(60,30,10,.22))]">
    <defs>
      <linearGradient id="hexsheen" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#fff" stopOpacity=".5" /><stop offset="1" stopColor="#fff" stopOpacity="0" /></linearGradient>
    </defs>
    <g transform="rotate(-8) scale(1 .66)">
      {HEX.map(([c, r, k]) => {
        const x = 1.5 * HEX_R * c, y = HEX_H * (r + (Math.abs(c) % 2 ? 0.5 : 0)), col = HEX_COLOR[k];
        return (
          <g key={`${c}${r}`} transform={`translate(${x} ${y - (k === 'R' ? 9 : 0)})`}>
            {k === 'R' && <polygon points={hexPts(HEX_R * 0.93)} transform="translate(0 9)" fill={col} fillOpacity=".55" />}
            <polygon points={hexPts(HEX_R * 0.93)} fill={col || '#fff'} fillOpacity={col ? (k === 'R' ? 0.62 : 0.55) : 0.07} stroke="#fff" strokeOpacity={col ? 0.85 : 0.8} strokeWidth="2.2" strokeLinejoin="round" />
            <polygon points={hexPts(HEX_R * 0.93)} fill="url(#hexsheen)" opacity=".55" />
          </g>
        );
      })}
    </g>
  </svg>
);

// One header style for every floating panel
const PanelHead = ({ Icon, children }) => (
  <p className="flex items-center gap-2.5 font-mono uppercase tracking-[0.1em] text-ink-2" style={fs(14, 11)}>
    <span className="grid shrink-0 place-items-center rounded-full bg-pine text-parchment" style={{ width: U(30), height: U(30), minWidth: 20, minHeight: 20 }}><Icon style={{ width: '58%', height: '58%' }} /></span>{children}
  </p>
);

const Dd = ({ children, icon }) => (   // a drop-down drawn as part of the illustration
  <span className="flex items-center gap-2 rounded-full border border-ink/10 bg-white/70 px-[0.9em] py-[0.5em] text-ink" style={fs(19, 13)}>
    {icon}<span className="flex-1">{children}</span>
    <svg viewBox="0 0 12 8" className="h-[0.5em] w-[0.7em] shrink-0" aria-hidden="true"><path d="m1 1 5 5 5-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>
  </span>
);

const Feature = ({ Icon, children }) => (
  <li className="flex items-center gap-4 lg:gap-[calc(var(--u)*20)]">
    <span className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-pine text-parchment shadow-md lg:h-[calc(var(--u)*66)] lg:w-[calc(var(--u)*66)]"><Icon className="h-[46%] w-[46%]" /></span>
    <span className="leading-snug text-ink" style={fs(22, 16)}>{children}</span>
  </li>
);


// Canvas coordinates (1900 x 941). Targets are tiles of the hexagon cluster: upper-right butter (filters), right ochre (legend),
// and the slab's front-right edge (privacy: the whole map shows counts, never points).
const CORDS = [
  { d: 'M1230 262 C1230 360 1170 430 1136 500', from: [1230, 262], to: [1136, 500], dot: true },
  { d: 'M1590 198 C1500 220 1400 370 1288 494', from: [1590, 198], to: [1288, 494] },
  { d: 'M1590 480 C1500 500 1340 540 1226 540', from: [1590, 480], to: [1226, 540] },
  { d: 'M1590 679 C1540 700 1500 698 1448 690', from: [1590, 679], to: [1448, 690] },
];

const MapSection = () => {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const crn = (c) => cap(cropName(c, lang));
  const din = (c, d) => cap(diseaseName(c, d, lang));
  const [crop, setCrop] = useState('potato');
  const [days, setDays] = useState(30);
  const sel = 'map-select w-full rounded-full border border-ink/20 py-2.5 pl-5 pr-10 text-ink shadow-sm focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-pine';

  return (
    <section id="map" className="map-bg scroll-mt-[4.6rem] px-5 pb-0 pt-16 sm:px-8 lg:pt-0">
      <div className="map-wrap">
        <div className="map-stage mx-auto flex max-w-[1240px] flex-col gap-10 lg:block lg:max-w-none">

          {/* left column: text, features, the two real selects and the button */}
          <div className="map-abs relative z-20" style={pos(96, 70, 640)}>
            <p className="flex items-center gap-3 font-mono uppercase tracking-[0.3em] text-ink-2" style={fs(17, 12)}><Leaf className="h-[1.3em] w-[1.3em] -rotate-12 text-leaf-text" />{t('mapsec.eyebrow')}</p>
            <h2 className="mt-[0.3em] text-balance font-display leading-[1.02] text-ink" style={fs(76, 40)}>
              {t('mapsec.title1')}<br /><em className="text-leaf-text">{t('mapsec.titleEm')}</em>
            </h2>
            <p className="mt-[0.5em] max-w-[34rem] leading-relaxed text-ink-2 lg:max-w-[calc(var(--u)*560)]" style={fs(22, 16)}>{t('mapsec.intro')}</p>
            <ul className="mt-6 space-y-3.5 lg:mt-[calc(var(--u)*28)] lg:space-y-[calc(var(--u)*16)]">
              <Feature Icon={(p) => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" aria-hidden="true" {...p}><path d="M12 2.8 20 7.4v9.2l-8 4.6-8-4.6V7.4z" /></svg>}>{t('mapsec.f1')}</Feature>
              <Feature Icon={(p) => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...p}><path d="M12 3 5 6v5.5c0 4.2 3 7.6 7 9 4-1.4 7-4.8 7-9V6z" /><rect x="9.3" y="10.5" width="5.4" height="4.4" rx="1" /><path d="M10.4 10.5V9a1.6 1.6 0 0 1 3.2 0v1.5" /></svg>}>{t('mapsec.f2')}</Feature>
              <Feature Icon={Calendar}>{t('mapsec.f3')}</Feature>
            </ul>
            <div className="mt-7 flex flex-wrap gap-3 lg:mt-[calc(var(--u)*28)]">
              <label className="min-w-[10rem] flex-1 lg:max-w-[calc(var(--u)*250)]"><span className="sr-only">{t('mapsec.cropSel')}</span>
                <select value={crop} onChange={(e) => setCrop(e.target.value)} className={sel} style={fs(21, 15)}>
                  {CROPS.map((c) => <option key={c} value={c}>{t('mapsec.cropSel')}: {crn(c)}</option>)}
                </select></label>
              <label className="min-w-[10rem] flex-1 lg:max-w-[calc(var(--u)*230)]"><span className="sr-only">{t('mapsec.daysSel')}</span>
                <select value={days} onChange={(e) => setDays(Number(e.target.value))} className={sel} style={fs(21, 15)}>
                  {DAYS.map((d) => <option key={d} value={d}>{t(`map.days${d}`)}</option>)}
                </select></label>
            </div>
            <Link to={`/map?crop=${crop}&days=${days}`} className="mt-6 inline-flex items-center gap-4 rounded-full bg-pine px-9 py-4 font-display text-parchment shadow-[0_18px_30px_-14px_rgba(7,38,24,.65)] transition-colors hover:bg-pine-hover focus-visible:outline-3 focus-visible:outline-offset-3 focus-visible:outline-ink lg:mt-[calc(var(--u)*24)]" style={fs(26, 19)}>
              {t('mapsec.cta')}<ArrowUpRight className="h-[0.8em] w-[0.8em]" />
            </Link>
          </div>

          {/* the picture: slab, tinted hexagons lying on the land, one thin ring, the lens joined to a tile by a line.
              Nothing in this group animates its position, so the line always stays attached. */}
          <div className="map-vis z-10" aria-hidden="true">
            <img src={diorama} alt="" style={at(16, 100, 908)} />
            <svg className="pointer-events-none" viewBox="0 0 940 720" style={at(0, 0, 940, 720)} fill="none" aria-hidden="true">
              <ellipse className="map-ring" cx="492" cy="372" rx="262" ry="132" stroke="#fff" strokeOpacity=".7" strokeWidth="2" />
              <ellipse cx="492" cy="372" rx="300" ry="156" stroke="#fff" strokeOpacity=".28" strokeWidth="1.5" />
            </svg>
            {hexClear ? <img src={hexClear} alt="" style={at(286, 232, 410)} /> : <HexLayer style={at(286, 232, 410, 280)} />}
            <span className="map-glow rounded-full" style={{ ...at(458, 300, 96, 56), background: 'radial-gradient(closest-side, rgba(255,60,25,.7), transparent)', mixBlendMode: 'screen' }} />
            {/* lens to tile: a lit cord with a knob on the lens rim and a ring on the tile */}
            <svg className="pointer-events-none z-10" viewBox="0 0 940 720" style={at(0, 0, 940, 720)} fill="none" aria-hidden="true">
              <path d="M330 138 C350 215 392 290 412 346" stroke="#fff" strokeOpacity=".75" strokeWidth="7" strokeLinecap="round" />
              <path d="M330 138 C350 215 392 290 412 346" stroke="#C9A227" strokeWidth="2.6" strokeLinecap="round" />
              <circle cx="330" cy="138" r="6.5" fill="#F2DB8F" stroke="#C9A227" strokeWidth="2.4" />
              <ellipse className="map-ring" cx="412" cy="357" rx="30" ry="16" stroke="#C9A227" strokeWidth="2.4" fill="#F2DB8F" fillOpacity=".25" />
            </svg>
            <img src={lens} alt="" className="rounded-full shadow-[0_18px_30px_-12px_rgba(40,25,5,.55)]" style={at(216, -30, 170)} />
            <img src={leafA} alt="" className="map-float" style={{ ...at(104, 8, 64), '--r': '-28deg' }} />
            <img src={leafE} alt="" className="map-float" style={{ ...at(866, 410, 62), '--r': '30deg' }} />
          </div>

          {/* example card (a worked example, labelled as such) */}
          <div className="map-abs relative z-20 max-lg:mx-auto max-lg:w-full max-lg:max-w-sm" style={pos(1062, 84, 366)}>
            <div className="map-glass" style={{ padding: U(24), borderRadius: U(30) }}>
              <div className="flex items-center justify-between">
                <PanelHead Icon={(p) => <Leaf {...p} />}>{t('mapsec.cardLabel')}</PanelHead>
                <span className="rounded-full bg-butter px-3 py-1 font-body text-ink" style={fs(15, 12)}>{t('mapsec.cardTag')}</span>
              </div>
              <p className="mt-[0.7em] font-display leading-tight text-ink" style={fs(31, 20)}>{din(EXAMPLE.crop, EXAMPLE.disease)} · {crn(EXAMPLE.crop)}</p>
              <p className="mt-2 flex items-center gap-3 font-display text-ink" style={fs(26, 18)}>
                <span className="map-hexsw inline-block" style={{ width: U(30), height: U(30), minWidth: 18, minHeight: 18, background: BINS[3].color }} />{t('mapsec.cardReports', { count: EXAMPLE.reports })}
                <span className="font-body text-ink-2" style={fs(18, 13)}>· {t('map.days30')}</span>
              </p>
            </div>
          </div>

          {/* the three panels in one column: same width, same glass, same header, equal gaps */}
          <div className="map-abs relative z-20 flex flex-col max-lg:mx-auto max-lg:w-full max-lg:max-w-sm max-lg:gap-4" style={{ ...pos(1590, 44, 292), gap: U(18) }}>
            <div className="map-glass hidden lg:block" aria-hidden="true" style={{ padding: U(22), borderRadius: U(28) }}>
              <PanelHead Icon={Calendar}>{t('mapsec.filtersTitle')}</PanelHead>
              <p className="mt-[0.6em] font-body text-ink" style={fs(17, 13)}>{t('mapsec.filterCrop')}</p>
              <div className="mt-1"><Dd icon={<img src={potato} alt="" className="object-contain" style={{ width: U(30), height: U(30) }} />}>{crn(EXAMPLE.crop)}</Dd></div>
              <p className="mt-[0.5em] font-body text-ink" style={fs(17, 13)}>{t('mapsec.filterDisease')}</p>
              <div className="mt-1"><Dd icon={<Leaf className="text-leaf-text" style={{ width: U(24), height: U(24) }} />}>{din(EXAMPLE.crop, EXAMPLE.disease)}</Dd></div>
              <div className="mt-[0.8em] grid grid-cols-3 gap-2 text-center" style={fs(16, 12)}>
                {DAYS.map((d) => <span key={d} className={`rounded-full py-[0.45em] ${d === 30 ? 'bg-pine text-parchment' : 'border border-ink/10 bg-white/70 text-ink'}`}>{d}{lang === 'hi' ? ' दिन' : 'd'}</span>)}
              </div>
            </div>
            <div className="map-glass" style={{ padding: U(22), borderRadius: U(28) }}>
              <PanelHead Icon={(p) => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" aria-hidden="true" {...p}><path d="M12 2.8 20 7.4v9.2l-8 4.6-8-4.6V7.4z" /></svg>}>{t('mapsec.legendTitle')}</PanelHead>
              <ul className="mt-[0.6em] grid grid-cols-1 gap-y-[calc(var(--u)*5)] max-lg:gap-y-2">
                {BINS.map((b, i) => (
                  <li key={b.color} className="flex items-center gap-3 text-ink" style={fs(18, 14)}>
                    <span className="map-hexsw inline-block shrink-0" style={{ width: U(30), height: U(30), minWidth: 22, minHeight: 22, background: b.color }} />{t('mapsec.legendRange', { range: binLabel(i) })}
                  </li>
                ))}
              </ul>
            </div>
            <div className="map-glass" style={{ padding: U(18), borderRadius: U(28) }}>
              <div className="flex items-center gap-3">
                <img src={badge} alt="" aria-hidden="true" className="shrink-0 object-contain" style={{ width: U(54), height: U(54), minWidth: 44 }} />
                <p className="font-display leading-tight text-ink" style={fs(19, 16)}>{t('mapsec.privTitle')}</p>
              </div>
              <p className="mt-2 leading-snug text-ink-2" style={fs(15, 12)}>{t('mapsec.privText')}</p>
            </div>
          </div>

          {/* cords: example card to the darkest tile (with a travelling dot), and one from each panel to the part of the map it controls or describes */}
          <svg className="map-flow pointer-events-none absolute inset-0 z-[15] h-full w-full max-lg:hidden" viewBox="0 0 1900 941" fill="none" aria-hidden="true">
            {CORDS.map(({ d, from, to, dot }) => (
              <g key={d}>
                <path d={d} stroke="#fff" strokeOpacity=".75" strokeWidth="7" strokeLinecap="round" />
                <path d={d} stroke="#C9A227" strokeWidth="2.6" strokeLinecap="round" />
                <circle cx={from[0]} cy={from[1]} r="6.5" fill="#F2DB8F" stroke="#C9A227" strokeWidth="2.4" />
                <ellipse className="map-ring" cx={to[0]} cy={to[1]} rx="20" ry="11" stroke="#C9A227" strokeWidth="2.2" fill="#F2DB8F" fillOpacity=".25" />
                {dot && <circle r="5" fill="#F2DB8F" stroke="#C9A227" strokeWidth="1.5"><animateMotion dur="3.4s" repeatCount="indefinite" path={d} /></circle>}
              </g>
            ))}
          </svg>

          {/* bottom: soil with sprouts, a potato, leaves */}
          <div className="pointer-events-none absolute inset-x-0 bottom-0 z-[15] max-lg:hidden" aria-hidden="true" style={{ height: U(150) }}>
            <img src={soil} alt="" className="absolute" style={{ left: U(-80), bottom: U(-48), width: U(1100) }} />
            <img src={soil} alt="" className="absolute -scale-x-100" style={{ right: U(-80), bottom: U(-48), width: U(1100) }} />
            <img src={potato} alt="" className="absolute" style={{ right: U(70), bottom: U(10), width: U(110) }} />
          </div>
          <img src={leafC} alt="" aria-hidden="true" className="map-float pointer-events-none absolute z-10 max-lg:hidden" style={{ ...at(1520, 18, 70), '--r': '28deg' }} />
          <div className="relative z-10 h-24 lg:hidden"><img src={soil} alt="" aria-hidden="true" className="absolute inset-x-0 bottom-0 w-full" /></div>
        </div>
      </div>
    </section>
  );
};

export default MapSection;
