import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { parentApi } from '../api.js';

// This screen runs once, the first time a parent's tablet is set up.
// After a successful pairing, the device token is stored permanently
// in localStorage and this screen is never shown again on that device.
export default function PairDevice() {
  const navigate = useNavigate();
  const [parentName, setParentName] = useState('');
  const [joinCode, setJoinCode] = useState('');
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const data = await parentApi.redeemCode(joinCode, parentName);
      localStorage.setItem('caresync_device_token', data.deviceToken);
      navigate('/tablet');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-black px-4">
      <div className="w-full max-w-md bg-white rounded-3xl p-10 text-center">
        <h1 className="text-3xl font-black text-slate-800 mb-2">Set Up This Tablet</h1>
        <p className="text-slate-500 mb-8">
          Enter the 6-digit code from your family member's phone
        </p>

        <form onSubmit={handleSubmit} className="space-y-5">
          <input
            type="text"
            placeholder="Your name"
            required
            value={parentName}
            onChange={(e) => setParentName(e.target.value)}
            className="w-full text-center text-xl border-2 rounded-2xl px-4 py-4 focus:outline-none focus:ring-4 focus:ring-emerald-300"
          />
          <input
            type="text"
            inputMode="numeric"
            maxLength={6}
            placeholder="000000"
            required
            value={joinCode}
            onChange={(e) => setJoinCode(e.target.value.replace(/\D/g, ''))}
            className="w-full text-center text-4xl font-black tracking-[0.4em] border-2 rounded-2xl px-4 py-6 focus:outline-none focus:ring-4 focus:ring-emerald-300"
          />

          {error && <p className="text-red-500 text-lg">{error}</p>}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-white text-2xl font-bold py-5 rounded-2xl transition-colors"
          >
            {loading ? 'Connecting…' : 'Connect'}
          </button>
        </form>
      </div>
    </div>
  );
}
