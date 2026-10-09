import { useTranslation } from 'react-i18next';
import { ArrowUpRight, Leaf } from './heroIcons';
import LangButtons from './LangButtons';
import reportEn from '../assets/report/report-en.webp';
import reportHi from '../assets/report/report-hi.webp';
import leafB from '../assets/how/leaf-b.webp';
import leafE from '../assets/how/leaf-e.webp';

const Check = () => <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m5 12.5 4.2 4.2L19 7" /></svg>;

const ReportSection = () => {
  const { t, i18n } = useTranslation();
  const hi = i18n.language === 'hi';
  const front = hi ? reportHi : reportEn, back = hi ? reportEn : reportHi;   // the page in the reader's language is on top
  return (
    <section id="report" className="rep-bg scroll-mt-[4.6rem] px-5 py-16 sm:px-8 lg:flex lg:min-h-[calc(100svh-4.6rem)] lg:items-center lg:pb-12 lg:pt-[clamp(64px,6.4vw,124px)]">
      <img src={leafB} alt="" aria-hidden="true" className="map-float pointer-events-none absolute bottom-[10%] left-[44%] w-16 max-lg:hidden" style={{ '--r': '16deg' }} />
      <img src={leafE} alt="" aria-hidden="true" className="map-float pointer-events-none absolute right-[3%] top-[12%] w-14 max-lg:hidden" style={{ '--r': '-26deg' }} />
      <div className="relative mx-auto grid w-full max-w-[1240px] items-center gap-12 lg:grid-cols-[.95fr_1.05fr] lg:gap-16">
        <div>
          <p className="flex items-center gap-3 font-mono text-xs uppercase tracking-[0.3em] text-ink-2"><Leaf className="h-5 w-5 -rotate-12 text-leaf-text" />{t('repsec.eyebrow')}</p>
          <h2 className="mt-3 text-balance font-display text-[clamp(2.3rem,4.6vw,4.1rem)] leading-[1.04] text-ink">{t('repsec.title1')}<br /><em className="text-leaf-text">{t('repsec.titleEm')}</em></h2>
          <p className="mt-5 max-w-xl text-lg leading-relaxed text-ink-2">{t('repsec.intro')}</p>
          <div className="mt-6 flex flex-wrap items-center gap-3"><span className="font-mono text-xs uppercase tracking-[0.2em] text-ink-2">{t('repsec.lang')}</span><LangButtons /></div>
          <ul className="mt-5 space-y-2.5 lg:mt-5">
            {['b1', 'b2', 'b3'].map((k) => (
              <li key={k} className="flex items-start gap-3 text-ink"><span className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full bg-pine text-parchment"><Check /></span><span className="leading-snug">{t(`repsec.${k}`)}</span></li>
            ))}
          </ul>
          <div className="mt-6 flex flex-wrap items-center gap-x-6 gap-y-3">
            <a href={hi ? '/samples/plantguard-sample-report-hi.pdf' : '/samples/plantguard-sample-report.pdf'} target="_blank" rel="noopener noreferrer"
              className="inline-flex items-center gap-3 rounded-full bg-pine px-7 py-3.5 font-display text-lg text-parchment shadow-[0_18px_30px_-14px_rgba(7,38,24,.65)] transition-colors hover:bg-pine-hover focus-visible:outline-3 focus-visible:outline-offset-3 focus-visible:outline-ink">
              {t('repsec.sample')}<ArrowUpRight className="h-4 w-4" />
            </a>
            <p className="text-sm text-ink-2">{t('repsec.note')}</p>
          </div>
        </div>

        {/* two real report pages, the one in the reader's language in front */}
        <figure className="relative mx-auto w-full max-w-[34rem] lg:max-w-none">
          <div className="relative mx-auto aspect-[1.02] w-[92%] lg:w-[94%]">
            <img src={back} alt="" aria-hidden="true" className="absolute inset-0 h-full w-full rotate-[5deg] translate-x-[6%] translate-y-[2%] rounded-md object-cover object-top opacity-90 shadow-[0_26px_50px_-24px_rgba(22,47,34,.55)] ring-1 ring-ink/15" />
            <img src={front} alt={t('repsec.sampleAlt')} className="relative h-full w-full -rotate-[3deg] rounded-md object-cover object-top shadow-[0_34px_60px_-26px_rgba(22,47,34,.6)] ring-1 ring-ink/15" />
            <span className="absolute -bottom-3 left-[6%] rounded-full bg-butter px-3.5 py-1.5 font-mono text-[11px] uppercase tracking-[0.14em] text-ink shadow-md">SHA-256 · verify link</span>
          </div>
          <figcaption className="mt-7 lg:mt-6 text-center text-sm text-ink-2">{t('repsec.cap')}</figcaption>
        </figure>
      </div>
    </section>
  );
};

export default ReportSection;
