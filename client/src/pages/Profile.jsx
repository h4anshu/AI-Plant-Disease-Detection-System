import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import LangButtons from '../components/LangButtons';
import { ACCURACY } from '../data/accuracy';
import { cropName } from '../locales/terms';
import { deleteMyData, getDeviceId } from '../services/api';
import { readConsent, saveConsent } from '../services/location';
import { useHistory } from '../components/workspace/useHistory';
import { Lbl, PageHead, hasLocation } from '../components/workspace/parts';
import { cropIcon } from '../components/workspace/cropIcon';
import { LeafMark } from '../components/heroIcons';

const TABS = [['prefs', 'tPrefs'], ['privacy', 'tPriv'], ['data', 'tData'], ['about', 'tAbout']];

// Profile & privacy (design "05"): sign-in is switched off, so the "profile" is this browser (a guest card); the slot for an account is drawn but disabled.
const Profile = () => {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const [params, setParams] = useSearchParams();
  const tab = TABS.some(([k]) => k === params.get('tab')) ? params.get('tab') : 'prefs';
  const { items, reload } = useHistory();
  const [consent, setConsent] = useState(readConsent);
  const [del, setDel] = useState('idle');   // idle | ask | busy | done | failed
  const [deleted, setDeleted] = useState(0);
  const shared = consent === 'granted';
  const device = getDeviceId().slice(0, 4) + '-' + getDeviceId().slice(-4);

  const toggleLocation = () => {
    const next = shared ? 'declined' : 'granted';
    saveConsent(next);
    setConsent(next);
  };
  const remove = async () => {
    setDel('busy');
    try {
      setDeleted((await deleteMyData()).data.deleted);
      setDel('done');
      reload();
    } catch {
      setDel('failed');
    }
  };

  return (
    <div className="mx-auto flex max-w-[1180px] flex-col gap-6 px-5 pb-12 pt-6 lg:px-11 lg:pt-9">
      <PageHead eyebrow={t('ws.me.eyebrow')} title={t('ws.me.title')} />

      <section className="ws-card flex flex-wrap items-center gap-5 px-7 py-6">
        <span className="grid h-[72px] w-[72px] place-items-center rounded-full bg-sage-wash text-pine"><LeafMark className="h-[34px] w-[38px]" /></span>
        <div className="min-w-[220px] flex-1">
          <p className="font-display text-3xl">{t('ws.me.guest')}</p>
          <p className="mt-0.5 text-sm text-ink-2">{t('ws.me.guestSince', { count: del === 'done' ? 0 : items.length })}</p>
          <p className="mt-2 font-mono text-[11px] tracking-[0.1em] text-ink-2">{t('ws.me.device', { id: device })}</p>
        </div>
        <div className="flex max-w-[340px] flex-col items-start gap-2">
          <button type="button" className="ws-btn" disabled>{t('ws.me.signIn')}</button>
          <p className="text-[13px] text-ink-2">{t('ws.me.signInNote')}</p>
        </div>
      </section>

      <div role="tablist" aria-label={t('ws.me.tabsAria')} className="ws-tabs">
        {TABS.map(([k, label]) => (
          <button key={k} type="button" role="tab" className="ws-tab" aria-selected={tab === k} onClick={() => setParams({ tab: k }, { replace: true })}>{t(`ws.me.${label}`)}</button>
        ))}
      </div>

      {tab === 'prefs' && (
        <div role="tabpanel" className="ws-card flex max-w-2xl flex-col gap-4 p-6">
          <h2 className="font-display text-2xl">{t('ws.me.langTitle')}</h2>
          <LangButtons className="self-start" />
          <p className="text-sm text-ink-2">{t('ws.me.langNote')}</p>
        </div>
      )}

      {tab === 'privacy' && (
        <div role="tabpanel" className="grid items-start gap-5 lg:grid-cols-2">
          <article className="ws-card flex flex-col gap-4 p-6">
            <h2 className="font-display text-2xl">{t('ws.me.locTitle')}</h2>
            <div className="flex items-center gap-4 rounded-2xl border border-ink/15 bg-white/60 px-4 py-4">
              <label className="ws-sw"><input type="checkbox" checked={shared} onChange={toggleLocation} aria-label={t('ws.me.locTitle')} /><i /></label>
              <p className="flex-1 font-semibold">{shared ? t('location.on') : t('location.off')}</p>
            </div>
            <p className="text-sm text-ink-2">{shared ? t('ws.me.locNoteOn') : t('ws.me.locNoteOff')}</p>
          </article>
          <article className="ws-card flex flex-col gap-4 p-6">
            <h2 className="font-display text-2xl">{t('ws.me.locWhat')}</h2>
            <ol className="flex flex-col gap-3.5">
              {['locUse1', 'locUse2', 'locUse3'].map((k, i) => (
                <li key={k} className="flex gap-3.5"><span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-pine font-display text-parchment">{i + 1}</span><p className="text-[15px]">{t(`ws.me.${k}`)}</p></li>
              ))}
            </ol>
            <Link to="/privacy" className="text-sm font-semibold text-pine underline underline-offset-4">{t('ws.me.privacyPage')}</Link>
          </article>
        </div>
      )}

      {tab === 'data' && (
        <div role="tabpanel" className="grid items-start gap-5 lg:grid-cols-2">
          <article className="ws-card flex flex-col gap-4 p-6">
            <h2 className="font-display text-2xl">{t('ws.me.dataTitle')}</h2>
            <ul className="grid grid-cols-3 gap-3">
              {[[items.length, 'dCheckups'], [items.length, 'dPhotos'], [items.filter(hasLocation).length, 'dLoc']].map(([n, k]) => (
                <li key={k} className="ws-sage p-4"><p className="font-display text-[2.4rem] leading-none tabular-nums">{del === 'done' ? 0 : n}</p><p className="mt-1 text-[13px] text-ink-2">{t(`ws.me.${k}`)}</p></li>
              ))}
            </ul>
            <p className="text-sm text-ink-2">{t('ws.me.dNote')}</p>
          </article>
          <article className="ws-card flex flex-col gap-3.5 border-rust-deep p-6">
            <h2 className="font-display text-2xl text-[#6A2202]">{t('privacy.deleteTitle')}</h2>
            <p className="text-[15px]">{t('privacy.delete')}</p>
            {(del === 'idle' || del === 'failed') && <button type="button" className="ws-btn ws-btn-danger self-start" onClick={() => setDel('ask')}>{t('privacy.deleteButton')}</button>}
            {(del === 'ask' || del === 'busy') && (
              <div className="flex flex-wrap gap-2.5">
                <button type="button" disabled={del === 'busy'} onClick={remove} className="ws-btn border-rust-deep bg-rust-deep">{t('privacy.confirm')}</button>
                <button type="button" disabled={del === 'busy'} onClick={() => setDel('idle')} className="ws-btn ws-btn-ghost">{t('privacy.cancel')}</button>
              </div>
            )}
            {del === 'done' && <p role="status" className="ws-note !bg-[#E4F0D8]">{t('privacy.done', { count: deleted })}</p>}
            {del === 'failed' && <p role="alert" className="ws-note ws-note-bad">{t('privacy.failed')}</p>}
          </article>
        </div>
      )}

      {tab === 'about' && (
        <div role="tabpanel" className="grid items-start gap-5 lg:grid-cols-2">
          <article className="ws-card flex flex-col gap-3.5 p-6">
            <h2 className="font-display text-2xl">{t('ws.me.aboutTitle')}</h2>
            <ul className="flex flex-col">
              {ACCURACY.map((a, i) => {
                const weakest = i === ACCURACY.length - 1;
                return (
                  <li key={a.crop} className="flex min-h-[36px] items-center gap-3 border-t border-ink/10 text-sm">
                    <img src={cropIcon(a.crop)} alt="" className="h-7 w-7 shrink-0 object-contain" />
                    <span className="w-28 font-medium">{cropName(a.crop, lang)}{a.cv ? '*' : ''}</span>
                    <b className={`w-[68px] tabular-nums ${weakest ? 'text-rust-deep' : ''}`}>{(a.acc * 100).toFixed(2)}%</b>
                    <span className="hidden w-[100px] text-[13px] tabular-nums text-ink-2 sm:block">[{(a.lo * 100).toFixed(1)}–{(a.hi * 100).toFixed(1)}]</span>
                    <span className={`ws-bar flex-1 !h-2 ${weakest ? 'ws-bar-rust' : ''}`}><i style={{ width: `${((a.acc * 100 - 70) / 30) * 100}%` }} /></span>
                  </li>
                );
              })}
            </ul>
            <p className="text-[12.5px] text-ink-2">{t('ws.me.aboutNote')}</p>
          </article>
          <article className="ws-card flex flex-col gap-3.5 p-6">
            <h2 className="font-display text-2xl">{t('ws.me.canTitle')}</h2>
            <ul className="flex flex-col gap-3 text-[14.5px] text-ink-2">{['can1', 'can2', 'can3', 'can4'].map((k) => <li key={k}>{t(`ws.me.${k}`)}</li>)}</ul>
            <Lbl className="mt-1">{t('honest.weakest')}: {cropName(ACCURACY[ACCURACY.length - 1].crop, lang)}</Lbl>
          </article>
        </div>
      )}
    </div>
  );
};

export default Profile;
