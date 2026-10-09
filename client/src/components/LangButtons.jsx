import { useTranslation } from 'react-i18next';
import { LANGUAGES } from '../i18n';

// The real language switch (same state as the navbar), in a light or dark style
const LangButtons = ({ dark = false, className = '' }) => {
  const { t, i18n } = useTranslation();
  return (
    <div role="group" aria-label={t('nav.language')} className={`inline-flex overflow-hidden rounded-full border font-mono text-sm ${dark ? 'border-parchment/40' : 'border-ink/25 bg-white/60'} ${className}`}>
      {Object.entries(LANGUAGES).map(([code, lang]) => {
        const on = i18n.language === code;
        return (
          <button key={code} type="button" lang={code} aria-label={lang.name} aria-pressed={on} onClick={() => i18n.changeLanguage(code)}
            className={`px-5 py-2 transition-colors ${on ? (dark ? 'bg-butter text-bg-dark' : 'bg-pine text-parchment') : (dark ? 'text-parchment/85 hover:text-parchment' : 'text-ink-2 hover:text-ink')}`}>
            {lang.name}
          </button>
        );
      })}
    </div>
  );
};

export default LangButtons;
