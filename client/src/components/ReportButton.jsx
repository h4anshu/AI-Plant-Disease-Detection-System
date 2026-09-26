import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { getReport } from '../services/api';

// One-click PDF of this checkup (docs/REPORT.md), in the app's language. Fetched with the device id
// header like every checkup call, then saved from a blob URL.
const ReportButton = ({ predictionId, hasLocation }) => {
  const { t, i18n } = useTranslation();
  const [state, setState] = useState('idle');

  const download = async () => {
    setState('loading');
    try {
      const { data } = await getReport(predictionId, i18n.language === 'hi' ? 'hi' : 'en');
      const url = URL.createObjectURL(new Blob([data], { type: 'application/pdf' }));
      const a = Object.assign(document.createElement('a'), { href: url, download: `plantguard-report-${predictionId}.pdf` });
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 10000);
      setState('idle');
    } catch {
      setState('error');
    }
  };

  return (
    <div className="mt-5 pt-4 border-t border-ink/10">
      <button type="button" onClick={download} disabled={state === 'loading'}
        className="font-mono text-xs uppercase tracking-wide px-3 py-2 border border-ink/40 text-ink hover:bg-ink/5 disabled:opacity-50">
        {state === 'loading' ? t('report.preparing') : t('report.download')}
      </button>
      <p className="text-xs text-ink/60 mt-2">{t(hasLocation ? 'report.whatLocation' : 'report.what')}</p>
      {state === 'error' && <p role="alert" className="text-xs text-clay mt-1">{t('report.failed')}</p>}
    </div>
  );
};

export default ReportButton;
