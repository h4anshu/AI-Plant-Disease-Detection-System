import { useState, useEffect } from 'react';
import HistoryList from '../components/HistoryList';
import { getPredictionHistory } from '../services/api.js';
import { useNavigate } from "react-router-dom";

const History = () => {
  const [predictions, setPredictions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const navigate = useNavigate();

  useEffect(() => {
    const fetchHistory = async () => {
      try {
        const res = await getPredictionHistory();
        setPredictions(res.data);
      } catch (err) {
        setError(err.response?.data?.message || 'Failed to load history');
      } finally {
        setLoading(false);
      }
    };
    fetchHistory();
  }, []);

  return (
    <div className="mt-10">
      <h2 className="text-2xl font-bold text-green-800 text-center mb-4">
        Prediction History
      </h2>

      {loading && <p className="text-center text-gray-500">Loading...</p>}
      {error && <p className="text-center text-red-600">{error}</p>}

      {!loading && !error && <HistoryList predictions={predictions} />}
    </div>
  );
};

export default History;