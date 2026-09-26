import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import HistoryList from '../components/HistoryList';
import { getPredictionHistory } from '../services/api';

const PAGE_SIZE = 50; // server/controllers/predictController.js

const History = () => {
  const { t } = useTranslation();
  const [predictions, setPredictions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [hasMore, setHasMore] = useState(false);

  const load = async (before) => {
    setLoading(true);
    try {
      const res = await getPredictionHistory(before);
      setPredictions((shown) => (before ? [...shown, ...res.data] : res.data));
      setHasMore(res.data.length === PAGE_SIZE);
    } catch (err) {
      setError(err.response?.data?.message || t('history.loadFailed'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  return (
    <div className="max-w-2xl mx-auto px-6 pt-16 pb-20">
      <span className="font-mono text-xs text-clay uppercase tracking-widest">{t('history.eyebrow')}</span>
      <h2 className="font-display text-4xl text-ink mt-2 mb-10">{t('history.title')}</h2>

      {loading && <p className="font-mono text-xs text-sage">{t('history.loading')}</p>}
      {error && <p className="font-mono text-xs text-clay border-l-2 border-clay pl-3">{error}</p>}
      {!error && (predictions.length > 0 || !loading) && <HistoryList predictions={predictions} />}
      {!loading && hasMore && (
        <button
          type="button"
          onClick={() => load(predictions[predictions.length - 1].createdAt)}
          className="w-full mt-6 border border-ink/25 py-2.5 font-mono text-xs uppercase tracking-wide text-ink/70 hover:border-ink/50"
        >
          {t('history.loadOlder')}
        </button>
      )}
    </div>
  );
};

export default History;