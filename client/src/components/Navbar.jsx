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
    <nav className="flex items-center justify-between px-6 py-4 bg-green-700 text-white">
      <Link to="/" className="text-xl font-bold">
        🌿 PlantGuard
      </Link>

      <div className="flex items-center gap-6">
        <Link to="/" className="hover:underline">Home</Link>

        {isAuthenticated ? (
          <>
            <Link to="/predict" className="hover:underline">Predict</Link>
            <Link to="/history" className="hover:underline">History</Link>
            <span className="text-sm opacity-90">Hi, {user?.name}</span>
            <button
              onClick={handleLogout}
              className="bg-white text-green-700 px-3 py-1 rounded hover:bg-gray-100"
            >
              Logout
            </button>
          </>
        ) : (
          <>
            <Link to="/login" className="hover:underline">Login</Link>
            <Link to="/register" className="hover:underline">Register</Link>
          </>
        )}
      </div>
    </nav>
  );
}

export default Navbar
