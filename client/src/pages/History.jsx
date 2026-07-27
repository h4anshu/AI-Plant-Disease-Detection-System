import { useState, useEffect } from 'react';
import HistoryList from '../components/HistoryList';
import { getPredictionHistory } from '../services/api';

const History = () => {
  const [predictions, setPredictions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const fetchHistory = async () => {
      try {
        const res = await getPredictionHistory();
        setPredictions(res.data);
      } catch (err) {
        setError(err.response?.data?.message || 'Could not load the log.');
      } finally {
        setLoading(false);
      }
    };
    fetchHistory();
  }, []);

  return (
    <div className="max-w-2xl mx-auto px-6 pt-16 pb-20">
      <span className="font-mono text-xs text-clay uppercase tracking-widest">Your Record</span>
      <h2 className="font-display text-4xl text-ink mt-2 mb-10">Field log</h2>

      {loading && <p className="font-mono text-xs text-sage">Loading…</p>}
      {error && <p className="font-mono text-xs text-clay border-l-2 border-clay pl-3">{error}</p>}
      {!loading && !error && <HistoryList predictions={predictions} />}
    </div>
  );
};

export default History;