import { createContext, useCallback, useEffect, useMemo, useState } from "react";
import { deleteAccount, getMe, loginUser, registerUser } from "../services/api";
import { clearLast } from "../services/offlineCache";
import { disablePush, resyncPush } from "../services/push";
import i18n from "../i18n";

// The default lets pages render without a provider (tests, previews): a guest.
export const AuthContext = createContext({ user: null, isAuthenticated: false, loading: false });

const read = () => {
  try {
    const user = JSON.parse(localStorage.getItem('user'));
    return localStorage.getItem('token') && user?.id ? user : null;
  } catch { return null; }
};
const store = (data) => {
  try { localStorage.setItem('token', data.token); localStorage.setItem('user', JSON.stringify(data.user)); } catch { /* private mode: signed in until the page closes */ }
};
const forget = () => {
  try { localStorage.removeItem('token'); localStorage.removeItem('user'); } catch { /* private mode */ }
  clearLast();   // the next person to use this phone must not see the last alerts and log
};

// Who is signed in (docs/AUTH.md). Signing in is optional: without it the browser is a guest.
export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(read);

  useEffect(() => {
    // the server says a token is no longer good (api.js): sign out
    const expired = () => { clearLast(); setUser(null); };
    window.addEventListener('auth:expired', expired);
    // a saved session is checked once per visit; offline or a server error keeps it (only a 401 'invalid_token' signs out, in api.js)
    // (the server also sends a fresh token when the old one is half used, which keeps people who open the app now and then signed in)
    if (read()) getMe().then((res) => { if (res.data.token) store({ token: res.data.token, user: read() }); }).catch(() => {});
    return () => window.removeEventListener('auth:expired', expired);
  }, []);

  const start = useCallback(async (request) => {
    const res = await request;
    store(res.data);
    setUser(res.data.user);
    resyncPush(i18n.language);   // notifications already on follow the person who signed in
    return res.data;
  }, []);

  const value = useMemo(() => ({
    user,
    isAuthenticated: !!user,
    loading: false,
    login: (email, password) => start(loginUser({ email, password })),
    register: (name, email, password) => start(registerUser({ name, email, password })),
    // notifications go off first: on a shared phone the next person must not be sent this one's warnings
    logout: () => { disablePush(); forget(); setUser(null); },
    // erases the account and everything of it on the server, then signs out
    removeAccount: async (password) => { const res = await deleteAccount(password); disablePush(); forget(); setUser(null); return res.data; },
  }), [user, start]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};
