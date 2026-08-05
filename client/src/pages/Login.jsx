import React from 'react'
import { useState } from 'react'
import { useNavigate , Link } from 'react-router-dom';
import { AuthContext  } from '../context/AuthContext';
import { useContext } from 'react';
import PasswordInput from '../components/PasswordInput';
const Login = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const { login } = useContext(AuthContext);
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await login(email, password);
      navigate('/predict');
    } catch (err) {
      setError(err.response?.data?.message || 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-sm mx-auto px-6 pt-20">
      <span className="font-mono text-xs text-clay uppercase tracking-widest">Return Visit</span>
      <h2 className="font-display text-4xl text-ink mt-2 mb-8">Sign in</h2>

      {error && (
        <p className="font-mono text-xs text-clay mb-5 border-l-2 border-clay pl-3">{error}</p>
      )}

      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <div>
          <label className="font-mono text-[10px] text-sage uppercase tracking-widest block mb-1">Email</label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            className="w-full border border-ink/25 bg-transparent px-3 py-2 focus:outline-none focus:border-field"
          />
        </div>
        <div>
          <label className="font-mono text-[10px] text-sage uppercase tracking-widest block mb-1">Password</label>
          <PasswordInput
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </div>
        <button
          type="submit"
          disabled={loading}
          className="bg-field text-parchment py-3 font-mono text-sm uppercase tracking-wide hover:bg-field-dark disabled:opacity-50 transition-colors mt-2"
        >
          {loading ? 'Signing in…' : 'Login'}
        </button>
      </form>

      <p className="font-mono text-xs text-sage mt-6">
        Don't have an account? <Link to="/register" className="text-field underline">Register</Link>
      </p>
    </div>
  );
};

export default Login;
