import { useTranslation } from 'react-i18next';

// TODO(auth): remove when login returns
const DemoBanner = () => {
  const { t } = useTranslation();
  return (
    <div className="bg-wheat/20 border-b border-wheat/40 px-6 py-2 text-center font-mono text-[11px] text-ink/70">
      {t('banner')}
    </div>
  );
};

export default DemoBanner;
