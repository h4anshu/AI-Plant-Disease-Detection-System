import React, { useState, useContext } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { AuthContext } from '../context/AuthContext';
import { LANGUAGES } from '../i18n';

// Always visible (also on phones, next to the menu button); the choice is remembered (i18n.js)
const LanguageSwitch = () => {
  const { t, i18n } = useTranslation();
  return (
    <div role="group" aria-label={t('nav.language')} className="flex border border-ink/25 font-mono text-xs md:order-last">
      {Object.entries(LANGUAGES).map(([code, lang]) => (
        <button key={code} type="button" lang={code} aria-label={lang.name} aria-pressed={i18n.language === code}
          onClick={() => i18n.changeLanguage(code)}
          className={`px-2.5 py-1 ${i18n.language === code ? 'bg-ink text-parchment' : 'text-ink/70 hover:text-ink'}`}>
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
      <div className="max-w-5xl mx-auto flex items-center justify-between px-6 py-4">
        {/* Logo */}
        <Link to="/" onClick={closeMenu} className="flex items-center gap-2">
          <span className="font-display text-2xl italic text-ink">PlantGuard</span>
          <span className="hidden sm:inline font-mono text-[10px] text-sage tracking-widest uppercase">Field Ed.</span>
        </Link>

        <div className="flex items-center gap-4 md:gap-6">
        <LanguageSwitch />
        {/* Mobile Hamburger Button */}
        <button
          onClick={() => setIsOpen(!isOpen)}
          type="button"
          aria-label={t('nav.toggle')}
          className="md:hidden text-ink focus:outline-none p-1"
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
        <div className="hidden md:flex items-center gap-6 font-body text-sm">
          <Link to="/" className="text-ink/70 hover:text-ink transition-colors">
            {t('nav.home')}
          </Link>

          {/* ponytail: login temporarily disabled, always show the signed-in links. Restore the isAuthenticated ternary once login is back on. */}
          <Link to="/predict" className="text-ink/70 hover:text-ink transition-colors">
            {t('nav.diagnose')}
          </Link>
          <Link to="/history" className="text-ink/70 hover:text-ink transition-colors">
            {t('nav.log')}
          </Link>
          <Link to="/map" className="text-ink/70 hover:text-ink transition-colors">
            {t('nav.map')}
          </Link>
          <Link to="/privacy" className="text-ink/70 hover:text-ink transition-colors">
            {t('nav.privacy')}
          </Link>
        </div>
        </div>
      </div>

      {/* Mobile Menu Dropdown */}
      {isOpen && (
        <div className="md:hidden border-t border-ink/10 bg-parchment px-6 py-4 flex flex-col gap-4 font-body text-sm">
          <Link to="/" onClick={closeMenu} className="text-ink/70 hover:text-ink transition-colors py-1">
            {t('nav.home')}
          </Link>

          {/* ponytail: login temporarily disabled, always show the signed-in links */}
          <Link to="/predict" onClick={closeMenu} className="text-ink/70 hover:text-ink transition-colors py-1">
            {t('nav.diagnose')}
          </Link>
          <Link to="/history" onClick={closeMenu} className="text-ink/70 hover:text-ink transition-colors py-1">
            {t('nav.log')}
          </Link>
          <Link to="/map" onClick={closeMenu} className="text-ink/70 hover:text-ink transition-colors py-1">
            {t('nav.map')}
          </Link>
          <Link to="/privacy" onClick={closeMenu} className="text-ink/70 hover:text-ink transition-colors py-1">
            {t('nav.privacy')}
          </Link>
        </div>
      )}
    </nav>
  );
};

export default Navbar;