import React, { createContext, useState, useEffect, useContext } from 'react'
import { Link , useNavigate } from 'react-router-dom'
import { AuthContext } from '../context/AuthContext'

const Navbar = () => {

    const { user, logout, isAuthenticated } = useContext(AuthContext);
    const navigate = useNavigate();

    const handleLogout = () => {
        logout();
        navigate('/login');
    }

   return (
    <nav className="border-b border-ink/15 bg-parchment/95 backdrop-blur-sm sticky top-0 z-10">
      <div className="max-w-5xl mx-auto flex items-center justify-between px-6 py-4">
        <Link to="/" className="flex items-center gap-2">
          <span className="font-display text-2xl italic text-ink">PlantGuard</span>
          <span className="font-mono text-[10px] text-sage tracking-widest uppercase">Field Ed.</span>
        </Link>

        <div className="flex items-center gap-6 font-body text-sm">
          <Link to="/" className="text-ink/70 hover:text-ink transition-colors">Home</Link>

          {isAuthenticated ? (
            <>
              <Link to="/predict" className="text-ink/70 hover:text-ink transition-colors">Diagnose</Link>
              <Link to="/history" className="text-ink/70 hover:text-ink transition-colors">Log</Link>
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
              <Link to="/login" className="text-ink/70 hover:text-ink transition-colors">Sign in</Link>
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
    </nav>
  );
}

export default Navbar
