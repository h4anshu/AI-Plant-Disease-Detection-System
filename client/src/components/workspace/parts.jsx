import { cropName, diseaseName } from '../../locales/terms';
import { cropIcon } from './cropIcon';

export const DAY = 864e5;
export const locOf = (lang) => (lang === 'en' ? 'en-IN' : lang);   // Indian date order in English
export const shortDate = (d, lang) => new Date(d).toLocaleDateString(locOf(lang), { day: 'numeric', month: 'short' });
export const longDate = (d, lang) => new Date(d).toLocaleDateString(locOf(lang), { day: 'numeric', month: 'long', year: 'numeric' });
export const hasLocation = (p) => ['gps', 'exif'].includes(p.locationSource);

// What a checkup is called: the disease, or why there is no diagnosis
export const titleOf = (p, t, lang) => {
  if (p.status && p.status !== 'ok') return t(`history.status.${p.status}.title`);
  return p.disease ? diseaseName(p.crop, p.disease, lang) : t('history.healthy');
};

export const CropTag = ({ crop, lang, size = 22 }) => (
  <span className="flex items-center gap-2">
    <img src={cropIcon(crop)} alt="" width={size} height={size} className="shrink-0 object-contain" style={{ width: size, height: size }} />
    <span className="font-mono text-[11px] uppercase tracking-[0.14em] text-leaf-text">{crop ? cropName(crop, lang) : ''}</span>
  </span>
);

// A card heading used by every workspace page
export const PageHead = ({ eyebrow, title, children }) => (
  <header className="flex flex-wrap items-end justify-between gap-4">
    <div>
      <p className="font-mono text-xs uppercase tracking-[0.22em] text-rust-deep">{eyebrow}</p>
      <h1 className="mt-2.5 font-display text-[clamp(2rem,4vw,2.9rem)] leading-[1.08] tracking-[-0.01em] text-ink">{title}</h1>
    </div>
    {children}
  </header>
);

export const Lbl = ({ children, className = '' }) => <p className={`font-mono text-[11px] uppercase tracking-[0.14em] text-ink-2 ${className}`}>{children}</p>;
