import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { getPredictionHistory } from '../../services/api';

const PAGE_SIZE = 50; // server/controllers/predictController.js

// This browser's checkups, newest first, 50 per page. `more()` loads the next page.
export const useHistory = () => {
  const { t } = useTranslation();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [hasMore, setHasMore] = useState(false);

  const load = useCallback(async (before) => {
    setLoading(true);
    try {
      const res = await getPredictionHistory(before);
      setItems((shown) => (before ? [...shown, ...res.data] : res.data));
      setHasMore(res.data.length === PAGE_SIZE);
      setError('');
    } catch (err) {
      setError(err.response?.data?.message || t('ws.loadFailed'));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => { load(); }, [load]);
  const more = () => load(items[items.length - 1]?.createdAt);
  return { items, loading, error, hasMore, more, reload: () => load() };
};
