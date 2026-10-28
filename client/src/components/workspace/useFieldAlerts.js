import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { getFieldAlerts } from '../../services/api';

// This browser's saved fields with their weather alerts (GET /api/fields/alerts). `error` is set when the
// request failed; if an earlier answer exists it stays in `data`, so a failed refresh never empties the page.
export const useFieldAlerts = () => {
  const { t } = useTranslation();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const alive = useRef(true);
  const tRef = useRef(t);   // read at failure time, so a language change does not refetch
  tRef.current = t;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await getFieldAlerts();
      if (alive.current) { setData(res.data); setError(''); }
    } catch (err) {
      if (alive.current) setError(err.response?.data?.message || tRef.current('alerts.error.load'));
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
