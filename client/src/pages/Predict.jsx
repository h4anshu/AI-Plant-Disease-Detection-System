import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { cropName } from '../locales/terms';
import UploadBox from '../components/UploadBox';
import ResultCard from '../components/ResultCard';
import { predictDisease } from '../services/api';

// Both Cloud Run services scale to zero: the first check after a quiet spell also starts them
export const SLOW_AFTER_MS = 8000;

const crops = ['wheat', 'rice', 'sugarcane', 'potato', 'maize', 'pigeonpea', 'groundnut', 'blackgram', 'apple', 'banana'];

const Predict = () => {
  const { t, i18n } = useTranslation();
  const [file, setFile] = useState(null);
  const [crop, setCrop] = useState('wheat');
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [slow, setSlow] = useState(false);

  const handleAnalyze = async () => {
    if (!file) {
      setError(t('predict.selectFirst'));
      return;
    }
    setError('');
    setLoading(true);
    setResult(null);
    const slowTimer = setTimeout(() => setSlow(true), SLOW_AFTER_MS);

    try {
      const formData = new FormData();
      formData.append('image', file);
      formData.append('crop', crop);
      const res = await predictDisease(formData);
      setResult(res.data);
    } catch (err) {
      setError(err.response?.data?.message || t('predict.failed'));
    } finally {
      clearTimeout(slowTimer);
      setSlow(false);
      setLoading(false);
    }
  };

  return (
    <div className="max-w-6xl mx-auto px-6 pt-16 pb-20">
      <span className="font-mono text-xs text-clay uppercase tracking-widest">{t('predict.eyebrow')}</span>
      <h2 className="font-display text-4xl text-ink mt-2 mb-10">{t('predict.title')}</h2>

      <div className="grid lg:grid-cols-2 gap-12 items-start">
        {/* Left: form */}
        <div className="w-full">
          <label className="font-mono text-[10px] text-sage uppercase tracking-widest block mb-3">
            {t('predict.selectCrop')}
          </label>
          <div className="flex flex-wrap gap-2 mb-8">
            {crops.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setCrop(c)}
                className={`font-mono text-xs uppercase tracking-wide px-3 py-1.5 border transition-colors
                  ${crop === c
                    ? 'bg-ink text-parchment border-ink'
                    : 'border-ink/25 text-ink/60 hover:border-ink/50 hover:text-ink'}`}
              >
                {cropName(c, i18n.language)}
              </button>
            ))}
          </div>

          <label className="font-mono text-[10px] text-sage uppercase tracking-widest block mb-3">
            {t('predict.leafPhoto')}
          </label>
          <UploadBox onFileSelect={setFile} />

          {error && (
            <p className="font-mono text-xs text-clay mt-4 border-l-2 border-clay pl-3">{error}</p>
          )}

          <button
            onClick={handleAnalyze}
            disabled={loading}
            className="w-full mt-6 bg-field text-parchment py-3.5 font-mono text-sm uppercase tracking-wide hover:bg-field-dark disabled:opacity-50 transition-colors"
          >
            {loading ? t('predict.reading') : t('predict.analyze')}
          </button>
          {slow && (
            <p role="status" className="font-mono text-xs text-sage mt-3">
              {t('predict.waking')}
            </p>
          )}
        </div>

        {/* Right: result */}
        <div className="w-full lg:sticky lg:top-24">
          {result ? (
            <ResultCard result={result} />
          ) : (
            <div className="bg-sage/10 border border-sage/25 p-12 text-center min-h-[420px] flex flex-col items-center justify-center gap-3">
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" className="text-sage/60">
                <path d="M12 3C7 3 4 7 4 12c0 4 3 8 8 9 5-1 8-5 8-9 0-5-3-9-8-9z" stroke="currentColor" strokeWidth="1.2"/>
                <path d="M12 3v18M12 3C8 6 6 9 6 12" stroke="currentColor" strokeWidth="1"/>
              </svg>
              <p className="font-display text-lg text-ink/50 italic">{t('predict.awaiting')}</p>
              <p className="font-mono text-[10px] text-sage uppercase tracking-widest">
                {t('predict.willAppear')}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default Predict;