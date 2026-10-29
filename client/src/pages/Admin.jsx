import { useCallback, useEffect, useState } from 'react';
import { getAdminFeedback, getAdminHealth, getAdminSummary } from '../services/api';
import { cropName, diseaseName } from '../locales/terms';

// The operator's page (docs/ADMIN.md): use of the app, how often the model is right, the state of the feeds and of the free services, in counts
// only. For one person: it is in English on purpose and is not linked from anywhere. The token is typed here and kept for this tab only
// (sessionStorage), never in localStorage; the server decides everything (a wrong token is a 401, no token set on the server a 503).
const KEY = 'adminToken';
const read = () => { try { return sessionStorage.getItem(KEY) ?? ''; } catch { return ''; } };
const keep = (v) => { try { if (v) sessionStorage.setItem(KEY, v); else sessionStorage.removeItem(KEY); } catch { /* private mode: this visit only */ } };

const Card = ({ title, children, wide }) => (
  <section className={`ws-card flex min-w-0 flex-col gap-3 p-6 ${wide ? 'lg:col-span-2' : ''}`} aria-label={title}>
    <h2 className="font-display text-2xl">{title}</h2>
    {children}
  </section>
);
const Stat = ({ label, value, note }) => (
  <div className="ws-sage p-4"><p className="font-display text-[2.2rem] leading-none tabular-nums">{value ?? '–'}</p><p className="mt-1 text-[13px] text-ink-2">{label}</p>{note && <p className="text-[12px] text-ink-2">{note}</p>}</div>
);
const Table = ({ head, rows, empty = 'Nothing yet.' }) => (rows.length === 0 ? <p className="text-sm text-ink-2">{empty}</p> : (
  <div className="overflow-x-auto">
    <table className="w-full text-left text-sm">
      <thead><tr className="border-b border-ink/15 text-[12px] uppercase tracking-wide text-ink-2">{head.map((h) => <th key={h} className="py-2 pr-4 font-semibold">{h}</th>)}</tr></thead>
      <tbody>{rows.map((r, i) => <tr key={i} className="border-b border-ink/10">{r.map((c, j) => <td key={j} className="py-2 pr-4 tabular-nums">{c}</td>)}</tr>)}</tbody>
    </table>
  </div>
));
const ago = (iso) => {
  if (!iso) return 'never';
  const min = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  return min < 1 ? 'just now' : min < 90 ? `${min} min ago` : min < 2880 ? `${Math.round(min / 60)} h ago` : `${Math.round(min / 1440)} days ago`;
};
const pct = (v) => (v == null ? '–' : `${v}%`);

