import { useRef } from 'react';
import { useTranslation } from 'react-i18next';
import Icon from './icons';
import { AlertPill } from './alertParts';

// The two halves of the Overview: My Field (leaf checks) and Weather & Alerts. Each tab shows what is waiting in it,
// so nothing important hides behind the other one. tabs: [{ id, title, sub, icon, pills: [{ level, label }] }]
const ModeTabs = ({ tabs, mode, onChange }) => {
  const { t } = useTranslation();
  const refs = useRef({});
  const move = (e, i) => {
    const next = { ArrowRight: i + 1, ArrowLeft: i - 1, Home: 0, End: tabs.length - 1 }[e.key];
    if (next === undefined) return;
    e.preventDefault();
    const tab = tabs[(next + tabs.length) % tabs.length];
    onChange(tab.id);
    refs.current[tab.id]?.focus();
  };
  return (
    <div role="tablist" aria-label={t('alerts.mode.aria')} className="grid gap-4 pb-2 sm:grid-cols-2">
      {tabs.map((tab, i) => (
        <button key={tab.id} ref={(el) => { refs.current[tab.id] = el; }} type="button" role="tab" id={`ws-mode-${tab.id}`} aria-selected={mode === tab.id}
          aria-controls="ws-mode-panel" tabIndex={mode === tab.id ? 0 : -1} className="ws-mode" onClick={() => onChange(tab.id)} onKeyDown={(e) => move(e, i)}>
          <span className="ws-mode-disc"><Icon name={tab.icon} className="h-7 w-7" /></span>
          <span className="flex min-w-0 flex-1 flex-col gap-1">
            <b className="font-display text-[1.6rem] font-normal leading-none sm:text-[1.75rem]">{tab.title}</b>
            <span className="ws-mode-sub">{tab.sub}</span>
          </span>
          <span className="ws-mode-pills">
            {tab.pills.map((p) => <AlertPill key={p.label} level={p.level} label={p.label} />)}
          </span>
        </button>
      ))}
    </div>
  );
};

export default ModeTabs;
