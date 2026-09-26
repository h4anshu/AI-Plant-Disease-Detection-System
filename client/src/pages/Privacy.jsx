import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { deleteMyData } from '../services/api';

const SECTIONS = ['stored', 'public', 'location'];

// What is stored, what is public, and "delete my data" (DELETE /api/predict for this browser)
const Privacy = () => {
  const { t } = useTranslation();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  const remove = async () => {
    setBusy(true);
    try {
      const res = await deleteMyData();
      setMessage(t('privacy.done', { count: res.data.deleted }));
    } catch {
      setMessage(t('privacy.failed'));
    } finally {
      setBusy(false);
      setConfirming(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto px-6 pt-16 pb-20">
      <span className="font-mono text-xs text-clay uppercase tracking-widest">{t('privacy.eyebrow')}</span>
      <h2 className="font-display text-4xl text-ink mt-2 mb-8">{t('privacy.title')}</h2>

      {SECTIONS.map((s) => (
        <section key={s} className="mb-6">
          <h3 className="font-display text-xl text-ink mb-1">{t(`privacy.${s}Title`)}</h3>
          <p className="text-sm text-ink/75 leading-relaxed">{t(`privacy.${s}`)}</p>
        </section>
      ))}

      <section className="border-t border-ink/15 pt-6">
        <h3 className="font-display text-xl text-ink mb-1">{t('privacy.deleteTitle')}</h3>
        <p className="text-sm text-ink/75 leading-relaxed mb-4">{t('privacy.delete')}</p>
        {confirming ? (
          <div className="flex flex-wrap gap-2">
            <button type="button" disabled={busy} onClick={remove}
              className="font-mono text-xs uppercase tracking-wide px-3 py-2 bg-clay text-parchment disabled:opacity-50">
              {t('privacy.confirm')}
            </button>
            <button type="button" disabled={busy} onClick={() => setConfirming(false)}
              className="font-mono text-xs uppercase tracking-wide px-3 py-2 border border-ink/25 text-ink/70">
              {t('privacy.cancel')}
            </button>
          </div>
        ) : (
          <button type="button" onClick={() => { setMessage(''); setConfirming(true); }}
            className="font-mono text-xs uppercase tracking-wide px-3 py-2 border border-clay text-clay hover:bg-clay/10">
            {t('privacy.deleteButton')}
          </button>
        )}
        {message && <p role="status" className="font-mono text-xs text-sage mt-3">{message}</p>}
      </section>
    </div>
  );
};

export default Privacy;