const Admin = () => {
  const [token, setToken] = useState(read);
  const [typed, setTyped] = useState('');
  const [data, setData] = useState(null);
  const [state, setState] = useState(read() ? 'loading' : 'ask');   // ask | loading | ready | denied | off | failed
  useEffect(() => {
    const robots = document.createElement('meta');
    robots.name = 'robots';
    robots.content = 'noindex';
    document.head.appendChild(robots);
    return () => robots.remove();
  }, []);

  const load = useCallback(async (t) => {
    setState('loading');
    try {
      // the summary decides; the other two add to it and may fail on their own
      const [summary, health, feedback] = await Promise.allSettled([getAdminSummary(t), getAdminHealth(t), getAdminFeedback(t)]);
      if (summary.status === 'rejected') {
        const status = summary.reason.response?.status;
        if (status === 401 || status === 429) { keep(''); setToken(''); }
        setState(status === 401 ? 'denied' : status === 429 ? 'locked' : status === 503 ? 'off' : 'failed');
        return;
      }
      setData({ summary: summary.value.data, health: health.status === 'fulfilled' ? health.value.data : null, feedback: feedback.status === 'fulfilled' ? feedback.value.data : null });
      setState('ready');
    } catch {
      setState('failed');
    }
  }, []);
  useEffect(() => { if (token) load(token); }, [token, load]);

  const submit = (e) => { e.preventDefault(); const t = typed.trim(); if (!t) return; keep(t); setToken(t); setTyped(''); };
  const signOut = () => { keep(''); setToken(''); setData(null); setState('ask'); };

  if (state === 'ask' || state === 'denied' || state === 'locked' || state === 'off') {
    return (
      <div className="mx-auto max-w-sm px-6 pb-20 pt-16">
        <h1 className="font-display text-4xl">Operator page</h1>
        <form onSubmit={submit} className="mt-6 flex flex-col gap-3">
          <label htmlFor="admin-token" className="text-sm font-semibold">Operator token</label>
          <input id="admin-token" type="password" autoComplete="off" value={typed} onChange={(e) => setTyped(e.target.value)} required
            className="min-h-[44px] rounded-xl border border-ink/25 bg-white/60 px-3.5 focus:border-pine focus:outline-none focus:ring-2 focus:ring-pine/25" />
          {state === 'denied' && <p role="alert" className="ws-note ws-note-bad">That token is not right.</p>}
          {state === 'locked' && <p role="alert" className="ws-note ws-note-bad">Too many wrong tokens. Wait a few minutes.</p>}
          {state === 'off' && <p role="alert" className="ws-note ws-note-bad">The server has no operator token set (ALERTS_ADMIN_TOKEN), so this page is off.</p>}
          <button type="submit" className="ws-btn">Open</button>
        </form>
      </div>
    );
  }
  if (state === 'loading') return <p role="status" className="px-6 pt-16 text-center font-mono text-xs text-ink-2">Loading…</p>;
  if (state === 'failed') {
    return (
      <div className="mx-auto max-w-sm px-6 pt-16">
        <p role="alert" className="ws-note ws-note-bad">The summary could not be loaded.</p>
        <div className="mt-4 flex gap-2.5"><button type="button" className="ws-btn" onClick={() => load(token)}>Try again</button><button type="button" className="ws-btn ws-btn-ghost" onClick={signOut}>Sign out</button></div>
      </div>
    );
  }

  const { summary: s, health, feedback } = data;
  const usage = health?.usage;
  return (
    <div className="mx-auto flex max-w-[1180px] flex-col gap-6 px-5 pb-16 pt-8 lg:px-11">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div><h1 className="font-display text-4xl">Operator page</h1><p className="text-sm text-ink-2">Counts only. Updated {ago(s.generatedAt)}.</p></div>
        <div className="flex gap-2.5"><button type="button" className="ws-btn ws-btn-ghost" onClick={() => load(token)}>Refresh</button><button type="button" className="ws-btn ws-btn-ghost" onClick={signOut}>Sign out</button></div>
      </header>

      <div className="grid items-start gap-5 lg:grid-cols-2">
        <Card title="Use of the app" wide>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat label="Accounts" value={s.users.total} note={`${s.users.newThisWeek} new this week`} />
            <Stat label="Saved fields" value={s.fields.total} note={Object.entries(s.fields.byCrop).map(([c, n]) => `${cropName(c, 'en')} ${n}`).join(', ') || undefined} />
            <Stat label="Checkups, 30 days" value={s.checkups.last30Days} note={`${s.checkups.last7Days} in 7 days, ${s.checkups.total} in all`} />
            <Stat label="Notifications on" value={s.push.subscriptions} note={Object.entries(s.push.byLanguage).map(([l, n]) => `${l} ${n}`).join(', ') || undefined} />
          </div>
          <Table head={['Outcome of checkups, 30 days', 'Count']} rows={Object.entries(s.checkups.byStatusLast30Days).map(([k, n]) => [k.replace(/_/g, ' '), n])} />
          <p className="text-[13px] text-ink-2">{s.checkups.withLocationLast30Days} of them shared a location.</p>
        </Card>

        <Card title="Is the model right? (the users' own answer)">
          <p className="text-sm text-ink-2">"Was this correct?" Right = correct ÷ (correct + incorrect); "not sure" counts for neither. Guest answers are unverified.</p>
          <Stat label={`${s.modelFeedback.answered} answers`} value={pct(s.modelFeedback.rightPct)} />
          <Table head={['Crop', 'Answers', 'Correct', 'Wrong', 'Not sure', 'Right']} empty="No answers yet."
            rows={s.modelFeedback.byCrop.map((r) => [cropName(r.crop, 'en'), r.answered, r.correct, r.incorrect, r.unsure, pct(r.rightPct)])} />
        </Card>

        <Card title="Most common diseases, 30 days">
          <Table head={['Crop', 'Disease', 'Checkups']} empty="No disease results in 30 days."
            rows={s.topDiseasesLast30Days.map((r) => [cropName(r.crop, 'en'), diseaseName(r.crop, r.disease, 'en'), r.n])} />
        </Card>

        <Card title="Did the alerts help?">
          {feedback ? (
            <>
              <Stat label={`${feedback.total} answers`} value={pct(feedback.helpfulPct)} note="acted on it (target 60% or more)" />
              <Table head={['Rule', 'Answers', 'Acted', 'Not needed', 'Wrong']} empty="No answers yet."
                rows={feedback.rules.map((r) => [r.rule, r.total, `${r.helpfulPct}%`, r.notNeeded, `${r.wrongPct}%`])} />
            </>
          ) : <p className="text-sm text-ink-2">Could not be loaded.</p>}
        </Card>

        <Card title="Feeds and switches">
          {health ? (
            <>
              <Table head={['Feed', 'State', 'Fetched']} rows={health.sources.map((x) => [x.source, x.state, ago(x.fetchedAt)])} />
              <p className="text-[13px]">Switched off: {Object.entries(health.switches).filter(([, v]) => v === 'off').map(([k]) => k).join(', ') || 'none'}.</p>
              <p className="text-[13px]">Configured: {Object.entries(health.configured).map(([k, v]) => `${k} ${v ? 'yes' : 'no'}`).join(', ')}.</p>
            </>
          ) : <p className="text-sm text-ink-2">Could not be loaded.</p>}
        </Card>

        <Card title="Free services today" wide>
          {usage ? (
            <>
              <Stat label="of Open-Meteo's 10,000 a day" value={pct(usage.openMeteoPct)} note={`${usage.openMeteoCalls} calls counted`} />
              <Table head={['Service', 'Calls today', 'Limit', 'Used']} rows={usage.services.map((u) => [u.service, u.calls, u.perDay ?? 'see note', u.pct == null ? '–' : `${u.pct}%`])} />
            </>
          ) : <p className="text-sm text-ink-2">Could not be loaded.</p>}
        </Card>
      </div>
    </div>
  );
};

export default Admin;
