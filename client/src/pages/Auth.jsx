import { useContext, useRef, useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { AuthContext } from '../context/AuthContext';
import PasswordInput from '../components/PasswordInput';
import ClaimGuest from '../components/ClaimGuest';

const INPUT = 'min-h-[44px] w-full rounded-xl border border-ink/25 bg-white/60 px-3.5 py-2 focus:border-pine focus:outline-none focus:ring-2 focus:ring-pine/25';

// Sign in / create an account (docs/AUTH.md). Optional: PlantGuard works without it, and what a browser made as a guest
// can be added to the account right after signing in (components/ClaimGuest.jsx).
const Auth = ({ mode }) => {
  const register = mode === 'register';
  const { t } = useTranslation();
  const { login, register: signUp, isAuthenticated } = useContext(AuthContext);
  const navigate = useNavigate();
  const [form, setForm] = useState({ name: '', email: '', password: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [claim, setClaim] = useState(false);
  const justSignedIn = useRef(false);   // signing in makes isAuthenticated true a render before `claim` is set: no redirect in between

  if (isAuthenticated && !claim && !justSignedIn.current) return <Navigate to="/overview" replace />;
  const leave = () => navigate('/overview');
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    justSignedIn.current = true;
    try {
      await (register ? signUp(form.name, form.email, form.password) : login(form.email, form.password));
      setClaim(true);
    } catch (err) {
      justSignedIn.current = false;
      const status = err.response?.status;
      setError(status === 401 ? t('auth.badLogin') : status === 409 ? t('auth.exists') : status === 429 ? t('auth.tooMany')
        : status === 400 && err.response.data?.message ? err.response.data.message : t('auth.failed'));
    } finally {
      setBusy(false);
    }
  };

  if (claim) {
    return (
      <div className="mx-auto max-w-lg px-6 pb-20 pt-16">
        <ClaimGuest onDone={leave} />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-sm px-6 pb-20 pt-16">
      <span className="font-mono text-xs uppercase tracking-widest text-clay">{register ? t('auth.registerEyebrow') : t('auth.loginEyebrow')}</span>
      <h1 className="mb-8 mt-2 font-display text-4xl text-ink">{register ? t('auth.registerTitle') : t('auth.loginTitle')}</h1>

      {error && <p role="alert" className="mb-5 border-l-2 border-clay pl-3 text-sm text-clay">{error}</p>}

      <form onSubmit={submit} className="flex flex-col gap-4">
        {register && (
          <div>
            <label htmlFor="auth-name" className="mb-1 block text-sm font-semibold">{t('auth.name')}</label>
            <input id="auth-name" type="text" autoComplete="name" value={form.name} onChange={set('name')} required maxLength={60} className={INPUT} />
          </div>
        )}
        <div>
          <label htmlFor="auth-email" className="mb-1 block text-sm font-semibold">{t('auth.email')}</label>
          <input id="auth-email" type="email" autoComplete="email" value={form.email} onChange={set('email')} required className={INPUT} />
        </div>
        <div>
          <label htmlFor="auth-password" className="mb-1 block text-sm font-semibold">{t('auth.password')}</label>
          <PasswordInput id="auth-password" value={form.password} onChange={set('password')} required minLength={register ? 8 : undefined}
            autoComplete={register ? 'new-password' : 'current-password'} />
          {register && <p className="mt-1.5 text-[13px] text-ink-2">{t('auth.passwordNote')}</p>}
        </div>
        <button type="submit" disabled={busy} className="ws-btn mt-2">{busy ? t('auth.wait') : register ? t('auth.registerButton') : t('auth.loginButton')}</button>
      </form>

      <p className="mt-6 text-sm text-ink-2">
        {register ? t('auth.haveAccount') : t('auth.noAccount')}{' '}
        <Link to={register ? '/login' : '/register'} className="font-semibold text-pine underline underline-offset-4">{register ? t('auth.loginLink') : t('auth.registerLink')}</Link>
      </p>
      <p className="mt-3 text-sm text-ink-2">{t('auth.guestNote')} <Link to="/predict" className="font-semibold text-pine underline underline-offset-4">{t('auth.guestLink')}</Link></p>
    </div>
  );
};

export default Auth;
