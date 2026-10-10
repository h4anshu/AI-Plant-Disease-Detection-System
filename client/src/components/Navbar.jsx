import React, { useState, useContext } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { AuthContext } from '../context/AuthContext';
import { LANGUAGES } from '../i18n';
import { ArrowUpRight, LeafMark } from './heroIcons';

// Always visible (also on phones, next to the menu button); the choice is remembered (i18n.js)
const LanguageSwitch = () => {
  const { t, i18n } = useTranslation();
  return (
    <div role="group" aria-label={t('nav.language')} className="flex border border-ink/25 font-mono text-xs lg:order-last">
      {Object.entries(LANGUAGES).map(([code, lang]) => (
        <button key={code} type="button" lang={code} aria-label={lang.name} aria-pressed={i18n.language === code}
          onClick={() => i18n.changeLanguage(code)}
          className={`px-3 py-2.5 lg:px-2.5 lg:py-1 ${i18n.language === code ? 'bg-ink text-parchment' : 'text-ink-2 hover:text-ink'}`}>
          {lang.short}
        </button>
      ))}
    </div>
  );
};

const Navbar = () => {
  const { user, logout, isAuthenticated } = useContext(AuthContext);
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [isOpen, setIsOpen] = useState(false);

  const handleLogout = () => {
    logout();
    setIsOpen(false);
    navigate('/login');
  };

  const closeMenu = () => setIsOpen(false);

  return (
    <nav className="border-b border-ink/15 bg-parchment/95 backdrop-blur-sm sticky top-0 z-50">
      <div className="max-w-[2000px] mx-auto flex items-center justify-between px-[clamp(1.25rem,4.2vw,5.5rem)] py-4">
        {/* Logo */}
        <Link to="/" onClick={closeMenu} className="flex items-center gap-3">
          <LeafMark className="h-8 w-9 text-leaf-text" />
          <span className="font-display text-[1.7rem] leading-none text-ink">PlantGuard</span>
          <span className="hidden sm:inline border-l border-ink/25 pl-3 font-mono text-[11px] text-ink-2 tracking-[0.25em] uppercase">Field Clinic</span>
        </Link>

        <div className="flex items-center gap-4 lg:gap-6">
        <LanguageSwitch />
        {/* Mobile Hamburger Button */}
        <button
          onClick={() => setIsOpen(!isOpen)}
          type="button"
          aria-label={t('nav.toggle')}
          className="lg:hidden text-ink focus:outline-none p-2.5 -m-1.5"
        >
          <svg className="w-6 h-6 fill-current" viewBox="0 0 24 24">
            {isOpen ? (
              <path
                fillRule="evenodd"
                clipRule="evenodd"
                d="M18.278 16.864a1 1 0 0 1-1.414 1.414l-4.829-4.828-4.828 4.828a1 1 0 0 1-1.414-1.414l4.828-4.829-4.828-4.828a1 1 0 0 1 1.414-1.414l4.829 4.828 4.828-4.828a1 1 0 1 1 1.414 1.414l-4.828 4.829 4.828 4.828z"
              />
            ) : (
              <path
                fillRule="evenodd"
                d="M4 5h16a1 1 0 0 1 0 2H4a1 1 0 1 1 0-2zm0 6h16a1 1 0 0 1 0 2H4a1 1 0 0 1 0-2zm0 6h16a1 1 0 0 1 0 2H4a1 1 0 0 1 0-2z"
              />
            )}
          </svg>
        </button>

        {/* Desktop Links */}
        <div className="hidden lg:flex items-center gap-6 font-body text-sm">
          <Link to="/" className="text-ink-2 hover:text-ink transition-colors">
            {t('nav.home')}
          </Link>

          {/* ponytail: login temporarily disabled, always show the signed-in links. Restore the isAuthenticated ternary once login is back on. */}
          <Link to="/overview" className="text-ink-2 hover:text-ink transition-colors">
            {t('nav.myField')}
          </Link>
          <Link to="/predict" className="text-ink-2 hover:text-ink transition-colors">
            {t('nav.diagnose')}
          </Link>
          <Link to="/history" className="text-ink-2 hover:text-ink transition-colors">
            {t('nav.log')}
          </Link>
          <Link to="/map" className="text-ink-2 hover:text-ink transition-colors">
            {t('nav.map')}
          </Link>
          <Link to="/privacy" className="text-ink-2 hover:text-ink transition-colors">
            {t('nav.privacy')}
          </Link>
          <Link to="/predict" className="inline-flex items-center gap-2 rounded-lg bg-pine px-5 py-2.5 text-parchment transition-colors hover:bg-pine-hover">
            {t('nav.start')}<ArrowUpRight className="h-4 w-4" />
          </Link>
        </div>
        </div>
      </div>

      {/* Mobile Menu Dropdown */}
      {isOpen && (
        <div className="lg:hidden border-t border-ink/10 bg-parchment px-6 py-4 flex flex-col gap-4 font-body text-sm">
          <Link to="/" onClick={closeMenu} className="text-ink-2 hover:text-ink transition-colors py-2.5">
            {t('nav.home')}
          </Link>

          {/* ponytail: login temporarily disabled, always show the signed-in links */}
          <Link to="/overview" onClick={closeMenu} className="text-ink-2 hover:text-ink transition-colors py-2.5">
            {t('nav.myField')}
          </Link>
          <Link to="/predict" onClick={closeMenu} className="text-ink-2 hover:text-ink transition-colors py-2.5">
            {t('nav.diagnose')}
          </Link>
          <Link to="/history" onClick={closeMenu} className="text-ink-2 hover:text-ink transition-colors py-2.5">
            {t('nav.log')}
          </Link>
          <Link to="/map" onClick={closeMenu} className="text-ink-2 hover:text-ink transition-colors py-2.5">
            {t('nav.map')}
          </Link>
          <Link to="/privacy" onClick={closeMenu} className="text-ink-2 hover:text-ink transition-colors py-2.5">
            {t('nav.privacy')}
          </Link>
          <Link to="/predict" onClick={closeMenu} className="mt-1 inline-flex items-center justify-center gap-2 rounded-lg bg-pine px-5 py-3 text-parchment">
            {t('nav.start')}<ArrowUpRight className="h-4 w-4" />
          </Link>
        </div>
      )}
    </nav>
  );
};

export default Navbar;