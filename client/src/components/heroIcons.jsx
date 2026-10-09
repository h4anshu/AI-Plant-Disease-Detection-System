// Small line icons for the hero, nav and steps. 24x24, currentColor, decorative (aria-hidden).
const Svg = ({ children, className = 'w-6 h-6', ...p }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"
    className={className} aria-hidden="true" {...p}>{children}</svg>
);

export const LeafMark = ({ className }) => (
  <svg viewBox="0 0 40 36" className={className} aria-hidden="true" fill="currentColor">
    <path d="M20 34C19 22 12 14 1 12c1 11 7 18 19 22Z" />
    <path d="M21 31c0-12 5-22 18-27C40 16 33 27 21 31Z" opacity=".78" />
  </svg>
);
export const Camera = (p) => <Svg {...p}><path d="M4 8h3l1.5-2h7L17 8h3a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1Z" /><circle cx="12" cy="13" r="3.5" /></Svg>;
export const ArrowUpRight = (p) => <Svg {...p}><path d="M7 17 17 7M8 7h9v9" /></Svg>;
export const Magnifier = (p) => <Svg {...p}><circle cx="10.5" cy="10.5" r="6.5" /><path d="m15.5 15.5 5 5" /><path d="M10.5 7.5c-2 .3-3 1.6-3 3.4 2 0 3.2-.9 3-3.4Z" /></Svg>;
export const Spray = (p) => <Svg {...p}><path d="M8 10h6v10a1 1 0 0 1-1 1H9a1 1 0 0 1-1-1V10ZM9 10V7h4l2-2M18 5h2M18 8h2M17.5 2l1.5 1.5" /><path d="M11 14.5c-1.5.2-2 1-2 2.2 1.5 0 2.200-.6 2-2.200Z" /></Svg>;
export const Calendar = (p) => <Svg {...p}><rect x="4" y="5" width="16" height="15" rx="2" /><path d="M8 3v4M16 3v4M4 10h16M9 15l2 2 4-4" /></Svg>;
export const Leaf = (p) => <Svg {...p}><path d="M5 19c0-8 4-13 14-14 0 9-4 14-13 14" /><path d="M5 19c2-5 5-8 9-10" /></Svg>;

// ---- Illustrations drawn for the hero (line art in the reference's style; currentColor) ----
export const Sprig = ({ className }) => (   // faded corner sprig
  <svg viewBox="0 0 140 240" className={className} aria-hidden="true" fill="currentColor">
    <path d="M70 238C66 170 72 100 96 8" fill="none" stroke="currentColor" strokeWidth="2.2" />
    {[[78, 176, -55, 1], [74, 150, 58, 1.05], [80, 118, -50, 1.1], [84, 88, 54, 1], [92, 56, -46, .9], [96, 30, 40, .8]].map(([x, y, r, k], i) => (
      <path key={i} transform={`translate(${x} ${y}) rotate(${r}) scale(${k})`} d="M0 0C14-26 44-30 66-14 44 4 16 10 0 0Z" opacity=".85" />
    ))}
  </svg>
);
export const LeafSketch = ({ className, style }) => (   // "leaf anatomy" drawing: outline, midrib, veins
  <svg viewBox="0 0 100 150" className={className} style={style} aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round">
    <path d="M50 6C86 30 92 84 50 142 8 84 14 30 50 6Z" />
    <path d="M50 12V138" />
    {[34, 52, 70, 88, 106].map((y) => <path key={y} d={`M50 ${y}L${72 - (y - 34) / 12} ${y - 14}M50 ${y}L${28 + (y - 34) / 12} ${y - 14}`} opacity=".7" />)}
  </svg>
);
export const LeafCircle = ({ className, style }) => (   // leaf in a ring with a small node, as in the reference scan badge
  <svg viewBox="0 0 100 100" className={className} style={style} aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="50" cy="50" r="42" /><circle cx="86" cy="22" r="5" fill="currentColor" stroke="none" />
    <path d="M32 70C30 44 46 28 70 28 72 54 56 70 32 70Z" /><path d="M32 70 58 40" />
  </svg>
);
export const SunLeaf = ({ className }) => (   // "made for the field" badge: rays over a leaf
  <svg viewBox="0 0 64 56" className={className} aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
    <path d="M32 6V12M14 14l4 4M50 14l-4 4M6 30h6M52 30h6M18 46c8 4 22 4 28 0" opacity=".8" />
    <path d="M24 40C22 28 30 20 42 20 42 32 34 40 24 40Z" fill="currentColor" fillOpacity=".15" /><path d="M24 40 36 27" />
  </svg>
);
export const SprayLeaf = ({ className }) => (   // care-plan bottle
  <svg viewBox="0 0 48 64" className={className} aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 26h18v30a3 3 0 0 1-3 3H15a3 3 0 0 1-3-3V26ZM15 26v-8h12l5-5M36 12h6M36 18h6M35 6l4 4" />
    <path d="M18 48c0-8 4-12 10-12 0 8-4 12-10 12Z" /><path d="M18 48l7-8" />
  </svg>
);
export const Bars = (p) => <Svg {...p}><path d="M5 20V12M12 20V5M19 20v-9" /><path d="M3 20h18" /></Svg>;
