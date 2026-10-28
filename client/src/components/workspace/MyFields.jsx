import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { deleteField, getFields } from '../../services/api';
import { cropIcon } from './cropIcon';
import Icon from './icons';
import { MAX_FIELDS, cropLabel, fieldName } from './alertsLib';

// Profile > My data: the fields saved for weather alerts, each with a delete button (the place is private: it is never shown here)
const MyFields = () => {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const [fields, setFields] = useState(null);   // null = loading
  const [error, setError] = useState('');
  const [ask, setAsk] = useState(null);         // id waiting for "yes, delete"
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try { setFields((await getFields()).data); setError(''); } catch { setError(t('alerts.mine.failed')); setFields((f) => f ?? []); }
  }, [t]);
  useEffect(() => { load(); }, [load]);

  const remove = async (id) => {
    setBusy(true);
    try { await deleteField(id); setAsk(null); await load(); } catch { setError(t('alerts.mine.deleteFailed')); } finally { setBusy(false); }
  };

  return (
    <article className="ws-card flex flex-col gap-4 p-6 lg:col-span-2" aria-labelledby="my-fields">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h2 id="my-fields" className="font-display text-2xl">{t('alerts.mine.title')}</h2>
        {fields && fields.length < MAX_FIELDS && <Link to="/fields/new" className="text-sm font-semibold text-pine underline underline-offset-4">{t('alerts.fields.add')}</Link>}
      </div>
      <p className="text-sm text-ink-2">{t('alerts.mine.note')}</p>
      {error && <p role="alert" className="ws-note ws-note-bad">{error}</p>}
      {fields && fields.length === 0 && !error && <p className="text-[15px] text-ink-2">{t('alerts.mine.none')}</p>}
      <ul className="flex flex-col">
        {(fields ?? []).map((f) => (
          <li key={f._id} className="flex flex-wrap items-center gap-4 border-t border-ink/10 py-3">
            <img src={cropIcon(f.crop)} alt="" className="h-10 w-10 shrink-0 object-contain" />
            <span className="min-w-[160px] flex-1"><b className="block">{fieldName(f, lang)}</b><span className="text-[13px] text-ink-2">{cropLabel(f.crop, lang)} · {t(`alerts.stage.${f.stage}`)}</span></span>
            {ask === f._id ? (
              <span className="flex flex-wrap gap-2">
                <button type="button" disabled={busy} className="ws-btn border-rust-deep bg-rust-deep !min-h-[44px] !px-4 text-sm" onClick={() => remove(f._id)}>{t('alerts.mine.confirm')}</button>
                <button type="button" disabled={busy} className="ws-btn ws-btn-ghost !min-h-[44px] !px-4 text-sm" onClick={() => setAsk(null)}>{t('privacy.cancel')}</button>
              </span>
            ) : (
              <button type="button" className="ws-btn ws-btn-danger !min-h-[44px] !px-4 text-sm" aria-label={t('alerts.mine.deleteAria', { name: fieldName(f, lang) })} onClick={() => setAsk(f._id)}><Icon name="trash" className="h-4 w-4" />{t('alerts.mine.delete')}</button>
            )}
          </li>
        ))}
      </ul>
    </article>
  );
};

export default MyFields;
