// The last good answer of a few calls (the alerts, the log), kept in this browser for the person who made it, so that with no signal the
// app shows what it last knew instead of an error (docs/OFFLINE.md). Kept per owner (the account, or the guest browser): the next person
// to use the phone never sees it, and it is erased on sign-out, on an ended session and on "Delete my data".
// It holds the same text the API returned (never an exact field place: the API has none to return).
const PREFIX = 'pg:last:';

const owner = () => {
  try {
    const user = localStorage.getItem('token') && JSON.parse(localStorage.getItem('user'));
    return user?.id ? `u:${user.id}` : `d:${localStorage.getItem('deviceId') ?? ''}`;
  } catch { return null; }
};

export const saveLast = (name, data) => {
  const who = owner();
  if (!who) return;
  try { localStorage.setItem(`${PREFIX}${name}:${who}`, JSON.stringify({ at: Date.now(), data })); } catch { /* storage full or private mode: nothing is kept */ }
};

// -> { at, data } or null
export const readLast = (name) => {
  const who = owner();
  if (!who) return null;
  try { return JSON.parse(localStorage.getItem(`${PREFIX}${name}:${who}`)); } catch { return null; }
};

// the service could not be reached at all (no signal, or Cloud Run's front end answering 502/503/504), not "it answered and said no"
export const unreachable = (err) => !err.response || err.response.status >= 502;

export const clearLast = () => {
  try { Object.keys(localStorage).filter((k) => k.startsWith(PREFIX)).forEach((k) => localStorage.removeItem(k)); } catch { /* private mode */ }
};
