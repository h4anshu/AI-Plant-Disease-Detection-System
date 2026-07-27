import React, { useState, useContext } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { AuthContext } from '../context/AuthContext';

const Navbar = () => {
  const { user, logout, isAuthenticated } = useContext(AuthContext);
  const navigate = useNavigate();
  const location = useLocation();
  const [isOpen, setIsOpen] = useState(false);

  const handleLogout = () => {
    logout();
    navigate('/login');
    setIsOpen(false);
  };

  const toggleMenu = () => setIsOpen(!isOpen);
  const closeMenu = () => setIsOpen(false);

  const isActive = (path) => location.pathname === path;

  return (
    <nav className="border-b border-ink/15 bg-parchment sticky top-0 z-40">
      <div className="max-w-5xl mx-auto flex items-center justify-between px-6 py-4">

        <Link to="/" onClick={closeMenu} className="flex items-center gap-3 group">
          <div className="flex flex-col">
            <span className="font-display text-2xl italic text-ink tracking-tight group-hover:opacity-85 transition-opacity">
              PlantGuard
            </span>
            <div className="flex items-center gap-1.5">
              <span className="font-mono text-[9px] text-sage tracking-widest uppercase">
                Field Ed.
              </span>
              <span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-600 animate-pulse" title="System Online" />
            </div>
          </div>
        </Link>

        {/* Desktop Navigation */}
        <div className="hidden md:flex items-center gap-6 font-body text-sm">
          <Link
            to="/"
            className={`transition-colors relative py-1 ${
              isActive('/') ? 'text-ink font-medium' : 'text-ink/70 hover:text-ink'
            }`}
          >
            Home
            {isActive('/') && <span className="absolute bottom-0 left-0 w-full h-[1.5px] bg-sage rounded-full" />}
          </Link>

          {isAuthenticated ? (
            <>
              <Link
                to="/predict"
                className={`transition-colors relative py-1 ${
                  isActive('/predict') ? 'text-ink font-medium' : 'text-ink/70 hover:text-ink'
                }`}
              >
                Diagnose
                {isActive('/predict') && <span className="absolute bottom-0 left-0 w-full h-[1.5px] bg-sage rounded-full" />}
              </Link>
              <Link
                to="/history"
                className={`transition-colors relative py-1 ${
                  isActive('/history') ? 'text-ink font-medium' : 'text-ink/70 hover:text-ink'
                }`}
              >
                Log
                {isActive('/history') && <span className="absolute bottom-0 left-0 w-full h-[1.5px] bg-sage rounded-full" />}
              </Link>

              <div className="flex items-center gap-2 pl-2 border-l border-ink/15">
                <div className="w-6 h-6 rounded-full bg-sage/20 border border-sage/40 flex items-center justify-center font-mono text-[10px] text-ink font-semibold">
                  {user?.name ? user.name.charAt(0).toUpperCase() : 'U'}
                </div>
                <span className="font-mono text-xs text-sage truncate max-w-[100px]">{user?.name}</span>
              </div>

              <button
                onClick={handleLogout}
                className="border border-ink/25 text-ink px-3 py-1.5 text-xs font-mono uppercase tracking-wide hover:bg-ink hover:text-parchment active:scale-95 transition-all"
              >
                Sign out
              </button>
            </>
          ) : (
            <>
              <Link to="/login" className="text-ink/70 hover:text-ink transition-colors px-2 py-1">
                Sign in
              </Link>
              <Link
                to="/register"
                className="bg-field text-parchment px-4 py-1.5 text-xs font-mono uppercase tracking-wide hover:bg-field-dark shadow-sm hover:shadow transition-all active:scale-95"
              >
                Get started
              </Link>
            </>
          )}
        </div>

        {/* Mobile Hamburger */}
        <button
          onClick={toggleMenu}
          className="md:hidden p-2 text-ink hover:text-ink/70 focus:outline-none focus:ring-1 focus:ring-ink/20 rounded"
          aria-label="Toggle navigation menu"
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
      </div>

      {/* Mobile overlay */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-ink/40 z-[90] md:hidden"
          onClick={closeMenu}
        />
      )}

      {/* Mobile drawer */}
<div
  className={`fixed top-0 right-0 h-full w-72 max-w-[80vw] bg-parchment border-l border-ink/15 p-6 z-[100] transform transition-transform duration-300 ease-in-out md:hidden flex flex-col justify-between shadow-xl ${
    isOpen ? 'translate-x-0' : 'translate-x-full'
  }`}
>
  <div>
    <div className="flex justify-end mb-6">
      <button
        onClick={closeMenu}
        className="p-2 text-ink hover:text-ink/70"
        aria-label="Close menu"
      >
        <svg className="w-5 h-5 fill-current" viewBox="0 0 24 24">
          <path
            fillRule="evenodd"
            clipRule="evenodd"
            d="M18.278 16.864a1 1 0 0 1-1.414 1.414l-4.829-4.828-4.828 4.828a1 1 0 0 1-1.414-1.414l4.828-4.829-4.828-4.828a1 1 0 0 1 1.414-1.414l4.829 4.828 4.828-4.828a1 1 0 1 1 1.414 1.414l-4.828 4.829 4.828 4.828z"
          />
        </svg>
      </button>
    </div>

    <div className="flex flex-col gap-4 font-body text-base">
      <Link
        to="/"
        onClick={closeMenu}
        className={`py-2 px-3 rounded-sm transition-colors ${
          isActive('/') ? 'bg-ink/5 font-medium text-ink' : 'text-ink/70'
        }`}
      >
        Home
      </Link>

      {isAuthenticated ? (
        <>
          <Link
            to="/predict"
            onClick={closeMenu}
            className={`py-2 px-3 rounded-sm transition-colors ${
              isActive('/predict') ? 'bg-ink/5 font-medium text-ink' : 'text-ink/70'
            }`}
          >
            Diagnose
          </Link>
          <Link
            to="/history"
            onClick={closeMenu}
            className={`py-2 px-3 rounded-sm transition-colors ${
              isActive('/history') ? 'bg-ink/5 font-medium text-ink' : 'text-ink/70'
            }`}
          >
            Log
          </Link>
        </>
      ) : (
        <>
          <Link to="/login" onClick={closeMenu} className="py-2 px-3 text-ink/70 hover:text-ink transition-colors">
            Sign in
          </Link>
          <Link
            to="/register"
            onClick={closeMenu}
            className="mt-2 text-center bg-field text-parchment py-2 text-xs font-mono uppercase tracking-wide hover:bg-field-dark transition-colors"
          >
            Get started
          </Link>
        </>
      )}
    </div>
  </div>

  {isAuthenticated && (
    <div className="pt-6 border-t border-ink/15 flex flex-col gap-3">
      <div className="flex items-center gap-3">
        <div className="w-8 h-8 rounded-full bg-sage/20 border border-sage/40 flex items-center justify-center font-mono text-xs text-ink font-semibold">
          {user?.name ? user.name.charAt(0).toUpperCase() : 'U'}
        </div>
        <div className="flex flex-col">
          <span className="font-mono text-xs text-ink font-medium">{user?.name}</span>
          <span className="font-mono text-[10px] text-sage uppercase">Field Researcher</span>
        </div>
      </div>
      <button
        onClick={handleLogout}
        className="w-full border border-ink/25 text-ink py-2 text-xs font-mono uppercase tracking-wide hover:bg-ink hover:text-parchment transition-colors"
      >
        Sign out
      </button>
    </div>
  )}
</div>
    </nav>
  );
};

export default Navbar;