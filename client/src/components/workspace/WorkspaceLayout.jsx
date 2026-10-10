import { Link, Outlet, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { LANGUAGES } from '../../i18n';
import { LeafMark } from '../heroIcons';
import DemoBanner from '../DemoBanner';
import Icon from './icons';
import { readReturn } from './siteReturn';

// [icon, route, the routes that light it up, menu key, tab-bar key]
const ITEMS = [
  ['overview', '/overview', ['/overview'], 'overview', 'tabHome'],
  ['check', '/predict', ['/predict'], 'check', 'tabCheck'],
  ['log', '/history', ['/history', '/checkup'], 'log', 'tabLog'],
  ['map', '/map', ['/map'], 'map', 'tabMap'],
  ['me', '/me', ['/me'], 'me', 'tabMe'],
];

const LangSeg = () => {
  const { t, i18n } = useTranslation();
  return (
    <div role="group" aria-label={t('nav.language')} className="ws-seg self-start">
      {Object.entries(LANGUAGES).map(([code, lang]) => (
        <button key={code} type="button" lang={code} aria-label={lang.name} aria-pressed={i18n.language === code} onClick={() => i18n.changeLanguage(code)}>{lang.short}</button>
      ))}
    </div>
  );
};

// The signed-in-or-guest area: a left menu on desktop, a bottom tab bar (with a raised camera button) on phones.
const WorkspaceLayout = () => {
  const { t } = useTranslation();
  const { pathname } = useLocation();
  const back = readReturn()?.path || '/';
  const on = (routes) => routes.some((r) => pathname === r || pathname.startsWith(`${r}/`));

  return (
    <>
      <DemoBanner />
      <div className="lg:flex lg:min-h-svh">
        <div className="hidden w-[248px] flex-none border-r border-ink/15 bg-[#EFE8D4] lg:block">
        <aside className="flex flex-col gap-5 px-4 py-6 lg:sticky lg:top-0 lg:h-svh lg:overflow-y-auto">
          <Link to={back} className="-mb-2 inline-flex min-h-[44px] items-center gap-1.5 self-start rounded-full px-2 text-sm font-semibold text-pine hover:bg-pine/10"><Icon name="back" className="h-4 w-4" />{t('ws.menu.back')}</Link>
          <Link to="/" aria-label={t('ws.menu.home')} className="flex items-center gap-2.5 px-1.5">
            <LeafMark className="h-8 w-9 text-leaf-text" />
            <span className="flex flex-col leading-none"><span className="font-display text-2xl text-ink">PlantGuard</span><span className="mt-1 font-mono text-[11px] uppercase tracking-[0.3em] text-ink-2">Field clinic</span></span>
          </Link>
          <Link to="/predict" className="ws-btn w-full"><Icon name="check" />{t('ws.menu.scan')}</Link>
          <nav className="ws-nav" aria-label={t('ws.menu.aria')}>
            <ul className="flex flex-col gap-1">
              {ITEMS.map(([icon, to, routes, key]) => (
                <li key={icon}><Link to={to} aria-current={on(routes) ? 'page' : undefined}><Icon name={icon} />{t(`ws.menu.${key}`)}</Link></li>
              ))}
            </ul>
          </nav>
          <div className="flex-1" />
          <div className="rounded-2xl border border-ink/10 bg-white/55 p-3.5">
            <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-leaf-text">{t('ws.menu.guest')}</p>
            <p className="mt-1.5 text-[13px] leading-snug text-ink-2">{t('ws.menu.guestNote')}</p>
          </div>
          <LangSeg />
        </aside>
        </div>

        <div className="min-w-0 flex-1 pb-28 lg:pb-0">
          <header className="flex items-center justify-between px-5 py-3 lg:hidden">
            <div className="flex items-center gap-1">
              <Link to={back} aria-label={t('ws.menu.back')} className="-ml-2 grid h-11 w-11 place-items-center rounded-full text-pine"><Icon name="back" /></Link>
              <Link to="/" className="flex items-center gap-2"><LeafMark className="h-7 w-8 text-leaf-text" /><span className="font-display text-[22px] text-ink">PlantGuard</span></Link>
            </div>
            <LangSeg />
          </header>
          <Outlet />
        </div>
      </div>

      <nav aria-label={t('ws.menu.aria')} className="fixed inset-x-0 bottom-0 z-40 border-t border-ink/15 bg-[#FBF8F0] px-2 pb-[env(safe-area-inset-bottom)] lg:hidden">
        <ul className="flex items-start pt-2">
          {ITEMS.map(([icon, to, routes, , tab]) => {
            const active = on(routes);
            const fab = icon === 'check';
            return (
              <li key={icon} className="flex-1">
                <Link to={to} aria-current={active ? 'page' : undefined} aria-label={t(`ws.menu.${tab}`)}
                  className={`flex min-h-[56px] flex-col items-center gap-0.5 no-underline ${active ? 'text-pine' : 'text-ink-2'}`}>
                  {fab
                    ? <span className="-mt-5 grid h-14 w-14 place-items-center rounded-full bg-pine text-parchment shadow-[0_12px_20px_-8px_rgba(7,38,24,.6),0_0_0_5px_#FBF8F0]"><Icon name="check" className="h-7 w-7" /></span>
                    : <span className={`grid h-8 w-14 place-items-center rounded-full ${active ? 'bg-sage-wash' : ''}`}><Icon name={icon} /></span>}
                  <span className={`text-xs leading-tight ${active ? 'font-bold' : 'font-medium'}`}>{t(`ws.menu.${tab}`)}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </>
  );
};

export default WorkspaceLayout;
