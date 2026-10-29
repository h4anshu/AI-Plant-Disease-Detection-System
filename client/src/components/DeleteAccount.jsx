import { useContext, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AuthContext } from '../context/AuthContext';
import PasswordInput from './PasswordInput';

// "Delete my account": the account and everything of it (checkups with photos, fields, answers). The password is asked again.
const DeleteAccount = ({ onDeleted }) => {
  const { t } = useTranslation();
  const { removeAccount } = useContext(AuthContext);
  const [step, setStep] = useState('idle');   // idle | ask | busy
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  const submit = async (e) => {
    e.preventDefault();
    setStep('busy');
    setError('');
    try {
      await removeAccount(password);
      onDeleted?.();
    } catch (err) {
      setStep('ask');
      setError(err.response?.data?.code === 'wrong_password' ? t('auth.wrongPassword') : t('privacy.failed'));
    }
  };

  return (
    <article className="ws-card flex flex-col gap-3.5 border-rust-deep p-6">
      <h2 className="font-display text-2xl text-[#6A2202]">{t('auth.deleteAccountTitle')}</h2>
      <p className="text-[15px]">{t('auth.deleteAccount')}</p>
      {step === 'idle' && <button type="button" className="ws-btn ws-btn-danger self-start" onClick={() => setStep('ask')}>{t('auth.deleteAccountButton')}</button>}
      {step !== 'idle' && (
        <form onSubmit={submit} className="flex max-w-sm flex-col gap-3">
          <label htmlFor="delete-password" className="text-sm font-semibold">{t('auth.passwordConfirm')}</label>
          <PasswordInput id="delete-password" value={password} onChange={(e) => setPassword(e.target.value)} required autoComplete="current-password" />
          {error && <p role="alert" className="ws-note ws-note-bad">{error}</p>}
          <div className="flex flex-wrap gap-2.5">
            <button type="submit" disabled={step === 'busy' || !password} className="ws-btn border-rust-deep bg-rust-deep">{t('auth.deleteAccountConfirm')}</button>
            <button type="button" disabled={step === 'busy'} onClick={() => { setStep('idle'); setPassword(''); setError(''); }} className="ws-btn ws-btn-ghost">{t('privacy.cancel')}</button>
          </div>
        </form>
      )}
    </article>
  );
};

export default DeleteAccount;
