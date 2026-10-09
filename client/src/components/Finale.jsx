import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowUpRight, Camera, LeafMark } from './heroIcons';
import LangButtons from './LangButtons';
import plant from '../assets/end/plant-happy.webp';
import soil from '../assets/honest/soil.webp';
import leafA from '../assets/how/leaf-a.webp';
import leafC from '../assets/how/leaf-c.webp';

const LINKS = [['/predict', 'nav.diagnose'], ['/history', 'nav.log'], ['/map', 'nav.map'], ['/privacy', 'nav.privacy']];

// Closing call to action and the footer, one deep-pine band (the only dark band of the page)
const Finale = () => {
  const { t } = useTranslation();
  return (
    <footer id="start" className="cta-bg px-5 pt-20 sm:px-8 lg:pt-24">
      <img src={leafA} alt="" aria-hidden="true" className="map-float pointer-events-none absolute left-[6%] top-[16%] w-14 max-lg:hidden" style={{ '--r': '-24deg' }} />
      <img src={leafC} alt="" aria-hidden="true" className="map-float pointer-events-none absolute right-[38%] top-[26%] w-12 max-lg:hidden" style={{ '--r': '20deg' }} />
      <div className="relative mx-auto w-full max-w-[1240px]">
        <div className="grid items-center gap-8 lg:grid-cols-[1.1fr_.9fr] lg:gap-12">
          <div className="pb-4 lg:pb-16">
            <h2 className="text-balance font-display text-[clamp(2.8rem,6vw,5.2rem)] leading-[1.02] text-parchment">{t('finale.title1')} <em className="text-butter">{t('finale.titleEm')}</em></h2>
            <p className="mt-5 max-w-lg text-lg leading-relaxed text-[#D5D5C7] lg:text-xl">{t('finale.sub')}</p>
            <div className="mt-8 flex flex-wrap items-center gap-x-6 gap-y-3">
              {/* ponytail: login temporarily disabled, always send to /predict. Restore the ternary once login is back on. */}
              <Link to="/predict" className="inline-flex items-center gap-4 rounded-full bg-butter px-9 py-4 font-display text-xl text-bg-dark shadow-[0_20px_36px_-16px_rgba(0,0,0,.7)] transition-colors hover:bg-butter-wash focus-visible:outline-3 focus-visible:outline-offset-3 focus-visible:outline-butter">
                <Camera className="h-6 w-6" />{t('finale.cta')}<ArrowUpRight className="h-4 w-4" />
              </Link>
              <span className="text-sm text-[#D5D5C7]">{t('finale.free')}</span>
            </div>
          </div>
          <div className="relative mx-auto flex w-full max-w-xs justify-center lg:mx-0 lg:max-w-none lg:justify-end">
            <img src={plant} alt="" aria-hidden="true" className="relative z-10 w-[62%] max-w-[300px] lg:w-[58%]" width="520" height="710" loading="lazy" />
            <img src={soil} alt="" aria-hidden="true" className="pointer-events-none absolute -bottom-6 left-1/2 w-[120%] max-w-none -translate-x-1/2" loading="lazy" />
          </div>
        </div>

        <div className="relative z-10 mt-10 grid gap-8 border-t border-parchment/20 py-9 lg:mt-6 lg:grid-cols-[1.2fr_.8fr_1fr] lg:gap-12">
          <div>
            <p className="flex items-center gap-3"><LeafMark className="h-8 w-9 text-butter" /><span className="font-display text-2xl text-parchment">PlantGuard</span></p>
            <p className="mt-3 max-w-xs text-sm leading-relaxed text-[#D5D5C7]">{t('finale.tagline')}</p>
          </div>
          <nav aria-label={t('finale.explore')}>
            <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-butter">{t('finale.explore')}</p>
            <ul className="mt-2 text-parchment">
              {LINKS.map(([to, key]) => <li key={to}><Link to={to} className="inline-block py-1.5 underline-offset-4 hover:underline focus-visible:outline-3 focus-visible:outline-butter">{t(key)}</Link></li>)}
            </ul>
          </nav>
          <div>
            <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-butter">{t('finale.language')}</p>
            <LangButtons dark className="mt-3" />
          </div>
        </div>

        <div className="relative z-10 space-y-2 border-t border-parchment/15 pb-8 pt-5 text-[13px] leading-relaxed text-[#D5D5C7]">
          <p>{t('finale.legal')}</p>
          <p>{t('finale.credit')}</p>
          <p>{t('finale.copy', { year: new Date().getFullYear() })}</p>
        </div>
      </div>
    </footer>
  );
};

export default Finale;
