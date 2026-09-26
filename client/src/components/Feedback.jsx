import { useState } from 'react';
import { getCropClasses, sendFeedback } from '../services/api';

const button = 'font-mono text-xs uppercase tracking-wide px-3 py-1.5 border border-ink/25 text-ink/70 hover:border-ink/50 hover:text-ink disabled:opacity-50';

// "Was this correct?" under a diagnosis. Answers go to server/controllers/predictController.js
// (giveFeedback); corrections are reviewed by an expert before any retraining (docs/MONITORING.md).
const Feedback = ({ predictionId, crop }) => {
  const [answer, setAnswer] = useState(null);
  const [classes, setClasses] = useState(null); // null = picker closed, [] while loading
  const [label, setLabel] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const send = async (feedback, correctedLabel) => {
    setBusy(true);
    setError('');
    try {
      await sendFeedback(predictionId, correctedLabel ? { feedback, correctedLabel } : { feedback });
      setAnswer(feedback);
    } catch {
      setError('Could not save your answer. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  const openPicker = async () => {
    setClasses([]);
    try {
      setClasses((await getCropClasses()).data[crop] ?? []);
    } catch {
      setError('Could not load the list. Please try again.');
      setClasses(null);
    }
  };

  if (answer) {
    return (
      <p role="status" className="font-mono text-xs text-sage mt-5">
        {answer === 'incorrect' ? 'Thank you. Your correction will be checked by an expert.' : 'Thank you for the feedback.'}
      </p>
    );
  }

  return (
    <div className="mt-5 pt-4 border-t border-ink/10">
      <p className="font-mono text-[10px] text-sage uppercase tracking-widest mb-2">Was this correct?</p>
      <div className="flex gap-2">
        <button type="button" className={button} disabled={busy} onClick={() => send('correct')}>Yes</button>
        <button type="button" className={button} disabled={busy} onClick={openPicker}>No</button>
        <button type="button" className={button} disabled={busy} onClick={() => send('unsure')}>Not sure</button>
      </div>

      {classes && (
        <div className="mt-3 flex gap-2 items-center">
          <label htmlFor="corrected-label" className="sr-only">What was it?</label>
          <select id="corrected-label" value={label} onChange={(e) => setLabel(e.target.value)}
            className="flex-1 border border-ink/25 bg-parchment px-2 py-1.5 text-sm text-ink">
            <option value="" disabled>What was it?</option>
            {classes.map((c) => <option key={c} value={c}>{c.replace(/_/g, ' ')}</option>)}
            <option value="Other">Other / not listed</option>
          </select>
          <button type="button" className={button} disabled={busy || !label} onClick={() => send('incorrect', label)}>
            Send
          </button>
        </div>
      )}

      {error && <p className="font-mono text-xs text-clay mt-2">{error}</p>}
    </div>
  );
};

export default Feedback;
