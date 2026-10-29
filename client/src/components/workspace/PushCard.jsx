import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import Icon from './icons';
import { disablePush, enablePush, pushStatus, resyncPush, sendTestPush } from '../../services/push';

// "Alerts on this phone" (docs/PUSH.md): a notification when a serious warning is issued for a saved field, even with the app closed.
// Not shown at all when the server has no push keys. Asks the browser for permission only when the button is tapped.
const PushCard = () => {
  const { t, i18n } = useTranslation();
  const [status, setStatus] = useState(null);      // from pushStatus(); null while asking
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState('');            // a result the person should read: 'tested' | 'failed' | 'limit' | 'testFailed'

  const lang = i18n.language;
  const refresh = useCallback(() => pushStatus().then(setStatus).catch(() => setStatus({ state: 'unsupported' })), []);
  useEffect(() => { refresh(); }, [refresh]);
  // already on: tell the server again, quietly. It heals a copy the server lost, and follows a change of person or language.
  const on = status?.state === 'on';
  useEffect(() => { if (on) resyncPush(lang); }, [on, lang]);

  // nothing to offer: the server has no keys, or this browser cannot (an iPhone outside the home screen is the exception: it is told how)
  if (!status || status.state === 'unconfigured' || (status.state === 'unsupported' && !status.ios)) return null;

  const turnOn = async () => {
    setBusy(true); setNote('');
    try { await enablePush(i18n.language); } catch (err) { setNote(err.code === 'limit' ? 'limit' : err.code === 'denied' ? '' : 'failed'); }
    await refresh();
    setBusy(false);
  };
  const turnOff = async () => { setBusy(true); setNote(''); await disablePush(); await refresh(); setBusy(false); };
  const test = async () => {
    setBusy(true); setNote('');
    try { await sendTestPush(status.endpoint); setNote('tested'); } catch { setNote('testFailed'); }
    setBusy(false);
  };

  return (
    <section aria-labelledby="push-title" className="ws-card flex flex-wrap items-center gap-5 p-6">
      <span className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-sage-wash text-pine"><Icon name="bell" className="h-6 w-6" /></span>
      <div className="min-w-[240px] flex-1">
        <h2 id="push-title" className="font-display text-[1.4rem] leading-tight">{t('push.title')}</h2>
        <p className="mt-1 text-[15px] text-ink-2">
          {on ? t('push.on') : status.state === 'blocked' ? t('push.blocked') : status.state === 'unsupported' ? t('push.ios') : t('push.off')}
        </p>
        {status.state === 'off' && <p className="mt-1 text-[13px] text-ink-2">{t('push.privacy')}</p>}
        {note && <p role={note === 'tested' ? 'status' : 'alert'} className={`ws-note mt-3 ${note === 'tested' ? '!bg-[#E4F0D8]' : 'ws-note-bad'}`}>{t(`push.note.${note}`)}</p>}
      </div>
      <div className="flex flex-wrap gap-2.5">
        {status.state === 'off' && <button type="button" className="ws-btn" disabled={busy} onClick={turnOn}>{t('push.turnOn')}</button>}
        {on && <button type="button" className="ws-btn ws-btn-ghost" disabled={busy} onClick={test}>{t('push.test')}</button>}
        {on && <button type="button" className="ws-btn ws-btn-ghost" disabled={busy} onClick={turnOff}>{t('push.turnOff')}</button>}
      </div>
    </section>
  );
};

export default PushCard;
