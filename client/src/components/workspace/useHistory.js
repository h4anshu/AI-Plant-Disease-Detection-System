import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { getPredictionHistory } from '../../services/api';
import { readLast, saveLast, unreachable } from '../../services/offlineCache';

const PAGE_SIZE = 50; // server/controllers/predictController.js

// The checkups, newest first, 50 per page. `more()` loads the next page. With no signal the first page last seen (kept in this browser,
// services/offlineCache.js) is shown, with a note in `error`.
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
      if (!before) saveLast('history', res.data);
      setItems((shown) => (before ? [...shown, ...res.data] : res.data));
      setHasMore(res.data.length === PAGE_SIZE);
      setError('');
    } catch (err) {
      const last = !before && unreachable(err) ? readLast('history') : null;
      if (last) {
        setItems((shown) => (shown.length ? shown : last.data));
        setHasMore(false);
        setError(t('ws.offline'));
      } else {
        setError(err.response?.data?.message || t('ws.loadFailed'));
      }
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => { load(); }, [load]);
  const more = () => load(items[items.length - 1]?.createdAt);
  return { items, loading, error, hasMore, more, reload: () => load() };
};
