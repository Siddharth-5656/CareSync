import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { childApi } from '../api.js';

export default function GenerateCode() {
  const navigate = useNavigate();
  const [code, setCode] = useState(null);
  const [expiresAt, setExpiresAt] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  const handleGenerate = async () => {
    setError(null);
    setLoading(true);
    try {
      const data = await childApi.generateJoinCode();
      setCode(data.joinCode);
      setExpiresAt(data.expiresAt);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-sm bg-white rounded-2xl shadow-sm border p-8 text-center">
        <h1 className="text-2xl font-bold text-slate-800 mb-1">Pair a parent's tablet</h1>
        <p className="text-slate-500 text-sm mb-6">
          Generate a code, then enter it on your parent's tablet to permanently link the accounts.
        </p>

        {code ? (
          <div className="mb-6">
            <div className="text-5xl font-black tracking-widest text-slate-800 bg-slate-50 rounded-xl py-6 mb-3">
              {code}
            </div>
            <p className="text-xs text-slate-400">
              Expires at {new Date(expiresAt).toLocaleTimeString()}
            </p>
          </div>
        ) : (
          <div className="mb-6 text-slate-400 text-sm">No active code yet.</div>
        )}

        {error && <p className="text-red-500 text-sm mb-4">{error}</p>}

        <button
          onClick={handleGenerate}
          disabled={loading}
          className="w-full bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-white font-medium py-2.5 rounded-lg transition-colors mb-3"
        >
          {loading ? 'Generating…' : code ? 'Generate New Code' : 'Generate Code'}
        </button>

        <button
          onClick={() => navigate('/dashboard')}
          className="w-full border border-slate-200 text-slate-600 font-medium py-2.5 rounded-lg transition-colors hover:bg-slate-50"
        >
          Go to Dashboard
        </button>
      </div>
    </div>
  );
}
