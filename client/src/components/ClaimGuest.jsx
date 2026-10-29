import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { claimGuestData, getGuestData } from '../services/api';

// "Add this browser's records to my account?" Shown right after signing in, and on Profile while there is something to add.
// It only asks and moves on request: on a shared phone, whoever signs in must not absorb another person's records.
// With nothing to add (or if the question cannot be asked) it shows nothing and calls onDone at once.
const ClaimGuest = ({ onDone }) => {
  const { t } = useTranslation();
  const [data, setData] = useState(null);       // { predictions, fields } this browser holds as a guest
  const [state, setState] = useState('ask');    // ask | busy | done | failed
  const [moved, setMoved] = useState(null);
  const done = useRef(onDone);
  done.current = onDone;

  useEffect(() => {
    let alive = true;
    getGuestData().then((res) => {
      if (!alive) return;
      if (res.data.predictions + res.data.fields === 0) done.current?.(); else setData(res.data);
    }).catch(() => { if (alive) done.current?.(); });
    return () => { alive = false; };
  }, []);

  if (!data) return null;

  const add = async () => {
    setState('busy');
    try { setMoved((await claimGuestData()).data); setState('done'); } catch { setState('failed'); }
  };

  return (
    <section className="ws-card flex flex-col gap-3.5 p-6" aria-labelledby="claim-title">
      <h2 id="claim-title" className="font-display text-2xl">{t('auth.claimTitle')}</h2>
      {state !== 'done' && <p className="text-[15px]">{t('auth.claimBody', { predictions: data.predictions, fields: data.fields })}</p>}
      {state === 'done' && (
        <>
          <p role="status" className="ws-note !bg-[#E4F0D8]">{t('auth.claimDone', { predictions: moved.predictions, fields: moved.fields })}</p>
          {moved.fieldsLeft > 0 && <p className="ws-note">{t('auth.claimLeft', { count: moved.fieldsLeft })}</p>}
        </>
      )}
      {state === 'failed' && <p role="alert" className="ws-note ws-note-bad">{t('auth.claimFailed')}</p>}
      <div className="flex flex-wrap gap-2.5">
        {state !== 'done' && <button type="button" className="ws-btn" disabled={state === 'busy'} onClick={add}>{t('auth.claimAdd')}</button>}
        {onDone && <button type="button" className="ws-btn ws-btn-ghost" disabled={state === 'busy'} onClick={() => onDone()}>{state === 'done' ? t('auth.continue') : t('auth.claimSkip')}</button>}
      </div>
    </section>
  );
};

export default ClaimGuest;
