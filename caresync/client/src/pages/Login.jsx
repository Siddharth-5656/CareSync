import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { childApi } from '../api.js';

export default function Login() {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const data = await childApi.login(email, password);
      localStorage.setItem('caresync_token', data.token);
      if (data.parentId) {
        localStorage.setItem('caresync_parent_id', data.parentId);
        navigate('/dashboard');
      } else {
        navigate('/generate-code');
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-sm bg-white rounded-2xl shadow-sm border p-8">
        <h1 className="text-2xl font-bold text-slate-800 mb-1">CareSync</h1>
        <p className="text-slate-500 text-sm mb-6">Sign in to your account</p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-600 mb-1">Email</label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-600 mb-1">Password</label>
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400"
            />
          </div>

          {error && <p className="text-red-500 text-sm">{error}</p>}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-white font-medium py-2.5 rounded-lg transition-colors"
          >
            {loading ? 'Signing in…' : 'Sign In'}
          </button>
        </form>

        <p className="text-sm text-slate-500 mt-6 text-center">
          Don't have an account?{' '}
          <Link to="/register" className="text-emerald-600 font-medium">
            Register
          </Link>
        </p>
        <p className="text-sm text-slate-500 mt-2 text-center">
          Setting up a parent's tablet?{' '}
          <Link to="/pair" className="text-emerald-600 font-medium">
            Pair a device
          </Link>
        </p>
      </div>
    </div>
  );
}
