import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { getFieldAlerts } from '../../services/api';
import { readLast, saveLast, unreachable } from '../../services/offlineCache';
import { formatDateTime } from '../../locales/dates';

// The saved fields with their weather alerts (GET /api/fields/alerts). `error` is set when the request failed; if an earlier answer exists it
// stays in `data`, so a failed refresh never empties the page. With no signal on a first look, the last good answer kept in this browser
// (services/offlineCache.js) is shown, and `error` says how old it is.
export const useFieldAlerts = () => {
  const { t, i18n } = useTranslation();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const alive = useRef(true);
  const tRef = useRef(t);   // read at failure time, so a language change does not refetch
  tRef.current = t;
  const i18nRef = useRef(i18n);
  i18nRef.current = i18n;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await getFieldAlerts();
      saveLast('alerts', res.data);
      if (alive.current) { setData(res.data); setError(''); }
    } catch (err) {
      if (!alive.current) return;
      const last = unreachable(err) ? readLast('alerts') : null;
      if (last) {
        setData((shown) => shown ?? last.data);
        setError(tRef.current('alerts.offline', { when: formatDateTime(new Date(last.at), i18nRef.current.language, { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }) }));
      } else {
        setError(err.response?.data?.message || tRef.current('alerts.error.load'));
      }
    } finally {
      if (alive.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    alive.current = true;
    load();
    return () => { alive.current = false; };
  }, [load]);

  return { data, fields: data?.fields ?? [], loading, error, reload: load };
};
