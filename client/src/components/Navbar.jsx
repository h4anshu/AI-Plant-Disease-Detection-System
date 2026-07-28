import React, { useState, useContext } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { AuthContext } from '../context/AuthContext';

const Navbar = () => {
  const { user, logout, isAuthenticated } = useContext(AuthContext);
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
          <span className="font-mono text-[10px] text-sage tracking-widest uppercase">Field Ed.</span>
        </Link>

        {/* Mobile Hamburger Button */}
        <button
          onClick={() => setIsOpen(!isOpen)}
          type="button"
          aria-label="Toggle navigation"
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
            Home
          </Link>

          {isAuthenticated ? (
            <>
              <Link to="/predict" className="text-ink/70 hover:text-ink transition-colors">
                Diagnose
              </Link>
              <Link to="/history" className="text-ink/70 hover:text-ink transition-colors">
                Log
              </Link>
              <span className="font-mono text-xs text-sage">{user?.name}</span>
              <button
                onClick={handleLogout}
                className="border border-ink/25 text-ink px-3 py-1.5 text-xs font-mono uppercase tracking-wide hover:bg-ink hover:text-parchment transition-colors"
              >
                Sign out
              </button>
            </>
          ) : (
            <>
              <Link to="/login" className="text-ink/70 hover:text-ink transition-colors">
                Sign in
              </Link>
              <Link
                to="/register"
                className="bg-field text-parchment px-4 py-1.5 text-xs font-mono uppercase tracking-wide hover:bg-field-dark transition-colors"
              >
                Get started
              </Link>
            </>
          )}
        </div>
      </div>

      {/* Mobile Menu Dropdown */}
      {isOpen && (
        <div className="md:hidden border-t border-ink/10 bg-parchment px-6 py-4 flex flex-col gap-4 font-body text-sm">
          <Link to="/" onClick={closeMenu} className="text-ink/70 hover:text-ink transition-colors py-1">
            Home
          </Link>

          {isAuthenticated ? (
            <>
              <Link to="/predict" onClick={closeMenu} className="text-ink/70 hover:text-ink transition-colors py-1">
                Diagnose
              </Link>
              <Link to="/history" onClick={closeMenu} className="text-ink/70 hover:text-ink transition-colors py-1">
                Log
              </Link>
              <div className="pt-2 border-t border-ink/10 flex items-center justify-between">
                <span className="font-mono text-xs text-sage">{user?.name}</span>
                <button
                  onClick={handleLogout}
                  className="border border-ink/25 text-ink px-3 py-1.5 text-xs font-mono uppercase tracking-wide hover:bg-ink hover:text-parchment transition-colors"
                >
                  Sign out
                </button>
              </div>
            </>
          ) : (
            <div className="pt-2 border-t border-ink/10 flex flex-col gap-3">
              <Link to="/login" onClick={closeMenu} className="text-ink/70 hover:text-ink transition-colors py-1">
                Sign in
              </Link>
              <Link
                to="/register"
                onClick={closeMenu}
                className="bg-field text-parchment px-4 py-2 text-center text-xs font-mono uppercase tracking-wide hover:bg-field-dark transition-colors"
              >
                Get started
              </Link>
            </div>
          )}
        </div>
      )}
    </nav>
  );
};

export default Navbar;