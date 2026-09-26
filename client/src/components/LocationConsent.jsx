import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

const button = 'font-mono text-xs uppercase tracking-wide px-3 py-1.5 border';

// Asks before any location is read: why, what becomes public, and a real "skip". The answer is
// remembered (services/location.js) and can be changed here at any time.
const LocationConsent = ({ consent, onChange }) => {
  const { t } = useTranslation();

  if (consent === 'granted' || consent === 'declined') {
    return (
      <p className="font-mono text-xs text-sage mt-4 flex flex-wrap gap-x-3 gap-y-1 items-center">
        <span>{consent === 'granted' ? t('location.on') : t('location.off')}</span>
        <button type="button" className="underline text-ink/70 hover:text-ink" onClick={() => onChange(null)}>
          {t('location.change')}
        </button>
      </p>
    );
  }

  return (
    <section aria-labelledby="location-title" className="mt-6 border border-ink/15 bg-sage/5 p-4">
      <h3 id="location-title" className="font-mono text-[10px] text-sage uppercase tracking-widest mb-2">
        {t('location.title')}
      </h3>
      <p className="text-sm text-ink/75 leading-relaxed mb-3">{t('location.why')}</p>
      <div className="flex flex-wrap gap-2 items-center">
        <button type="button" onClick={() => onChange('granted')}
          className={`${button} bg-field text-parchment border-field hover:bg-field-dark`}>
          {t('location.share')}
        </button>
        <button type="button" onClick={() => onChange('declined')}
          className={`${button} border-ink/25 text-ink/70 hover:border-ink/50 hover:text-ink`}>
          {t('location.skip')}
        </button>
        <Link to="/privacy" className="font-mono text-xs text-sage underline ml-1">{t('location.privacyLink')}</Link>
      </div>
    </section>
  );
};

export default LocationConsent;
