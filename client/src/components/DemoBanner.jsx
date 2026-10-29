import { useContext } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { AuthContext } from '../context/AuthContext';

// For guests only: where their records live, and the way to keep them across phones
const DemoBanner = () => {
  const { t } = useTranslation();
  const { isAuthenticated } = useContext(AuthContext);
  if (isAuthenticated) return null;
  return (
    <div className="bg-wheat/20 border-b border-wheat/40 px-6 py-2 text-center font-mono text-[11px] text-ink/70">
      {t('banner')} <Link to="/login" className="font-semibold text-pine underline underline-offset-2">{t('nav.signIn')}</Link>
    </div>
  );
};

export default DemoBanner;
