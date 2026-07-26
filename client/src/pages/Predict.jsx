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
    <div className="max-w-xl mx-auto px-6 pt-16 pb-20">
      <span className="font-mono text-xs text-clay uppercase tracking-widest">Field Diagnosis</span>
      <h2 className="font-display text-4xl text-ink mt-2 mb-8">Analyze a leaf</h2>

      <div className="mb-6">
        <label className="font-mono text-[10px] text-sage uppercase tracking-widest block mb-2">Crop</label>
        <select
          value={crop}
          onChange={(e) => setCrop(e.target.value)}
          className="w-full border border-ink/25 bg-transparent px-3 py-2 font-body text-ink focus:outline-none focus:border-field"
        >
          {crops.map((c) => (
            <option key={c} value={c}>{c.charAt(0).toUpperCase() + c.slice(1)}</option>
          ))}
        </select>
      </div>

      <UploadBox onFileSelect={setFile} />

      {error && (
        <p className="font-mono text-xs text-clay mt-4 border-l-2 border-clay pl-3">{error}</p>
      )}

      <button
        onClick={handleAnalyze}
        disabled={loading}
        className="w-full mt-6 bg-field text-parchment py-3 font-mono text-sm uppercase tracking-wide hover:bg-field-dark disabled:opacity-50 transition-colors"
      >
        {loading ? 'Reading the leaf…' : 'Analyze'}
      </button>

      <ResultCard result={result} />
    </div>
  );
};

export default Predict
