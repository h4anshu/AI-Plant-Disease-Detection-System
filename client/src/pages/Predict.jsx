import React from 'react'
import UploadBox from '../components/UploadBox'
import ResultCard from '../components/ResultCard'
import { predictDisease } from '../services/api.js'
import { useState } from 'react'

const crops = ['wheat', 'potato', 'mustard', 'sugarcane'];

const Predict = () => {
  const [file, setFile] = useState(null);
  const [crop, setCrop] = useState('wheat');
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleAnalyze = async () => {
    if (!file) {
      setError('Please select a leaf image first');
      return;
    }

    setError('');
    setLoading(true);
    setResult(null);

    try {
      const formData = new FormData();
      formData.append('image', file);
      formData.append('crop', crop);

      const res = await predictDisease(formData);
      setResult(res.data);
    } catch (err) {
      setError(err.response?.data?.message || 'Prediction failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-xl mx-auto mt-10 px-4">
      <h2 className="text-2xl font-bold text-green-800 mb-6 text-center">
        Analyze Your Crop
      </h2>

      <div className="mb-4">
        <label className="block text-sm font-medium text-gray-700 mb-1">Select Crop</label>
        <select
          value={crop}
          onChange={(e) => setCrop(e.target.value)}
          className="w-full border rounded px-3 py-2"
        >
          {crops.map((c) => (
            <option key={c} value={c}>{c.charAt(0).toUpperCase() + c.slice(1)}</option>
          ))}
        </select>
      </div>

      <UploadBox onFileSelect={setFile} />

      {error && <div className="bg-red-100 text-red-700 p-2 rounded mt-4 text-sm">{error}</div>}

      <button
        onClick={handleAnalyze}
        disabled={loading}
        className="w-full mt-4 bg-green-700 text-white py-2 rounded hover:bg-green-800 disabled:opacity-50"
      >
        {loading ? 'Analyzing...' : 'Analyze'}
      </button>

      <ResultCard result={result} />
    </div>
  );
};

export default Predict
