import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

// Asks before any location is read: why, what becomes public, and a real "skip". The answer is
// remembered (services/location.js) and can be changed here at any time.
const LocationConsent = ({ consent, onChange }) => {
  const { t } = useTranslation();

  if (consent === 'granted' || consent === 'declined') {
    return (
      <p className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-2xl border border-ink/15 bg-white/60 px-4 py-3.5 text-sm text-ink-2">
        <span className="font-semibold text-ink">{consent === 'granted' ? t('location.on') : t('location.off')}</span>
        <button type="button" className="min-h-[44px] font-semibold text-pine underline underline-offset-4" onClick={() => onChange(null)}>
          {t('location.change')}
        </button>
      </p>
    );
  }

  return (
    <section aria-labelledby="location-title" className="rounded-2xl border border-ink/15 bg-sage-wash/60 p-4">
      <h3 id="location-title" className="font-display text-xl text-ink">{t('location.title')}</h3>
      <p className="mb-3 mt-1.5 text-sm leading-relaxed text-ink-2">{t('location.why')}</p>
      <div className="flex flex-wrap items-center gap-2.5">
        <button type="button" onClick={() => onChange('granted')} className="ws-btn">{t('location.share')}</button>
        <button type="button" onClick={() => onChange('declined')} className="ws-btn ws-btn-ghost">{t('location.skip')}</button>
        <Link to="/privacy" className="ml-1 text-sm font-semibold text-pine underline underline-offset-4">{t('location.privacyLink')}</Link>
      </div>
    </section>
  );
};

export default LocationConsent;
